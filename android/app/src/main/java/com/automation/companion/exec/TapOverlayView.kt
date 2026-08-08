package com.automation.companion.exec

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.view.View

/**
 * Overlay view that draws a numbered circle at each captured tap.
 * The number indicates the order of the tap during recording.
 */
class TapOverlayView(context: Context) : View(context) {

    private data class Tap(val x: Float, val y: Float, val index: Int)

    private val taps = mutableListOf<Tap>()
    private val maxTaps = 40

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xE6266BB0.toInt()
        style = Paint.Style.FILL
    }
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF66BB6A.toInt()
        style = Paint.Style.STROKE
        strokeWidth = 4f
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        textSize = 34f
        typeface = Typeface.DEFAULT_BOLD
        textAlign = Paint.Align.CENTER
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        textSize = 20f
        typeface = Typeface.DEFAULT_BOLD
        textAlign = Paint.Align.CENTER
    }

    private val radius = 34f

    fun addTap(x: Float, y: Float, index: Int) {
        taps.add(Tap(x, y, index))
        if (taps.size > maxTaps) {
            taps.removeAt(0)
        }
        invalidate()
    }

    fun clear() {
        taps.clear()
        invalidate()
    }

    fun isEmpty(): Boolean = taps.isEmpty()

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val safeTop = 96f
        for (tap in taps) {
            val cy = tap.y.coerceAtLeast(safeTop)
            canvas.drawCircle(tap.x, cy, radius, fillPaint)
            canvas.drawCircle(tap.x, cy, radius, strokePaint)
            val baseline = cy - (textPaint.descent() + textPaint.ascent()) / 2
            canvas.drawText(tap.index.toString(), tap.x, baseline, textPaint)
        }
        if (taps.isNotEmpty()) {
            val countText = "Taps: ${taps.size}"
            val textWidth = labelPaint.measureText(countText)
            val pad = 20f
            val left = width - textWidth - pad * 2
            val top = 12f
            canvas.drawRoundRect(left, top, width - 12f, top + 48f, 16f, 16f, fillPaint)
            val baseline = top + 48f / 2 - (labelPaint.descent() + labelPaint.ascent()) / 2
            canvas.drawText(countText, left + pad, baseline, labelPaint)
        }
    }
}
