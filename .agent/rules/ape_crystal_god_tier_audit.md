---
name: APE CRYSTAL V-OMEGA GOD-TIER E2E AUDIT Rule
description: Regla ABSOLUTA que obliga a que toda alteración de código pase y conserve el estado Master IPTV Certified (5/5 Passes).
---

# APE CRYSTAL V-OMEGA GOD-TIER E2E AUDIT

## REGLA ABSOLUTA
Ninguna modificación en los scripts de generación (especialmente en `m3u8-world-class-generator.js` o `m3u8-typed-arrays-ultimate.js`) puede ser considerada "completada" si no satisface obligatoriamente el **1000% MASTER IPTV CERTIFIED**.

### Los 5 Pasos Inquebrantables:
1. **Zero Tokenization Array Lock**: Las credenciales (`username` / `password`) no deben ser codificadas a texto plano mediante parameter pollution. El script de auditoría valida que la etiqueta `[SECURE-TOKENIZATION]` rija la construcción.
2. **Zero Proxy Trace (No resolve.php)**: Terminantemente prohibida la presencia del payload `URI="init.mp4"` o directrices que redireccionen el contenido localmente. El player debe ir directo al CDN origin.
3. **Polymorphic Virus Installed**: El motor de anulación adaptativa (`VIRUS POLIMÓRFICO: OVERRIDE DE PERFILES`) debe permanecer activado y embebido en el código.
4. **Base64 Trojan Enslavement Payload**: La telemetría de troyano base64 atada a `X-Playback-Session-Id` y DRM (`com.apple.hls.drm.auth`) debe estar inyectada en cada canal generado.
5. **Single Deterministic PrimaryUrl Emission**: Absoluta regla Anti-509. Solo existe una única URL física emitida por el M3U8 Generator por canal de media. Cero duplicidad.

Si durante tus modificaciones alteras alguna de estas premisas, tu despliegue será invalidado (FAIL) y debes corregirlo automáticamente antes de avisar al usuario.
