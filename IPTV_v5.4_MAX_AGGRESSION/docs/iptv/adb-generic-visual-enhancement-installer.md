# ADB Generic Visual-Enhancement Installer

Instalador VPS **genérico, idempotente y polimórfico** de mejora visual por ADB para cualquier
player AndroidTV/Fire con ADB habilitado. Extiende lo existente (no duplica).

## Qué hace
- Detecta cualquier device alcanzable por ADB y su **SoC** (amlogic/mediatek/realtek/rockchip/qualcomm/generic)
  y **player** (OTT Navigator/TiviMate/Kodi/VLC/Smarters/ExoPlayer).
- Aplica **mejoras universales** (match_content_frame_rate, HDR conversion, resolución preferida,
  stay-awake, animaciones 0) + **mejoras por SoC** + **MEMC best-effort** donde el SoC lo soporta.
- **Idempotente**: `get → compare → put` (`put_if_diff`/`setprop_if_diff`) + marcador
  `persist.ape.enh.version=2026.06-universal-1`. Re-correr no reprocesa.
- **Auto-instala** desde el VPS cuando detecta un player nuevo (sin marcador) e instala el sentinel
  on-device solo si falta (clean-detach `setsid … </dev/null >/dev/null 2>&1 &`, un solo daemon).

## Qué NO toca
nginx · URLs · túneles WireGuard/Xray/chisel · SHIELDED · proveedor IPTV · rutas. **Solo ADB al device.**

## Archivos
- `vps/sentinel/lib/detect_capabilities.sh` — fingerprint SoC/player/marcador (extiende `detect_device.sh`).
- `vps/sentinel/profiles/generic_player.sh` — perfil polimórfico idempotente (superset de `onn_4k.sh`).
- `vps/prisma/adb/ape-player-autoinstall.sh` — detector/instalador VPS.
- `vps/prisma/adb/ape-player-autoinstall.{service,timer}` — systemd (manual enable).
- `sentinel_orchestrator.sh` — paso 3.5: despacha `generic_player` para no-ONN (ONN intacto).

## Cómo detecta SoC
`ro.board.platform` + `ro.hardware` → `case`: amlogic(s905/s922/t9) · mediatek(mt6/8/9) · realtek(rtd1) ·
rockchip(rk3) · qualcomm(msm/sm) · generic.

## Cómo aplica MEMC ("FPS de novela")
Best-effort, nunca obligatorio, siempre `|| true`:
- **Amlogic**: `settings put system/global memc_enable 1` + `setprop persist.sys.memc.enable 1` +
  broadcast `com.droidlogic.tv.action.MEMC_ENABLE`.
- **MediaTek**: `persist.vendor.mtk.memc.enable`. **Realtek**: `persist.vendor.rtk.memc`. **Rockchip**: `persist.sys.rkmemc.enable`.
- **generic/qualcomm**: NO MEMC (no romper) → reporta `NOT_SUPPORTED`.

## Idempotencia
El marcador `persist.ape.enh.version` se compara al inicio: si coincide con `APE_ENH_VERSION`, imprime
`idempotent skip <T>` y no hace nada. Cada setting/prop se aplica solo si difiere del valor actual.

## Instalar el timer (manual — NO auto-deploy)
```bash
sudo cp vps/prisma/adb/ape-player-autoinstall.{service,timer} /etc/systemd/system/
sudo cp vps/prisma/adb/ape-player-autoinstall.sh /opt/netshield/vps/prisma/adb/   # ajustar ExecStart si otra ruta
sudo systemctl daemon-reload
sudo systemctl enable --now ape-player-autoinstall.timer
systemctl list-timers | grep ape-player
```

## Rollback
1. Borrar marcador en el device: `adb -s <T> shell "setprop persist.ape.enh.version ''"`.
2. (Opcional) restaurar settings específicos previos si se guardaron.
3. Detener timer: `sudo systemctl disable --now ape-player-autoinstall.timer`.

## Verificar
- `adb devices` vacío → script no falla, imprime skip limpio.
- 2ª ejecución → `idempotent skip` (0 cambios).
- Amlogic: `getprop persist.sys.memc.enable`=1, `settings get system aisr_enable`=1, marcador set.
- Generic: solo universal aplicado, sin props de SoC ajeno.
- Sentinel on-device: 1 solo (PPID=1, clean-detach).
