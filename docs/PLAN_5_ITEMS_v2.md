# Plan de Implementación v2 — 5 Ítems de Activación y Mejora del Sistema APE Crystal

> **Versión:** 2.0 · **Fecha:** 2026-06-18 · **Autorización:** Propietario HFRC · **Branch:** `feat/adb-generic-visual-enhancement-installer`
> **Verdad física:** el **VPS NO recodifica** (solo selecciona/prioriza representaciones vía manifests/headers/IA); el **APK SÍ recodifica localmente** en el device (UltraEnhance Engine: AI-SR/denoise/AI-PQ/HDR/frame-interp + VPP del SoC) usando lo que llega por URL-2.

## 0. Doctrina del sistema (3 capas indivisibles)
```
① GENERADOR (Node.js) → lista M3U enriquecida (#EXT-X-APE-* · ape-profile · STABLE-VARIANT-ID)
② VPS (nginx+Lua+PHP+SQLite) → muta manifests en tiempo real (URL-2 bidireccional · HEVC/AV1-first · CMAF-aware) — NO recodifica, NO toca píxeles
③ APK Crystal Agent (Kotlin) → daemon en device → VPP hardware (SoC) + UltraEnhance Engine (IA on-device, recode perceptual de borde)
```
- **URL-1** (reproducción) = verbatim proveedor, DNS-hijack→nginx→passthrough. INTOCABLE.
- **URL-2** (control) = bus metadata+QoE bidireccional (IDA políticas / VUELTA QoE). El APK une ambos.
- **Autopista:** nadie bloquea URL-1; `pcall` Lua, silent-fail PHP/SQLite, SupervisorJob+backoff Kotlin.

## Reglas de ejecución (TODOS los ítems)
Aditivo/reversible · `nginx -t` SIEMPRE antes de reload · `php -l` SIEMPRE · `deploy_vps.sh --whatif`→`--yes` · Council adversarial antes de tocar `combined_body_filter.lua`/módulos de manifest · Sandbox `/tmp` para Lua nuevo · Rollback gate desde `/root/ape-deploy-rollback/<ts>/` · **explícito "Aplica" por ítem**.

---

## ⚠️ ESTADO VIVO RECONCILIADO (verificado 2026-06-18 — currency check obligatorio)

| Ítem | Premisa del plan | Estado VIVO real (verificado) | Acción |
|---|---|---|---|
| **1 — `/ara/events`** | inerte (ARA_TOKEN + snippet) | ✅ **YA ACTIVO**: `env[ARA_TOKEN]` en `www.conf`, device `G4N2JM02434606AT` recibe **200** (deltas fluyendo), incluido vía `sites-enabled/default:212`, NO vía `iptv-intercept.conf` | **SKIP** — no re-incluir (duplicado rompe) |
| **2 — `/ara/install` + APK + `/ara/enroll`** | crear onboarding | ❌ enroll INACTIVO (council B4); APK con blockers B2 (ENROLL_SECRET placeholder, extraíble 90s) + B3 (deviceId `firestick-cali` colisiona peer 10.200.0.3) | Gated — resolver B2/B3 + activar enroll (fpm→nginx→worker) |
| **3 — `deny all` en `/lists/`** | bloquea /lists/ | ⚠️ **PREMISA STALE**: los `deny all` (L54/140/220/253) están en vhosts de **intercept de proveedores** (seguridad), NO en `location /lists/`; la lista se sirve por **Flask :8080** y **YA funciona** (283MB OK) | **NO tocar los deny all** (son seguridad) — re-verificar qué se quiere realmente |
| **4 — `ape_profile_map.json` default P3** | archivo AUSENTE | 🟢 **PRESENTE** (`/etc/nginx/lua/ape_profile_map.json`, `"default":"P2"`) | **Acción real = P2→P3** (edit chico + sandbox + Council). Efecto solo en el path through-VPS |
| **5 — APK UltraEnhance** | integrar | ⚠️ **INOPERATIVO hoy** (sin .tflite, glReadPixels mata 4K@25fps, media3-effect sin cablear — council FASE 4) | Diferir |

## Veredicto del council (workflow wd2ixg8zj, 11 agentes, verificado vs config viva)
**WARN** — diseño sólido/aditivo/safe; **3 premisas refutadas**: (1) full-tunnel NATea por eth0 Ashburn (GeoIP PEOR, no wg-surfshark-br); (2) full-tunnel ≠ cascada (DNAT solo port-80+DNS; HTTPS/QUIC/302-CDN bypasean); (3) ADB self-grant Shizuku-style NO existe en Fire OS (grant operador por LAN). El lever honesto de códec = el **selector ExoPlayer HEVC-first del APK** (OTT no lo tiene). Ver `.agents/reports/freezeless-visual-master-council_20260618_UHD_CRYSTAL_PLAN.md`.

## Orden de ejecución recomendado (reconciliado: solo lo verificado-accionable, freeze-clean primero)
1. **ITEM 4 (P2→P3)** — único cambio VPS chico y seguro hoy (sandbox + Council ligero + nginx-t + backup + rollback + smoke). Caveat: efecto solo en el path through-VPS.
2. **Track-1 (council FASE 1)** — PRISMA generation-time en la lista verbatim + APK con ExoPlayer HEVC-first ON (`enhance=false`, WG flag-off) + resolver B2/B3. Freeze-clean, sin premisa refutada.
3. **FASE 2** — tcpdump read-only del túnel en NO-prod antes de cualquier full-tunnel / ITEM 2 enroll.
4. **ITEM 2 enroll + ITEM 5 UltraEnhance** — gated tras validación.

**NO se ejecuta nada sin "Aplica" explícito por ítem.**
