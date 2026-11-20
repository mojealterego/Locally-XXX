package com.example.app
import android.os.Bundle
class Prefs {
    val values = mutableMapOf<String, Any>()
    var fail = false
    fun contains(key: String) = values.containsKey(key)
    fun getLong(key: String, default: Long) = values[key] as? Long ?: default
    fun getString(key: String, default: String): String? = values[key] as? String ?: default
    fun getBoolean(key: String, default: Boolean) = values[key] as? Boolean ?: default
    fun edit() = Editor()
    inner class Editor {
        private val pending = mutableMapOf<String, Any>()
        fun putLong(key: String, value: Long) = apply { pending[key] = value }
        fun putString(key: String, value: String) = apply { pending[key] = value }
        fun putBoolean(key: String, value: Boolean) = apply { pending[key] = value }
        fun commit(): Boolean { if (fail) return false; values.putAll(pending); return true }
    }
}
open class TauriActivity {
    companion object { val prefs = Prefs() }
    val MODE_PRIVATE = 0
    val calls = mutableListOf<String>()
    fun getSharedPreferences(name: String, mode: Int): Prefs { check(name == "omega_lifecycle_v1" && mode == 0); return prefs }
    open fun onCreate(savedInstanceState: Bundle?) { calls.add("create") }
    open fun onStart() { calls.add("start") }
    open fun onStop() { calls.add("stop") }
    open fun onDestroy() { calls.add("destroy") }
}
