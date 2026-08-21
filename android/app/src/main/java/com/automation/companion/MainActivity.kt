package com.automation.companion

import android.Manifest
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.automation.companion.device.AuthStorage
import com.automation.companion.device.LanDiscovery
import com.automation.companion.device.RelayEvent
import com.automation.companion.databinding.ActivityMainBinding
import com.automation.companion.exec.AutomationAccessibilityService
import com.automation.companion.exec.RecordingSessionManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: AuthStorage
    private val app by lazy { application as CompanionApp }
    private var relayEventCollector: Job? = null
    private var recordingSessionId: String? = null

    private val notifPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private val screenConsentLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == RESULT_OK && result.data != null) {
                ProjectionHolder.consentData = result.data
                appendLog("screen share allowed")
                if (CompanionApp.pendingMirrorParams != null) {
                    app.onScreenStart(CompanionApp.pendingMirrorParams!!)
                }
            } else {
                appendLog("screen share declined")
            }
        }

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                launchScanner()
            } else {
                Toast.makeText(this, "Camera permission is required to scan QR codes", Toast.LENGTH_LONG).show()
            }
        }

override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = AuthStorage(this)
        binding.relayUrlInput.setText(prefs.relayUrl)
        binding.apiKeyInput.setText(prefs.apiKey)
        binding.fcmTokenInput.setText(prefs.fcmToken)

        binding.connectButton.setOnClickListener { connect() }
        binding.disconnectButton.setOnClickListener { disconnect() }
        binding.scanQrButton.setOnClickListener { scanQr() }
        binding.findLanButton.setOnClickListener { findRelayOnLan() }
        binding.enableAccessibilityButton.setOnClickListener { openAccessibilitySettings() }
        binding.recordButton.setOnClickListener { toggleRecording() }
        binding.setupButton.setOnClickListener {
            startActivity(Intent(this, SetupActivity::class.java))
        }
        binding.screenShareButton.setOnClickListener { requestScreenConsent() }

        // First-run nudge: if the connection is configured but automation is
        // not enabled yet, open the guided wizard once so nothing is missed.
        if (prefs.relayUrl.isNotBlank() &&
            prefs.apiKey.isNotBlank() &&
            !isAccessibilityServiceEnabled() &&
            !prefs.setupPrompted
        ) {
            prefs.setupPrompted = true
            startActivity(Intent(this, SetupActivity::class.java))
        }

        updateAccessibilityButton()
        updateRecordingButton()

        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
        ) {
            notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        if (prefs.relayUrl.isNotBlank() && prefs.apiKey.isNotBlank()) {
            appendLog("saved connection found; starting relay service")
            ContextCompat.startForegroundService(this, Intent(this, DeviceSocketService::class.java))
            requestIgnoreBatteryOptimizations()
        }

        relayEventCollector?.cancel()
        relayEventCollector = app.appScope.launch {
            app.relayClient.events.collect { event -> onRelayEvent(event) }
        }

        app.recordingSessionManager.addCountListener(countListener)
    }

    private val countListener = object : RecordingSessionManager.OnCountListener {
        override fun onCountChanged(count: Int) {
            runOnUiThread {
                if (recordingSessionId != null) {
                    binding.recordStatusText.text = "Recording… $count tap(s) captured"
                }
            }
        }
    }

    override fun onDestroy() {
        relayEventCollector?.cancel()
        relayEventCollector = null
        app.recordingSessionManager.removeCountListener(countListener)
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        updateAccessibilityButton()
    }

    private fun connect() {
        val url = binding.relayUrlInput.text.toString().trim()
        val key = binding.apiKeyInput.text.toString().trim()
        val token = binding.fcmTokenInput.text.toString().trim()
        if (url.isBlank() || key.isBlank()) {
            Toast.makeText(this, "Relay URL and API key are required", Toast.LENGTH_SHORT).show()
            return
        }
        prefs.relayUrl = url
        prefs.apiKey = key
        prefs.fcmToken = token
        val intent = Intent(this, DeviceSocketService::class.java)
        ContextCompat.startForegroundService(this, intent)
        requestIgnoreBatteryOptimizations()
    }

    private fun openAccessibilitySettings() {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
        } catch (e: Exception) {
            appendLog("could not open accessibility settings: ${e.message}")
            Toast.makeText(
                this,
                "Could not open settings; enable 'Automation' under System > Accessibility",
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    private fun requestScreenConsent() {
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager
        screenConsentLauncher.launch(manager.createScreenCaptureIntent())
    }

    private fun updateAccessibilityButton() {
        val enabled = isAccessibilityServiceEnabled()
        binding.enableAccessibilityButton.text = if (enabled) "Accessibility: ON" else "Enable Accessibility"
        binding.enableAccessibilityButton.isEnabled = !enabled
    }

private fun isAccessibilityServiceEnabled(): Boolean {
        val component = ComponentName(this, AutomationAccessibilityService::class.java)
        val flattened = component.flattenToString()
        val enabled = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: ""
        if (enabled.contains(flattened)) return true
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_GENERIC)
            ?: return false
        return enabledServices.any { service -> service.id == flattened }
    }

    private fun requestIgnoreBatteryOptimizations() {
        val pm = getSystemService(POWER_SERVICE) as android.os.PowerManager
        if (pm.isIgnoringBatteryOptimizations(packageName)) return
        try {
            val intent = Intent(
                android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                android.net.Uri.parse("package:$packageName"),
            )
            startActivity(intent)
        } catch (e: Exception) {
            // not granted by the OS; connection still proceeds
        }
    }

    private fun scanQr() {
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            return
        }
        launchScanner()
    }

    private fun launchScanner() {
        val intent = Intent(this, QrScanActivity::class.java)
        startActivityForResult(intent, QR_SCAN_REQUEST)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == QR_SCAN_REQUEST && resultCode == RESULT_OK) {
            val contents = data?.getStringExtra(QrScanActivity.EXTRA_RESULT)
            if (!contents.isNullOrBlank()) {
                applyPairingPayload(contents)
            } else {
                Toast.makeText(this, "Scan cancelled", Toast.LENGTH_SHORT).show()
            }
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    private fun applyPairingPayload(payload: String) {
        try {
            val json = JSONObject(payload)
            val url = json.optString("url").trim()
            val key = json.optString("key").trim()
            if (url.isBlank() || key.isBlank()) {
                Toast.makeText(this, "QR code does not contain pairing data", Toast.LENGTH_SHORT).show()
                return
            }
            binding.relayUrlInput.setText(url)
            binding.apiKeyInput.setText(key)
            appendLog("pairing info from QR")
            connect()
        } catch (e: Exception) {
            Toast.makeText(this, "Invalid pairing QR code", Toast.LENGTH_SHORT).show()
        }
    }

    private fun findRelayOnLan() {
        appendLog("searching for relay on LAN...")
        binding.findLanButton.isEnabled = false
        app.appScope.launch {
            try {
                val urls = LanDiscovery.findRelayUrls(this@MainActivity)
                binding.findLanButton.isEnabled = true
                if (urls.isEmpty()) {
                    Toast.makeText(this@MainActivity, "No reachable relay found on the LAN", Toast.LENGTH_LONG).show()
                    appendLog("no reachable relay found")
                    return@launch
                }
                // Prefer a Wi-Fi URL, but fall back to Ethernet if that's all
                // that is reachable. The list from findRelayUrls is already
                // reachability-checked and Wi-Fi preferred.
                val url = urls.first()
                binding.relayUrlInput.setText(url)
                prefs.relayUrl = url
                prefs.apiKey = binding.apiKeyInput.text.toString().trim()
                appendLog("found relay: $url")
                Toast.makeText(
                    this@MainActivity,
                    "Relay found: $url",
                    Toast.LENGTH_LONG,
                ).show()
                connect()
            } catch (e: Exception) {
                binding.findLanButton.isEnabled = true
                appendLog("LAN discovery failed: ${e.message}")
                Toast.makeText(this@MainActivity, "LAN discovery failed", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun disconnect() {
        stopService(Intent(this, DeviceSocketService::class.java))
    }

    private fun toggleRecording() {
        if (recordingSessionId != null) {
            stopLocalRecording()
        } else {
            startLocalRecording()
        }
    }

    private fun startLocalRecording() {
        if (!isAccessibilityServiceEnabled()) {
            Toast.makeText(
                this,
                "Enable Automation (Accessibility) first to record taps",
                Toast.LENGTH_LONG,
            ).show()
            openAccessibilitySettings()
            return
        }
        val sessionId = UUID.randomUUID().toString()
        recordingSessionId = sessionId
        app.recordingSessionManager.start(sessionId)
        updateRecordingButton()
        appendLog("local recording started (session=${sessionId.take(8)})")
    }

    private fun stopLocalRecording() {
        val sessionId = recordingSessionId ?: return
        val steps = app.recordingSessionManager.stop(sessionId)
        recordingSessionId = null
        updateRecordingButton()
        appendLog("local recording stopped: ${steps.length()} step(s)")
        if (steps.length() > 0) {
            val payload = JSONObject()
                .put("type", "task_recorded")
                .put("steps", steps)
            if (app.relayClient.isConnected) {
                app.relayClient.send(payload.toString())
                appendLog("uploaded recording to panel")
                Toast.makeText(
                    this,
                    "Recorded ${steps.length()} tap(s) and uploaded",
                    Toast.LENGTH_LONG,
                ).show()
            } else {
                appendLog("recording saved locally (relay not connected)")
                Toast.makeText(
                    this,
                    "Recorded ${steps.length()} tap(s) locally (connect to upload)",
                    Toast.LENGTH_LONG,
                ).show()
            }
        } else {
            Toast.makeText(
                this,
                "No taps captured during recording",
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    private fun updateRecordingButton() {
        val recording = recordingSessionId != null
        binding.recordButton.text = if (recording) "Stop recording" else "Start recording"
        binding.recordStatusText.text = if (recording) {
            "Recording… ${app.recordingSessionManager.currentCount()} tap(s) captured"
        } else {
            "Idle"
        }
    }

private fun onRelayEvent(event: RelayEvent) {
        when (event) {
            is RelayEvent.Connected -> {
                binding.statusText.text = "Connected as ${event.deviceId}"
                binding.statusText.setTextColor(ContextCompat.getColor(this, R.color.ok))
                binding.statusBadge.text = "Online"
                binding.statusBadge.setTextColor(ContextCompat.getColor(this, R.color.ok))
                appendLog("connected device=${event.deviceId}")
                updateAccessibilityButton()
            }
            is RelayEvent.Disconnected -> {
                binding.statusText.text = "Disconnected (${event.reason ?: "closed"})"
                binding.statusText.setTextColor(ContextCompat.getColor(this, R.color.err))
                binding.statusBadge.text = "Offline"
                binding.statusBadge.setTextColor(ContextCompat.getColor(this, R.color.err))
                appendLog("disconnected: ${event.reason ?: "closed"}")
                updateAccessibilityButton()
            }
            is RelayEvent.RunTask -> {
                appendLog("run_task runId=${event.runId} steps=${event.stepsJson}")
            }
            is RelayEvent.StartRecording -> appendLog("start_recording session=${event.sessionId}")
            is RelayEvent.StopRecording -> appendLog("stop_recording session=${event.sessionId}")
            RelayEvent.ScreenPermissionNeeded -> requestScreenConsent()
            is RelayEvent.Error -> {
                binding.statusText.text = "Error: ${event.message}"
                binding.statusText.setTextColor(ContextCompat.getColor(this, R.color.err))
                binding.statusBadge.text = "Error"
                binding.statusBadge.setTextColor(ContextCompat.getColor(this, R.color.err))
                appendLog("error: ${event.message}")
            }
        }
    }

private fun appendLog(line: String) {
        val current = binding.logText.text
        binding.logText.text = if (current.isBlank()) line else "$current\n$line"
    }

    private companion object {
        const val QR_SCAN_REQUEST = 101
    }
}
