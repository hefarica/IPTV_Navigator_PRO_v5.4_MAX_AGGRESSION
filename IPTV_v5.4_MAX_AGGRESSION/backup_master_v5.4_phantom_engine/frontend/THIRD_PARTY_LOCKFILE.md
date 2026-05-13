# THIRD_PARTY_LOCKFILE (OFFLINE)

Este archivo “congela” las librerías de terceros incluidas en el toolkit para garantizar **comportamiento determinista** y **100% offline**.

## Librerías incluidas (versión local + huella)

| Librería | Archivo local | SHA256 | Rol en el toolkit |
|---|---|---|---|
| SheetJS (XLSX) | `xlsx.full.min.js` | `36a42f409fe9b8b8e4d112f0edc826883e40ed88eae071987a427a0389b06c03` | Exportación/lectura de XLSX |
| QRCodeJS | `qrcode.min.js` | `c541ef06327885a8415bca8df6071e14189b4855336def4f36db54bde8484f36` | Generación de QR |
| Axios | `axios.min.js` | `0779da444699d5f305352f3892fa24efc1418e5f4ade1017b28cdbbfe77ae192` | Requests internos (si aplica) |

## Política de actualización (resumen)

Actualizar **solo** si se cumple al menos una condición:
1. **Bug crítico** que afecte una función usada por el toolkit.
2. **Seguridad** (vulnerabilidad aplicable al uso real del toolkit).
3. **Compatibilidad** (cambio de navegador/API que rompa funcionalidades).
4. **Mejora medible** con pruebas de regresión aprobadas.

### Procedimiento seguro (sin romper nada)
1) Añadir la nueva lib como archivo **nuevo** (no sobreescribir):
- `vendor/<lib>.vX.Y.Z.min.js`

2) Cambiar `index-v4.html` para apuntar al nuevo archivo.

3) Ejecutar regresión mínima:
- Export XLSX
- QR generation
- Generación M3U8 + Telemetría + Inspector + Recomendaciones (smoke test)

4) Si pasa, promover a “default” y mantener la versión anterior 1 release como rollback.

---
Generado: 2025-12-27 15:10:01
