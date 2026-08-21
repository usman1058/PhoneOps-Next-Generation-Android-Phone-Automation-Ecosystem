package com.automation.companion

import android.app.Activity
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

/**
 * Invisible trampoline that shows the system MediaProjection consent dialog.
 * Opened when the panel asks for a screen share while the app is in the
 * background (and directly from MainActivity's "Allow screen share" button).
 */
class MirrorConsentActivity : AppCompatActivity() {

    private val consentLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == Activity.RESULT_OK && result.data != null) {
                ProjectionHolder.consentData = result.data
                val app = application as CompanionApp
                if (CompanionApp.pendingMirrorParams != null) {
                    app.onScreenStart(CompanionApp.pendingMirrorParams!!)
                }
            } else {
                Toast.makeText(
                    this,
                    "Screen sharing was declined",
                    Toast.LENGTH_SHORT,
                ).show()
            }
            finish()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val manager =
            getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        try {
            consentLauncher.launch(manager.createScreenCaptureIntent())
        } catch (e: Exception) {
            Toast.makeText(this, "Screen sharing is not available", Toast.LENGTH_SHORT).show()
            finish()
        }
    }
}
