# references.md — iptv-stream-stability-score

## Política aplicada

- **No se copió código.** De `ottstreamscore` se toma **el concepto de score con pesos
  explícitos**; de `stream-manager`, **las tres etiquetas** PASS/FAIL/SKIP y su semántica.
  Ambas cosas se reescriben para la telemetría de este stack.
- **No se instaló nada** y **no se ejecutó** ningún artefacto de terceros.
- **No se tocó el VPS.** Las consultas de §9 de `SKILL.md` son `awk`/`cat` de lectura.
- Licencias leídas en la API de GitHub el **2026-11-15**.

## Repos usados como fuente de concepto

| Repo | Licencia (API) | Estrellas | Qué se leyó | Concepto tomado | ¿Copiado? |
|---|---|---|---|---|---|
| `ottstreamscore/ottstreamscore` | **MIT** | 18 | `README.md` completo | Score compuesto con pesos declarados (**60 % reliability / 25 % resolución / 15 % FPS**) sobre ventana de **7 días**; sondeo de sanos cada 72 h y de fallidos con backoff; lock que impide sondeos concurrentes | **No** |
| `christheradioguy/stream-manager` | **null** (sin licencia) | 0 | `README.md` completo | Salida de auditoría **PASS/FAIL/SKIP** (`3 ok, 2 failed, 0 skipped`) y la regla de que un PASS exige **bytes recibidos y stream decodificable**: "a source that emits data but nothing decodable is reported as a failure, not a pass" | **No** |

Nota sobre `stream-manager`: al no tener licencia declarada, se usa **solo el concepto y la
semántica de las etiquetas**, que además coinciden con la práctica estándar de auditoría. No
se transcribe su código ni su salida literal como formato propio.

## Los 11 repos del encargo (estado de lectura)

| # | Repo | Licencia (API) | ¿Usado en esta skill? | Motivo |
|---|---|---|---|---|
| 1 | `streamlink/streamlink` | BSD-2-Clause | No | su aporte es buffer de transporte, no scoring |
| 2 | `m3ue/m3u-proxy` | NOASSERTION · README **CC BY-NC-SA 4.0** | No | su scoring es de stats internas, no de log HTTP |
| 3 | `back-to/liveproxy` | null | No | sin métricas |
| 4 | `kpirnie/kptv-proxy` | NOASSERTION · badge MIT | No (citado en skill 1) | su "estado" es de proceso, no de canal |
| 5 | `JustDr00py/mmp` | AGPL-3.0 | No | su score es por proveedor/backbone, no por canal |
| 6 | `euzu/tuliprox` | MIT | No (citado en skill 3) | QoS 24 h/7 d/30 d: concepto válido, no implementado aquí |
| 7 | `ottstreamscore/ottstreamscore` | MIT | **Sí** | pesos y ventana |
| 8 | `christheradioguy/stream-manager` | null | **Sí** | PASS/FAIL/SKIP |
| 9 | `rebeliptv/iptv` | NOASSERTION · README **proprietary**, forking prohibido | No | su salud de stream es booleana, sin score |
| 10 | `Maxhm007/IPTVTuner.github.io` | null | No | estados Active/Inactive/Healing/Recovered (citados en skill 1) |
| 11 | `akashshinde700/iptv_app` | null | No | health doctor sin fórmula publicada |

`Maxhm007/IPTVTuner` (sin sufijo) devuelve **404**: ese repo no existe. El real es
`Maxhm007/IPTVTuner.github.io`.

## Fuentes internas (lo que de verdad sostiene la fórmula)

| Artefacto | Qué se tomó | Línea / sección |
|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/pulse.php` | TTL de caché 8 s vs `targetduration` 11 s; retry y condiciones; `stale=1` a 60 s; código real al cliente | `:580`, `:610-624`, `:656-667`, `:671-680`, `:719-720` |
| `IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-module-watchdog.sh` | clasificación `sin-muestra` para 4xx del proveedor; 7 filas | `:137-171`, `:173-193` |
| `tools/ops/ape-zapping-meter.sh` | definición de arranque/gap/servicio y su límite de granularidad | `:7-22`, `:94-121`, `:142-144` |
| `docs/architecture/BASELINE_APE_CRYSTAL_FLOW_20261114.md` | p50 manifiesto 704 ms · caché 1 ms | `:43` |
| `docs/architecture/ESTADO_DEL_ARTE_20261115.md` | watchdog 6/6 y 7 módulos (contradicción declarada) | `:52`, `:217` |
| `docs/architecture/INSTRUMENTACION_APE_CRYSTAL_FLOW.md` | lista de módulos; "QoE perceptual no medible sin root" | `:112-115`, `:148` |
| `docs/audits/LIVE_CAPTURE_20261114.md` | p50 zapping bueno **0,649 s**, coste de un 502 **4,3 s**, 499 = zapping, prohibición de promediar 200 con 502 | `:248-259`, `:301` |
| `docs/audits/SEGMENT_PROXY_FIX_20261114.md` | 75,2 % de los 502 son del proveedor; bitrate real medido 11,42 Mbps | `:43-52`, `:71` |
| `docs/audits/ZAP_LATENCY_INSTRUMENTATION_20261114.md` | `$request_time` añadido al `log_format` el 2026-11-14 | `:16-31` |
| `docs/audits/E2E_PULSE_20261114.md` | 99,97 % de la latencia es `urt` del proveedor | `:131` |

## Lo que NO se pudo verificar

1. **No hay ninguna corrida per-canal.** Los valores del repo son **agregados** de baseline.
   Producir el score exige leer `playlist_access.log` del VPS, y esta sesión **no tiene acceso**.
   Por eso `SKILL.md` declara **NO COMPUTADO** en vez de inventar un ejemplo.
2. **Los pesos 40/20/30/10 son una propuesta de diseño**, no un resultado medido. El protocolo
   para validarlos (§10) **no se ha ejecutado**: requiere el ranking subjetivo del operador.
3. **`F` (frescura) no es computable hoy**: `X-APE-Pulse` no se persiste. Cualquier score que
   muestre `F` sin esa persistencia está inventando el dato.
4. **`C` (continuidad) solo es atribuible** cuando la cadena `/pulse/<id>` → `/seg/` es del
   mismo cliente y consecutiva. El log **no** trae un id de sesión que lo garantice; la
   atribución es una inferencia por proximidad temporal, y así se declara.
5. **No se verificó** si `playlist_access.log` incluye `$body_bytes_sent` en el `log_format`
   desplegado: la skill **no** usa bytes en la fórmula para no depender de un campo no
   confirmado. Si se confirma, `BANDWIDTH` real vs declarado sería un quinto componente.

## Reproducir

```bash
# 1) metadatos y licencias
curl -s https://api.github.com/repos/ottstreamscore/ottstreamscore | grep -E '"spdx_id"|"stargazers_count"'
curl -s https://api.github.com/repos/christheradioguy/stream-manager  | grep -E '"license"'

# 2) las fuentes internas, sin red
sed -n '576,700p' IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/pulse.php
sed -n '137,193p' IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-module-watchdog.sh
sed -n '248,260p' docs/audits/LIVE_CAPTURE_20261114.md
```

Estado: **concepto verificado en documentación; fórmula y pesos son propuesta; corrida real
NO COMPUTADA por falta de acceso al log del VPS.**
