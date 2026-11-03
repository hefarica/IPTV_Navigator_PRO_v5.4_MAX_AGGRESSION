# `_vps_stage/edge/e6/` — PESO Y ENTREGA DE LA LISTA (E6 · FASE 5)

Todo lo de esta carpeta es **read-only sobre el VPS**: GET/HEAD contra `127.0.0.1:443`
(con `--resolve`), lectura de `/proc`, `/var/log` y `nginx -T`. **No escribe nada en el VPS,
no recarga nginx y no cambia ningún `.conf`.** No toca `/var/www/lists` ni la ruta `/lists/`.

## Ficheros

| Fichero | Qué es | Escribe en el VPS |
|---|---|---|
| `payload_edge.mjs` | Arnés **v1.1.0** (Node ≥18, 0 dependencias): sonda + medidas de cliente | **NO** |
| `probe_vps.sh` | Sonda del servidor (A/B/C/D/E, 41 casos). Se ejecuta por `ssh … 'bash -s'` | **NO** |
| `proposals/manifest_microcache_1s.md` | Diseño y veredicto de la micro-caché de 1 s | **NO** (borrador) |
| `runs/<STAMP_UTC>/payload.json` | Resultado estructurado del run | — |
| `runs/<STAMP_UTC>/payload.log` | Log humano del run | — |
| `runs/<STAMP_UTC>/probe.raw.txt` | Salida cruda de la sonda (cabeceras incluidas) | — |
| `runs/latest.json` · `runs/latest_probe.json` | Copias del último run / última sonda | — |

## Cómo se ejecuta (desde la raíz del repo)

```bash
# arnés completo (sonda servidor + medidas cliente) — ~90 s
node _vps_stage/edge/e6/payload_edge.mjs --label "E6"

# solo cliente, reutilizando la última sonda (~60 s, ~64 MB de tráfico)
node _vps_stage/edge/e6/payload_edge.mjs --skip-probe --label "E6-cliente"

# re-derivar hechos del servidor de un raw ya capturado (0 tráfico)
node _vps_stage/edge/e6/payload_edge.mjs --rebuild _vps_stage/edge/e6/runs/<STAMP>
```

`EDGE_SSH` permite cambiar el destino SSH (default `root@178.156.147.234`).

## Parámetros FIJOS (no cambiar sin versionar `docs/edge/PAYLOAD.md`)

```
HOST    = iptv-ape.duckdns.org            LISTA = /lists/APE_LISTA_4K.m3u8
CLIENTE = 3 conexiones nuevas por representación · 3 HEAD keep-alive · k=4 conexiones
TOPES   = 32 MB / 10 s por muestra de caudal (NO se bajan 140 MB ni 564 MB)
SONDA   = 41 casos (A1–A8 · B1–B4 · C1–C11 · D1–D13 · E1–E5)
h2      = se sondea ALPN, se mide caudal con ventana por defecto (64 KiB) y con 16 MiB
```

## Runs

| Run | Qué es |
|---|---|
| `runs/20261026T203552Z/` | Primera sonda manual (solo servidor). CPU 280 ms gzip / 2.830 ms identity |
| `runs/20261026T203833Z/` | Ensayo de calibración (parser v1.0.0). **No canónico** |
| `runs/20261026T204034Z/` | **Run canónico PRE-HTTP/2** → ver [`docs/edge/PAYLOAD.md`](../../../docs/edge/PAYLOAD.md) |
| `runs/20261026T205522Z/` | **Transición**: la fase 1 aplicó `http2` durante la sonda ⇒ 8 casos salieron h1 |
| `runs/20261026T205755Z/` | Primera pasada post-h2 completa (ventana h2 por defecto vs 16 MiB) |
| `runs/20261026T205941Z/` | **Run canónico POST-HTTP/2** (h2=30 / h1.1=2 forzados) |
| `runs/latest.json` | Copia del último `payload.json` |

> **HTTP/2:** activo desde 2026-10-26T20:55:20Z (fase 1, `default` `49c162a8…`, `nginx -T`
> `0c6c0ea0…`). E6 no aplicó el cambio: lo midió antes y después con el mismo arnés. El
> caudal h2 depende de la **ventana de flujo del cliente** (0,42–0,50 MB/s con 64 KiB vs
> 3,7–4,7 MB/s con 16 MiB) — ver `docs/edge/PAYLOAD.md` §8.1.
