# checklist.md — pre / durante / post / rollback

## PRE (antes de tocar una sola cadena)

- [ ] ¿Identifiqué el **carril**? `vlc` · `ffmpeg` · `manifest`.
- [ ] ¿Identifiqué el **runtime**? VLC desktop · OTT Navigator (¿motor VLC seleccionado?) · TiviMate · ExoPlayer · Kodi.
- [ ] ¿La cadena que voy a copiar viene de un **artefacto medido**, no de una prosa?
- [ ] ¿Tengo la **fuente de prueba con tags de color**? (sin tags, `zscale=transfer=linear` aborta con `code 3074`).
- [ ] ¿Voy a afirmar "se aplica"? Entonces necesito un **log** que lo pruebe.
- [ ] ¿Estoy a punto de usar un tramo fijo de líneas para delimitar un bloque? **PARAR**: usar `#EXTINF`.
- [ ] ¿Estoy a punto de leer un `0` como ausencia? Repetir **case-insensitive**.

## DURANTE

- [ ] Probar **etapa por etapa** cuando la cadena completa falla. Un solo parámetro puede tumbar todo.
- [ ] Leer el **stderr literal** y atribuir el fallo al parámetro que el parser nombra.
- [ ] Verificar rangos contra el binario real (`ffmpeg -h filter=<nombre>`), no contra memoria.
- [ ] En VLC: probar cada módulo **aislado**; el arnés headless aborta tras el primero.
- [ ] Respetar el layout del bloque: **URI + 2 tags + línea vacía**.
- [ ] No inventar `VPP_INTENSITY` ni ningún valor no observado.

## POST (antes de declarar hecho)

- [ ] `node -c` sobre cada JS tocado → exit 0.
- [ ] `ffmpeg -filter_script` sobre cada perfil → exit 0, con la ruta de la cadena.
- [ ] VLC: 0 × `Failed to create video filter`.
- [ ] El payload de `#EXT-X-APE-IMAGE-RECIPE:` parsea con `JSON.parse` y cabe en 1024 B.
- [ ] Ledger con veredicto **por celda** (perfil × carril), sin huecos.
- [ ] Cero credenciales en los artefactos (`verify_no_leaks`-style).
- [ ] Los números del reporte citan su comando y su archivo.

## ROLLBACK

- [ ] Copia previa del artefacto antes de editar (`recipes.json`, `compile.js`).
- [ ] Si el cambio tocó el generador: `git diff --stat` y `node -c` de los 3 JS del pipeline.
- [ ] Si tocó el VPS: `nginx -T > /tmp/pre-$(date +%s).conf` **antes**; `nginx -t` sobre el propuesto; reload solo si es seguro (restart obligatorio para `proxy_cache_path`, `worker_*`, `listen`, `ssl_*`, módulo Lua nuevo).
- [ ] Nunca revertir bajando calidad (resolución, códec, HDR, fps, bitrate).

## Señales de que estoy a punto de repetir un error ya pagado

| Señal | Error |
|---|---|
| "es obvio que `video-filter` con sintaxis ffmpeg funciona" | VLC no tiene plugin avfilter |
| "la opción tiene que ser `me_mode`" | `me` existe (1..9); el fallo era `scd=5` |
| "`bt1886` no aparece" | aparece 9.765 veces como `BT.1886` |
| "el bloque tiene 256 EXTVLCOPT" | son 134; el tramo fijo engaña |
| "la lista usa P5" | 0 instancias |
| "el URI cierra el bloque" | hay 2 tags después |
| "120 fps" | medido: P1 4K = 29,6 fps |
