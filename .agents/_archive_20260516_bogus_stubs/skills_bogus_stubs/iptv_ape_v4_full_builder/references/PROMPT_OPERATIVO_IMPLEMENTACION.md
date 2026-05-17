# PROMPT OPERATIVO: IMPLEMENTACIÓN DE 0 A 100%
## ACTUALIZACIÓN DE CUALQUIER GENERADOR AL ESTÁNDAR OMEGA

Este prompt contiene las instrucciones operativas paso a paso que el agente implementador (ya inicializado con el Prompt de Skills PhD) debe seguir para tomar cualquier generador M3U8 existente y elevarlo al Estado del Arte OMEGA.

---

### COPIAR Y PEGAR EL SIGUIENTE BLOQUE AL AGENTE IMPLEMENTADOR:

```markdown
Como **Arquitecto Supremo OMEGA**, tu misión inmediata es tomar el código fuente del generador M3U8 actual del sistema y actualizarlo al 100% para que cumpla con el estándar OMEGA ABSOLUTO. 

Debes ejecutar la implementación de 0 a 100% siguiendo estrictamente esta hoja de ruta. No puedes omitir ningún paso ni optimizar líneas si eso compromete la arquitectura.

### FASE 1: INYECCIÓN DE LA CABECERA GLOBAL
Modifica la función de generación de cabecera del script actual para que emita exactamente estas líneas al inicio del archivo M3U8. Debes generar un hash MD5 único por cada ejecución para garantizar el polimorfismo.

1. `#EXTM3U`
2. `#EXTM3U-VERSION:7`
3. `#EXT-X-APE-GENERATOR-VERSION: 1.0.0-OMEGA`
4. `#EXT-X-APE-GENERATOR-UNIQUENESS: [HASH_MD5_DINAMICO]`
5. `#EXT-X-APE-GENERATOR-TIMESTAMP: [ISO_8601_TIMESTAMP]`

### FASE 2: CLASIFICACIÓN DE CONTENIDO Y PERFILES
Implementa una función de clasificación neuronal (o basada en heurísticas fuertes) que analice el `tvg-name` y `group-title` de cada canal para asignarle uno de los 5 perfiles maestros:
- `P0_ULTRA_SPORTS_8K` (Para deportes: 120fps, buffer 60s, bw 80Mbps)
- `P1_CINEMA_8K_HDR` (Para cine: 60fps, buffer 60s, bw 80Mbps)
- `P2_NEWS_4K_HDR` (Para noticias: 60fps, buffer 30s, bw 40Mbps)
- `P3_KIDS_4K_HDR` (Para infantil: 60fps, buffer 30s, bw 40Mbps)
- `P4_DOCU_8K_HDR` (Para documentales: 60fps, buffer 60s, bw 80Mbps)

### FASE 3: CONSTRUCCIÓN DEL PAYLOAD JSON (EL OMNI-ORCHESTRATOR)
Esta es la fase crítica. Por cada canal, en lugar de inyectar cientos de directivas en el archivo de texto, debes construir un objeto JSON y empaquetarlo en la directiva `#EXTHTTP`.

El JSON debe contener estrictamente la siguiente estructura:
```json
{
  "paradigm": "OMNI-ORCHESTRATOR-V5-OMEGA",
  "version": "1.0.0-OMEGA",
  "profile": "[PERFIL_ASIGNADO_EN_FASE_2]",
  "ct": "[TIPO_DE_CONTENIDO]",
  "auth": "[TOKEN_DE_AUTENTICACION_SI_EXISTE]",
  "sid": "[SESSION_ID_UNICO_E_IDEMPOTENTE]",
  "referer": "[URL_ORIGINAL_DEL_CANAL]",
  "uniqueness_hash": "[HASH_MD5_GLOBAL_DE_LA_LISTA]",
  "uniqueness_nonce": "[NONCE_ALEATORIO_POR_CANAL]"
}
```

### FASE 4: INYECCIÓN DEL BLOQUE DE CANAL
Modifica el loop principal del generador para que el bloque de cada canal quede exactamente así (5 líneas máximo):

```text
#EXTINF:-1 tvg-id="[ID]" tvg-name="[NAME]" tvg-logo="[LOGO]" group-title="[GROUP]",[NAME]
#EXTHTTP:{"paradigm":"OMNI-ORCHESTRATOR-V5-OMEGA","version":"1.0.0-OMEGA","profile":"P0_ULTRA_SPORTS_8K","ct":"sports","auth":"Bearer xyz","sid":"abc123","referer":"https://...","uniqueness_hash":"e94e1a4c","uniqueness_nonce":"f8a2b1"}
[URL_DEL_PROXY_RESOLVE_QUALITY_OMEGA]?url=[URL_ORIGINAL_URLENCODED]
```

### FASE 5: AUDITORÍA DE IDEMPOTENCIA
Verifica que tu implementación cumpla con la regla de Idempotencia:
- Si ejecutas el generador 10 veces, el `uniqueness_hash` y el `uniqueness_nonce` cambiarán las 10 veces (1% uniqueness).
- Sin embargo, el `sid` (Session ID) debe calcularse usando un hash combinado del `tvg-id` y una semilla estática, para que el proxy reconozca que es el mismo canal y aplique las mismas reglas de orquestación, garantizando el mismo resultado visual perfecto.

### CRITERIO DE ÉXITO
Al finalizar la implementación, ejecuta el generador contra la base de datos de canales. Si una lista de 5,000 canales pesa más de 20 MB, has fallado en la compresión del Payload JSON. Si pesa menos de 20 MB y contiene la directiva `#EXTHTTP` perfectamente formateada, has logrado el Estado del Arte OMEGA.
```
