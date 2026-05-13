---
description: "Workflow M3U8: Upload Resiliente, Gzip Seguro y Eliminación de Dobles Guiones Bajos (__1_)"
---

# 🚀 Workflow: Upload Resilience & Sanitization Pipeline

**Skill requerida:** `Skill_Upload_Resilience_Gate_v2`
**Ubicación de los cambios:** `upload.php`, `finalize_upload.php`, `frontend/js/gateway-manager.js`

Este flujo de trabajo estandariza CÓMO se deben subir, sanitizar y archivar las listas M3U8 para prevenir fallos catastróficos en el backend ("No space left on device") y asegurar nombres de URL prístinos para el cliente final IPTV.

---

## FASE 1: Sanitización de Archivos Pre-Upload (Zero Double-Underscore)

1. Cuando subas un archivo como `M3U8_ULTIMATE (3).m3u8`, asegúrate de que el código **elimine silenciosamente los paréntesis** antes de reemplazar los espacios.
2. Confirmar que la cadena final NO contenga `__` (guiones bajos continuos).
   - Resultado esperado: `M3U8_ULTIMATE_3.m3u8`
3. Esto permite URLs hermosas y compatibles: `https://iptv-ape.duckdns.org/lists/M3U8_ULTIMATE_3.m3u8`

## FASE 2: Subida y Comprensión GZIP por Sistema Operativo

1. El servidor recibe los Chunks o el File raw en `/var/www/lists/`.
2. Se ensamblan los pedazos en su tamaño gigante (ej. 320 MB).
3. Se invoca `gzip -9 -k -f <filename>`
   * 🛑 **PUNTO DE AUDITORÍA CRÍTICA:** `gzip` creará una copia pesada de al menos el ~35-40% del tamaño original. El servidor DEBE tener espacio libre.

## FASE 3: Intervención SRE Ante Falta de Almacenamiento (No space left on device)

**Síntoma:** Error 500 en logs, interfaz JS congelada, o el archivo final queda atascado pesando 320 MB crudos sin la extensión `.gz`.

1. Acceder al nodo principal SRE:
   ```bash
   ssh root@178.156.147.234
   ```
2. Auditar la partición madre `/dev/sda1`:
   ```bash
   df -h
   ```
   *Si `Use%` está en `98% - 100%`, proceder a purga.*
3. Detectar basureros y archivos crudos que no lograron cruzar a Gzip:
   ```bash
   ls -laSh /var/www/lists/ | head -n 15
   ```
4. **Ejecución Purga Nuclear:** Eliminar compilados fallidos masivos y backups de zips antiguos de semanas pasadas:
   ```bash
   rm /var/www/lists/*.zip
   ```

## FASE 4: Confirmación del Placeholder Trick

Una vez el script `upload.php` finaliza la compresión exitosa, DEBE auto-aplicar el sacrificio del Payload en RAM y disco:

1. El archivo nativo `XXX_1.m3u8` recibe **Content-Replace** total:
   ```php
   file_put_contents($outputPath, "#EXTM3U\n");
   ```
2. Confirmación final de éxito:
   ```bash
   ssh root@178.156.147.234 "ls -lh /var/www/lists/XXX*"
   ```
   - *M3U8 Base:* **8 Bytes** exactos.
   - *M3U8.GZ (Compañero):* **Decenas de MegaBytes** (Payload Absoluto).

Con esto, Nginx orquestará `gzip_static;` para evocar Zero-Latency, Zero-RAM Delivery para las apps cliente.
