# ARA — Realidad de auto-instalación + bootstrap (honesto)

## Lo IMPOSIBLE (sandbox Android — no se promete)
Una **playlist IPTV sola NO puede**:
- instalar una app Android,
- otorgar permisos (WRITE_SECURE_SETTINGS, etc.),
- abrir/activar ADB,
- habilitar wireless debugging,
- ejecutar código en el device.

El VPS, al reproducir la lista, **sí puede**: activar URL-2, crear `device_state`, emitir `policy_deltas`,
preparar el bootstrap — pero **no puede violar el sandbox Android**. Un tag `#EXT-X-APE-*` es metadata inerte
(RFC 8216 §6.3.1); los players lo ignoran.

## Lo POSIBLE (con bootstrap autorizado)
El ARA se instala/despierta **casi inmediato** SOLO si existe **al menos uno** de:
1. **ADB ya autorizado** (RSA aceptado en el device para ese host).
2. **Helper APK** ya instalado con `BOOT_COMPLETED` (re-habilita wireless-debug / pin de puerto al boot).
3. **Agente shell** ya bootstrappeado en `/data/local/tmp` (lo relanza el watchdog).
4. **Device emparejado** por wireless debugging / mDNS.
5. **Usuario aceptó** permisos o el RSA fingerprint previamente.

## Si NO hay bootstrap autorizado
El sistema reporta **`ARA_BOOTSTRAP_REQUIRED`** y **no** promete auto-instalación falsa.
`bootstrap_ara_android.sh` sale con código 2 + el mensaje, y el watchdog sigue reintentando (no spamea).

## Cómo bootstrappear (host LAN, 1 vez)
```sh
# descubrir el device (IP/puerto cambian tras reboot -> wireless debugging != 5555)
adb mdns services            # -> _adb-tls-connect._tcp ... ip:port
# instalar el ARA canónico (token NO en argv; va en un launcher 0700)
ARA_TOKEN='<token largo>' CURL_BIN='<curl estatico arm64>' \
  IPTV_v5.4_MAX_AGGRESSION/vps/prisma/adb/bootstrap_ara_android.sh <ip:port>
# verificar
adb -s <ip:port> shell '/data/local/tmp/ape-qoe-agent.sh selftest'
```
`selftest` confirma `uid=2000`, grupo `log=1007`, `logcat=READABLE`, `curl`, `ara_root`, `token`, `fsm`.

## Persistencia 365 días (sin systemd/root en el TV)
- **On-device**: `nohup` + lockfile + self-re-exec; el agente se relanza si el logcat termina.
- **Host LAN**: `host-qoe-watchdog.ps1` + `tools/adb-keepalive.sh` (mDNS) — 1 Hz keep-alive, reboot-detect, re-push.
- **Boot frío total** (agente muerto + adb-net off + sin sesión + sin helper APK) → necesita **1 toque físico**
  USB/Opciones-de-desarrollador (límite del modelo de seguridad Android). El watchdog **alerta**, no promete.
