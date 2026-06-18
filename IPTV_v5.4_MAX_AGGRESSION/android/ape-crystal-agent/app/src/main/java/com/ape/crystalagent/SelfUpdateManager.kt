package com.ape.crystalagent

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Auto-update: consulta /ara/version cada 1h. Si hay versión nueva → descarga /ara/agent.apk,
 * verifica integridad (SHA-256) Y autenticidad (firma del APK == firma de la app instalada),
 * y lanza el intent de instalación. MY_PACKAGE_REPLACED re-arranca el servicio. Si ya está al día → nada.
 *
 * SEGURIDAD (review HIGH 2026-06-18):
 *  - FAIL-CLOSED: si el VPS no provee sha256 → NO instala (no confiar en download sin hash).
 *  - PINNING DE FIRMA: aunque el VPS estuviera comprometido y sirviera un APK con sha256 "correcto",
 *    el APK debe estar firmado por el MISMO certificado que la app YA instalada; si no, se descarta.
 *    Un atacante sin la clave de firma del propietario no puede producir un update aceptable.
 */
class SelfUpdateManager(private val ctx: Context, private val cfg: Config) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()
    @Volatile private var job: Job? = null
    private val prefs = ctx.getSharedPreferences("ape", Context.MODE_PRIVATE)

    fun start(scope: CoroutineScope) {
        job?.cancel()
        job = scope.launch(Dispatchers.IO) {
            delay(60_000L)
            while (isActive) {
                try { checkAndUpdate() }
                catch (e: CancellationException) { throw e }
                catch (e: Exception) { Log.w(TAG, "update check err: ${e.message}") }
                delay(3_600_000L)
            }
        }
    }

    fun stop() { job?.cancel(); job = null }

    private fun checkAndUpdate() {
        client.newCall(Request.Builder().url("${cfg.vpsBase}/ara/version").build()).execute().use { r ->
            if (!r.isSuccessful) return
            val obj = JSONObject(r.body?.string() ?: return)
            val remoteVer = obj.optString("version", "")
            val remoteSha = obj.optString("sha256", "")
            val localVer = prefs.getString("apk_version", "") ?: ""
            if (remoteVer.isEmpty() || remoteVer == localVer) return
            Log.i(TAG, "nueva versión: $remoteVer (local: $localVer)")
            downloadAndInstall(remoteVer, remoteSha)
        }
    }

    private fun downloadAndInstall(version: String, expectedSha: String) {
        // (1) FAIL-CLOSED: sin hash no se instala.
        if (expectedSha.isBlank()) { Log.e(TAG, "sha256 ausente — fail-closed, update DESCARTADO"); return }

        val outFile = File(ctx.cacheDir, "ape-update.apk")
        client.newCall(Request.Builder().url("${cfg.vpsBase}/ara/agent.apk").build()).execute().use { r ->
            if (!r.isSuccessful) { Log.w(TAG, "download apk http=${r.code}"); return }
            outFile.outputStream().use { out -> r.body?.byteStream()?.copyTo(out) }
        }

        // (2) Integridad: SHA-256 del APK == el declarado.
        val computed = sha256Of(outFile)
        if (!computed.equals(expectedSha, ignoreCase = true)) {
            Log.e(TAG, "SHA-256 mismatch — descartado"); outFile.delete(); return
        }

        // (3) Autenticidad: la firma del APK debe coincidir con la de la app instalada (pinning).
        if (!apkSignerMatchesInstalled(outFile.absolutePath)) {
            Log.e(TAG, "firma del APK NO coincide con la instalada — DESCARTADO (posible APK malicioso)")
            outFile.delete(); return
        }

        prefs.edit().putString("apk_version", version).apply()
        Log.i(TAG, "APK v$version verificado (sha256 + firma) — instalando")
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.provider", outFile)
        ctx.startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
        })
    }

    private fun sha256Of(f: File): String = f.inputStream().use { ins ->
        val md = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(8192); var n: Int
        while (ins.read(buf).also { n = it } != -1) md.update(buf, 0, n)
        md.digest().joinToString("") { "%02x".format(it) }
    }

    /** Compara la(s) firma(s) del APK descargado contra la(s) de ESTE paquete instalado. */
    private fun apkSignerMatchesInstalled(apkPath: String): Boolean = try {
        val pm = ctx.packageManager
        val flag = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES
                   else @Suppress("DEPRECATION") PackageManager.GET_SIGNATURES
        val apkInfo = pm.getPackageArchiveInfo(apkPath, flag)
        val selfInfo = pm.getPackageInfo(ctx.packageName, flag)
        val apkSigs = signatureHashes(apkInfo)
        val selfSigs = signatureHashes(selfInfo)
        apkSigs.isNotEmpty() && selfSigs.isNotEmpty() && apkSigs == selfSigs
    } catch (e: Exception) { Log.w(TAG, "signer check err: ${e.message}"); false }

    private fun signatureHashes(info: PackageInfo?): Set<String> {
        if (info == null) return emptySet()
        val sigs = if (Build.VERSION.SDK_INT >= 28) {
            val si = info.signingInfo ?: return emptySet()
            (if (si.hasMultipleSigners()) si.apkContentsSigners else si.signingCertificateHistory)
        } else {
            @Suppress("DEPRECATION") info.signatures
        } ?: return emptySet()
        val md = MessageDigest.getInstance("SHA-256")
        return sigs.map { md.digest(it.toByteArray()).joinToString("") { b -> "%02x".format(b) } }.toSet()
    }

    companion object { const val TAG = "ApeSelfUpdate" }
}
