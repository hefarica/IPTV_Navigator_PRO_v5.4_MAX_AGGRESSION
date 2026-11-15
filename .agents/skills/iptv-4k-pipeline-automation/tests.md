# Tests — iptv-4k-pipeline-automation

## T1 — La URL del catálogo está muerta

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://iptv-org.github.io/iptv/categories/4k.m3u
```
**Esperado:** `404`.
**Falla si:** alguien reintroduce esa URL como paso 1.

## T2 — El inventario 2160p

```bash
curl -s https://iptv-org.github.io/api/streams.json | jq '[.[]|select(.quality=="2160p")]|length'
```
**Esperado:** 20 ±20 % (16-24). 8K: 0.
**Falla si:** el pipeline promete "30.000 canales 4K".

## T3 — El script aborta con lista inválida

```bash
printf '#EXTM3U\n#EXTINF:-1,A\nhttps://a\n' > bad.m3u   # 1 URL, ok
bash examples/build_real_4k.sh /tmp/out.m3u
```
**Esperado:** `EXTINF == URLs`, `#EXTM3U` presente, `master_tags=0`, exit 0.
**Falla si:** genera una lista con 2 URLs bajo un `#EXTINF` o sin cabecera.

## T4 — Anti-509

**Esperado:** por cada `#EXTINF` exactamente una línea `http(s)://`.
**Falla si:** hay más URLs que `#EXTINF` (múltiples URLs por canal → 509 upstream).

## T5 — Etiqueta ≤ evidencia

**Entrada:** cualquier canal con `quality != "2160p"`.
**Esperado:** no lleva etiqueta 4K; si la fuente no declara calidad, ninguna.
**Falla si:** un `quality: 1080p` aparece como `group-title="4K"`.

## T6 — Sin tags de master

```bash
grep -c '^#EXT-X-STREAM-INF\|^#EXT-X-MEDIA.*URI=\|^#EXT-X-I-FRAME-STREAM-INF.*URI=' real-4k.m3u
```
**Esperado:** `0`.

## T7 — Gates del repo

```bash
node tools/check_anti_degradation_policy.js && node tools/check_crystal_4k_law.js
```
**Esperado:** exit 0 en ambos.
**Falla si:** la lista declara 4K sobre fuente FHD, o reduce bitrate para "estabilizar".

## T8 — Dedupe correcto

**Entrada:** dos canales distintos con el mismo `title` y URLs distintas
(p. ej. dos "Fireplace Vibes" en 2160p).
**Esperado:** ambos se conservan.
**Falla si:** el dedupe por nombre elimina uno (pérdida de canal).
