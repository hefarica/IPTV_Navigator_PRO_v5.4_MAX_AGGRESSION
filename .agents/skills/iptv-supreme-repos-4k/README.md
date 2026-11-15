# iptv-supreme-repos-4k

Skill ancla del catálogo **medido** de repositorios supremos IPTV 4K.

## Qué contiene

- Los **11 repos** del catálogo del owner, íntegros: features declaradas, comandos
  de clonado, endpoints y veredicto.
- La **segunda columna medida** el `2026-11-15T06:45Z`: estrellas, forks, lenguaje,
  licencia SPDX, último push.
- Los **9 endpoints** que responden y los **4 declarados que están en 404**, con su
  detalle (`#EXTINF`, tamaño).
- La **distribución real de calidad** de `iptv-org` (20 streams 2160p de 18.689).
- El **stack revisado** y el **esquema JSON declarado** (marcado como declarado).

## Estructura

```
iptv-supreme-repos-4k/
  SKILL.md              # catálogo completo (declarado vs medido)
  README.md             # este archivo
  references.md         # fuentes externas y su estado
  commands.md           # comandos permitidos / prohibidos
  checklist.md          # pre / during / post / rollback
  tests.md              # casos de prueba de las afirmaciones
  install.lock.json     # pin de versión + timestamp
  audit-report.md       # log de uso + drift detectado
  fixtures/
    measured_2026-11-15.json   # evidencia cruda de la medición
```

## Regla de oro

**Declarado ≠ medido.** Toda cifra de este catálogo viaja con fecha y fuente, o
viaja marcada como declarada. Una skill que repite "1.5K+ estrellas" sin medir
propaga un error de 37×.

## Cuándo se dispara

- "¿Qué repos IPTV 4K hay?", "¿qué agregador uso?", "¿de dónde saco 4K real?"
- "¿cuántas estrellas tiene X?" (respuesta: las medidas, con fecha)
- Antes de copiar `categories/4k.m3u` o cualquier URL del catálogo.
- Antes de recomendar `Dispatcharr`, `tuliprox`, `iptv-org` o `iptv-checker`.
