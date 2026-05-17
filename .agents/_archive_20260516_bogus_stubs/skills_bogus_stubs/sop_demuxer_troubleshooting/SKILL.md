# Procedimiento Operativo Estándar (SOP): Resolución de Error "Failed to create demuxer" en VLC

**Versión:** 1.0  
**Fecha:** Abril 2026  
**Sistema:** Ecosistema OMEGA ABSOLUTE  

---

## 1. Propósito y Alcance

Este documento detalla el procedimiento técnico para diagnosticar y resolver el error de reproducción `adaptive error: Failed to create demuxer 0000000000000000 Unknown` en VLC Media Player, específicamente dentro del contexto de la arquitectura OMEGA ABSOLUTE (Proxy Inverso 200 OK).

El error indica que la resolución DNS fue exitosa y la conexión HTTP se estableció, pero el payload devuelto por el servidor no pudo ser parseado como un flujo multimedia válido (HLS/MPEG-TS).

---

## 2. Prerrequisitos

- Acceso a la terminal local (Windows CMD/PowerShell o Linux/macOS bash).
- Herramienta `curl` instalada.
- Lista M3U8 generada por el ecosistema OMEGA.
- Acceso SSH al VPS (opcional, para verificación profunda).

---

## 3. Diagnóstico de Causa Raíz

El error de demuxer en la arquitectura SSOT 200 OK es un síntoma de un problema subyacente en el backend PHP. Ocurre cuando el servidor devuelve texto plano, HTML o JSON en lugar del manifest M3U8 esperado por el reproductor.

### 3.1. Identificación del Payload Devuelto

Para identificar qué está recibiendo exactamente VLC, ejecuta el siguiente comando en la terminal local, reemplazando la URL con la de un canal que falla:

```bash
curl -v "https://tu-dominio.duckdns.org/resolve_quality_unified.php?mode=200ok&ch=1&profile=DEFAULT"
```

Analiza la respuesta obtenida:

| Respuesta Obtenida | Causa Raíz | Acción Requerida |
|--------------------|------------|------------------|
| `HTTP 404 Not Found` (HTML) | La URL apunta a un archivo inexistente (ej. `rq_polymorphic_resolver.php`). | Actualizar la lista M3U8 al SSOT actual. |
| `ADN DE CANAL CORRUPTO` | El canal no existe en el registro del backend (`channels.json`). | Registrar el canal en el VPS. |
| `Warning:` o `Fatal error:` (PHP) | Error de sintaxis o ejecución en el script PHP. | Revisar los logs de PHP en el VPS. |
| `{"error": "Rate limit exceeded"}` | Bloqueo por exceso de peticiones desde la misma IP. | Esperar o ajustar `RATE_LIMIT` en PHP. |

---

## 4. Procedimiento de Resolución (Árbol de Decisión)

Sigue estos pasos en orden secuencial hasta que el stream reproduzca correctamente.

### Fase 1: Verificación de URL Obsoleta

Si la lista M3U8 fue generada antes de la consolidación SSOT, es probable que las URLs apunten a un archivo purgado.

1. Abre la lista M3U8 en un editor de texto.
2. Busca la cadena `rq_polymorphic_resolver.php`.
3. Si existe, reemplaza todas las ocurrencias por `resolve_quality_unified.php`.

**Comando rápido de parcheo (PowerShell):**
```powershell
(Get-Content "lista.m3u8") -replace "rq_polymorphic_resolver.php","resolve_quality_unified.php" | Set-Content "lista_corregida.m3u8"
```

### Fase 2: Verificación de ADN de Canal

Si la URL es correcta, el problema puede ser que el backend no reconozca el ID del canal.

1. Ejecuta el comando `curl` detallado en la sección 3.1.
2. Si la respuesta contiene `ADN DE CANAL CORRUPTO`:
   - Conéctate al VPS vía SSH.
   - Verifica el archivo de mapeo de canales (ej. `channels.json` o base de datos).
   - Asegúrate de que el ID del canal (parámetro `ch=`) esté mapeado a una URL de origen válida.

### Fase 3: Verificación de Estado del Backend (Health Check)

Si el canal existe, verifica la salud general del subsistema PHP.

1. Ejecuta el endpoint de diagnóstico:
   ```bash
   curl "https://tu-dominio.duckdns.org/resolve_quality_unified.php?mode=health"
   ```
2. La respuesta esperada es un JSON válido con `"status": "ok"`.
3. Si la respuesta es un error PHP o HTML corrupto, revisa los logs del servidor web en el VPS:
   ```bash
   sudo tail -n 50 /var/log/nginx/error.log
   # o para Apache:
   sudo tail -n 50 /var/log/apache2/error.log
   ```

### Fase 4: Verificación de Conectividad del VPS al Origen

Si el backend está sano y el canal existe, el VPS podría no tener conectividad con el proveedor IPTV original.

1. Conéctate al VPS vía SSH.
2. Intenta descargar el manifest de origen manualmente usando `curl` desde el VPS.
3. Si el VPS no puede alcanzar el origen (timeout, bloqueo de IP), el proxy inverso fallará y devolverá un error al reproductor.

---

## 5. Checklist de Validación (QA)

Antes de dar por resuelto el incidente, verifica los siguientes puntos:

- [ ] La URL en la lista M3U8 apunta a `resolve_quality_unified.php`.
- [ ] El endpoint `?mode=health` devuelve JSON válido.
- [ ] La petición directa con `curl` devuelve un manifest M3U8 válido (comienza con `#EXTM3U`), no texto plano ni HTML.
- [ ] VLC reproduce el canal sin mostrar errores en la ventana de mensajes (Ctrl+M).

---

## 6. Referencias

1. Arquitectura OMEGA ABSOLUTE SSOT (v5.0+).
2. Documentación de Hardening del Ecosistema IPTV.
