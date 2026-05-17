---
name: Skill VPS Storage Audit and Upload Optimizations
description: Doctrina absoluta para auditar y prevenir la saturación del disco del VPS por logs masivos y optimizar la velocidad del ResumableChunkUploader.
---

# Skill_VPS_Storage_Audit_and_Upload_Optimizations

## 1. Contexto Clínico (El Incidente de los 30GB Ocultos)
Durante el ciclo operativo, el VPS reportaba disco lleno (`No space left on device` - 36G / 100%).
Al auditar los directorios raíz, se descubrió que el espacio no estaba en las listas M3U8, sino en:
- `/var/log/quantum_guardian.log` -> **7.2 GB**
- `/var/log/syslog` y `.gz` temporales -> **~1.5 GB**
- `/var/lib/containerd` -> **9.5 GB**

### Regla 1: Destrucción de Logs Parásitos
Si el disco se llena misteriosamente sin que hayan subido listas de tamaño equivalente, LA PRIMERA OBLIGACIÓN es auditar `/var/log`.
Comando forense esencial:
\`\`\`bash
du -hx --max-depth=2 /var | sort -hr | head -n 10
ls -lahS /var/log/ | head -n 10
\`\`\`
Truncado inmediato seguro sin matar los procesos:
\`\`\`bash
> /var/log/quantum_guardian.log && > /var/log/syslog.1 && rm -f /var/log/*.gz && > /var/log/btmp.1
\`\`\`

## 2. Optimización de Subida (Velocidad y Silencio Mortal)
El usuario reportó que la subida "fallaba sin decir nada" y era demasiado lenta.

### Diagnóstico Forense:
1. **Lentitud:** El tamaño del chunk en `ResumableChunkUploader` (`resumable-uploader-v2.js`) estaba muy conservador (10MB, 3 concurrencia). Esto provocaba congestión de red (demasiados handshakes HTTP) para archivos grandes.
2. **Silencio Mortal (Fallo Silencioso):** El método `_processUpload` **olvidaba retornar el `result`** hacia la función contenedora `upload()`. Así que `upload()` retornaba simplemente `true` en lugar del objeto estructurado. Al recibir `true`, el `gateway-manager.js` comprobaba `result.success` (el cual evaluaba a `undefined`) y lanzaba erróneamente un Error `Upload did not complete successfully: true`.

### Regla 2: Parámetros Extremos de Chunking
En `resumable-uploader-v2.js`, la configuración base **debe ser agresiva** para subir sin tregua:
- \`chunkSize\`: **50 * 1024 * 1024** (50MB por payload). Disminuye dramáticamente los tiempos perdidos en el overhead del network.
- \`concurrency\`: **6**. Fuerza al browser a mantener 6 pipelines TCP saturando el ancho de banda sin mercy.

### Regla 3: Handshake de Finalización Restablecido
El ciclo del uploader debe devolver siempre el payload final:
\`\`\`javascript
// En _processUpload()
return result;

// En upload()
const result = await this._processUpload(file, sessionId);
return result;
\`\`\`
Esto arregla permanentemente el bug "fallo silencioso", permitiendo a la UI interpretar cuando un bloque falla realmente versus un éxito interpretado como fallo.

## 3. Disconexión Categórica del Resolver 
Por directriz operativa de pruebas crudas, la inyección del proxy en las URLs generadas fue deshabilitada cambiando la opción B por la opción A en `m3u8-typed-arrays-ultimate.js`:
\`\`\`javascript
// 🎯 OPTION A: DIRECT PHYSICAL URL
finalUrl = primaryUrl; 
\`\`\`
Esto bypassa el `resolve_quality` para poder auditar el comportamiento de VLC y OTT Nav con listas "físicas y desnudas".
