# VPS Condition Report — IPTV-APE Hetzner

- **Fecha:** 2026-06-14
- **Host:** `ubuntu-2gb-ash-1` · Hetzner CPX21 · `178.156.147.234` · `iptv-ape.duckdns.org` · Ashburn VA
- **Lectura:** en vivo, read-only (SSH + `GET /api/health`)
- **Veredicto:** **OPERACIONAL** — `health=warning` (era `critical` antes del saneo). Sin pérdida de servicio en ningún momento (uptime 91 días, ~1289 req/5min).

---

## 1. Resumen ejecutivo

El VPS estaba **sirviendo correctamente** pero con `health=critical` por **disco `/` al 100%** (308 MB libres de 38 GB), lo que mantenía la caché en `EMPTY_RESTARTING` y **habría hecho fallar cualquier deploy** (sin espacio para backups ni escritura atómica).

Se ejecutó un **saneo read-only-first** (autorizado): **disco 100% → 65%**, recuperando **~12.7 GB** sin tocar nada funcional. La caché RAM ya repobla con tráfico. Queda un único flag no crítico: un **drift de whitelist WireGuard** (no es intrusión — es tu propio Fire TV Cali tras una rotación de clave).

---

## 2. Estado de la plataforma (post-saneo)

| Área | Valor | Veredicto |
|---|---|---|
| Uptime / Load | 91 días / 0.50·0.36·0.36 (3 vCPU) | OK |
| RAM | 3819 MB · ~2026 MB disponible · swap 0 | OK |
| **Disco `/`** | **38 G · 24 G usados · 13 G libres · 65%** | **OK (era 100%)** |
| `/dev/shm` | 1.9 G · 5 M usados | OK |
| nginx | 1.24.0 (Ubuntu) — **nginx, NO openresty** | OK active |
| php8.3-fpm | active | OK |
| Cache RAM `/dev/shm/nginx_cache` | `EMPTY_WITH_TRAFFIC` (repoblando) | Transitorio |
| Health version | 6.3.0 | — |
| SurfShark egress | `miami` + `br`, 0 fallos | OK |
| Blacklist | 668 canales muertos filtrados | OK |

### Arquitectura real observada (más de lo que la doctrina documentaba)
Además de nginx + PHP-FPM + Unbound + WireGuard + Guardian, el VPS corre **Docker con 10 contenedores**:
- **9× `anti407_*`** — Anti-407 Sandbox (mocks JA3/ja3, openresty shield, test-runner). "Up 3 weeks". **Sandbox de prueba**, no ruta de streaming productiva.
- **1× `coa-navigator-mysql`** (mysql:8.0) — "Up 3 months (healthy)", proyecto coa-navigator.

> Estos contenedores ocupan **7.2 GB** de imágenes Docker (en uso, no se tocaron). Si el Anti-407 Sandbox ya no se necesita, detenerlo liberaría ~7 GB adicionales (**decisión del usuario**, no ejecutado).

---

## 3. Saneo de disco ejecutado (100% → 65%, ~12.7 GB)

| Acción | Recuperado | Riesgo |
|---|---|---|
| `journalctl --vacuum-size=500M` + cap `SystemMaxUse=500M` | ~3.0 GB | Nulo (logs viejos) |
| `rm /root/.cache/pip` (2.8 G) + `/root/.rustup` (1.3 G) | ~4.1 GB | Nulo (build cache, sin proceso activo) |
| `rm /root/backups` (fechado 2026-05-20) | 0.38 GB | Nulo (backup viejo) |
| `docker builder prune -f` (0 cache activo) | ~5.3 GB | Nulo (build cache reclamable) |
| Snap: `refresh.retain=2` + remove revisiones disabled (chromium/core22/core24/cups/snapd) | ~0.9 GB | Nulo (revisiones deshabilitadas) |

**Preservado intencionalmente (NO borrado):**
- `/var/lib/containerd` 7.2 G → **en uso** por los 10 contenedores Docker (la suposición inicial de "huérfano" era falsa; verificado antes de actuar).
- `/opt/ape-dual-link` 5.3 G → shadow dual-link conectado a endpoints live + `ROLLBACK.sh`. Adelgazarlo requiere cirugía selectiva (no urgente a 65%).
- Backups `06-12` recientes (`ape_v321_live_deploy_latest`, `ape_orchestration_backup`, `ape_backups_407_deep`) → rollback de deploys de hace 2 días.

**Reclamo opcional futuro (con tu OK):** detener Anti-407 Sandbox (~7 GB) · adelgazar `/opt/ape-dual-link` (~varios GB).

---

## 4. Auditoría WireGuard — `unauthorized_wg_peer` resuelto (NO es intrusión)

`wg0` (túnel de clientes IPTV) tiene 2 peers, **ambos dispositivos legítimos HFRC** (en `wg0.conf` con nombre, ambos endpoints de ISP colombiano):

| Peer (pubkey) | IP | Dispositivo | Último handshake | En whitelist? |
|---|---|---|---|---|
| `5idLPkMF…` | 10.200.0.2 | ONN 4K (Bogotá ETB) | hace 45 días (stale) | ✅ Sí |
| `fhQ5lipG…` | 10.200.0.3 | **Fire TV Cali (activo)** | hace 4 días | ❌ **No** |

**Causa:** el whitelist `/etc/net-shield/authorized_peers.conf` autoriza para el slot Cali la pubkey **vieja** `Ga1ykV7T…`, pero el Fire TV Cali rotó su clave a `fhQ5lipG…` (actualizada en `wg0.conf`, **no** en el whitelist). El audit marca tu propio dispositivo activo como "no autorizado".

**Conclusión:** drift de whitelist tras key-rotation, **no acceso no autorizado**. Ningún endpoint desconocido, ambos `/32` ADB.

**Fix recomendado (1 línea, NO ejecutado — requiere tu OK):** en `/etc/net-shield/authorized_peers.conf`, reemplazar la línea `Ga1ykV7T… | SECONDARY_PEER | Cali_ETB …` por la pubkey actual `fhQ5lipG…` (firestick-cali-hfrc). Tras eso, `health` volverá a `ok`.

---

## 5. Riesgos abiertos / acciones recomendadas

1. **(no crítico)** Actualizar pubkey Cali en `authorized_peers.conf` → cierra el último warning de health. *(1 línea, requiere OK.)*
2. **(monitorear)** Disco a 65%: los grandes consumidores restantes (containerd 7.2 G, opt/ape-dual-link 5.3 G) son recuperables solo con decisiones de producto (¿se sigue usando el Anti-407 Sandbox? ¿el shadow dual-link?).
3. **(prevención)** El cap de journald (500 M) ya evita el recrecimiento de `/var/log/journal` que contribuyó al 100%.
4. **(deploy)** Disco con 13 G libres → el pre-flight del nuevo CD (`<1.5 GB` aborta) tiene holgura amplia.

---

*Generado durante la sesión de saneo + diseño CI/CD 2026-06-14. Cifras en vivo, sin mocks.*
