# Referencias — iptv-4k-source-truth-audit

## Fuentes medidas

| Fuente | Qué da | Estado |
|---|---|---|
| `GET https://api.github.com/repos/{o}/{r}` | `stargazers_count`, `forks_count`, `language`, `license.spdx_id`, `pushed_at`, `archived` | medido |
| `GET https://raw.githubusercontent.com/{o}/{r}/{branch}/LICENSE` | la licencia **real**, cuando el SPDX no clasifica | medido |
| `GET https://iptv-org.github.io/api/streams.json` | inventario y `quality` por stream | medido |
| `GET https://iptv-org.github.io/api/categories.json` | categorías existentes | medido |
| `GET` a cualquier `.m3u` | status + `#EXTINF` | medido |

## Trampas de la herramienta (medidas, no teóricas)

1. **`Invoke-WebRequest` lanza en 4xx/5xx.** Sin `catch` no hay código de estado:
   el script muere o, peor, sigue como si fuera 200. Captura siempre
   `Exception.Response.StatusCode.value__`.
2. **`$r.Content` puede ser `byte[]`.** Contar `#EXTINF` sobre bytes da 0 y parece
   lista vacía. Decodifica UTF-8 antes de contar.
3. **Imprimir el cuerpo borra la evidencia.** `channels.json` pesa 8 MB y
   `dearbulut/api/v1/channels.json` 26,6 MB: la consola se trunca y se pierde el
   resto de la tabla. Para JSON usa `@($j).Count`, nunca el volcado.
4. **`ConvertFrom-Json` sobre 26 MB tarda** y puede agotar memoria en un bucle.
5. **Sin token: 60 req/h.** Un bucle de 50 repos y un reintento lo agotan; el
   `403` resultante no significa "repositorio privado".

## Discrepancias SPDX vs archivo (medidas 2026-11-15)

| Repo | `license.spdx_id` | Archivo `LICENSE` | Gana |
|---|---|---|---|
| `Guovin/iptv-api` | NOASSERTION | GNU AFFERO GPL v3 (26.574 B) | AGPL-3.0 |
| `kpirnie/kptv-proxy` | NOASSERTION | MIT (1.871 B) | MIT |
| `iptv-org/iptv` | Unlicense | Unlicense (1.235 B) | Unlicense |
| `Drone9988/IPTV` | `null` | no hay archivo | sin licencia |
| `shadialhasan/iptv-m3u-validator` | MIT | (no leído) | MIT por SPDX |

Conclusión operativa: **el campo SPDX es un atajo, no una verificación.** Cuando
decide una integración, se lee el archivo.

## Normas internas

- `docs/policies/ANTI_DEGRADATION_LAW.md` — prohibido degradar o etiquetar de más.
- `docs/policies/CRYSTAL_4K_ENHANCEMENT_LAW.md` — enhancement se declara como
  enhancement, nunca como fuente.
- `AGENTS.md` → REGLA LEGAL Y ÉTICA — solo fuentes autorizadas.
- `iptv-http-error-triage` — para diagnosticar 401/403/429 de proveedores
  (diagnóstico, no evasión).
- `iptv-vps-touch-nothing` — una auditoría no autoriza mutar el VPS.
