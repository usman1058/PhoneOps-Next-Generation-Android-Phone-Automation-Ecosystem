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
import android.os.PowerManager
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.automation.companion.databinding.ActivitySetupBinding
import com.automation.companion.device.AuthStorage
import com.automation.companion.exec.AutomationAccessibilityService

/**
 * Guided setup. Walks the user through exactly the permissions the app needs
 * (notification, notification/system settings, battery optimization override),
 * opening each system screen directly and auto-verifying when they return.
 */
class SetupActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySetupBinding
    private var index = 0
    private var steps: MutableList<SetupStep> = mutableListOf()
    private var askedNotification: Boolean = false

    private val notifPermissionRequest =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            refresh()
        }

    data class SetupStep(
        val title: String,
        val hint: String,
        val isDone: () -> Boolean,
        val open: () -> Unit,
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySetupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        steps = buildSteps()

        binding.makeItWorkButton.setOnClickListener {
            index = 0
            refresh()
        }
        binding.goButton.setOnClickListener {
            steps.getOrNull(index)?.let { step ->
                if (!step.isDone()) step.open()
            }
        }
        binding.skipButton.setOnClickListener {
            if (index < steps.size - 1) {
                index += 1
                refresh()
            }
        }

        refresh()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun buildSteps(): MutableList<SetupStep> {
        val list = mutableListOf<SetupStep>()
        if (Build.VERSION.SDK_INT >= 33) {
            list.add(
                SetupStep(
                    title = "Allow notifications",
                    hint = "Lets you see the connection status while it works in the background.",
                    isDone = {
                        ContextCompat.checkSelfPermission(
                            this,
                            Manifest.permission.POST_NOTIFICATIONS,
                        ) == PackageManager.PERMISSION_GRANTED
                    },
                    open = {
                        if (!askedNotification) {
                            askedNotification = true
                            notifPermissionRequest.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            openPowerSettings()
                        }
                    },
                ),
            )
        }
        list.add(
            SetupStep(
                title = "Allow battery optimisation override",
                hint = "Keeps the app alive so it can still receive tasks when the screen is off.",
                isDone = {
                    val pm = getSystemService(POWER_SERVICE) as PowerManager
                    pm.isIgnoringBatteryOptimizations(packageName)
                },
                open = { openBatteryOptimizations() },
            ),
        )
        list.add(
            SetupStep(
                title = "Enable Automation (accessibility)",
                hint = "This is the permission that lets tasks open apps, tap, and swipe for you. If a \u201CRestricted settings\u201D popup appears, tap OK first, allow it for this app, then come back here.",
                isDone = { isAccessibilityEnabled() },
                open = { openAccessibilitySettings() },
            ),
        )
        // Xiaomi/Redmi/POCO devices block sideloaded apps from enabling
        // accessibility until "Allow restricted settings" is flipped on the
        // app's system info page. Detect that case and guide through it first.
        val manufacturer = Build.MANUFACTURER?.lowercase() ?: ""
        val miuiFamily = manufacturer == "xiaomi" || manufacturer == "redmi" || manufacturer == "poco"
        if (miuiFamily) {
            list.add(
                1,
                SetupStep(
                    title = "Allow restricted settings (Xiaomi)",
                    hint = "On the next screen scroll down and tap \u201CAllow restricted settings\u201D. Without this, Xiaomi blocks the automation toggle in the next step.",
                    isDone = { isAccessibilityEnabled() },
                    open = { openAppInfoSettings() },
                ),
            )
        }
        return list
    }

    private fun openAppInfoSettings() {
        try {
            startActivity(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:$packageName"),
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        } catch (_: Exception) {
            try {
                startActivity(Intent(Settings.ACTION_APPLICATION_SETTINGS))
            } catch (_: Exception) {
            }
        }
    }

    private fun isAccessibilityEnabled(): Boolean {
        val component = ComponentName(this, AutomationAccessibilityService::class.java)
        val flattened = component.flattenToString()
        val enabled = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: ""
        if (enabled.contains(flattened)) return true
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val list = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_GENERIC)
            ?: return false
        return list.any { it.id == flattened }
    }

    private fun openAccessibilitySettings() {
        try {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (e: Exception) {
            binding.stepHintText.text = "Could not open settings. Enable \u201CAutomation\u201D under System > Accessibility."
        }
    }

    private fun openBatteryOptimizations() {
        try {
            startActivity(
                Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:$packageName"),
                ),
            )
        } catch (e: Exception) {
            try {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            } catch (_: Exception) {
            }
        }
    }

    private fun openPowerSettings() {
        openBatteryOptimizations()
    }

    private fun refresh() {
        // Advance past any step that is already done, unless everything is done.
        var anyIncomplete = false
        for (i in steps.indices) {
            if (!steps[i].isDone()) {
                anyIncomplete = true
                break
            }
        }
        if (!anyIncomplete) {
            showAllDone()
            return
        }
        // Pick the next incomplete step.
        while (index < steps.size && steps[index].isDone()) {
            index += 1
        }
        if (index >= steps.size) index = 0
        render(index)
    }

    private fun showAllDone() {
        binding.titleText.text = ""
        binding.stepText.text = "Setup complete \u2713"
        binding.allDoneText.visibility = android.view.View.VISIBLE
        binding.allDoneText.text = "Everything is ready. Go back to the main screen, scan the pairing QR or enter your URL, and connect."
        binding.stepHintText.text = "You won\u2019t be asked for these again."
        binding.goButton.visibility = android.view.View.GONE
        binding.skipButton.visibility = android.view.View.GONE
        binding.makeItWorkButton.visibility = android.view.View.GONE
        binding.statusList.text = renderStatusList()
    }

    private fun render(index: Int) {
        val total = steps.size
        binding.allDoneText.visibility = android.view.View.GONE
        binding.titleText.text = "STEP ${index + 1} OF $total \u2014 PERMISSION"
        val step = steps[index]
        binding.stepText.text = step.title
        binding.stepHintText.text = step.hint
        binding.goButton.visibility = if (step.isDone()) {
            android.view.View.VISIBLE
        } else {
            android.view.View.VISIBLE
        }
        binding.goButton.text = if (step.isDone()) "Open again" else "Open settings"
        binding.skipButton.visibility = android.view.View.VISIBLE
        binding.makeItWorkButton.visibility = android.view.View.VISIBLE
        binding.statusList.text = renderStatusList()
    }

    private fun renderStatusList(): String {
        return buildString {
            for ((i, step) in steps.withIndex()) {
                val mark = if (step.isDone()) "[x]" else "[ ]"
                append(if (i == index) "> " else "  ")
                append(mark)
                append(" ")
                append(step.title.capitalize().replace("\u201CRestricted settings\u201D", "restricted settings"))
                if (i == index) append("  <-- NEXT")
                append("\n")
            }
        }
    }

    private fun String.capitalize(): String =
        if (isEmpty()) this else replaceFirstChar { it.uppercase() }
}