package com.automation.companion.exec

import android.view.accessibility.AccessibilityEvent
import android.graphics.Rect
import org.json.JSONArray
import org.json.JSONObject

class RecordingSessionManager {

    interface OnTapListener {
        fun onTap(index: Int, x: Float, y: Float)
    }

    interface OnCountListener {
        fun onCountChanged(count: Int)
    }

    private val lock = Any()
    private var activeSessionId: String? = null
    private val capturedSteps = mutableListOf<JSONObject>()
    private var tapCounter = 0
    private val countListeners = mutableListOf<OnCountListener>()

    // Dedup: a single touch commonly emits FOCUSED + SELECTED + CLICKED for the
    // same node. We only record the first gesture seen on a given node within a
    // short window so one tap == one step.
    private var lastCaptureNodeKey: String? = null
    private var lastCaptureTime = 0L
    private val dedupWindowMs = 600L

    var onTap: OnTapListener? = null

    fun addCountListener(listener: OnCountListener) {
        synchronized(lock) {
            if (countListeners.contains(listener)) return
            countListeners.add(listener)
        }
    }

    fun removeCountListener(listener: OnCountListener) {
        synchronized(lock) {
            countListeners.remove(listener)
        }
    }

    private fun notifyCount(count: Int) {
        for (listener in synchronized(lock) { countListeners.toList() }) {
            listener.onCountChanged(count)
        }
    }

    fun currentCount(): Int = synchronized(lock) { tapCounter }

    fun start(sessionId: String) {
        synchronized(lock) {
            activeSessionId = sessionId
            capturedSteps.clear()
            tapCounter = 0
        }
        notifyCount(0)
    }

    fun isRecording(sessionId: String? = null): Boolean = synchronized(lock) {
        val current = activeSessionId ?: return false
        sessionId == null || sessionId == current
    }

    fun captureFromEvent(event: AccessibilityEvent) {
        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_CLICKED,
            AccessibilityEvent.TYPE_VIEW_LONG_CLICKED,
            AccessibilityEvent.TYPE_VIEW_SELECTED,
            AccessibilityEvent.TYPE_VIEW_FOCUSED -> captureTap(event)
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> captureScroll(event)
            else -> {
                // not a gesture we can reproduce
            }
        }
    }

    private fun captureTap(event: AccessibilityEvent) {
        val sourceKey = "${event.windowId}:${event.source?.viewIdResourceName ?: ""}"
        val source = event.source
        var centerX = 0
        var centerY = 0
        var hasBounds = false
        if (source != null) {
            try {
                val bounds = Rect()
                source.getBoundsInScreen(bounds)
                if (!bounds.isEmpty) {
                    centerX = bounds.centerX()
                    centerY = bounds.centerY()
                    hasBounds = true
                }
            } catch (_: Exception) {
                // ignore; bounds are best-effort
            }
        }
        val step = buildStepFromEvent(event) ?: return
        val now = System.currentTimeMillis()
        val nodeKey = sourceKey
        val index = synchronized(lock) {
            if (activeSessionId == null) return
            // Skip duplicate gesture fired on the same node within the dedup window.
            if (lastCaptureNodeKey == nodeKey && now - lastCaptureTime < dedupWindowMs) {
                return
            }
            capturedSteps.add(step)
            tapCounter += 1
            lastCaptureNodeKey = nodeKey
            lastCaptureTime = now
            tapCounter
        }
        notifyCount(index)
        if (hasBounds) {
            onTap?.onTap(index, centerX.toFloat(), centerY.toFloat())
        }
    }

    // A scroll event (RecyclerView/ScrollView/WebView fling) is turned into a
    // swipe step. Accessibility gives us the scroll delta; we reconstruct the
    // finger movement as a swipe gesture at the scrolled view's location.
    private fun captureScroll(event: AccessibilityEvent) {
        if (!isEventAllowed(event)) return
        val source = event.source
        if (source == null) return
        val bounds = Rect()
        try {
            source.getBoundsInScreen(bounds)
        } catch (_: Exception) {
            return
        }
        val dx = event.scrollDeltaX
        val dy = event.scrollDeltaY
        if (dx == 0 && dy == 0) {
            source.recycle()
            return
        }
        val cx = bounds.centerX()
        val cy = bounds.centerY()
        val dist = if (Math.abs(dx) >= Math.abs(dy)) Math.abs(dx) else Math.abs(dy)
        val d = dist.coerceIn(50, 500)
        val (fromX, fromY, toX, toY) = if (Math.abs(dx) >= Math.abs(dy)) {
            // content scrolled horizontally; finger moved opposite to delta
            if (dx > 0) arrayOf(cx + d, cy, cx - d, cy)
            else arrayOf(cx - d, cy, cx + d, cy)
        } else {
            if (dy > 0) arrayOf(cx, cy + d, cx, cy - d)
            else arrayOf(cx, cy - d, cx, cy + d)
        }
        val now = System.currentTimeMillis()
        val nodeKey = "scroll:${event.windowId}:${event.source?.viewIdResourceName ?: ""}"
        val step = JSONObject()
            .put("action", "swipe")
            .put("fromX", fromX)
            .put("fromY", fromY)
            .put("toX", toX)
            .put("toY", toY)
            .put("durationMs", 300)
        val index = synchronized(lock) {
            if (activeSessionId == null) return
            // A single fling produces many scroll events; coalesce per node.
            if (lastCaptureNodeKey == nodeKey && now - lastCaptureTime < dedupWindowMs) {
                return
            }
            capturedSteps.add(step)
            tapCounter += 1
            lastCaptureNodeKey = nodeKey
            lastCaptureTime = now
            tapCounter
        }
        notifyCount(index)
        onTap?.onTap(index, cx.toFloat(), cy.toFloat())
        source.recycle()
    }

    private fun isEventAllowed(event: AccessibilityEvent): Boolean {
        // Do not auto-capture scrolls while a recording session is inactive.
        return synchronized(lock) { activeSessionId != null }
    }

    fun stop(sessionId: String): JSONArray = synchronized(lock) {
        if (activeSessionId != sessionId) {
            return JSONArray()
        }
        val out = JSONArray()
        for (step in capturedSteps) {
            out.put(step)
        }
        activeSessionId = null
        capturedSteps.clear()
        tapCounter = 0
        notifyCount(0)
        out
    }

    fun clear(sessionId: String) {
        synchronized(lock) {
            if (activeSessionId == sessionId) {
                activeSessionId = null
                capturedSteps.clear()
                tapCounter = 0
                notifyCount(0)
            }
        }
    }

    private fun buildStepFromEvent(event: AccessibilityEvent): JSONObject? {
        val source = event.source
        if (source != null) {
            try {
                source.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let {
                    return JSONObject()
                        .put("action", "tap_by_text")
                        .put("text", it)
                }
                source.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let {
                    return JSONObject()
                        .put("action", "tap_by_text")
                        .put("text", it)
                }
                val bounds = Rect()
                source.getBoundsInScreen(bounds)
                if (!bounds.isEmpty) {
                    return JSONObject()
                        .put("action", "tap_by_coordinates")
                        .put("x", bounds.centerX())
                        .put("y", bounds.centerY())
                }
            } finally {
                source.recycle()
            }
        }

        val spoken = event.text
            ?.mapNotNull { it?.toString()?.trim()?.takeIf(String::isNotEmpty) }
            ?.firstOrNull()
        if (spoken != null) {
            return JSONObject()
                .put("action", "tap_by_text")
                .put("text", spoken)
        }

        return null
    }

    // Records a navigation / open-app step that does not originate from a
    // view click (e.g. HOME, BACK, launching an app from home or a folder).
    fun captureNavigation(action: String, pkg: String? = null) {
        val step = if (pkg != null) {
            JSONObject().put("action", action).put("package", pkg)
        } else {
            JSONObject().put("action", action)
        }
        val index = synchronized(lock) {
            if (activeSessionId == null) return
            capturedSteps.add(step)
            tapCounter += 1
            tapCounter
        }
        notifyCount(index)
    }

    // Steps injected remotely from the live-view panel are recorded with exact
    // screen coordinates so replay reproduces what was demonstrated.
    fun captureRemoteTap(x: Float, y: Float) {
        val step = JSONObject()
            .put("action", "tap_by_coordinates")
            .put("x", x.toInt())
            .put("y", y.toInt())
        val index = synchronized(lock) {
            if (activeSessionId == null) return
            capturedSteps.add(step)
            tapCounter += 1
            tapCounter
        }
        notifyCount(index)
        onTap?.onTap(index, x, y)
    }

    fun captureRemoteSwipe(
        fromX: Float,
        fromY: Float,
        toX: Float,
        toY: Float,
        durationMs: Long,
    ) {
        val step = JSONObject()
            .put("action", "swipe")
            .put("fromX", fromX.toInt())
            .put("fromY", fromY.toInt())
            .put("toX", toX.toInt())
            .put("toY", toY.toInt())
            .put("durationMs", durationMs.toInt().coerceAtLeast(50))
        val index = synchronized(lock) {
            if (activeSessionId == null) return
            capturedSteps.add(step)
            tapCounter += 1
            tapCounter
        }
        notifyCount(index)
        onTap?.onTap(index, toX, toY)
    }
}
