package com.automation.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.Log
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Streams compressed screen frames over the relay socket while the panel is
 * watching. Frames are RGBA captures scaled to [MirrorParams.maxW], JPEG
 * encoded and base64 wrapped into `screen_frame` messages.
 */
class ScreenMirrorService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private val running = AtomicBoolean(false)
    private var params: MirrorParams? = null
    private var seq = 0L
    private var lastFrameAt = 0L
    private var pendingImage: Image? = null

    private val frameRunnable = object : Runnable {
        override fun run() {
            if (!running.get()) return
            emitLatestFrame()
            val fps = (params?.fps ?: 4).coerceIn(1, 15)
            handler.postDelayed(this, (1000L / fps))
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopMirror()
            return START_NOT_STICKY
        }

        val p = CompanionApp.pendingMirrorParams ?: run {
            stopSelf()
            return START_NOT_STICKY
        }
        params = p

        startForegroundCompat()

        if (!running.get()) {
            if (!startCapture(p)) {
                updateNotification("Screen share failed")
                stopSelf()
                return START_NOT_STICKY
            }
            running.set(true)
            handler.post(frameRunnable)
            updateNotification("Sharing screen with panel")
        }
        return START_STICKY
    }

    private fun startCapture(p: MirrorParams): Boolean {
        val data = ProjectionHolder.consume() ?: return false
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val proj = try {
            manager.getMediaProjection(android.app.Activity.RESULT_OK, data)
        } catch (e: Exception) {
            Log.w(TAG, "media projection rejected", e)
            return false
        }
        projection = proj
        proj.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                handler.post { stopMirror() }
            }
        }, handler)

        val metrics = resources.displayMetrics
        val screenW = metrics.widthPixels
        val screenH = metrics.heightPixels
        val scale = minOf(1f, p.maxW.toFloat() / screenW.toFloat())
        val outW = (screenW * scale).toInt().coerceAtLeast(120)
        val outH = (screenH * scale).toInt().coerceAtLeast(120)

        imageReader = ImageReader.newInstance(outW, outH, PixelFormat.RGBA_8888, 2)
        virtualDisplay = proj.createVirtualDisplay(
            "phoneops-mirror",
            outW,
            outH,
            metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader!!.surface,
            null,
            handler,
        )
        return true
    }

    private fun emitLatestFrame() {
        val reader = imageReader ?: return
        val image = try {
            reader.acquireLatestImage() ?: return
        } catch (e: Exception) {
            return
        }
        // Keep only the newest frame; release the previous one.
        pendingImage?.close()
        pendingImage = null
        val bitmap = imageToBitmap(image) ?: run {
            image.close()
            return
        }
        image.close()

        val now = System.currentTimeMillis()
        if (now - lastFrameAt < 40) {
            bitmap.recycle()
            return
        }
        lastFrameAt = now

        val quality = (params?.quality ?: 45).coerceIn(20, 90)
        val bytes = ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            bitmap.recycle()
            out.toByteArray()
        }

        val payload = JSONObject()
            .put("type", "screen_frame")
            .put("sessionId", params?.sessionId ?: "")
            .put("seq", ++seq)
            .put("w", bitmapWidth)
            .put("h", bitmapHeight)
            .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
        (application as CompanionApp).relayClient.send(payload.toString())
    }

    private var bitmapWidth = 0
    private var bitmapHeight = 0

    private fun imageToBitmap(image: Image): Bitmap? {
        return try {
            val plane = image.planes[0]
            val buffer = plane.buffer
            val pixelStride = plane.pixelStride
            val rowStride = plane.rowStride
            val rowPadding = rowStride - pixelStride * image.width
            val full = Bitmap.createBitmap(
                image.width + rowPadding / pixelStride,
                image.height,
                Bitmap.Config.ARGB_8888,
            )
            full.copyPixelsFromBuffer(buffer)
            val cropped = if (rowPadding > 0) {
                Bitmap.createBitmap(full, 0, 0, image.width, image.height)
                    .also { if (it != full) full.recycle() }
            } else {
                full
            }
            bitmapWidth = cropped.width
            bitmapHeight = cropped.height
            cropped
        } catch (e: Exception) {
            Log.w(TAG, "frame conversion failed", e)
            null
        }
    }

    private fun stopMirror() {
        if (!running.getAndSet(false)) {
            stopSelf()
            return
        }
        handler.removeCallbacks(frameRunnable)
        try {
            virtualDisplay?.release()
        } catch (_: Exception) {
        }
        virtualDisplay = null
        try {
            imageReader?.close()
        } catch (_: Exception) {
        }
        imageReader = null
        try {
            projection?.stop()
        } catch (_: Exception) {
        }
        projection = null
        pendingImage?.close()
        pendingImage = null
        ProjectionHolder.clear()
        stopSelf()
    }

    override fun onDestroy() {
        handler.removeCallbacks(frameRunnable)
        running.set(false)
        try {
            virtualDisplay?.release()
        } catch (_: Exception) {
        }
        virtualDisplay = null
        try {
            imageReader?.close()
        } catch (_: Exception) {
        }
        imageReader = null
        try {
            projection?.stop()
        } catch (_: Exception) {
        }
        projection = null
        super.onDestroy()
    }

    private fun startForegroundCompat() {
        val notification = buildNotification("Preparing screen share…")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIF_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
            )
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun buildNotification(text: String): Notification {
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIF_ID, buildNotification(text))
    }

    companion object {
        private const val TAG = "ScreenMirrorService"
        private const val CHANNEL_ID = "screen_mirror"
        private const val NOTIF_ID = 1002
        const val ACTION_STOP = "com.automation.companion.STOP_MIRROR"

        fun ensureChannel(context: Context) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Screen sharing",
                    NotificationManager.IMPORTANCE_LOW,
                ),
            )
        }
    }
}
