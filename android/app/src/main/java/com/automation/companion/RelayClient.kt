package com.automation.companion

import android.content.Intent
import android.util.Log
import com.automation.companion.device.RelayEvent
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class RelayClient(private val app: CompanionApp) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

private val scope = app.appScope
    private var socket: WebSocket? = null
    private var shouldRun = false
    private var connectLoop: Job? = null
    private var relayUrl: String = ""
    private var apiKey: String = ""
    private var deviceId: String? = null
    private var wsToken: String? = null
    private var backoffMs = 2000L

    private val _events = MutableSharedFlow<RelayEvent>(extraBufferCapacity = 128)
    val events: SharedFlow<RelayEvent> = _events

    @Volatile
    var isConnected: Boolean = false
        private set

    fun start(url: String, apiKey: String) {
        relayUrl = url.trimEnd('/')
        this.apiKey = apiKey.trim()
        shouldRun = true
        backoffMs = 2000L
        // Guard against stacking multiple reconnect loops when start() is
        // called more than once (e.g. Connect pressed twice, or service
        // restarting). Cancel any previous loop first.
        if (connectLoop == null || connectLoop?.isActive != true) {
            connectLoop = scope.launch { connectLoop() }
        }
    }

    fun stop() {
        shouldRun = false
        deviceId = null
        wsToken = null
        isConnected = false
        socket?.close(1000, "Stopped by user")
        socket = null
        connectLoop?.cancel()
        connectLoop = null
    }

    fun send(text: String) {
        socket?.send(text)
    }

    fun sendFcmToken(token: String) {
        val msg = JSONObject()
            .put("type", "fcm_token")
            .put("token", token)
        send(msg.toString())
    }

    private fun queryInstalledApps(): JSONArray {
        val pm = app.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolveInfos = pm.queryIntentActivities(intent, 0)
        val seen = LinkedHashSet<String>()
        val apps = JSONArray()
        for (info in resolveInfos) {
            val pkg = info.activityInfo?.packageName ?: continue
            if (!seen.add(pkg)) continue
            val label = info.loadLabel(pm)?.toString()?.takeIf { it.isNotBlank() } ?: pkg
            apps.put(JSONObject().put("package", pkg).put("label", label))
        }
        if (apps.length() > 0) {
            return apps
        }
        // Fallback: if package visibility hid launcher apps, list installed applications.
        val installed = pm.getInstalledApplications(0)
        for (info in installed) {
            val pkg = info.packageName ?: continue
            if (!seen.add(pkg)) continue
            if (pkg == app.packageName) continue
            val label = info.loadLabel(pm)?.toString()?.takeIf { it.isNotBlank() } ?: pkg
            apps.put(JSONObject().put("package", pkg).put("label", label))
        }
        val items = ArrayList<JSONObject>(apps.length())
        for (i in 0 until apps.length()) {
            items.add(apps.getJSONObject(i))
        }
        val sorted = items.sortedBy { it.optString("label").lowercase() }
        return JSONArray().apply { for (a in sorted) put(a) }
    }

    private suspend fun connectLoop() {
        while (shouldRun) {
            if (deviceId == null) {
                deviceId = runHandshake()
            }
            if (deviceId != null) {
                openSocket(deviceId!!)
            } else if (shouldRun) {
                _events.tryEmit(RelayEvent.Error("Handshake failed; retrying"))
            }
            if (!shouldRun) break
            delay(backoffMs)
            backoffMs = (backoffMs * 1.5).toLong().coerceAtMost(30_000L)
        }
    }

    private suspend fun runHandshake(): String? = withContext(kotlinx.coroutines.Dispatchers.IO) {
        try {
            val body = JSONObject().put("apiKey", apiKey).toString()
            val request = Request.Builder()
                .url("$relayUrl/device-auth/handshake")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    Log.w(TAG, "handshake HTTP ${resp.code}: ${resp.body?.string()}")
                    return@withContext null
                }
                val data = JSONObject(resp.body!!.string())
                wsToken = data.getString("token")
                return@withContext data.getString("deviceId")
            }
        } catch (e: Exception) {
            Log.w(TAG, "handshake error", e)
            null
        }
    }

    private suspend fun openSocket(deviceId: String) {
        val token = wsToken ?: return
        val done = CompletableDeferred<Unit>()
        val request = Request.Builder().url(toWsUrl(relayUrl)).build()
        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                isConnected = true
                backoffMs = 2000L
                _events.tryEmit(RelayEvent.Connected(deviceId))
                val hello = JSONObject()
                    .put("type", "hello")
                    .put("deviceId", deviceId)
                    .put("authToken", token)
                webSocket.send(hello.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                finishConnection(reason, done)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                finishConnection(t.message ?: "failure", done)
            }
        }
        socket = client.newWebSocket(request, listener)
        done.await()
        socket = null
        isConnected = false
        wsToken = null
        this.deviceId = null
    }

    private fun finishConnection(reason: String, done: CompletableDeferred<Unit>) {
        _events.tryEmit(RelayEvent.Disconnected(reason))
        if (!done.isCompleted) done.complete(Unit)
    }

    private fun handleMessage(text: String) {
        try {
            val msg = JSONObject(text)
            when (msg.getString("type")) {
"run_task" -> {
                    val runId = msg.getString("runId")
                    val steps = msg.getJSONArray("steps").toString()
                    _events.tryEmit(RelayEvent.RunTask(runId, steps))
                    if (app.runTaskHandler == null) {
                        Log.w(TAG, "run_task received but no accessibility handler (service not enabled)")
                        val fail = JSONObject()
                            .put("type", "run_complete")
                            .put("runId", runId)
                            .put("status", "failed")
                            .put("error", "Accessibility service is not enabled on the phone")
                        send(fail.toString())
                        app.onTaskRejected?.invoke(runId, "Accessibility service is not enabled")
                    } else {
                        app.runTaskHandler?.invoke(runId, steps)
                    }
                }
                "start_recording" -> {
                    val sessionId = msg.getString("sessionId")
                    app.onRecordingStarted(sessionId)
                    _events.tryEmit(RelayEvent.StartRecording(sessionId))
                }
                "stop_recording" -> {
                    val sessionId = msg.getString("sessionId")
                    scope.launch {
                        delay(300)
                        val steps = app.onRecordingStopped(sessionId)
                        val payload = JSONObject()
                            .put("type", "recording_steps")
                            .put("sessionId", sessionId)
                            .put("steps", steps)
                        send(payload.toString())
                    }
                    _events.tryEmit(RelayEvent.StopRecording(sessionId))
                }
                "list_apps" -> {
                    val requestId = msg.getString("requestId")
                    scope.launch(Dispatchers.IO) {
                        val payload = JSONObject()
                            .put("type", "app_list")
                            .put("requestId", requestId)
                            .put("apps", queryInstalledApps())
                        send(payload.toString())
                    }
                }
                "screen_start" -> {
                    app.onScreenStart(
                        MirrorParams(
                            sessionId = msg.getString("sessionId"),
                            fps = msg.optInt("fps", 4),
                            maxW = msg.optInt("maxW", 540),
                            quality = msg.optInt("quality", 45),
                        ),
                    )
                }
                "screen_stop" -> {
                    app.onScreenStop()
                }
                "remote_input" -> {
                    val input = msg.optJSONObject("input") ?: return
                    app.remoteInputHandler?.invoke(input)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "unparsed message: $text", e)
        }
    }

    private fun toWsUrl(httpUrl: String): String {
        val base = httpUrl.trimEnd('/')
        val wsBase =
            base.replaceFirst("http://", "ws://").replaceFirst("https://", "wss://")
        return if (wsBase.endsWith("/device")) wsBase else "$wsBase/device"
    }

    private companion object {
        const val TAG = "RelayClient"
    }
}
