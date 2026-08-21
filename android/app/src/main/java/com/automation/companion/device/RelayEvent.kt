package com.automation.companion.device

sealed interface RelayEvent {
    data class Connected(val deviceId: String) : RelayEvent
    data class Disconnected(val reason: String?) : RelayEvent
    data class RunTask(val runId: String, val stepsJson: String) : RelayEvent
    data class StartRecording(val sessionId: String) : RelayEvent
    data class StopRecording(val sessionId: String) : RelayEvent

    /** The panel asked for a screen share but consent is missing/expired. */
    data object ScreenPermissionNeeded : RelayEvent
    data class Error(val message: String) : RelayEvent
}
