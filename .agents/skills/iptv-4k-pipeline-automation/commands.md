# Comandos — iptv-4k-pipeline-automation

## Permitidos

```bash
# Los 4 pasos completos, con invariantes y abort
bash examples/build_real_4k.sh real-4k.m3u
```

```bash
# Paso 1 suelto
curl -s https://iptv-org.github.io/api/streams.json \
  | jq -r '.[] | select(.quality=="2160p") | "#EXTINF:-1," + .title + "\n" + .url' > real-4k.m3u
```

```bash
# Inventario antes de prometer nada
curl -s https://iptv-org.github.io/api/streams.json | jq '[.[]|select(.quality=="2160p")]|length'
curl -s https://iptv-org.github.io/api/streams.json | jq -r '[.[]|select(.quality)]|length'
```

```bash
# Invariantes de la lista
grep -c '^#EXTINF' real-4k.m3u
grep -cE '^https?:' real-4k.m3u
head -1 real-4k.m3u
grep -c '^#EXT-X-STREAM-INF' real-4k.m3u || true
```

```bash
# Gate del repo
node tools/check_anti_degradation_policy.js
node tools/check_crystal_4k_law.js
```

```bash
# Probe de un canal concreto (paso 2, opcional)
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name \
  -of csv=p=0 "https://host/canal/index.m3u8"
```

## Prohibidos

- `curl -o 4k.m3u https://iptv-org.github.io/iptv/categories/4k.m3u` → **404**.
- Etiquetar 4K un canal cuya `quality` no es `2160p` y que no se midió.
- Emitir `RESOLUTION=` o `CODECS=` en una lista de canales (no es un master HLS).
- Emitir `#EXT-X-MEDIA URI=`, `#EXT-X-I-FRAME-STREAM-INF URI=` o más de un
  `#EXT-X-STREAM-INF` por canal.
- Transformar las URLs internas para "shielding" (SHIELDED es rename).
- Escribir en `/var/www/html`, `/opt/netshield/` o `/etc/nginx/` desde este pipeline
  sin autorización (rige `iptv-vps-touch-nothing`).
- Publicar la lista sin pasar `check_anti_degradation_policy.js`.
