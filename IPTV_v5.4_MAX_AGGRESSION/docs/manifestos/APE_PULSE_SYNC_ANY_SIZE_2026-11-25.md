# APE pulse sync — listas de cualquier tamaño y espacio recuperado (2026-11-25)

**Estado:** sync 1.8.0 desplegado, tres listas grandes envueltas y servidas, 6,9 GB libres.  
**Run CI/CD:** [45547641720](https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/actions/runs/45547641720) · **success**.

## 1. Qué se ha cambiado

- `ape-pulse-sync.sh` **1.8.0**:
  - `MAX_MB=0` por defecto: **sin tope artificial** de 700 MB.
  - La guarda de disco calcula el tamaño **descomprimido** (`gzip -l` para `.gz`), no el comprimido.
  - El tope sigue disponible con `APE_PULSE_MAX_MB` si el operador lo quiere.
  - Sigue usando `flock`, estado idempotente, escritura atómica del wrapper y `nice/ionice`.
- Workflow `ape-deploy-hybrid` ahora instala también `ape-pulse-sync.sh` con `bash -n` y verificación de `MAX_MB=0`/`content_bytes`.

## 2. Espacio recuperado

| Origen | Liberado |
|---|---:|
| Journal (vacuum a 100 MB) | 418 MB |
| `syslog.1` truncado (se conserva el syslog activo) | 262 MB |
| APT cache | ~114 MB |
| Revisiones Snap antiguas (8) | ~1,5 GB |
| `target/` de Rust (`cargo clean`) | 480 MB |
| `LIGHT_CABLEADA` duplicados, sha256 idéntico | 793 MB |
| Backups `*.bak-presync` del 15-nov | 570 MB |

Resultado: **3,5 GB → 7,3 GB libres** antes de las salidas; después de generar las tres listas grandes quedan **6,9 GB**.

No se tocaron Docker, `/root/ape-backups`, la base de datos, la configuración de nginx ni las listas de reproducción.

## 3. Listas grandes

Para cada una se verificó que `gzip -dc .gz | sha256sum` coincide con el `.m3u8` original antes de tocar nada:

| Lista | `.gz` | Salida envuelta | HTTP | Tags |
|---|---:|---:|---:|---:|
| `APE_LISTA_1795576545357_DIRECTA_CABLEADA` | 494.293.276 B | 1.862.477.516 B | 200 | 28.655 |
| `3JHFTC_CABLEADA` | 488.395.456 B | 1.867.039.679 B | 200 | 28.655 |
| `APE_LISTA_1795555985857_DIRECTA_CABLEADA` | 493.207.118 B | 1.864.973.019 B | 200 | 28.655 |

- El `.m3u8` original se ha dejado en **0 B** (placeholder) y el contenido real se conserva en el `.gz` verificado.
- La salida envuelta vive en `/var/www/lists/pulse/<base>.m3u8` y es la que sirve nginx (`try_files`).
- El sync 1.8.0 procesó el canario desde `.gz`:

```text
wrap 3JHFTC_CABLEADA (465MB comprimido, 1763MB descomprimido, ...)
```

- Estado del canario: `wrapper_version=1.8.0`, `src_size=488.395.456`, `out_bytes=1.867.039.679`.
- Timer `ape-pulse-sync.timer` **activo**.

### Restaurar una fuente original

```bash
gzip -dc /var/www/lists/<base>.m3u8.gz > /var/www/lists/<base>.m3u8
```

La salida envuelta no se toca. El `.gz` es la copia de seguridad exacta.

## 4. Límite real

No hay tope de 700 MB. El único límite es el disco: **38 GB totales, 6,9 GB libres** y una guarda que no empieza una lista si no cabe su tamaño descomprimido + colchón. Para sostener más listas grandes simultáneas hay que ampliar el volumen; no se recorta ninguna lista para “hacer sitio”.

## 5. Rollback

- Sync: backup del deploy en `/var/backups/ape-hybrid/<stamp>/tools/ape-pulse-sync.sh`.
- Listas: el `.gz` verificado permite restaurar el `.m3u8` original.
- No se ha borrado ninguna lista servida; solo se sustituyó el original por un placeholder cuando la copia `.gz` era hash-idéntica.

## 6. Fuera de alcance

- APK 4K local, nodo GPU compatible, 6K de dispositivo y LLM asesor: fases P3/P5-P7 del plan, no desplegadas.
- No se tocaron Docker, bases de datos, PHP, configuración de nginx ni JIT.
