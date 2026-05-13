---
name: IPTV OMEGA — Integración de Capas L11/L12/L13 (Oro Puro)
description: "Protocolo para integrar las 8 capas 'oro puro' identificadas en la auditoría forense del js.zip al generador OMEGA, evolucionando de 796 → 850+ líneas/canal sin romper la doctrina monolítica. Cubre Heurística, TLS Coherence, Xtream Exploit, VPN, Throughput, Smart Codec, JWT runtime."
---

# IPTV OMEGA — Integración de Capas L11/L12/L13 (Oro Puro)

> **Cuándo usar:** Cuando el usuario pida "integrar las capas oro puro", "OMEGA Crystal V6", o "evolucionar a 850 líneas". Esta skill encapsula el plan derivado del documento `Auditoría Forense_ Extracción de _Oro Puro_ del Archivo js.zip`.

## 1. Origen del Plan

La auditoría forense del archivo `js.zip` (174 archivos) identificó **8 motores de próxima generación (v9 / v16)** ya presentes como módulos JS independientes pero **NO integrados** al M3U8 generado. Estos módulos se ejecutan en runtime pero no se manifiestan como directivas en la lista, perdiendo la oportunidad de control declarativo.

## 2. Los 8 Motores Oro Puro

| # | Motor | Archivo origen | Capa destino |
|---|---|---|---|
| 1 | Channel Classifier + Heuristic | `ape-channel-classifier.js`, `ape-heuristics-engine.js` | **L11** |
| 2 | Runtime Evasion Cortex | `ape-runtime-evasion-engine.js` | **L12** |
| 3 | TLS Coherence JA3/JA4 | `tls-coherence-engine-v9.js` | **L12** |
| 4 | Xtream Exploit Engine | `xtream-exploit-engine-v9.js` | **L13** |
| 5 | VPN Integration Supremo | `vpn-integration-supremo.js` | **L12** |
| 6 | Realtime Throughput + Dynamic QoS Buffer | `realtime-throughput-v9.js`, `dynamic-qos-buffer-v9.js` | **L13** |
| 7 | Smart Codec Prioritizer | `smart-codec-prioritizer.js` | **L11** |
| 8 | JWT Token Generator runtime | `jwt-token-generator-v9.js` | **L11** |

## 3. Las 3 Nuevas Capas

### L11 — Heurística y Contexto (Identidad del canal)
**Líneas estimadas:** ~15
```m3u8
#EXT-X-APE-CONTENT-CLASS:SPORTS_LIVE
#EXT-X-APE-HEURISTIC-SCORE:0.93
#EXT-X-APE-DEVICE-TARGET:SMART_TV,ANDROID_TV,FIRE_TV,VLC
#EXT-X-APE-EXPECTED-BITRATE:15000
#EXT-X-APE-CODEC-PRIMARY:AV1
#EXT-X-APE-CODEC-FALLBACK:HEVC,VP9,H264
#EXT-X-APE-JWT-PAYLOAD:eyJhbGciOiJIUzI1NiJ9...
#EXT-X-APE-JWT-EXP:1735689600
```

### L12 — Coherencia TLS y Evasión Profunda
**Líneas estimadas:** ~20
```m3u8
#EXT-X-APE-TLS-JA3:771,4865-4866-4867-49195,0-23-65281-10-11,29-23-24,0
#EXT-X-APE-TLS-JA3-HASH:e7d705a3286e19ea42f587b344ee6865
#EXT-X-APE-TLS-JA4:t13d1517h2_8daaf6152771_b0da82dd1658
#EXT-X-APE-TLS-CIPHER-SUITES:TLS_AES_256_GCM_SHA384,TLS_CHACHA20_POLY1305_SHA256
#EXT-X-APE-CORTEX-CHAIN:403->PROXY_AUTH,407->IDENTITY_MORPH,429->IP_SWARM,502->RECONNECT_SILENT
#EXT-X-APE-CORTEX-STRATEGY:13_DECISION_TREE_ACTIVE
#EXT-X-APE-VPN-OBFUSCATION:ENABLED
#EXT-X-APE-VPN-PAYLOAD-PADDING:RANDOM_64_512
#EXT-X-APE-VPN-WEBSOCKET-BIDIRECTIONAL:wss://vpn.iptv-ape.duckdns.org/ws
```

### L13 — Explotación y Rendimiento
**Líneas estimadas:** ~20
```m3u8
#EXT-X-APE-XTREAM-VULN:V1,V4,V6,V8
#EXT-X-APE-XTREAM-EXPLOIT:PREFETCH_500,MULTI_STREAM,RATE_BYPASS
#EXT-X-APE-PREFETCH-STRATEGY:ULTRA_AGRESIVO_500_SEGMENTS
#EXT-X-APE-THROUGHPUT-MONITOR:KBPS_REALTIME
#EXT-X-APE-THROUGHPUT-THRESHOLD-LOW:0.70
#EXT-X-APE-THROUGHPUT-ESCALATE:AUTO_BUFFER_1GB
#EXT-X-APE-DYNAMIC-BUFFER-CEILING:60000ms,1024MB
#EXT-X-APE-DYNAMIC-BUFFER-FLOOR:5000ms,128MB
```

**Total nuevo:** ~55 líneas → 796 + 55 = **851 líneas/canal** (consistente con la meta de "850+ líneas").

## 4. Procedimiento de Integración

### Fase 0 — Pre-flight
1. Ejecutar `iptv_navigator_v54_pre_edit_audit_checklist` completo sobre `m3u8-typed-arrays-ultimate.js`.
2. Backup obligatorio.
3. Confirmar que el archivo está en GREEN antes de empezar (`node -c`).
4. Confirmar con el usuario el conteo final esperado (851 vs otro).

### Fase 1 — Localizar el punto de inyección
Las nuevas capas van DESPUÉS de L10 (URL final) NO — eso rompe el orden. Van **ANTES de L10**, justo después de L9 (Phantom Hydra):

```javascript
// === LAYER 9: PHANTOM HYDRA EVASIÓN ISP (13 líneas) ===
// ... 13 líneas existentes ...

// === LAYER 11: HEURÍSTICA Y CONTEXTO (15 líneas — NUEVO) ===
// ... 15 líneas nuevas ...

// === LAYER 12: TLS COHERENCE + EVASIÓN PROFUNDA (20 líneas — NUEVO) ===
// ... 20 líneas nuevas ...

// === LAYER 13: EXPLOIT + PERFORMANCE (20 líneas — NUEVO) ===
// ... 20 líneas nuevas ...

// === LAYER 10: RESOLUCIÓN FINAL (2 líneas) ===
// #EXT-X-MAP + URL
```

**Razón del orden:** Players básicos abandonan parseo en URL. Todo lo "interesante" debe estar antes. L10 sigue siendo el cierre.

### Fase 2 — Crear funciones helper LOCALES dentro del bloque monolítico
**NO crear funciones top-level separadas** — eso viola la doctrina monolítica.

```javascript
function generateChannelEntry(channel, index, profile, creds) {
    const lines = [];

    // ... L0 a L9 existentes ...

    // L11 — Heurística y Contexto (helpers inline)
    const _l11_classify = () => {
        // Llamar al runtime classifier (asume window.APE_CLASSIFIER existe)
        const cls = (window.APE_CLASSIFIER && window.APE_CLASSIFIER.classify(channel)) || {};
        return {
            content_class: cls.class || 'UNKNOWN',
            heuristic_score: cls.score || 0.5,
            device_target: cls.devices || 'SMART_TV,VLC,KODI,EXOPLAYER',
            expected_bitrate: cls.bitrate || profile.target_bitrate || 8000,
        };
    };
    const _l11_codec = () => {
        // Smart codec prioritizer
        const sc = (window.APE_SMART_CODEC && window.APE_SMART_CODEC.prioritize(channel, profile)) || {};
        return {
            primary: sc.primary || 'HEVC',
            fallback: sc.fallback || 'AV1,VP9,H264',
        };
    };
    const _l11_jwt = () => {
        const jwt = (window.APE_JWT_GEN && window.APE_JWT_GEN.generate(channel, profile, creds)) || {};
        return { payload: jwt.token || '', exp: jwt.exp || 0 };
    };

    const l11Cls = _l11_classify();
    const l11Cdc = _l11_codec();
    const l11Jwt = _l11_jwt();

    lines.push(`#EXT-X-APE-CONTENT-CLASS:${l11Cls.content_class}`);
    lines.push(`#EXT-X-APE-HEURISTIC-SCORE:${l11Cls.heuristic_score}`);
    lines.push(`#EXT-X-APE-DEVICE-TARGET:${l11Cls.device_target}`);
    lines.push(`#EXT-X-APE-EXPECTED-BITRATE:${l11Cls.expected_bitrate}`);
    lines.push(`#EXT-X-APE-CODEC-PRIMARY:${l11Cdc.primary}`);
    lines.push(`#EXT-X-APE-CODEC-FALLBACK:${l11Cdc.fallback}`);
    lines.push(`#EXT-X-APE-JWT-PAYLOAD:${l11Jwt.payload}`);
    lines.push(`#EXT-X-APE-JWT-EXP:${l11Jwt.exp}`);
    // ... resto de L11 hasta 15 líneas ...

    // L12 — TLS Coherence + Evasión Profunda
    const _l12_tls = () => {
        const t = (window.APE_TLS_ENGINE && window.APE_TLS_ENGINE.fingerprint(profile)) || {};
        return {
            ja3: t.ja3 || '771,4865-4866-4867,0-23,29-23-24,0',
            ja3_hash: t.ja3_hash || 'fallback_hash',
            ja4: t.ja4 || 't13d_fallback',
            ciphers: t.ciphers || 'TLS_AES_256_GCM_SHA384',
        };
    };
    // ... etc ...

    // L13 — Exploit + Performance
    // ... etc ...

    // L10 — Resolución final (FIX 2026-04-17: SIN EXT-X-MAP:URI=init.mp4, SIN URI= en MEDIA/I-FRAME)
        lines.push(`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-primary",NAME="Primary Audio",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="spa"`);
        lines.push(`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-backup",NAME="Backup Audio",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="spa"`);
        lines.push(`#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=${Math.round(_bw796*0.025)},CODECS="${_codec796}"`);
        lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${_bw796},CODECS="${_codec796},${_codecAudio}",RESOLUTION=${_res796}`);
        lines.push(finalUrl);

    // Validación runtime — actualizar el conteo esperado
    const _omega_count = lines.length;
    const _omega_expected = 851;  // ← CAMBIO: era 796
    if (_omega_count !== _omega_expected) {
        console.warn(`[OMEGA-${_omega_expected}] Canal ${channel.name}: ${_omega_count} líneas (esperadas ${_omega_expected}). Delta=${_omega_count - _omega_expected}`);
    }

    return lines.join('\n');
}
```

### Fase 3 — Actualizar la doctrina
Crear o actualizar:
1. `arquitectura_omega_v5_2_746_lineas/SKILL.md` → versionar a `arquitectura_omega_v6_851_lineas/SKILL.md`
2. `m3u8_120_120_perfection_invariant/SKILL.md` → cambiar `796` por `851` en TODAS las menciones
3. `omega_absolute_doctrine.md` → actualizar mención a "exactamente 796 líneas"
4. `post_generation_audit_v10_4/SKILL.md` → nueva versión v11

### Fase 4 — Validación post-edit
```bash
# 1. Sintaxis
node -c m3u8-typed-arrays-ultimate.js

# 2. Conteo runtime
node test-e2e-v6.js  # debe imprimir "851" no "796"

# 3. Auditoría conformidad universal
python audit_m3u8.py lista_test.m3u8
# Score esperado: >= 95/120
```

## 5. Riesgos Conocidos

| Riesgo | Mitigación |
|---|---|
| Romper conteo 796 → todos los validators fallan | Actualizar TODAS las menciones de 796 a 851 (grep + sed cuidadoso) |
| Players básicos chocan con directivas desconocidas | Players deben ignorar `#EXT-X-APE-*` por RFC 8216 §4.1 |
| Helpers que llaman a `window.*` pueden ser undefined en SSR/Node | Wrapping en `(window.X && ...)` con fallback default |
| Líneas L11/L12/L13 quedan después de URL | Insertar ANTES de L10, no después |
| Agregar 55 líneas explota el tamaño total del archivo .m3u8 | Aceptado por doctrina ("el peso es necesario") |
| Refactor accidental de `generateChannelEntry()` en helpers top-level | NO HACER — viola doctrina monolítica |

## 6. Pre-Requisitos del Usuario

Antes de ejecutar este protocolo, confirmar:
- ¿El usuario quiere los 8 motores integrados de golpe o por capas (primero L11, luego L12, luego L13)?
- ¿Se actualiza la versión declarada del generador (`v22.2.0` → `v23.0.0-OMEGA-CRYSTAL-V6`)?
- ¿Se actualizan las skills hermanas (doctrina, scorecard) al mismo tiempo?
- ¿Cuáles son los runtime endpoints reales para JWT, classifier, TLS engine?

## 7. Referencias

- Documento fuente: `Auditoría Forense_ Extracción de _Oro Puro_ del Archivo js.zip.md` (compartido por usuario)
- Skill hermana: `m3u8_typed_arrays_ultimate_safe_modify_protocol`
- Skill hermana: `arquitectura_omega_v5_2_746_lineas`
- Skill hermana: `m3u8_120_120_perfection_invariant`
- Doctrina: `.agent/rules/omega_absolute_doctrine.md`
