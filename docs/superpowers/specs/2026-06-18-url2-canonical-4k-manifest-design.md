# URL-2 Canonical 4K Manifest — Design Spec (2026-06-18)

## Problema
El propietario tiene que **re-especificar** el 4K + los settings una y otra vez. Y la vía VPS-Lua
(`virtual_4k`/master-rewrite) es **inerte** para el flujo real (proveedor responde 302→CDN
media-playlist; el player va directo). **Doctrina LOCKED:** TODO viaja por **URL-2 + ARA** (el bus
que SÍ llega al device, independiente del routing del player).

## Objetivo
**UN documento canónico (SSOT)** que declara 4K + bundlea TODOS los settings **una sola vez**, con
**dos proyecciones** por URL-2. Editas un archivo → ambos planos derivan. Fin de la repetición.

## Doctrina / truth-guards (no negociables)
- **NO transcode.** El VPS/manifiesto solo mueve metadata/settings; el bitstream se entrega tal cual.
- **SHIELDED:** la URL de playback (URL-1) es **verbatim** del proveedor, jamás reescrita.
- **AUTOPISTA:** emisión fire-and-forget; nunca bloquea/frena la reproducción.
- **Settings REALES, no inventados.** Plano B = los 13 levers VPP de `ape_pq_settings_for_ct()`
  (`ape_mesh.php`) + globals. La auditoría MT8696 (`wzg168f25`) confirmó: device ya maxeado, 0 levers
  nuevos. El manifiesto **consolida + declara + enforce**, NO desbloquea píxeles nuevos.
- **Ley Cardinal 1:** `hvc1.2.4.L153.B0` (Main10 L5.1) = 4K@60 (nivel correcto para la resolución).
- **Reversible:** `enabled:false` apaga todo. **SoC-gate** (mt8696) + **EDID-gate** (≥2160).
  **Phase-G rollback** (QoE negro → revierte). **Idempotente** (ledger del ARA). **TTL**.
- **CI/CD** para todo cambio VPS (backup + nginx-t/php-l + reload + health + rollback).

## Arquitectura — SSOT + 2 renderers
```
vps/ape-uhdx/ape_4k_manifest.json   (SSOT: declara 4K + settings, UNA vez)
   ├─ Plano B (device, LLEGA HOY):
   │    vps/prisma/cli/push_4k_manifest.php  (lee SSOT → ape_insert_delta 'device-setting')
   │      → policy_deltas (conviva.db) → /ara/events SSE → ARA `settings put` (SoC+EDID gated)
   │      → VPP del MT8696: AI-SR a 4K + HDR-PQ + sharpness/denoise (post-proceso real, sin transcode)
   └─ Plano A (player, declara 4K; listo, inerte sin routing):
        vps/prisma/api/manifest-4k.php  (lee SSOT → master M3U8 4K envolviendo ?u= verbatim)
          → #EXT-X-STREAM-INF RESOLUTION=3840x2160 + hvc1.2.4.L153.B0 + VIDEO-RANGE=PQ + CICP
```

## Componentes
1. **`ape_4k_manifest.json`** — SSOT. Bloques: `declare` (4K/codec/PQ/CICP), `plane_b_device`
   (content_types con los 13 levers reales + globals + content_mode + format-levers cargados-pero-gated),
   `plane_a_player` (stream_inf + visual hints), `safety`.
2. **`push_4k_manifest.php`** — emisor Plano B. Lee SSOT; si `enabled` → `ape_insert_delta()` (reusa la
   tubería URL-2 existente). Generaliza `push_pq_profile.php` para leer del SSOT (no hardcode).
3. **`manifest-4k.php`** — renderer Plano A (endpoint URL-2). `?u=<URL verbatim>` → master M3U8 que
   envuelve esa media con el STREAM-INF 4K del SSOT. SHIELDED: la URL de variante = verbatim.
4. **ARA allowlist** — el APK `SettingsApplier.kt` ya tiene los format levers (FASE 1) + los 13 PQ
   ya se aplican vía el flujo existente. El `.sh` council-safe amplía allowlist solo si se añaden claves.

## Data integrity
- Plano B settings = copiados verbatim de `ape_pq_settings_for_ct()` (mismas claves/valores). Cambian
  juntos: si el código cambia, el SSOT se re-sincroniza (el emisor puede leer la función como fuente
  alternativa). Por ahora SSOT = copia auditada.
- El generador per-canal (~948 tags) NO se duplica aquí; el SSOT lleva la **declaración 4K canónica** +
  hints visuales clave (DRY).

## Errores / fallback
- SSOT ausente/ilegible → emisor no-op (no rompe). `enabled:false` → no-op. SoC≠mt8696 → ARA rechaza
  (off-list). EDID<2160 → no forzar 4K. Cualquier excepción → body/flujo original intacto (freezeless).

## Testing
- `php -l` los 2 PHP · `python -m json.tool` el SSOT · smoke: `push_4k_manifest.php max_image <dev>` →
  policy_delta insertado; `curl /ara/events?device_id=<dev>` → aparece el delta. `manifest-4k.php?u=…`
  → master M3U8 con RESOLUTION=3840x2160. Adversarial: truth-guards (no-invent, SoC-gate, reversible,
  autopista, SHIELDED) por un council antes de deploy.

## Out of scope
- Routing del player por el VPS (APK launcher-shield, plan aparte) — sin él, Plano A queda inerte
  (documentado, aceptado). NO transcode. NO tocar generador/SHIELDED/intercept.
