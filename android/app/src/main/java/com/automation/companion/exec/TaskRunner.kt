package com.automation.companion.exec

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class TaskRunner(
    private val service: AccessibilityService,
    private val scope: CoroutineScope,
    private val onReport: (runId: String, type: String, stepIndex: Int, status: String, error: String?) -> Unit,
) {

    private val handler = Handler(Looper.getMainLooper())

    fun execute(runId: String, stepsJson: String) {
        scope.launch {
            val steps = try {
                JSONArray(stepsJson)
            } catch (e: Exception) {
                onReport(runId, "run_complete", -1, "failed", "Invalid steps payload")
                return@launch
            }

            var failed: Pair<Int, String>? = null
            for (i in 0 until steps.length()) {
                val step = steps.getJSONObject(i)
                val (ok, error) = try {
                    runStep(step)
                } catch (e: Exception) {
                    false to (e.message ?: "Exception")
                }
                if (!ok) {
                    onReport(runId, "step_result", i, "failed", error)
                    failed = i to (error ?: "Step failed")
                    break
                }
                onReport(runId, "step_result", i, "success", null)
            }

            if (failed != null) {
                onReport(runId, "run_complete", failed.first, "failed", failed.second)
            } else {
                onReport(runId, "run_complete", steps.length() - 1, "success", null)
            }
        }
    }

    private suspend fun runStep(step: JSONObject): Pair<Boolean, String?> {
        val action = step.optString("action")
        return when (action) {
            "open_app" -> openApp(step.optString("package"))
            "tap_by_text" -> tapByText(step.optString("text"), step.optLong("timeoutMs", 5000))
            "tap_by_coordinates" -> tapCoordinates(
                step.optDouble("x"),
                step.optDouble("y"),
            )
            "swipe" -> swipe(
                step.optDouble("fromX"),
                step.optDouble("fromY"),
                step.optDouble("toX"),
                step.optDouble("toY"),
                step.optLong("durationMs", 300),
            )
            "wait" -> {
                delay(step.optLong("ms", 1000))
                true to null
            }
            "back" -> {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
                delay(500)
                true to null
            }
            "home" -> {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
                delay(500)
                true to null
            }
            else -> false to "Unknown action: $action"
        }
    }

    private fun openApp(pkg: String): Pair<Boolean, String?> {
        val intent = service.packageManager.getLaunchIntentForPackage(pkg)
        if (intent == null) return false to "Package not installed: $pkg"
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        service.startActivity(intent)
        return true to null
    }

    private suspend fun tapByText(text: String, timeoutMs: Long): Pair<Boolean, String?> {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val node = findNodeByText(text)
            if (node != null) {
                val clicked = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                if (clicked) {
                    node.recycle()
                    return true to null
                }
                val bounds = android.graphics.Rect()
                node.getBoundsInScreen(bounds)
                node.recycle()
                tapOn(bounds.centerX().toDouble(), bounds.centerY().toDouble())
                return true to null
            }
            delay(300)
        }
        return false to "Element not found: '$text'"
    }

    private fun findNodeByText(text: String): AccessibilityNodeInfo? {
        val root = service.rootInActiveWindow ?: return null
        return findInTree(root, text)
    }

    private fun findInTree(node: AccessibilityNodeInfo, text: String): AccessibilityNodeInfo? {
        val nodeText = node.text?.toString()
        val desc = node.contentDescription?.toString()
        if (text.equals(nodeText, ignoreCase = true) || text.equals(desc, ignoreCase = true)) {
            return node
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findInTree(child, text)
            if (found != null) {
                return found
            }
            child.recycle()
        }
        return null
    }

    private suspend fun tapCoordinates(x: Double, y: Double): Pair<Boolean, String?> {
        tapOn(x, y)
        return true to null
    }

    private fun tapOn(x: Double, y: Double) {
        val path = Path().apply { moveTo(x.toFloat(), y.toFloat()) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 60))
            .build()
        service.dispatchGesture(gesture, null, handler)
    }

    private suspend fun swipe(
        fromX: Double,
        fromY: Double,
        toX: Double,
        toY: Double,
        durationMs: Long,
    ): Pair<Boolean, String?> {
        val path = Path().apply {
            moveTo(fromX.toFloat(), fromY.toFloat())
            lineTo(toX.toFloat(), toY.toFloat())
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs.coerceAtLeast(1)))
            .build()
        service.dispatchGesture(gesture, null, handler)
        delay(durationMs + 200)
        return true to null
    }
}
