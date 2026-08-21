package com.automation.companion.exec

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import com.automation.companion.CompanionApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.json.JSONObject

class AutomationAccessibilityService : AccessibilityService() {

    private val app: CompanionApp
        get() = application as CompanionApp

    private var runner: TaskRunner? = null
    private var scope: CoroutineScope? = null
    private var overlay: TapOverlayManager? = null

    // Last foreground package seen, used to detect app launches so we can
    // record an "open_app" step when the user starts another app (including
    // from the home screen or a folder).
    private var lastWindowPackage: String? = null

    private val countListener = object : RecordingSessionManager.OnCountListener {
        override fun onCountChanged(count: Int) {
            if (count == 0) {
                overlay?.detach()
            }
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        scope = serviceScope
        runner = TaskRunner(this, serviceScope) { runId, type, stepIndex, status, error ->
            val msg = JSONObject()
                .put("type", type)
                .put("runId", runId)
                .put("stepIndex", stepIndex)
                .put("status", status)
            if (error != null) msg.put("error", error)
            app.relayClient.send(msg.toString())
        }
        app.runTaskHandler = runner?.let { it::execute }
        app.remoteInputHandler = ::handleRemoteInput
        app.recordingSessionManager.onTap = object : RecordingSessionManager.OnTapListener {
            override fun onTap(index: Int, x: Float, y: Float) {
                ensureOverlay()
                overlay?.addTap(x, y, index)
            }
        }
        app.recordingSessionManager.addCountListener(countListener)
    }

    // Injects touch/gesture input requested by a panel operator watching the
    // live screen mirror. While a recording session is active the injected
    // gestures are captured as automation steps.
    private fun handleRemoteInput(input: JSONObject) {
        val kind = input.optString("kind")
        when (kind) {
            "tap" -> {
                val x = input.optDouble("x")
                val y = input.optDouble("y")
                tapOn(x.toFloat(), y.toFloat())
                if (app.recordingSessionManager.isRecording()) {
                    app.recordingSessionManager.captureRemoteTap(x.toFloat(), y.toFloat())
                }
            }
            "swipe" -> {
                val fromX = input.optDouble("x").toFloat()
                val fromY = input.optDouble("y").toFloat()
                val toX = input.optDouble("x2").toFloat()
                val toY = input.optDouble("y2").toFloat()
                val durationMs = input.optLong("durationMs", 300).coerceAtLeast(1)
                swipe(fromX, fromY, toX, toY, durationMs)
                if (app.recordingSessionManager.isRecording()) {
                    app.recordingSessionManager.captureRemoteSwipe(
                        fromX,
                        fromY,
                        toX,
                        toY,
                        durationMs,
                    )
                }
            }
            "back" -> {
                performGlobalAction(GLOBAL_ACTION_BACK)
                if (app.recordingSessionManager.isRecording()) {
                    app.recordingSessionManager.captureNavigation("back")
                }
            }
            "home" -> {
                performGlobalAction(GLOBAL_ACTION_HOME)
                if (app.recordingSessionManager.isRecording()) {
                    app.recordingSessionManager.captureNavigation("home")
                }
            }
        }
    }

    private fun tapOn(x: Float, y: Float) {
        val path = android.graphics.Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 60))
            .build()
        dispatchGesture(gesture, null, null)
    }

    private fun swipe(
        fromX: Float,
        fromY: Float,
        toX: Float,
        toY: Float,
        durationMs: Long,
    ) {
        val path = android.graphics.Path().apply {
            moveTo(fromX, fromY)
            lineTo(toX, toY)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
        dispatchGesture(gesture, null, null)
    }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (app.recordingSessionManager.isRecording()) {
            app.recordingSessionManager.captureFromEvent(event)

            if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
                event.eventType == AccessibilityEvent.TYPE_WINDOWS_CHANGED
            ) {
                val pkg = event.packageName?.toString() ?: return
                val last = lastWindowPackage
                lastWindowPackage = pkg
                if (last != null && last != pkg) {
                    if (isLauncherPackage(pkg)) {
                        // Returning to the home screen (home button / gesture).
                        app.recordingSessionManager.captureNavigation("home")
                    } else if (isRealAppPackage(pkg)) {
                        app.recordingSessionManager.captureNavigation("open_app", pkg)
                    }
                }
            }
        } else {
            overlay?.detach()
            lastWindowPackage = null
        }
    }

    // Captures HOME / BACK (button, gesture nav or key) as navigation steps
    // so the recording reflects the user actually leaving/entering screens.
    override fun onKeyEvent(event: KeyEvent?): Boolean {
        if (event == null) return super.onKeyEvent(event)
        if (event.action == KeyEvent.ACTION_DOWN && app.recordingSessionManager.isRecording()) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_HOME -> app.recordingSessionManager.captureNavigation("home")
                KeyEvent.KEYCODE_BACK -> app.recordingSessionManager.captureNavigation("back")
            }
        }
        return super.onKeyEvent(event)
    }

    private fun isLauncherPackage(pkg: String): Boolean {
        return try {
            val intent = android.content.Intent(android.content.Intent.ACTION_MAIN)
                .addCategory(android.content.Intent.CATEGORY_HOME)
            packageManager.resolveActivity(intent, 0)?.activityInfo?.packageName == pkg
        } catch (_: Exception) {
            false
        }
    }

    private fun isRealAppPackage(pkg: String): Boolean {
        // Ignore our own UI, launchers, and system windows; focus on real apps.
        if (pkg == packageName) return false
        if (isLauncherPackage(pkg)) return false
        return true
    }

    override fun onInterrupt() {
    }

    override fun onDestroy() {
        overlay?.detach()
        overlay = null
        app.recordingSessionManager.onTap = null
        app.recordingSessionManager.removeCountListener(countListener)
        scope?.cancel()
        app.runTaskHandler = null
        app.remoteInputHandler = null
        super.onDestroy()
    }

    private fun ensureOverlay() {
        if (overlay == null) {
            overlay = TapOverlayManager(this)
        }
    }
}
