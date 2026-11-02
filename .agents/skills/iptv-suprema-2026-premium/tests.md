# Tests — IPTV PREMIUM

## Validación obligatoria

```bash
python .agents/skills/iptv-suprema-2026-premium/scripts/validate_suprema_profile.py profiles/IPTV_PREMIUM.json
python -m json.tool profiles/IPTV_PREMIUM.json >/dev/null
python -m json.tool .agents/skills/iptv-suprema-2026-premium/fixtures/min_profile.json >/dev/null
```

## Casos

1. `based_on` debe ser `creador_habilidades`.
2. `inherits` debe incluir `creador_habilidades`.
3. `id` debe ser `IPTV_PREMIUM`.
4. Cada entrada de `maturity` debe tener `score` 0–100 y `evidence`.
5. `commands` no puede estar vacío.
6. El perfil no debe contener credenciales.
7. El reporte debe separar `declared/observed/resolved/applied/verified`.
8. El reporte debe declarar límites de bitstream/salud.

## Evidencia live

```text
10.573 canales
10.573 URLs únicas
10.315.662 líneas
muestra HTTP 50: 46×200, 4×407
```

No se declara salud completa.

## Resultado esperado

```text
ok: true
errors: []
```



