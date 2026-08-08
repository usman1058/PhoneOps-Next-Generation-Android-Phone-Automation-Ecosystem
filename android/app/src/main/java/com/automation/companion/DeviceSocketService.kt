package com.automation.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.automation.companion.device.AuthStorage
import com.automation.companion.device.RelayEvent
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class DeviceSocketService : Service() {

    private val app: CompanionApp
        get() = application as CompanionApp

    private var collector: Job? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundCompat(buildNotification("Connecting..."))

        collector?.cancel()

        val prefs = AuthStorage(this)
        val url = prefs.relayUrl
        val key = prefs.apiKey
        val token = prefs.fcmToken

        if (url.isBlank() || key.isBlank()) {
            stopSelf()
            return START_NOT_STICKY
        }

        collector = app.appScope.launch {
            app.relayClient.events.collect { event ->
                val text = when (event) {
                    is RelayEvent.Connected -> {
                        if (token.isNotBlank()) {
                            app.relayClient.sendFcmToken(token)
                        }
                        "Connected (${event.deviceId})"
                    }
                    is RelayEvent.Disconnected -> "Disconnected"
                    is RelayEvent.RunTask -> "Run ${event.runId.take(8)}..."
                    is RelayEvent.StartRecording -> "Recording ${event.sessionId.take(8)}..."
                    is RelayEvent.StopRecording -> "Recording stopped"
                    is RelayEvent.Error -> "Error: ${event.message}"
                }
                updateNotification(text)
            }
        }

        app.relayClient.start(url, key)
        return START_STICKY
    }

    override fun onDestroy() {
        collector?.cancel()
        collector = null
        app.relayClient.stop()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun buildNotification(text: String): Notification {
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIF_ID, buildNotification(text))
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Connection status",
            NotificationManager.IMPORTANCE_LOW,
        )
        manager.createNotificationChannel(channel)
    }

    private companion object {
        const val CHANNEL_ID = "connection_status"
        const val NOTIF_ID = 1001
    }
}
