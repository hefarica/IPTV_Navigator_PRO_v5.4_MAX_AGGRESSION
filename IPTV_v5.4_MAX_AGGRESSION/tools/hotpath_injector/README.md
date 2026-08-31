# hotpath-injector (truth-guarded)

Sirve una lista `.m3u8` aplicando **upserts por canal en tiempo de request** desde un
`metadata.json` inmutable en memoria. No es proxy de segmentos; la autopista nginx queda
intocada. Posicionamiento: sidecar local / CI. Cualquier despliegue en el VPS pasa por
`tools/cicd/vps_deploy_map.json` + backup + health (doctrina `iptv-vps-touch-nothing`).

## Correcciones vs. la propuesta original (auditoría 2026-08-30)

| Propuesta original | Corregido a | Razón (truth-guard) |
|---|---|---|
| `X-Priority`, `X-Stream-Quality=4K-UHD-Tier1`, `X-Buffer-Strategy` hacia providers | **Eliminados** | Los origins no los interpretan; "simular Netflix/Akamai" por header es ficción |
| `X-CMAF-Optimized: TRUE` / LL-HLS "por header" | **Eliminados** | CMAF requiere `EXT-X-MAP`+fMP4 y LL-HLS requiere `EXT-X-PART` **del origin** |
| Perfil desde el path de la URL (`/P0/...`) | **Desde el bloque** (`#EXT-X-APE-PROFILE:` o default) | Las listas no llevan el perfil en el path |
| `RwLock` leído a través del `await` (serializaba todo) | `Arc` inmutable, recarga solo al reiniciar | Bug real del draft |
| Cap EXTHTTP 128 KB | **8 KB** (política `_sanitizePayloadSize`) | 128 KB × 10,172 canales ≈ 1.3 GB de lista |
| "Latencia 40–70 µs" (afirmada sin medir) | `--bench` mide p50/p99 reales en el host | Números medidos > números declarados |

## Schema `metadata.json`

```json
{
  "default_profile": "P3",
  "profiles": {
    "P3": {
      "exthttp": { "User-Agent": "…", "Referer": "…", "Accept": "*/*" },
      "vlcopt":  { "clock-synchro": "1", "audio-time-stretch": "1" }
    }
  }
}
```

Solo headers HTTP reales en `exthttp`. `vlcopt` upserta `#EXTVLCOPT:<key>=` existente.

## Uso

```bash
cargo run --release -- --metadata metadata.json --bench
cargo run --release -- --metadata metadata.json --listen 127.0.0.1:8081 --lists-dir /ruta/a/listas
curl http://127.0.0.1:8081/APE_LISTA.m3u8
```

## Estado

- **Fuente completa, NO compilada en el host Windows de desarrollo** (cargo/rustup
  ausentes — verificado 2026-08-30). Compilar en CI/VPS (`cargo build --release`)
  antes de cualquier uso. El bench reemplaza cualquier cifra de latencia por medición.
