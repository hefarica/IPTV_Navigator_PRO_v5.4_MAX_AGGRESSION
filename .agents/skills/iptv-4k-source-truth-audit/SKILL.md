---
name: iptv-4k-source-truth-audit
description: Procedimiento reproducibe para auditar cualquier catálogo o fuente IPTV 4K antes de creerle o recomendarlo — mide estrellas/forks/licencia/último push vía GitHub REST, sondea cada endpoint con su código HTTP real y cuenta #EXTINF, calcula la distribución real de calidad (2160p vs 1080p), detecta declaraciones infladas o insostenibles y emite veredicto con evidencia fechada. Úsala cuando llegue un catálogo de repos IPTV, cuando haya que decidir si una URL 4K es real, o cuando una cifra de estrellas o "30.000 canales 4K" no tenga fuente.
---

# Auditoría de verdad de fuentes IPTV 4K

## Principio único

**Una cifra sin fecha y sin fuente no es una medición: es una cita.** Y una cita
de un catálogo de terceros no se convierte en doctrina sin pasar por aquí.

## Cuándo se dispara

- Llega una lista de repos, "los mejores agregadores", o un catálogo con estrellas.
- Alguien afirma "X tiene 30.000 canales 4K" o "esta URL es la fuente 4K".
- Hay que elegir agregador/proxy/validador y no se quiere decidir por fama.
- Se va a citar una estrella, una licencia o un `pushed_at` en una decisión.
- Una skill o un panel repite cifras y no se sabe si están medidas.

## Los 4 ejes de la auditoría

| Eje | Qué se mide | Fuente | Falla típica que detecta |
|---|---|---|---|
| **Repo** | estrellas, forks, lenguaje, licencia SPDX, `pushed_at`, `archived` | `GET api.github.com/repos/{o}/{r}` | "1.5K+" que son 41 |
| **Endpoint** | código HTTP, bytes, `#EXTINF`, tipo | `GET` directo | URL "4K" que da 404 |
| **Calidad** | distribución de `quality`, cuántos 2160p/8K | `api/streams.json` | "30.000 canales 4K" = 20 |
| **Vigencia** | días desde el último push | `pushed_at` vs hoy | repo "activo" parado hace 16 meses |

## Paso 1 — Repos

```powershell
$probe = '<ruta a scripts/probe_repos.ps1>'
& $probe 'iptv-org/iptv','dearbulut/iptv','Guovin/iptv-api'
```

Reglas:
- **Sin token** hay 60 req/h: 11 repos caben de sobra. Si hace falta más, autentica
  con un token del usuario; **nunca** lo escribas en la skill ni en el repo.
- `license.spdx_id` puede ser `null` (sin licencia), `NOASSERTION` (hay archivo, no
  clasificable) o un id (MIT, AGPL-3.0, Unlicense…). **No son equivalentes**:
  `null` = sin permiso de redistribución por defecto.
- `archived: true` descalifica para dependencia viva.

## Paso 2 — Endpoints

```powershell
& '<ruta a scripts/probe_endpoints.ps1>' 'https://iptv-org.github.io/iptv/index.m3u'
```

Reglas:
- Contar `^#EXTINF` es la única forma barata de saber cuántos canales trae de verdad
  un `.m3u`. El tamaño en bytes no dice nada.
- `Invoke-WebRequest` **lanza excepción** en 4xx/5xx: captura el código del
  `Exception.Response.StatusCode`. Un programa que imprime "OK" tras un catch vacío
  es un generador de falsos positivos.
- `$r.Content` puede volver como `byte[]`: decodifica UTF-8 antes de contar. Si no,
  el conteo sale 0 y parece que la lista está vacía.
- Para JSON, `$c | ConvertFrom-Json` y `@($j).Count`; nunca imprimas el cuerpo
  entero (26 MB de `channels.json` inundan la consola y borran la evidencia).

## Paso 3 — Calidad real

```bash
curl -s https://iptv-org.github.io/api/streams.json \
  | jq -r 'group_by(.quality) | map({q: .[0].quality, n: length}) | sort_by(-.n) | .[:12][] | "\(.q)\t\(.n)"'
```

- `quality` puede faltar: 14.712 de 18.689 lo declaran (78,7 %). El 21,3 % restante
  **no es "sin calidad"**: es "no declarada".
- `quality == "2160p"` es el inventario 4K declarado. `8K` no existe en el campo.
- Que un canal se **llame** "4K" no lo hace 4K: el `title` no es `quality`.

## Paso 4 — Veredicto

| Regla | Veredicto | Acción |
|---|---|---|
| `measured < 0.75 × declared` | **INFLADO** | citar medido; no recomendar por fama |
| `measured > 1.5 × declared` | **SUBCONTADO** | corregir el orden del ranking |
| `stars == 0` y declarado ≥ 100 | **NO SOSTENIDO** | tratarlo como código sin auditar |
| `stars < 50` y declarado ≥ 300 | **NO SOSTENIDO** | ídem |
| `pushed_at` > 180 días | **DORMIDO** | decirlo antes de recomendarlo |
| `pushed_at` > 365 días | **ABANDONADO** | no como dependencia viva |
| `license == null` | **SIN LICENCIA** | sin permiso de redistribución |
| `license == NOASSERTION` | **LICENCIA SIN SPDX** | leer el archivo antes de integrar |
| endpoint declarado ≠ 200 | **ROTO** | sustituir por la ruta medida o descartar |
| `2160p` no aparece en `streams.json` | **4K NO DISPONIBLE** | no prometer 4K de esa fuente |

El veredicto **nunca** se emite sin la evidencia al lado: repo, fecha, código.

## Formato de evidencia

Toda auditoría termina en un objeto como `fixtures/measured_2026-11-15.json` de la
skill ancla: `measured_at_utc`, `method`, `repos[]`, `endpoints[]`, `quality`,
`not_measured[]`. El campo `not_measured` es obligatorio: es la diferencia entre un
informe honesto y una sábana de OK.

## Anti-patrones (todos detectados en el catálogo real)

1. **Sumar estrellas declaradas** y presentar el total como calidad. El total era
   93,6 K declarado vs 179,6 K medido: erraba en las dos direcciones.
2. **Asumir que una categoría existe** porque el nombre es lógico
   (`categories/4k.m3u` → 404).
3. **Contar canales por bytes** en lugar de por `#EXTINF`.
4. **Confundir "no medido" con cero**: no es lo mismo "no hay 8K" que "no lo miré".
5. **Ascender un repo por su licencia permisiva** sin mirar si tiene señal
   comunitaria.
6. **Reutilizar cifras de una sesión anterior** sin fecha: las estrellas caducan.

## Relación con otras skills

- `iptv-supreme-repos-4k` — el catálogo ya auditado (ancla).
- `iptv-4k-pipeline-automation` — qué hacer con el resultado de la auditoría.
- `iptv-m3u8-e2e-auditor`, `iptv-hls-validator` — auditar la lista, no el repo.
- `iptv-http-error-triage` — diagnosticar 401/403/429 de un proveedor.
- `iptv-supreme-2026-premium` — modelo de cuatro alcances con evidencia.

## Límites

- GitHub REST sin token: 60 req/h. Con token, 5.000/h.
- `api/streams.json` (3,9 MB) y `channels.json` (8 MB) cambian a diario: la foto
  caduca.
- Esta skill **mide repositorios públicos**; no accede a streams privados ni a
  credenciales, y no salta autenticación de ningún proveedor.
