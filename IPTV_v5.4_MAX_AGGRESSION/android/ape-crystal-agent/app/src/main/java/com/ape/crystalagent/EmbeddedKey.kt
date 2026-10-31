package com.ape.crystalagent

import android.util.Base64
import android.util.Log
import java.nio.charset.StandardCharsets
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Key de `/sync` cifrada dentro del APK (decisión del propietario).
 *
 * Esto es OFUSCACIÓN, no seguridad fuerte: la clave de descifrado también vive en el APK.
 * Evita el archivo manual/ADB y permite instalación autocontenida; la key sigue siendo
 * rotable y el VPS la puede revocar. No se usa para `/ara` (ese token es Bearer aparte).
 */
object EmbeddedKey {
    private const val TAG = "ApeEmbeddedKey"

    // 32 bytes AES-256; ofuscada como hex. El blob cifrado está en BuildConfig.SYNC_KEY_ENC.
    private const val AES_KEY_HEX = "A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90"

    fun keyId(): String = BuildConfig.SYNC_KEY_ID.ifBlank { "k1" }

    fun secret(): String = runCatching {
        val parts = BuildConfig.SYNC_KEY_ENC.split('.')
        require(parts.size == 3) { "blob inválido" }
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val tag = Base64.decode(parts[1], Base64.NO_WRAP)
        val ct = Base64.decode(parts[2], Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(hex(AES_KEY_HEX), "AES"),
            GCMParameterSpec(128, iv)
        )
        val plain = cipher.doFinal(ct + tag)
        String(plain, StandardCharsets.UTF_8).trim()
    }.onFailure { Log.w(TAG, "no se pudo descifrar la key embebida: ${it.message}") }
        .getOrDefault("")

    private fun hex(s: String): ByteArray {
        require(s.length % 2 == 0) { "hex impar" }
        return ByteArray(s.length / 2) { i ->
            ((Character.digit(s[i * 2], 16) shl 4) + Character.digit(s[i * 2 + 1], 16)).toByte()
        }
    }
}
