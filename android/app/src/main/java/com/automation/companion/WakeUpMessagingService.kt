package com.automation.companion

import android.content.Intent
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Receives Firebase Cloud Messaging push messages.
 *
 * The relay sends a data-only "wakeup" push when a task is triggered while the
 * app is killed. On receipt we (re)start the foreground socket service so the
 * device reconnects and pulls the pending run. New/refreshed registration
 * tokens are pushed to the relay via CompanionApp.onFcmTokenUpdated.
 */
class WakeUpMessagingService : FirebaseMessagingService() {

    private val app: CompanionApp
        get() = application as CompanionApp

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        app.onFcmTokenUpdated(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data ?: return
        val type = data["type"]
        if (type == "wakeup") {
            val prefs = com.automation.companion.device.AuthStorage(this)
            if (prefs.relayUrl.isBlank() || prefs.apiKey.isBlank()) return
            val intent = Intent(this, DeviceSocketService::class.java)
            ContextCompat.startForegroundService(this, intent)
        }
    }

    companion object {
        fun requestToken(onToken: (String) -> Unit) {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    task.result?.let(onToken)
                }
            }
        }
    }
}
