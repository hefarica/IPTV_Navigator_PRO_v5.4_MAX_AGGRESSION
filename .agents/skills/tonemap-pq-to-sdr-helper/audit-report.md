# Audit Report — tonemap-pq-to-sdr-helper

## Metadata
- **Skill:** tonemap-pq-to-sdr-helper
- **Specialist:** Color Scientist HDR (S4)
- **Kind:** satellite
- **Parent anchor:** hdr-color-science-architect
- **Installed:** 2026-05-17T02:53:09Z
- **Spec compliance:** iptv-enterprise-300-skills-v1

## Validaciones de instalación
- [x] SKILL.md presente y con frontmatter válido (name + description).
- [x] README.md presente.
- [x] references.md presente.
- [x] commands.md presente.
- [x] checklist.md presente.
- [x] tests.md presente.
- [x] install.lock.json presente y JSON válido.
- [x] examples/ creado.
- [x] scripts/ creado.
- [x] fixtures/ creado.
- [x] Cero secretos en archivos creados.
- [x] Cero binarios opacos instalados.
- [x] Cero scripts remotos ejecutados sin revisión.

## Doctrina cross-check
- [x] Respeta `iptv-omega-no-delete`.
- [x] Respeta `iptv-lab-ssot-no-clamp`.
- [x] Respeta `iptv-no-hardcode-doctrine`.
- [x] Respeta `iptv-vps-touch-nothing`.
- [x] Respeta legal/ético: NO evasión ilegal, NO bypass DRM, NO robo señal.

## Uso histórico
Sin invocaciones registradas todavía. Cuando esta skill se use en una tarea real, agregar entrada:

```
### YYYY-MM-DDTHH:MM:SSZ
- Triggered by: <task description>
- Files touched: <list>
- Validations run: <list>
- Result: PASS|FAIL
- Notes: <observations>
```

## Drift detection
Si esta skill se modifica después de install, recomputar SHA-256 de cada archivo y comparar con `install.lock.json.integrity_sha256_self`.

## Próximos pasos
- Expandir `fixtures/` con casos reales (anonimizados).
- Expandir `examples/` con código adaptado al repo.
- Implementar tests automatizados en `scripts/test.sh` o `scripts/test.py`.
- Considerar promover satellite → anchor si la skill se usa ≥5 veces en proyectos distintos.
