# Comandos — iptv-supreme-repos-4k

## Permitidos (lectura, sin efectos)

```powershell
# 1. Estrellas/lenguaje/licencia/push de los 11 repos (una sola llamada por repo)
$repos='iptv-org/iptv','dearbulut/iptv','Guovin/iptv-api','freearhey/iptv-checker',
 'shadialhasan/iptv-m3u-validator','Dispatcharr/Dispatcharr','euzu/tuliprox',
 'kpirnie/kptv-proxy','iptv-org/epg','alperokur/xtream-api-proxy-epg','Drone9988/IPTV'
foreach($r in $repos){
  $j=Invoke-RestMethod -Uri "https://api.github.com/repos/$r" -Headers @{'User-Agent'='probe'}
  '{0,-34} stars={1,-7} lic={2,-12} push={3}' -f $r,$j.stargazers_count,$j.license.spdx_id,$j.pushed_at
}
```

```powershell
# 2. Estado de un endpoint con su conteo de canales
$r=Invoke-WebRequest -Uri 'https://iptv-org.github.io/iptv/index.m3u' -Headers @{'User-Agent'='probe'}
([regex]::Matches($r.Content,'(?m)^#EXTINF')).Count
```

```bash
# 3. Distribución de calidad (requiere jq + red)
curl -s https://iptv-org.github.io/api/streams.json \
  | jq -r 'group_by(.quality) | map({q: .[0].quality, n: length}) | sort_by(-.n) | .[:12][] | "\(.q)\t\(.n)"'
```

```bash
# 4. Inventario 4K real
curl -s https://iptv-org.github.io/api/streams.json \
  | jq '[.[] | select(.quality == "2160p")] | length'   # esperado: 20
```

```bash
# 5. Clonar para inspección local (solo lectura del árbol)
git clone --depth 1 https://github.com/iptv-org/iptv.git /tmp/iptv-org
```

## Prohibidos

- `git push`, `git commit`, PRs o issues en repos de terceros en nombre del
  propietario sin autorización explícita.
- Ejecutar binarios descargados de repos con **0 estrellas y sin licencia**
  (`Drone9988/IPTV`) en la máquina de producción.
- Usar `curl | bash`, `iwr | iex` o cualquier instalador remoto de estos repos sin
  revisar el script.
- Presentar `verified: true` de un JSON de ejemplo como prueba de resolución.
- Escribir en `/var/www/html`, `/opt/netshield/` o `/etc/nginx/` a partir de una
  recomendación de esta skill (rige `iptv-vps-touch-nothing`).
- Scrapear con credenciales no autorizadas o saltarse un `401/403/429` de un
  proveedor (rige `iptv-http-error-triage` para diagnóstico, no para evasión).
