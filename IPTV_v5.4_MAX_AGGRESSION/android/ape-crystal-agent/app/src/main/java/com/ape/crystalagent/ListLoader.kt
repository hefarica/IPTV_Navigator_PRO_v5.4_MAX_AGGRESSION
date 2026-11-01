package com.ape.crystalagent

import android.util.Base64
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/** Un canal de la lista APE (URL-1 verbatim del proveedor + la metadata iData de URL-2). */
data class IptvChannel(
    val name: String, val url: String, val group: String, val logo: String,
    val profile: String, val contentType: String, val codec: String
)

/**
 * Descarga + parsea la lista en STREAMING (F3). NUNCA carga el ~1GB en RAM: lee línea-a-línea y
 * emite un IptvChannel por bloque. La URL del canal se conserva VERBATIM (SHIELDED Ley 5). NO-DELETE:
 * no descarta tags; solo extrae los campos que el grid necesita (el resto de iData sigue intacto en la
 * lista que el VPS/player consumen).
 */
class ListLoader(private val cfg: Config) {

    /** JSON metadata global de la lista (#EXT-X-APE-LAB-METADATA). */
    @Volatile
    var labMetadata: JSONObject? = null
        private set
    @Volatile
    var labMetadataSha256: String = ""
        private set

    private val labMetaParts = HashMap<Int, String>()
    private var labMetaTotal = 0

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)   // lista grande
        .build()

    /** @return cantidad de canales parseados. onChannel se invoca por cada uno (hilo del caller). */
    fun loadStreaming(listUrl: String, onChannel: (IptvChannel) -> Unit): Int {
        val req = Request.Builder().url(listUrl)
            .apply { if (cfg.hasToken()) addHeader("Authorization", "Bearer ${cfg.token}") }
            .build()
        var count = 0
        labMetaParts.clear()
        labMetaTotal = 0
        client.newCall(req).execute().use { r ->
            if (!r.isSuccessful) { Log.w(TAG, "list HTTP ${r.code}"); return 0 }
            val body = r.body ?: return 0
            BufferedReader(InputStreamReader(body.byteStream())).use { reader ->
                var meta = HashMap<String, String>()
                reader.forEachLine { line ->
                    when {
                        line.startsWith("#EXT-X-APE-LAB-METADATA:") -> {
                            try {
                                val body = line.substring("#EXT-X-APE-LAB-METADATA:".length).trim()
                                val m = Regex("""^(\d+)/(\d+):(.+)$""").find(body)
                                if (m != null) {
                                    val idx = m.groupValues[1].toInt()
                                    labMetaTotal = m.groupValues[2].toInt()
                                    labMetaParts[idx] = m.groupValues[3]
                                    if (labMetaParts.size == labMetaTotal) {
                                        val b64 = (1..labMetaTotal).joinToString("") {
                                            labMetaParts[it] ?: ""
                                        }
                                        applyLabMetadataB64(b64)
                                        labMetaParts.clear()
                                    }
                                } else {
                                    // Compatibilidad con metadata de una línea.
                                    applyLabMetadataB64(body)
                                }
                            } catch (e: Exception) {
                                Log.w(TAG, "LAB metadata inválida: ${e.message}")
                            }
                        }
                        line.startsWith("#EXTINF") -> meta = parseMeta(line)
                        line.startsWith("http") -> {
                            onChannel(
                                IptvChannel(
                                    name = meta["tvg-name"] ?: "",
                                    url = line.trim(),                    // VERBATIM
                                    group = meta["group-title"] ?: "",
                                    logo = meta["tvg-logo"] ?: "",
                                    profile = meta["ape-profile"] ?: "P2",
                                    contentType = meta["ape-content-type"] ?: "",
                                    codec = meta["ape-codec-family"] ?: ""
                                )
                            )
                            count++; meta = HashMap()
                        }
                    }
                }
            }
        }
        Log.i(TAG, "Lista: $count canales")
        return count
    }

    private fun applyLabMetadataB64(b64: String) {
        val raw = Base64.decode(b64, Base64.DEFAULT)
        val json = JSONObject(String(raw, StandardCharsets.UTF_8))
        labMetadata = json
        labMetadataSha256 = MessageDigest.getInstance("SHA-256")
            .digest(raw).joinToString("") { "%02x".format(it) }
        AraStatus.labMetadataProfile = json.optString("profile")
        AraStatus.labMetadataSha256 = labMetadataSha256
        AraStatus.labMetadataFieldCount =
            json.optJSONObject("fields")?.length() ?: 0
        cfg.saveLabMetadata(json.toString(), labMetadataSha256)
        Log.i(TAG, "LAB metadata: profile=${json.optString("profile")} sha=${labMetadataSha256.take(16)}")
    }

    private fun parseMeta(extinf: String): HashMap<String, String> {
        val map = HashMap<String, String>()
        Regex("""([\w-]+)="([^"]*)"""").findAll(extinf).forEach { m ->
            map[m.groupValues[1]] = m.groupValues[2]
        }
        return map
    }

    companion object { const val TAG = "ApeListLoader" }
}
