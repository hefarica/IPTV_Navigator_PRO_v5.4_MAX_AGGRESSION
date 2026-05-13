---
description: Pipeline de Auditoría de Almacenamiento VPS y Reparación del Motor de Subida
---

# Workflow: Auditoría de Almacenamiento VPS y Reparación del Uploader

Sigue estos pasos absolutos cuando el servidor reporte `No space left on device` o cuando el Uploader falle silenciosamente o de forma lenta.

## 1. Auditoría del Disco /var/log (Truncado Vital)
Si `/dev/sda1` está al 100% y las subidas fallan:

1. Ejecuta primero un mapeo rápido por la consola SSH:
   \`\`\`bash
   du -hx --max-depth=1 /var/log | sort -hr | head -n 10
   ls -lahS /var/log/ | head -n 10
   \`\`\`
2. Identifica si `quantum_guardian.log` o `syslog` están descontrolados. Estos archivos tragan Gigabytes ignorando políticas de rotación de logs (logrotate).
3. Nunca ejecutes `rm` sobre un archivo activo (como el guardian log) porque el descriptor de archivo quedará huérfano y retendrá el espacio en disco. En su lugar, trunca los archivos:
   // turbo
   \`\`\`bash
   > /var/log/quantum_guardian.log && > /var/log/syslog.1 && rm -f /var/log/*.gz
   \`\`\`

## 2. Ajuste Extremo de Upload y Concurrencia
Si la subida a Nginx/Rust es estúpidamente lenta, o lanza error silencioso `Upload did not complete successfully: true`:

1. Accede a `frontend/js/resumable-uploader-v2.js`.
2. Escala drásticamente \`chunkSize\` y \`concurrency\` en el \`constructor\`:
   \`\`\`javascript
   chunkSize: options.chunkSize || 50 * 1024 * 1024, // 50MB
   concurrency: options.concurrency || 6,
   \`\`\`
3. Asegura que el pase de batón (el resultado del objeto JSON) al final del ciclo no se trunca devolviendo un booleano (`return true`). Asegúrate de que `upload()` y `_processUpload()` finalicen con `return result;` para que `gateway-manager.js` pueda interpretar correctamente el `result.success`.

## 3. Disconnect Physical Lists
Si se requiere operar en aislamiento (excluyendo la lógica del Backend en pruebas destructivas para testear la estabilidad bruta del reproductor):

1. Escapa a `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`.
2. Busca la línea `finalUrl = resolverUrl`.
3. Anúlala explícitamente forzando a `finalUrl = primaryUrl`. Esto inyectará Credenciales Explicitas en el Manifiesto. ¡USAR SOLO PARA PRUEBAS!
