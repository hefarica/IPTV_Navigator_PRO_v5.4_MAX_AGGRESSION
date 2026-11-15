# iptv-4k-source-truth-audit

Procedimiento para auditar una fuente IPTV 4K **antes** de creerle.

## Qué mide

| Eje | Dato | Fuente |
|---|---|---|
| Repo | estrellas, forks, lenguaje, licencia, último push, archivado | GitHub REST |
| Endpoint | código HTTP, bytes, `#EXTINF` | GET directo |
| Calidad | distribución de `quality`, 2160p, 8K | `api/streams.json` |
| Vigencia | días desde el último push | `pushed_at` |

## Estructura

```
iptv-4k-source-truth-audit/
  SKILL.md                        # el procedimiento y las tablas de veredicto
  README.md                       # este archivo
  references.md                   # fuentes, trampas de PowerShell, normas
  commands.md                     # comandos permitidos / prohibidos
  checklist.md                    # pre / during / post / rollback
  tests.md                        # casos de verificación
  scripts/probe_repos.ps1         # estrellas + licencia + vigencia (TSV)
  scripts/probe_endpoints.ps1     # status + bytes + #EXTINF (TSV)
```

## Caso de origen

El 2026-11-15 se auditó un catálogo de 11 repos "supremos 4K". Resultado: las
**4 URLs** de endpoint en 404, **4 de 11** repos con estrellas insostenibles, y el
"rey del 4K" con **20** streams 2160p reales. Ver la skill ancla
`iptv-supreme-repos-4k` y su fixture.

## Reglas que no se negocian

1. **`null` ≠ `NOASSERTION` ≠ `MIT`.** Sin licencia no hay permiso; `NOASSERTION`
   obliga a leer el archivo `LICENSE` real (y a veces el archivo dice otra cosa).
2. **404 no es "vacío":** es roto. Se sustituye por la ruta medida o se descarta.
3. **"No medido" no es cero.** Va en `not_measured`, nunca como 0 ni como OK.
4. **La fecha viaja con la cifra.** Sin fecha, es una cita.
