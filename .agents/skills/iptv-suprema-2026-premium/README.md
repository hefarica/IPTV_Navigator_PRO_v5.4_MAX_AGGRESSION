# IPTV SUPREMA 2026 PREMIUM — Skill

Skill de arquitectura y auditoría IPTV APE REA. Carga el perfil `IPTV_PREMIUM` y extiende `creador_habilidades`.

## Archivos

```text
SKILL.md              conocimiento operativo (14 secciones)
SUPREME_2026.md       doctrina suprema, 10 leyes y matriz 0-100
README.md             este archivo
references.md         corpus y hashes
commands.md           comandos
checklist.md          pre/post
tests.md              validaciones
install.lock.json     pin de instalación
audit-report.md       estado de creación
scripts/validate_suprema_profile.py
examples/IPTV_PREMIUM.example.json
fixtures/min_profile.json
```

## Uso

```text
/suprema-2026 profile IPTV_PREMIUM
/suprema-2026 channel 159 <list.m3u8>
```

## Principio

Cuatro ámbitos separados: fuente, clasificación APE, reconstrucción/presentación y variante de manifiesto. Los estados son `declared / observed / resolved / applied / verified`.

No se declara calidad real sin bitstream verificado.


