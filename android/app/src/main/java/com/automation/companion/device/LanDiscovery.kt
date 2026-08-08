package com.automation.companion.device

import android.content.Context
import android.net.wifi.WifiManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import java.util.concurrent.TimeUnit

object LanDiscovery {

    private const val DISCOVERY_PORT = 45678
    private const val PROBE = "pa:lan:discover"

    private val probeClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(1500, TimeUnit.MILLISECONDS)
            .readTimeout(1500, TimeUnit.MILLISECONDS)
            .writeTimeout(1500, TimeUnit.MILLISECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    /**
     * Broadcasts a UDP probe and returns relay URLs reported by any responder.
     * The returned list is in preference order: the requester's own subnet first
     * (so Wi-Fi is chosen over a wired/Ethernet or virtual adapter), and each URL
     * is reachability-checked via the relay's /healthz endpoint. Unreachable URLs
     * are dropped, so the first element is a working address whenever possible.
     * Returns an empty list if nothing answers or is reachable.
     */
    suspend fun findRelayUrls(context: Context): List<String> = withContext(Dispatchers.IO) {
        val discovered = mutableListOf<String>()
        var lock: WifiManager.MulticastLock? = null
        try {
            lock = (context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager)
                ?.createMulticastLock("pa-lan-discovery")
            lock?.setReferenceCounted(true)
            lock?.acquire()
            DatagramSocket().use { socket ->
                socket.broadcast = true
                socket.soTimeout = 2200
                val probe = PROBE.toByteArray(Charsets.UTF_8)
                val broadcast = InetAddress.getByName("255.255.255.255")
                socket.send(DatagramPacket(probe, probe.size, broadcast, DISCOVERY_PORT))

                for (ip in localIpv4Addresses()) {
                    try {
                        socket.send(DatagramPacket(probe, probe.size, InetAddress.getByName(ip), DISCOVERY_PORT))
                    } catch (_: Exception) {
                        // not addressable as broadcast target; skip
                    }
                }

                val deadline = System.currentTimeMillis() + 2200
                while (System.currentTimeMillis() < deadline) {
                    val buf = ByteArray(4096)
                    val packet = DatagramPacket(buf, buf.size)
                    try {
                        socket.receive(packet)
                    } catch (e: Exception) {
                        break
                    }
                    val text = String(packet.data, 0, packet.length, Charsets.UTF_8)
                    val parsed = try {
                        JSONObject(text)
                    } catch (_: Exception) {
                        continue
                    }
                    val arr = parsed.optJSONArray("urls") ?: continue
                    for (i in 0 until arr.length()) {
                        val u = arr.optString(i)
                        if (u.isNotBlank() && u.startsWith("http")) discovered.add(u)
                    }
                }
            }
        } catch (_: Exception) {
            // discovery unavailable; use whatever we gathered
        } finally {
            runCatching { lock?.release() }
        }

        discovered.distinct()
            .sortedBy { preference(it) }
            .filter { isReachable(it) }
    }

    private fun preference(url: String): Int {
        val host = url.replace("^https?://".toRegex(), "").split(":")[0]
        // Fall back to matching against our own interfaces so the address we
        // can actually reach over Wi-Fi is preferred over a wired/virtual one.
        var inLocalSubnet = false
        var isWifi = false
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return 2
            for (nif in interfaces) {
                if (!nif.isUp || nif.isLoopback) continue
                for (addr in nif.inetAddresses) {
                    val h = addr.hostAddress ?: continue
                    if (addr.isSiteLocalAddress && h.contains(".")) {
                        if (sameSubnet(host, h)) inLocalSubnet = true
                    }
                }
                val n = nif.name.lowercase()
                if (n.contains("wlan") || n.contains("wl") || n.contains("wifi")) isWifi = true
            }
        } catch (_: Exception) {
            // ignore
        }
        return when {
            inLocalSubnet && isWifi -> 0
            inLocalSubnet -> 1
            else -> 2
        }
    }

    private fun sameSubnet(a: String, b: String): Boolean {
        val pa = a.split(".")
        val pb = b.split(".")
        if (pa.size != 4 || pb.size != 4) return false
        return pa[0] == pb[0] && pa[1] == pb[1] && pa[2] == pb[2]
    }

    private fun isReachable(url: String): Boolean {
        return try {
            val req = Request.Builder().url("$url/healthz").get().build()
            probeClient.newCall(req).execute().use { it.isSuccessful }
        } catch (_: Exception) {
            false
        }
    }

    private fun localIpv4Addresses(): List<String> {
        val out = mutableListOf<String>()
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return out
            for (nif in interfaces) {
                if (!nif.isUp || nif.isLoopback) continue
                for (addr in nif.inetAddresses) {
                    val host = addr.hostAddress ?: continue
                    if (addr.isSiteLocalAddress && host.contains(".")) {
                        out.add(host)
                    }
                }
            }
        } catch (_: Exception) {
            // ignore
        }
        return out
    }
}