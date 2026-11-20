---
name: ape-iptv-auditoria-4k-premium6k
description: "Auditar listas IPTV M3U/M3U8 grandes y metadata APE, extender REA con solicitudes 4K y Premium 6K simulada por perfil, conservar URLs/IDs/campos y validar idempotencia y escalado offline. Usar para auditar, corregir o enriquecer listas IPTV, revisar cartuchos URL u/d, HEVC, perfiles visuales, zapping y contradicciones entre calidad declarada y video real. No presentar metadata como transcodificación ni como un daemon instalado."
---

# Auditoría APE IPTV: 4K y Premium 6K simulada

Reutilizar los recursos probados sin duplicar motores. Separar fuente verificada, procesamiento solicitado y salida ejecutada. No prometer resolución, HDR, calidad subjetiva o latencia sin evidencia.

## Recursos

Identificar `<skill-dir>` como el directorio real que contiene este archivo. Leer `references/contrato_y_limites.md` para REA, HLS, cartuchos URL, HDR o integración player/VPS.

Usar `scripts/ejecutar_seguro.py` como entrada. Usar `auditar_y_ampliar.py` como biblioteca, sin eludir las protecciones. Mantener juntos los scripts porque importan módulos vecinos. Usar `verificar_lista.py` para verificar todos los bloques y `validar_escalado.py` para geometría/HEVC offline. Ejecutar las suites `test_*.py` al cambiar recursos.

Limitar el parche automático a catálogos IPTV con fuentes no verificadas. Para master/media HLS genuinos, usar un auditor HLS adecuado sin renombrar etiquetas estándar. Para fuentes verificadas o contratos ajenos, auditar primero y adaptar sin degradar la verdad de fuente; no aplicar a ciegas el parche de exportación desconocida.

## 1. Inspeccionar y preservar

Identificar archivo recibido, tamaño, codificación, finales de línea y herramientas multimedia. Crear una carpeta de salida nueva, distinta del original y de la habilidad. No asociar el proceso a nombres fijos de listas ni incluir listas privadas, tokens o evidencias del usuario en esta habilidad.

Comprobar componentes existentes antes de crear otros. Consultar Gemini con resumen sanitizado antes de crear/modificar componentes cuando corresponda a la preferencia del usuario; seguir la habilidad de modelos disponible. No enviar accesos del proveedor ni tratar su respuesta como inspección de un VPS inaccesible.

Leer archivos grandes por streaming/bloques. No volcar millones de líneas al contexto ni ejecutar payloads decodificados. Clasificar catálogo IPTV, híbrido IPTV con declaraciones HLS, master HLS o media HLS; no decidir solo por `.m3u8`.

## 2. Auditar el catálogo completo

Ejecutar en destinos que no existan:

```bash
python3 "<skill-dir>/scripts/ejecutar_seguro.py" "/ruta/lista.m3u8" \
  --audit-json "/ruta/salida-nueva/auditoria_original.json" \
  --inventory-jsonl "/ruta/salida-nueva/inventario_original.jsonl"
```

Comparar canales/URIs, IDs presentes, perfiles asignados/declarados, REA incompleto, solicitudes Premium, flags de resolución/codec/HDR, opciones duplicadas, cachés y perfiles QoE. No equiparar automáticamente perfil visual con perfil de red.

Inspeccionar muestras de `u`, `d`, `idata`, `isession` u otros payloads y contar su estructura sobre la lista. Distinguir descriptor de dispositivo, URL origen y metadata de procesamiento. `urls_with_full_metadata` es una heurística por nombre de parámetro, no prueba de que el contenido lleve todas las capas.

Cuando esté autorizado y resulte útil, probar pocos endpoints con límites de tiempo/descarga. Evitar sesiones concurrentes masivas del proveedor y redirecciones con secretos a dominios no verificados. Informar el tamaño de muestra y estado HTTP sin extrapolarlo a todos los canales. No emitir eventos POST/PUT durante la auditoría estructural.

## 3. Ampliar metadata sin inventar video

Comprobar compatibilidad del consumidor. Para una exportación APE con fuentes desconocidas, ejecutar en otra carpeta nueva:

```bash
python3 "<skill-dir>/scripts/ejecutar_seguro.py" "/ruta/lista.m3u8" \
  --output "/ruta/parche-nuevo/lista_4k_premium6k.m3u8" \
  --audit-json "/ruta/parche-nuevo/auditoria.json" \
  --inventory-jsonl "/ruta/parche-nuevo/inventario.jsonl" \
  --policy-json "/ruta/parche-nuevo/visual_profiles.overlay.json"
```

Extender REA existente conservando campos desconocidos. Solicitar `standard_4k` de 3840×2160 y `premium_6k_simulated` de 5760×3240, explicitando esa convención. Mantener `executed=false` y fuente/verificación pendientes hasta tener pruebas reales.

Ofrecer ambas variantes para P0–P5 y P0.5–P5.5, heredando ajustes existentes. No reasignar ni duplicar canales para aparentar que todos los perfiles están presentes. Extender por herencia los perfiles adicionales encontrados, sin eliminarlos ni inventar tuning.

Incluir `floor_lock`, `virtual_4k`, `hdr_intent` y `APE_VISUAL_FIRST=0`, activable con `1` para ajuste experimental compatible. Conservar fuentes superiores; no bajar 8K por una etiqueta 4K. Priorizar HEVC entre variantes verificadas compatibles, a la mayor calidad disponible; no afirmar ausencia de compresión.

No falsear dispositivos 6K ni renombrar SDR como PQ/Dolby Vision. Preservar HDR verificado y dejar conversiones experimentales desactivadas por defecto.

Conservar URLs, IDs, orden y demás capas. Archivar valores modificados en `APE-AUDIT-ORIGINAL`. En el híbrido IPTV que lo requiera, conservar declaraciones HLS no verificadas y cadenas FFmpeg mal colocadas bajo metadata propia. Advertir que consumidores dependientes de los nombres anteriores deben adaptar su lectura. No hacer ese traslado en un HLS genuino.

Entregar `visual_profiles.overlay.json` como extensión, no sustitución de `visual_profiles.json`. No afirmar que escribirlo haya integrado sus campos en Rust, Lua, PHP, player o VPS.

## 4. Validar y guardar evidencia

```bash
python3 -m unittest discover -s "<skill-dir>/scripts" -p 'test_*.py' -v

python3 "<skill-dir>/scripts/verificar_lista.py" "/ruta/parche-nuevo/lista_4k_premium6k.m3u8" \
  --audit-json "/ruta/parche-nuevo/auditoria.json" \
  --output-json "/ruta/parche-nuevo/validacion_lista.json"

python3 "<skill-dir>/scripts/validar_escalado.py" \
  --output-json "/ruta/parche-nuevo/validacion_multimedia.json"
```

Comprobar número/secuencia de URLs, perfiles e IDs y no forjar flags verificados. Verificar idempotencia de todos los bloques y recuperación del texto original por SHA-256, incluyendo LF/CRLF.

Separar pruebas unitarias, geometría offline, encode/decode HEVC y reproducción real. Las señales sintéticas no acreditan mejora visual, superresolución IA, rendimiento sostenido, HDR, latencia menor a 30 ms ni recuperación tras reinicios.

Comprimir después del parche; verificar gzip contra el hash sin comprimir y comprobar integridad del paquete. Mantener accesos privados: base64 no cifra. Conservar el original como rollback y no sobrescribir evidencias anteriores.

## 5. Integrar solo dentro de lo autorizado

Si se pidió auditoría/ampliación, entregar archivos y límites sin inventar despliegue. Si se pidió activación y existe acceso autorizado, inspeccionar/reutilizar motor y rutas existentes; seguir las habilidades aplicables de infraestructura/persistencia y validar endpoints, logs, reinicios y rollback reales.

Para video directo del proveedor, escalar localmente después de decodificar y describirlo como render local. Para un bitstream codificado 4K/6K, integrar un procesador real; headers no lo sustituyen.

Conectar zapping mediante POST asíncrono del player/helper a una ruta VPS existente/verificada, o PUT para modalidad de cambio de URL. Enviar identificador/nombre de canal, tipo de contenido, codec hint y timestamp UTC, más perfil/variante. No enviar credenciales. Una playlist estática no emite esos eventos por sí sola.

## 6. Entregar estado honesto

Entregar copia ampliada, informe, overlay, evidencia y scripts pertinentes como archivos enlazados. Resumir diagnóstico, acciones, componentes, validación, resultado, pendientes, riesgos, siguiente paso y avance por alcance.

Declarar por separado auditoría estática, metadata preparada, procesamiento offline y activación end-to-end. No presentar `REQUESTED` como `EXECUTED`, un endpoint muestreado como todos los canales validados ni una instalación pendiente como sistema operativo.
