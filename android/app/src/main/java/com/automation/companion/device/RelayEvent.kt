package com.automation.companion.device

data class AgentInfo(val id: String, val name: String)

sealed interface RelayEvent {
    data class Connected(val deviceId: String) : RelayEvent
    data class Disconnected(val reason: String?) : RelayEvent
    data class RunTask(val runId: String, val stepsJson: String) : RelayEvent
    data class StartRecording(val sessionId: String) : RelayEvent
    data class StopRecording(val sessionId: String) : RelayEvent

    /** The panel asked for a screen share but consent is missing/expired. */
    data object ScreenPermissionNeeded : RelayEvent
    data class PcAgents(val agents: List<AgentInfo>) : RelayEvent
    data class PcSession(val agentId: String, val ok: Boolean, val error: String?) : RelayEvent
    data class PcFrame(val agentId: String, val w: Int, val h: Int, val data: ByteArray) : RelayEvent
    data class Error(val message: String) : RelayEvent
}
