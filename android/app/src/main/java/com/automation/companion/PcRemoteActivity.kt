package com.automation.companion

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.automation.companion.databinding.ActivityPcRemoteBinding
import com.automation.companion.device.AgentInfo
import com.automation.companion.device.RelayEvent
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Phone -> PC remote control. Streams the Windows agent's screen and turns
 * touch input into mouse clicks/drags; the text box sends keystrokes.
 * Coordinates are sent as 0..1 fractions of the streamed frame so they map
 * correctly onto any monitor resolution.
 */
class PcRemoteActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPcRemoteBinding
    private val app: CompanionApp
        get() = application as CompanionApp

    private var agents: List<AgentInfo> = emptyList()
    private var selectedAgent: AgentInfo? = null
    private var connectedAgentId: String? = null
    private var frameW = 0
    private var frameH = 0
    private var collector: Job? = null
    private var downAt: Pair<Float, Float>? = null
    private var downTime = 0L

    @SuppressLint("ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPcRemoteBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.connectPcButton.setOnClickListener {
            val agent = selectedAgent ?: run {
                Toast.makeText(this, "Pick a PC first", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            setStatus("Connecting to ${agent.name}…")
            connectedAgentId = null
            app.relayClient.connectPc(agent.id)
        }

        binding.disconnectPcButton.setOnClickListener {
            setStatus("Disconnected")
            connectedAgentId = null
            frameW = 0
            frameH = 0
            binding.pcScreenView.setImageDrawable(null)
            binding.pcPlaceholder.visibility = View.VISIBLE
            app.relayClient.requestPcList()
        }

        binding.keyEnterButton.setOnClickListener { sendKey("enter") }
        binding.keyEscButton.setOnClickListener { sendKey("esc") }
        binding.textInput.setOnEditorActionListener { _, _, _ ->
            val text = binding.textInput.text?.toString().orEmpty()
            if (text.isNotEmpty() && connectedAgentId != null) {
                sendAction(
                    JSONObject()
                        .put("kind", "text")
                        .put("text", text),
                )
                sendKey("enter")
                binding.textInput.setText("")
            }
            true
        }

        binding.pcSpinner.onItemSelectedListener =
            object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(
                    parent: AdapterView<*>?,
                    view: View?,
                    position: Int,
                    id: Long,
                ) {
                    selectedAgent = agents.getOrNull(position)
                }

                override fun onNothingSelected(parent: AdapterView<*>?) {
                    selectedAgent = null
                }
            }

        // Touch on the screen: tap = click, drag = click-and-drag.
        binding.screenWrap.setOnTouchListener { _, event ->
            if (connectedAgentId == null) return@setOnTouchListener false
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downAt = Pair(event.x, event.y)
                    downTime = System.currentTimeMillis()
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val down = downAt
                    downAt = null
                    if (down != null && frameW > 0 && frameH > 0) {
                        val dx = event.x - down.first
                        val dy = event.y - down.second
                        val distance = Math.hypot(dx.toDouble(), dy.toDouble())
                        if (distance > 30f) {
                            sendDrag(down.first, down.second, event.x, event.y)
                        } else {
                            sendClick(event.x, event.y)
                        }
                    }
                    true
                }
                else -> false
            }
        }

        collectEvents()
    }

    override fun onResume() {
        super.onResume()
        app.relayClient.requestPcList()
        collectEvents()
    }

    override fun onPause() {
        collector?.cancel()
        collector = null
        super.onPause()
    }

    private fun collectEvents() {
        collector?.cancel()
        collector = app.appScope.launch {
            app.relayClient.events.collect { event ->
                when (event) {
                    is RelayEvent.PcAgents -> {
                        agents = event.agents
                        val names = agents.map { it.name }.ifEmpty {
                            listOf("(no PCs online — start the agent)")
                        }
                        binding.pcSpinner.adapter = ArrayAdapter(
                            this@PcRemoteActivity,
                            android.R.layout.simple_spinner_dropdown_item,
                            names,
                        )
                        selectedAgent = agents.firstOrNull()
                    }
                    is RelayEvent.PcSession -> {
                        if (event.ok) {
                            connectedAgentId = event.agentId
                            setStatus("Connected — tap to click, drag to drag")
                            binding.pcPlaceholder.visibility = View.INVISIBLE
                        } else {
                            connectedAgentId = null
                            setStatus(event.error ?: "Could not connect to PC")
                        }
                    }
                    is RelayEvent.PcFrame -> {
                        if (connectedAgentId == null || event.agentId != connectedAgentId) return@collect
                        frameW = event.w
                        frameH = event.h
                        val bitmap = BitmapFactory.decodeByteArray(
                            event.data,
                            0,
                            event.data.size,
                        )
                        if (bitmap != null) {
                            binding.pcScreenView.setImageBitmap(bitmap)
                        }
                    }
                    is RelayEvent.Disconnected -> setStatus(
                        "Relay offline — reconnect on the main screen",
                    )
                    else -> Unit
                }
            }
        }
    }

    private fun normalized(x: Float, y: Float): Pair<Float, Float> {
        if (frameW <= 0 || frameH <= 0) return 0f to 0f
        val view = binding.screenWrap
        // The ImageView letterboxes with fitCenter; compute the drawn area.
        val viewW = view.width.toFloat()
        val viewH = view.height.toFloat()
        val scale = minOf(viewW / frameW, viewH / frameH)
        val drawW = frameW * scale
        val drawH = frameH * scale
        val offX = (viewW - drawW) / 2f
        val offY = (viewH - drawH) / 2f
        val nx = ((x - offX) / drawW).coerceIn(0f, 1f)
        val ny = ((y - offY) / drawH).coerceIn(0f, 1f)
        return nx to ny
    }

    private fun sendClick(x: Float, y: Float) {
        val agent = connectedAgentId ?: return
        val (nx, ny) = normalized(x, y)
        app.relayClient.sendPcInput(
            agent,
            JSONObject()
                .put("kind", "click")
                .put("x", nx.toDouble())
                .put("y", ny.toDouble()),
        )
    }

    private fun sendDrag(x: Float, y: Float, x2: Float, y2: Float) {
        val agent = connectedAgentId ?: return
        val (nx, ny) = normalized(x, y)
        val (nx2, ny2) = normalized(x2, y2)
        app.relayClient.sendPcInput(
            agent,
            JSONObject()
                .put("kind", "drag")
                .put("x", nx.toDouble())
                .put("y", ny.toDouble())
                .put("x2", nx2.toDouble())
                .put("y2", ny2.toDouble())
                .put("durationMs", 250),
        )
    }

    private fun sendKey(key: String) {
        val agent = connectedAgentId ?: return
        app.relayClient.sendPcInput(
            agent,
            JSONObject().put("kind", "key").put("key", key),
        )
    }

    private fun sendAction(action: JSONObject) {
        val agent = connectedAgentId ?: return
        app.relayClient.sendPcInput(agent, action)
    }

    private fun setStatus(text: String) {
        binding.pcStatusText.text = text
    }
}
