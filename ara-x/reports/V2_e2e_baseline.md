# V2 · E2E baseline ARA-X sobre catálogo real

Fecha: 2026-10-30 · Resultado: **PASS** · Elapsed: 260770 ms

## Entrada / salida

| Dato | Valor |
|---|---|
| input | `APE_LISTA_4K_live_20261030_full.m3u8` (572170477 B) |
| input sha256 | `e27c03eb45dacd6e5f19c3f4e016b456236ca2c06f485ddf11165ddc86e2a680` |
| output | `APE_LISTA_4K_live_20261030_full_ARA-X_once.m3u8` (572171381 B) |
| output sha256 | `24e1e3f6babb8c6df82a3de25616423d78aa608881407063ddcd277a4ddc951d` |
| segunda pasada | injected=false, byte-idéntica=true |
| bloque ARA | 27 líneas, EOL LF |
| captura completa | true (EXTINF=10631 / declarados=10631) |



## Invariantes antes/después

| Métrica | Antes | Después |
|---|---|---|
| extinf | 10631 | 10631 |
| declaredChannels | 10631 | 10631 |
| urls | 10631 | 10631 |
| streamInf | 10631 | 10631 |
| extattr | 584705 | 584705 |
| araVersion | 0 | 1 |
| araTags | 0 | 27 |
| blocks | 10631 | 10631 |
| blocksWithWrongUrlCount | 0 | 0 |

## Checks

| Check | Estado | Antes | Después |
|---|---|---|---|
| channels_preserved | PASS | 10631 | 10631 |
| capture_complete | PASS | 10631 | 10631 |
| url_count_preserved | PASS | 10631 | 10631 |
| url_bytes_preserved | PASS | "f69a048f8c4c14a8ee6dd3eb9ab000b9c70e26d1e8178414c322a4f40f55f330" | "f69a048f8c4c14a8ee6dd3eb9ab000b9c70e26d1e8178414c322a4f40f55f330" |
| stream_inf_preserved | PASS | 10631 | 10631 |
| extattr_preserved | PASS | 584705 | 584705 |
| ara_block_exactly_once | PASS | 0 | 1 |
| no_duplicate_ara_directives | PASS | 0 | 0 |
| url_block_shape_preserved | PASS | 0 | 0 |
| media_only_tags_not_added | PASS | {"#EXT-X-SERVER-CONTROL":1,"#EXT-X-TARGETDURATION":1} | {"#EXT-X-SERVER-CONTROL":1,"#EXT-X-TARGETDURATION":1} |
| zero_wrong_url_blocks | PASS | 0 | 0 |

## Reproducir

```powershell
node ara-x/scripts/playlist/e2e_baseline.js --in ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8
```

> La salida no se sirve. Este E2E valida la capa de playlist localmente; publicar la lista con el
> bloque ARA-X requiere aprobación/claim del workstream correspondiente.
