package com.automation.companion

import android.content.Intent

/**
 * Holds the MediaProjection consent result so [ScreenMirrorService] can create
 * the projection later. The grant is only valid while the process keeps the
 * foreground service type mediaProjection alive; once mirroring stops the
 * user must re-consent (same as AnyDesk's "Start now" dialog).
 */
object ProjectionHolder {

    @Volatile
    var consentData: Intent? = null

    val hasConsent: Boolean
        get() = consentData != null

    fun consume(): Intent? {
        val data = consentData
        consentData = null
        return data
    }

    fun clear() {
        consentData = null
    }
}

/** Parameters for the running mirror session, sent by the relay. */
data class MirrorParams(
    val sessionId: String,
    val fps: Int,
    val maxW: Int,
    val quality: Int,
)
