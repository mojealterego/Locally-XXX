package com.example.app
/** UI-only Android class substitute; actual panel requires Android SDK on device. */
internal class OmegaAgentStatusPanel(private val activity: TauriActivity, private val heavyWorkAllowed: () -> Boolean) {
    private var attached = false
    fun attach() { check(!attached); attached = true }
    fun detach() { attached = false }
}
