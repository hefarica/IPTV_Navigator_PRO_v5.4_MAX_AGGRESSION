---
name: "Despliegue Atómico de Ecosistema IPTV (Zip Payload)"
description: "Doctrina para transformar la subida de archivos sueltos (.m3u8, channels_map.json) en un Despliegue Atómico usando compresión ZIP. Elimina fallos parciales, reduce el ancho de banda y garantiza consistencia."
---

# 🚀 Despliegue Atómico de Ecosistema IPTV (Zip Payload)

**Versión:** 1.0
**Módulos Afectados:** `export-module.js`, `gateway-manager.js`, `upload.php`, `finalize_upload.php`

## 1️⃣ Principio de Atomicidad

En sistemas distribuidos, enviar múltiples archivos críticos (como el manifiesto `.m3u8` y su mapa de ADN `channels_map.json`) mediante peticiones separadas introduce el riesgo de **Fallo Parcial** (Inconsistencia de Estado).

Si el manifiesto se sube con éxito pero el mapa falla, el sistema en el VPS no sabrá cómo resolver los canales.

El **Despliegue Atómico** resuelve esto:

* Empaqueta todos los archivos necesarios en un único `.zip`.
* Realiza una sola transferencia al servidor.
* El servidor extrae los archivos simultáneamente.
* O se actualiza todo, o no se actualiza nada.

## 2️⃣ Implementación GZIP/ZIP en Frontend

* **UI Trigger:** El toggle `📦 GZIP Compression` en la UI debe controlar este flujo.
* Cuando está habilitado, el proceso de exportación (ej. `generateAndDownload`) no solo debe generar los blobs individuales, sino empaquetarlos en un archivo `payload_APE_ULTIMATE_*.zip`.
* Utilidad: Se recomienda `JSZip` para empaquetado en memoria sin necesidad de servidor, o `CompressionStream` si se busca GZIP puro, aunque JSZip permite múltiples archivos, lo que es vital para Atomicidad.

## 3️⃣ Arquitectura del Backend (VPS)

Los scripts PHP de recepción (`upload.php`, `finalize_upload.php` o scripts análogos) deben ser modificados para:

1. **Detectar MIMEType o Extensión:** Identificar si el archivo recibido es `.zip`.
2. **Extracción In-Situ:** En lugar de dejar el `.zip` en `/lists/`, el servidor debe extraer su contenido (el `.m3u8` y el `.json`) directamente en el directorio final.
3. **Limpieza:** Borrar el `.zip` original de inmediato.
4. **Respuesta:** Devolver la URL del manifiesto `.m3u8` principal para que el frontend pueda reportar el éxito y entregarle el link al usuario.

## 4️⃣ Ventajas del Modelo

* **Ahorro Masivo de Ancho de Banda:** Las listas M3U8 y los JSON de gran tamaño (e.g. 100MB) se comprimen hasta en un 85%.
* **Velocidad:** Transmitir 15MB toma fracciones del tiempo que tomarían 100MB.
* **A prueba de Disrupciones:** Si la red se corta a mitad de subida, la transferencia falla, y el servidor mantiene intacta la versión anterior (Zero Downtime).
* **Escalabilidad:** Si en el futuro es necesario añadir archivos de Piconos, Overrides de Perfil, o Reglas de Firewall per-lista, solo se agregan al ZIP sin alterar la API de subida.
