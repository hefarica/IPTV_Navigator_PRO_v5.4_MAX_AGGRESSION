# ape-quality-watch — dónde puede correr de verdad, y dónde no

**Servicio de vigilancia del estado del pipeline. Solo lectura. Endurecido. NO desplegado.**

Este documento existe porque el detector HF se pidió «para el VPS/JIT», y hay que decir con precisión dónde tiene sujeto y dónde no. **Un servicio que finge medir lo que no puede medir es peor que no tenerlo.**

---

## 1 · Matriz de colocación, medida el 2026-11-13

| Ubicación | ¿Hay frames en CPU? | ¿Puede correr el detector HF? | Evidencia |
|---|---|---|---|
| **VPS `iptv-ape.duckdns.org`** | **NO** | **NO** | `/live/N.m3u8` → **404** · `/live/1.ts` → **404** · `/live/1.m4s` → **404**. El VPS es *rebase-only metadata*: rebasa URIs, no transporta vídeo. Está en `CLAUDE.md` y se volvió a medir hoy |
| **APK en el ONN (OTT/ExoPlayer)** | Sí, en el decodificador | **NO** | `MediaCodec.configure()` exige un *surface de render*; los decoders de hardware no entregan `YUV_420_888` legible por CPU a través de `ImageReader`. Ver `docs/audits/VEREDICTO_BLOCKINESS_DETECTOR_20261113.md` |
| **JIT worker** | Sí, **cuando exista** | Sí, **el día que procese vídeo** | Hoy el JIT no transcodea: el VPS no tiene FFmpeg sirviendo segmentos |
| **`dumpsys media.metrics` (APK o adb)** | N/A — no son frames | **NO, pero no le hace falta** | Da resolución real, cadencia declarada vs real, fotogramas perdidos, color estándar/transferencia/rango y judder. **Sí tiene datos** |

**Conclusión: el detector HF no tiene sujeto en ninguna parte del sistema tal como está hoy.** Lo que sí tiene sujeto es el **estado**, y es lo que este servicio vigila.

---

## 2 · Qué vigila este servicio, exactamente

Cada ciclo (60 s por defecto) lee del dispositivo autorizado:

| Comprobación | Fuente | Umbral | Origen del umbral |
|---|---|---|---|
| Color incoherente | `media.metrics` std/transfer | estándar BT.709/BT.2020 con transfer BT.601 | medido: el ONN entrega `standard=4 transfer=3` y `standard=1 transfer=3` |
| Rango full sobre BT.709 | `media.metrics` range | `range=2` con `standard=1` | medido |
| Cadencia declarada falsa | `media.metrics` content vs actual | desvío > **1 %** | medido: 29,41 vs 24,99 → 15 % de desvío |
| Judder | `media.metrics` judder-rate | > **0,10** | medido: 0,133 en el ONN con cadencia honesta |
| Fotogramas perdidos | `media.metrics` dropped/rendered | > **0,5 %** | margen sobre el 0 % medido en el ONN |
| Fuente pequeña | `media.metrics` width/height | ≤ 720p | medido: 640×360 en vivo |
| Override de densidad | `wm density` | cualquiera | fue la causa del incidente de pantalla grande |
| Claves persistentes | `settings get` | `display_size_forced`, `display_density_forced` no vacías | idem |

**Ninguna de estas comprobaciones es una opinión sobre la imagen. Son hechos del sistema.** Las que no tienen sujeto se reportan como `NO_COMPUTADO`, nunca como cero.

---

## 3 · El detector HF queda embarcado, no ejecutándose

`tools/quality/hf_zone_aware_calibrator.js` está validado:

- **0 falsos positivos** en dos codificaciones idénticas (7 alertas → 0 con clasificación de zona)
- **4 de 4 verdaderos** en una degradación real de 8 Mbps a 400 kbps
- Umbrales medidos: suelo de ruido 0,04 %, alerta 2 %, severo 8 %

**No se ejecuta en este servicio** porque no hay frames. Se activa con `APE_HF_ENABLE=1` + `APE_HF_INPUT=<ruta>` el día que el JIT entregue vídeo, y el demonio **declara en el ledger** si está activo o por qué no.

---

## 4 · Dureza: qué se garantiza

| Garantía | Cómo |
|---|---|
| **No escribe en el dispositivo** | solo `adb shell` con `dumpsys`, `wm`, `settings get` |
| **No toca producción** | el instalador no menciona nginx, `/lists/`, `/sync` ni `/ara` |
| **Fail-safe** | cualquier fallo se registra; el proceso **sale con 0** y el timer relanza. Nunca bucle caliente |
| **Sin crecimiento sin cota** | el ledger rota a 4 MiB (`APE_LEDGER_MAX`) |
| **Techo de tiempo** | cada llamada adb tiene `APE_TIMEOUT_MS` (15 s) |
| **Sin privilegios** | usuario `ape-quality` sin shell, `NoNewPrivileges`, `CapabilityBoundingSet=` vacío, `ProtectSystem=strict` |
| **Sin escritura fuera del ledger** | `ReadWritePaths=/var/lib/ape-quality-watch` es lo único escribible |
| **Techo de recursos** | `MemoryMax=256M`, `CPUQuota=20%`, `TasksMax=32` |
| **Sin secretos en el repo** | el token va en `/etc/ape-quality-watch/env` (0640, root:ape-quality). El instalador lo crea **vacío** y no lo sobrescribe |
| **Fail-closed en el empuje** | si hay `APE_PUSH_URL` sin `APE_PUSH_TOKEN`, **no empuja** y lo dice |
| **Idempotente** | correr `--apply` dos veces no duplica unidades ni usuarios; respeta `env` existente |
| **Reversible** | deja `/var/backups/ape-quality-watch/<stamp>/rollback.sh` con los comandos exactos |

---

## 5 · Instalación

```bash
./install.sh --audit    # solo lectura: qué hay y qué falta
./install.sh --plan     # qué cambiaría, sin escribir
./install.sh --apply    # aplica. NO arranca el timer.
```

**El instalador no arranca el timer a propósito.** Arrancar un servicio es decisión del operador:

```bash
systemctl start ape-quality-watch.timer      # arrancarlo
systemctl start ape-quality-watch.service    # forzar un ciclo ya
journalctl -u ape-quality-watch -n 20        # leer el ciclo
```

Configuración del empuje al VPS (opcional):

```bash
# /etc/ape-quality-watch/env
APE_DEVICE=192.168.1.3:34813
APE_PUSH_URL=https://iptv-ape.duckdns.org/...
APE_PUSH_TOKEN=<token>
```

**Sin `APE_DEVICE` el servicio usa el primer adb que encuentre** y lo declara en el ledger.

---

## 6 · Rollback

```bash
/var/backups/ape-quality-watch/<stamp>/rollback.sh
```

Restaura las unidades previas y recarga systemd. **No borra el ledger** — es historia, no estado.

---

## 7 · Lo que este servicio NO resuelve

- **No mejora la imagen.** Vigila y reporta; no hay motor que ejecute corrección en este sistema.
- **No arregla las 2.753 URLs muertas.** El censo de la lista publicada dio **100 % de URLs apuntando a `/live/`, que responde 404.** Eso es un problema de publicación, no de observación.
- **No sustituye al detector HF.** Son dos cosas distintas y este documento no las mezcla.
