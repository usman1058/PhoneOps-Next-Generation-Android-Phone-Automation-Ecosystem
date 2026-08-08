package com.automation.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.automation.companion.device.AuthStorage

class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }

        val prefs = AuthStorage(context)
        if (prefs.relayUrl.isBlank() || prefs.apiKey.isBlank()) {
            return
        }

        val serviceIntent = Intent(context, DeviceSocketService::class.java)
        ContextCompat.startForegroundService(context, serviceIntent)
    }
}