package com.ape.crystalagent

import org.json.JSONObject

/**
 * Estado compartido para el panel del ARA. Solo memoria del proceso; no es telemetría inventada.
 * Lo llenan AgentService/FeedForwardClient, QoEReporter, SettingsApplier y ApePlayer.
 */
object AraStatus {
    @Volatile var serviceRunning: Boolean = false
    @Volatile var lastHeartbeatAt: Long = 0L
    @Volatile var lastSseAt: Long = 0L
    @Volatile var lastSettings: List<String> = emptyList()
    @Volatile var lastDirective: JSONObject? = null
    @Volatile var vppAllowed: Boolean? = null
    @Volatile var vppReason: String = ""
    @Volatile var lastApplied: Int = 0
    @Volatile var lastRejected: Int = 0
    @Volatile var lastTrack: String = ""
    @Volatile var playerActive: Boolean = false
    @Volatile var currentChannelId: String = ""
    @Volatile var labMetadataProfile: String = ""
    @Volatile var labMetadataSha256: String = ""
    @Volatile var labMetadataFieldCount: Int = 0

    // ── /sync (D3) ────────────────────────────────────────────────────────────
    /** idle | disabled | no_key | applied | partial | denied | not_modified | endpoint_absent | unauthorized | rate_limited | protocol | replay | offline | server_error | error */
    @Volatile var syncState: String = "idle"
    @Volatile var syncReason: String = ""
    @Volatile var syncLastAt: Long = 0L
    @Volatile var syncNextAt: Long = 0L
    @Volatile var syncHttp: Int = 0
    @Volatile var syncSeq: Long = 0L
    @Volatile var syncEtag: String = ""
    @Volatile var syncProfile: String = ""
    @Volatile var syncApplied: Int = 0
    @Volatile var syncRejected: Int = 0
    @Volatile var syncFailures: Int = 0
    @Volatile var syncSelfCheck: String = ""

    // ── Track del player (lo llena ApePlayer; lo usa el sampler de /sync) ─────
    @Volatile var trackCodec: String = ""
    @Volatile var trackW: Int = 0
    @Volatile var trackH: Int = 0
    @Volatile var trackFps: Float = 0f
    @Volatile var trackBitrate: Int = 0
    @Volatile var trackHdr: String = "SDR"
    @Volatile var trackDropped: Long = 0L
    @Volatile var trackRendered: Long = 0L
    /** true sólo si el contador viene de un `AnalyticsListener` real (si no, el feature es `unavailable`). */
    @Volatile var trackDroppedValid: Boolean = false
    @Volatile var trackAt: Long = 0L
    @Volatile var playerBufferMs: Long? = null
    @Volatile var playerBufferAt: Long = 0L

    // ── Salida 4K / presentación ─────────────────────────────────────────────
    @Volatile var display4k: Boolean? = null
    @Volatile var displayMode: String = ""

    // ── ENTRADA real del canal (para el badge de upscaling) ──────────────────
    /**
     * Resolución de ENTRADA del canal que el operador está viendo, tal como la
     * declara el VPS. Vacío = no se sabe (el badge dirá "entrada: N/D").
     *
     * POR QUÉ EXISTE (2026-11-14)
     *   El badge mostraba SIEMPRE "entrada: N/D" porque AgentService llamaba a
     *   BadgeOverlay.show(ctx, null, nombre): le pasaba null como entrada. La
     *   resolución SÍ llegaba (campo `resolution_hint` del SSE y `source.resolution`
     *   del /sync) pero solo se usaba para el QoE, no para el badge.
     *
     *   Este campo es el puente. Sin él, el badge dice la salida pero nunca de dónde
     *   viene la imagen, que es justo lo que pidió el operador:
     *     "aparezca un aviso de upscaling de que resolución a cuál de salida está
     *      llevando la imagen, si real o simulada"
     *
     * NO SE INVENTA: si nadie lo llenó, se queda vacío y el badge dice N/D.
     */
    @Volatile var sourceResolution: String = ""
    @Volatile var sourceResolutionAt: Long = 0L

    // ── Tag #EXTSHIMOTT (sidecar por canal que lee el shim) ──────────────────
    /**
     * Último recibo del tag: qué canal, qué se aplicó y qué se rechazó. Lo escribe
     * [ExtShimOttBridge] cuando el shim le entrega un tag. Vacío = nunca llegó ninguno
     * (el shim solo ve el tag si la playlist se materializa; un catálogo en streaming no).
     */
    @Volatile var extShimOtt: String = ""
    @Volatile var extShimOttAt: Long = 0L

    // ── Homologación de presets de lista ─────────────────────────────────────
    @Volatile var lastPresetCount: Int = 0
    @Volatile var lastPresetLocal: Int = 0
    @Volatile var lastPresetUnknown: Int = 0
    @Volatile var lastPresetAndroid: Int = 0
    @Volatile var lastPresetApplyMs: Long = -1
    @Volatile var lastPresetP50: Long = -1
    @Volatile var lastPresetP95: Long = -1
    @Volatile var lastPresetP99: Long = -1
    @Volatile var lastPresetMax: Long = -1
    @Volatile var presetApplied: Int = 0
    @Volatile var presetStored: Int = 0
    @Volatile var presetDeclared: Int = 0

    // ── Bitrate guard (medido real, no declarado) ─────────────────────────────
    @Volatile var bitrateKbps: Int = 0
    @Volatile var bitrateNetworkKbps: Int = 0
    @Volatile var bitrateMaxVariantKbps: Int = 0
    @Volatile var bitrateFloorKbps: Int = 0
    @Volatile var bitrateCeilKbps: Int = 0
    @Volatile var bitrateSourceBand: String = ""
    @Volatile var bitrateOutBand: String = ""
    @Volatile var bitrateState: String = "SETTLED"
    @Volatile var bitrateAt: Long = 0L
    @Volatile var bufferPct: Int = 0
    @Volatile var bufferFloorPct: Int = 60
    @Volatile var bufferCeilingPct: Int? = null
    @Volatile var bufferState: String = "OK"

    // ── Captura global (MediaProjection, consentida) ─────────────────────────
    @Volatile var captureFrames: Long = 0L
    @Volatile var captureLuma: Double = 0.0
    @Volatile var captureLap: Double = 0.0
    @Volatile var captureMotion: Double = 0.0
    @Volatile var captureKind: String = "—"
    @Volatile var captureFrameGapMs: Long = 0L
    @Volatile var captureFps: Double = 0.0
    @Volatile var captureFreezeMs: Long = 0L
    @Volatile var captureStalls: Long = 0L
    @Volatile var captureAt: Long = 0L
    @Volatile var lastZapAt: Long = 0L
    @Volatile var lastFallbackChain: String = ""

    fun ageMs(ts: Long, now: Long = System.currentTimeMillis()): Long =
        if (ts <= 0L) Long.MAX_VALUE else (now - ts).coerceAtLeast(0L)

    fun ageLabel(ts: Long): String {
        val a = ageMs(ts)
        if (a == Long.MAX_VALUE) return "sin datos"
        val s = a / 1000
        return when {
            s < 60 -> "hace ${s}s"
            s < 3600 -> "hace ${s / 60}m"
            else -> "hace ${s / 3600}h"
        }
    }
}
