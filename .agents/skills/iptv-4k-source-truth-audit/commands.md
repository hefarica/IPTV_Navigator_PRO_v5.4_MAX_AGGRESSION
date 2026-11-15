# Comandos — iptv-4k-source-truth-audit

## Permitidos

```powershell
# Repos: estrellas, licencia, vigencia, veredicto
& "$HOME\.claude\skills\iptv-4k-source-truth-audit\scripts\probe_repos.ps1" `
  'iptv-org/iptv','dearbulut/iptv','Guovin/iptv-api'
```

```powershell
# Endpoints: status real + bytes + #EXTINF
& "$HOME\.claude\skills\iptv-4k-source-truth-audit\scripts\probe_endpoints.ps1" `
  'https://iptv-org.github.io/iptv/index.m3u','https://iptv-org.github.io/iptv/categories/4k.m3u'
```

```powershell
# Licencia real cuando el SPDX no clasifica
Invoke-WebRequest 'https://raw.githubusercontent.com/Guovin/iptv-api/master/LICENSE' |
  Select-Object -ExpandProperty Content | Select-Object -First 1
```

```bash
# Distribución de calidad
curl -s https://iptv-org.github.io/api/streams.json \
  | jq -r 'group_by(.quality) | map({q: .[0].quality, n: length}) | sort_by(-.n) | .[:12][] | "\(.q)\t\(.n)"'

# Cuántos 2160p hay de verdad
curl -s https://iptv-org.github.io/api/streams.json | jq '[.[]|select(.quality=="2160p")]|length'
```

```bash
# Categorías reales (para desmentir una categoría "4K" inventada)
curl -s https://iptv-org.github.io/api/categories.json | jq -r '.[].id' | sort
```

## Prohibidos

- `curl ... | bash` / `iwr ... | iex` sobre cualquier script de estos repos.
- Ejecutar binarios de repos con **0 estrellas y sin licencia** en producción.
- Autenticar GitHub con un token escrito en la skill, en el repo o en un log.
- Son dear sin `-Headers @{'User-Agent'=...}`: GitHub responde 403 y parece un repo
  privado.
- Convertir un `403` de rate limit en la conclusión "el repo no existe".
- Presentar un conteo de `#EXTINF` sin haber decodificado el cuerpo.
- Usar esta auditoría como autorización para tocar `/opt/netshield/` o
  `/etc/nginx/` (rige `iptv-vps-touch-nothing`).
