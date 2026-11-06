package dev.venice.ottshim

object Log {
    @Volatile var sink: ((String) -> Unit)? = null
    fun d(message: String) {
        sink?.invoke("${System.currentTimeMillis() % 100000} $message")
    }
}
