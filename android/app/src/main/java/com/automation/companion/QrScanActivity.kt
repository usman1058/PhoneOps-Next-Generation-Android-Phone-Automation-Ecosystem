package com.automation.companion

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.automation.companion.databinding.ActivityQrScanBinding
import com.journeyapps.barcodescanner.CaptureManager
import com.journeyapps.barcodescanner.DecoratedBarcodeView

/**
 * Portrait QR scanner. Uses a DecoratedBarcodeView embedded in a portrait
 * activity so the preview keeps the phone's aspect ratio instead of the
 * stretched full-screen landscape preview of the stock CaptureActivity.
 */
class QrScanActivity : AppCompatActivity() {

    private lateinit var binding: ActivityQrScanBinding
    private var capture: CaptureManager? = null
    private var savedState: Bundle? = null

    private val cameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                startScanning()
            } else {
                Toast.makeText(
                    this,
                    "Camera permission is required to scan QR codes",
                    Toast.LENGTH_LONG,
                ).show()
                finish()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityQrScanBinding.inflate(layoutInflater)
        setContentView(binding.root)
        savedState = savedInstanceState

        binding.qrCancelButton.setOnClickListener { finish() }

        val hasCamera = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED
        if (hasCamera) {
            startScanning()
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startScanning() {
        val view: DecoratedBarcodeView = binding.barcodeView
        view.setStatusText("Align the QR code inside the frame")
        val manager = CaptureManager(this, view)
        manager.initializeFromIntent(intent, savedState)
        manager.decode()
        capture = manager
    }

    override fun onResume() {
        super.onResume()
        capture?.onResume()
    }

    override fun onPause() {
        super.onPause()
        capture?.onPause()
    }

    override fun onDestroy() {
        capture?.onDestroy()
        capture = null
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        capture?.onSaveInstanceState(outState)
    }

    companion object {
        const val EXTRA_RESULT = "SCAN_RESULT"
    }
}