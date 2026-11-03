# Freezeless Visual Master Council — Re-aligned UHD Crystal Plan
Workflow wd2ixg8zj · 11 agentes (7 PhDs + 3 verificadores adversariales + síntesis) · 859k tokens · 2026-06-18

## VEREDICTO: WARN (exit 1) — diseño sólido, 3 premisas centrales REFUTADAS vs config viva
- BLOCKs de diseño: 0 · WARNs: 7
- Escala a BLOCK si se declara "VPS fuerza HEVC bajo full-tunnel" / sideload canónico antes de cerrar blockers.

## Per-mandato
- FREEZELESS: WARN (BLOCK-conditional) — token-IP mismatch bajo full-tunnel → 403-freeze; Track-1 freeze-clean
- VISUAL MASTER: PASS (techo) — lever real = ExoPlayer setPreferredVideoMimeTypes (OTT no lo tiene); UltraEnhance inoperativo hoy
- RICH-IDATA: WARN — emisión OK; lazo cerrado inactivo (enroll/auth/worker)
- NO-DAMAGE: WARN — aditivo, 0 mutaciones, PQ no quema TV; gaps pre-activación (secret/deviceId/regex)

## Premisas REFUTADAS
1. GeoIP: wg0 PostUp NATea por eth0 Ashburn (datacenter) — NO hay path wg-surfshark-br; full-tunnel da GeoIP PEOR
2. Full-tunnel ≠ cascada: DNAT solo port-80+DNS; HTTPS/QUIC/302-CDN bypasean combined_body_filter; el VPS NO fuerza HEVC
3. ADB self-grant Shizuku-style NO existe en Fire OS — requiere grant one-time del operador por LAN, re-necesario tras self-update

## Blockers
- B2 (incond): ENROLL_SECRET placeholder → CI BuildConfig
- B3 (incond): deviceId firestick-cali colisiona peer 10.200.0.3 → ANDROID_ID
- B1/B4 (solo tunnel): corregir claims refutadas + activar enroll (fpm→nginx→worker) por CI/CD

## Próximo paso por fases
FASE 1 (ahora, no-VPS): PRISMA generation-time + APK con ExoPlayer HEVC-first ON, enhance=false, WG flag-off + B2/B3. Freeze-clean.
FASE 2 (read-only): tcpdump del túnel en NO-prod antes de cualquier full-tunnel.
FASE 3 (VPS gated): s01s/c29s server_name + proxy_bind + policy-route+kill-switch + enroll + auth.
FASE 4 (diferir): UltraEnhance.

## Honest ceiling
SÍ: ExoPlayer HEVC-first (honesto, OTT no lo tiene) + Track-1 freeze-clean + aditivo/rollback + no daño TV.
NO: VPS-fuerza-HEVC bajo full-tunnel / mejor GeoIP / per-frame remoto / uplift IA hoy / Shizuku PC-less / lazo QoE cerrado en prod.
