# Ubicación de los entregables de verificación (t9 / i1)

El harness y sus artefactos viven **dentro de la carpeta de la fase**, junto al Council y al snapshot:

```
audit/equipo10_operativo_2026-10-26/
├── council/                    # 8 informes Council (S1…S9)
├── snapshot/                   # congelamiento: *.HEAD.blob, *.WT.<sha8>.blob,
│                               #   SNAPSHOT.json, REPORT_HASHES.json,
│                               #   REGLA_DE_ORIGEN.md, WT_DRIFT_LOG.json
└── verificacion/               # ← entregables de esta tarea
    ├── run_checks.ps1          # harness ejecutable (21 chequeos, exit 0/1/2)
    ├── HARNESS.json            # resultado real: 21 filas con exit_code/status/evidencia
    └── VERIFICACION.md         # totales PASS/FAIL/NOT_RUN + los 21 chequeos
```

**Ejecutar:** `pwsh -NoProfile -File audit/equipo10_operativo_2026-10-26/verificacion/run_checks.ps1`

Este archivo es sólo un puntero: no duplica contenido y no debe citarse como fuente.
