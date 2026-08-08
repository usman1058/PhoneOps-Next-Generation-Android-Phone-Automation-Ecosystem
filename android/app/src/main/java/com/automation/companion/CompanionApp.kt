package com.automation.companion

import android.app.Application
import com.automation.companion.device.AuthStorage
import com.automation.companion.exec.RecordingSessionManager
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.json.JSONArray

class CompanionApp : Application() {

    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val relayClient by lazy { RelayClient(this) }
    val recordingSessionManager by lazy { RecordingSessionManager() }

    @Volatile
    var runTaskHandler: ((runId: String, stepsJson: String) -> Unit)? = null

    @Volatile
    var onTaskRejected: ((runId: String, reason: String) -> Unit)? = null

    override fun onCreate() {
        super.onCreate()
        initFirebaseIfConfigured()
        fetchFcmToken()
    }

    private fun initFirebaseIfConfigured() {
        if (BuildConfig.FIREBASE_PROJECT_ID.isBlank()) return
        if (FirebaseApp.getApps(this).isNotEmpty()) return
        val options = FirebaseOptions.Builder()
            .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
            .setApplicationId(BuildConfig.FIREBASE_APP_ID)
            .setApiKey(BuildConfig.FIREBASE_API_KEY)
            .setGcmSenderId(BuildConfig.FIREBASE_GCM_SENDER_ID)
            .build()
        FirebaseApp.initializeApp(this, options)
    }

    private fun fetchFcmToken() {
        if (BuildConfig.FIREBASE_PROJECT_ID.isBlank()) return
        try {
            WakeUpMessagingService.requestToken { token ->
                onFcmTokenUpdated(token)
            }
        } catch (e: Exception) {
            // FCM unavailable; app still works over the direct socket
        }
    }

    fun onRecordingStarted(sessionId: String) {
        recordingSessionManager.start(sessionId)
    }

    fun onRecordingStopped(sessionId: String): JSONArray {
        return recordingSessionManager.stop(sessionId)
    }

    fun onFcmTokenUpdated(token: String) {
        val prefs = AuthStorage(this)
        prefs.fcmToken = token
        relayClient.sendFcmToken(token)
    }
}
