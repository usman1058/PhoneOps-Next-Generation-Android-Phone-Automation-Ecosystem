package com.automation.companion.device

import android.content.Context

class AuthStorage(context: Context) {

    private val prefs =
        context.applicationContext.getSharedPreferences("companion", Context.MODE_PRIVATE)

    var relayUrl: String
        get() = prefs.getString(KEY_URL, "").orEmpty()
        set(value) {
            prefs.edit().putString(KEY_URL, value).apply()
        }

    var apiKey: String
        get() = prefs.getString(KEY_KEY, "").orEmpty()
        set(value) {
            prefs.edit().putString(KEY_KEY, value).apply()
        }

    var fcmToken: String
        get() = prefs.getString(KEY_FCM, "").orEmpty()
        set(value) {
            prefs.edit().putString(KEY_FCM, value).apply()
        }

    private companion object {
        const val KEY_URL = "relayUrl"
        const val KEY_KEY = "apiKey"
        const val KEY_FCM = "fcmToken"
    }
}
