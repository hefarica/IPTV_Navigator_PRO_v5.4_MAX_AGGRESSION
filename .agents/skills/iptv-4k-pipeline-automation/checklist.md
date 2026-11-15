# Checklist — iptv-4k-pipeline-automation

## Antes

- [ ] Sé de dónde salen los streams y que la fuente está **autorizada**.
- [ ] Comprobé que la URL de categoría 4K no es la del catálogo viejo (404).
- [ ] Anoté la fecha de la medición del inventario.
- [ ] Sé qué etiqueta voy a poder sostener: `verified`, `declarado` o ninguna.

## Durante

- [ ] Paso 1: filtro por `quality == "2160p"`, no por título.
- [ ] Paso 2: si no hay probe, la etiqueta se queda en `declarado`.
- [ ] Paso 3: una URL por `#EXTINF`; dedupe por URL, no por nombre.
- [ ] Paso 4: `#EXTM3U` primero; sin tags de master; `group-title` coherente.
- [ ] Cada canal nuevo que entra conserva su procedencia (declarado/medido).

## Después

- [ ] `EXTINF == URLs`.
- [ ] `#EXTM3U` en la primera línea.
- [ ] 0 `#EXT-X-STREAM-INF`.
- [ ] 0 canales etiquetados 4K sin `quality == 2160p` o probe que lo confirme.
- [ ] `node tools/check_anti_degradation_policy.js` → OK.
- [ ] Si la lista es para el VPS: SHIELDED por rename y sin tocar URLs internas.

## Rollback

1. Si la lista salió con etiquetas infladas → **borrarla** y regenerar; no se
   "corrige" la etiqueta sobre la lista mala.
2. Si se publicó en el VPS → restaurar el fichero anterior desde el backup con stamp
   (`/var/backups/ape-deploy/<stamp>/`), nunca editar in situ.
3. Si el inventario cambió > 20 % (20 → 16/24) → re-medir, anotar fecha nueva y
   actualizar `iptv-supreme-repos-4k` y su fixture.
4. Si el pipeline escribió en un directorio de producción sin autorización → parar,
   informar y revertir; el pipeline no tiene permiso implícito sobre el VPS.
