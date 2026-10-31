# ARA-X · paquete de entrega (X2)

Paquete **verificable** de la capa ARA-X generada en la campaña 2026-10-25→30. Contiene el árbol
`ara-x/` (specs, implementaciones, tests, scripts, auditorías R1–R6, ADC/decision, contratos D1–D5,
listas A/B *por hash*, V1-R/V2/V3-R2, integración X1 staged) **excepto**:

| Excluido | Motivo |
|---|---|
| `ara-x/evidence/**` (10 archivos, 4.715.998.572 B) | Capturas de proveedor con el **par cuenta/clave en el path** (V3-F-01) y salidas de 572/568 MB. **No se empaqueta ni se commitea**: solo se incluye `EVIDENCE_MANIFEST.json` con size+sha256 por archivo y comandos para verificarlas/regenerarlas. |
| `ara-x/deliverables/**` | Es este directorio (ZIP, manifiestos, reporte). Evita recursión. |
| `ara-x/reports/X2_final_report.md` | Cita el `sha256` del propio ZIP (auto-referencia); se entrega al lado del paquete en `ara-x/reports/`. |

## Verificar el paquete

```powershell
# 1) Expandir
Expand-Archive -Path ARA_X_DELIVERY_<stamp>.zip -DestinationPath .\extract -Force
# 2) Verificar sha256+tamaño de cada archivo del manifiesto
node .\extract\ara-x\VERIFY_PACKAGE.js `
  --manifest .\extract\ara-x\MANIFEST_SHA256.txt `
  --root .\extract
# 3) (opcional Linux/macOS) node ./extract/ara-x/VERIFY_PACKAGE.js --manifest ... --root ./extract
```

El manifiesto **no se lista a sí mismo**; `VERIFY_PACKAGE.js` lo sabe y valida el resto (y avisa de
archivos extra). El `sha256` del ZIP está en `MANIFEST.json` (al lado del ZIP, fuera del paquete).

## Estado (resumen)

- **Paquete:** PASS (ZIP probado con `Expand-Archive` + manifiesto íntegro + `VERIFY_PACKAGE` OK).
- **Repo/staged ARA-X:** PASS (V1-R 18/0/5 + auditorías 16/16 · V2 2/2 · V3-R2 reparables PASS).
- **Deploy de producción: NO-GO** por F-01/F-05/F-09 (owner/VPS). `ara-x/vps/**` está **staged**, no desplegado.
- **8K real en S905X4:** físicamente imposible (decode máx. 4K; 8K solo presentación, sin transcode VPS).
- **NOT_RUN:** `php -l`, `luac -p`, `nginx -t` (herramientas ausentes), deploy VPS, build Android, tests frontend, re-verificación LAB/Excel.

## Rollback

- No se hizo commit/push/deploy en X2. Rollback del paquete = borrar ZIP+manifiestos de `ara-x/deliverables/`.
- El parche X1 **no está aplicado**; si se aplicara: `git apply -R ara-x/integration/ara-x-hook.patch`.
- VPS: nada desplegado; si en el futuro se despliega con `_vps_stage/deploy`, usar `rollback.sh <stamp> --yes` y el backup `/var/backups/ape-deploy/<stamp>/`.

Lee `ara-x/reports/X2_final_report.md` (reporte final) y `ara-x/reports/DEPLOY_PENDING_SINCE_25OCT.md`
(preflight de commit/deploy) para el detalle.
