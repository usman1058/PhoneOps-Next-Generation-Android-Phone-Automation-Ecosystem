package com.automation.companion.exec

import android.content.Context
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.WindowManager

/**
 * Manages a full-screen, touch-through overlay that shows numbered circles
 * for each tap captured during a recording session. Uses the
 * accessibility overlay window type so it does not require any extra
 * permission beyond the already-enabled accessibility service.
 */
class TapOverlayManager(private val context: Context) {

    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    private var view: TapOverlayView? = null
    private var attached = false

    private val layoutParams: WindowManager.LayoutParams
        get() = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            windowType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0
            y = 0
        }

    private fun windowType(): Int {
        @Suppress("DEPRECATION")
        return WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
    }

    fun addTap(x: Float, y: Float, index: Int) {
        ensureAttached()
        view?.addTap(x, y, index)
    }

    fun clear() {
        view?.clear()
    }

    fun detach() {
        val v = view ?: return
        if (attached) {
            runCatching { windowManager.removeView(v) }
        }
        view = null
        attached = false
    }

    private fun ensureAttached() {
        if (view == null) {
            view = TapOverlayView(context)
        }
        if (attached) return
        val current = view!!
        val added = runCatching { windowManager.addView(current, layoutParams) }.isSuccess
        attached = added
    }
}
