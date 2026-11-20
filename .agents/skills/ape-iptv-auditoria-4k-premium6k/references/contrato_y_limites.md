# Contrato y límites de la auditoría IPTV 4K/Premium6K

## Propósito y alcance

Usa este contrato para auditar un catálogo IPTV y sus salidas visuales sin confundir metadatos, capacidades declaradas y procesamiento real. Separa siempre el catálogo M3U de la master playlist y de los medios HLS: representan capas relacionadas, pero no son el mismo artefacto ni deben validarse con la misma evidencia. Documenta qué se observó, qué se ejecutó y qué solo se infirió; no conviertas una declaración en una medición.

Trata cada endpoint, variante y perfil como una unidad auditable. Conserva el identificador de la fuente, su estado, el resultado de la prueba y la evidencia asociada. Si una prueba no puede ejecutarse o la fuente es desconocida, conserva `source` tal como fue recibido y marca `executed: false`. No sustituyas una fuente desconocida por `source=simulated`, no cambies un resultado no ejecutado a verdadero y no rellenes campos para aparentar cobertura.

## Veracidad del vídeo y de la resolución

Interpreta `#EXT-X-STREAM-INF`, `RESOLUTION` y `CODECS` como declaraciones de selección y compatibilidad del stream, no como prueba de número de píxeles, calidad perceptual ni capacidad del motor de vídeo. Valida la reproducción y la geometría con evidencia separada. No llames “nativo” a un tamaño que solo provenga de una etiqueta, una variante o un escalado posterior.

Usa **4K estándar** como convención `3840x2160`. Usa **Premium6K** como convención simulada `5760x3240` únicamente cuando el perfil lo explicite. Presenta ambas convenciones como objetivos o lienzos de salida; no las presentes como resolución nativa garantizada por el proveedor, el stream o el dispositivo.

Prioriza HEVC solo entre fuentes verificadas como compatibles con el decodificador y la cadena de reproducción. No describas HEVC como “sin compresión” ni confundas un códec eficiente con ausencia de compresión. Examina el valor `d` de una URL como posible descriptor de dispositivo, pero no asumas que contiene metadatos completos ni derives dimensiones que no estén verificadas. No falsees anchura, altura, códec, HDR o tasa de bits para completar una ficha.

Distingue una entrega de vídeo directa del proveedor de un procesamiento de imagen local. El vídeo directo puede renderizarse localmente a un lienzo escalado sin cambiar el bitstream recibido. Cuando se requiera un flujo 4K o 6K codificado, exige un procesador real y evidencia de esa codificación; un `canvas`, un `scale` visual o una etiqueta de perfil no constituyen un nuevo stream codificado.

## Procesamiento y equivalencia

Describe de forma literal la cadena FFmpeg usada. Una cadena como `bwdif,unsharp,scale,setsar,pad` expresa desentrelazado, nitidez, escalado, relación de aspecto y relleno dentro de FFmpeg; no afirmes que es equivalente a VLC ni atribuyas al reproductor operaciones que no se hayan verificado. Conserva el orden de filtros, parámetros y destino para que otra ejecución pueda reproducirlos.

Extiende el esquema REA existente mediante `ape.rea-intent/1` cuando necesites expresar intención de auditoría, perfil o límite. No dupliques el motor REA, no inventes una segunda semántica para los mismos campos y no uses el esquema como sustituto de una prueba de reproducción. Mantén la compatibilidad con consumidores que ignoren extensiones y registra cualquier campo adicional sin alterar el significado original.

## Perfiles, QoE y zapping

Trata `floor_lock` como una restricción virtual de perfil, no como prueba de hardware. Usa `virtual_4k` y `hdr_intent` para expresar intención o límite solicitado, y conserva `APE_VISUAL_FIRST=0` como valor predeterminado. Permite `APE_VISUAL_FIRST=1` solo como modo experimental explícito, con trazabilidad de quién lo activó y qué comportamiento cambia.

No cambies `QoE.p` entre perfiles si al hacerlo alteras su semántica. Si un perfil visual necesita una política distinta, crea una distinción documentada y comparable; no reajustes el valor para mejorar artificialmente el resultado. Trata los tiempos objetivo de caché como objetivos operativos, no como mediciones observadas. Registra la medición real por separado, con método y momento de captura.

Para zapping, usa únicamente la ruta real y verificada, incluidos su método HTTP y su contrato. Una ruta POST/PUT no debe inventarse, simularse ni enviarse durante una auditoría solo para completar el informe. Si el flujo de zapping no fue probado, déjalo sin ejecutar y explica el límite; no infieras latencia ni disponibilidad a partir de otra operación.

## Seguridad y manejo de datos

Considera Base64 como codificación, nunca como cifrado. Redacta o protege cualquier valor sensible antes de almacenar logs, ejemplos o artefactos. Trata el campo `u` como potencialmente sensible: puede contener credenciales u otros secretos. No copies credenciales a la documentación, no las imprimas en diagnósticos y no las uses como evidencia de calidad. Mantén la separación entre configuración de acceso, identificadores de auditoría y resultados públicos.

## Muestreo, evidencia y rendimiento

Declara el tamaño de la muestra y su criterio de selección. Una prueba de un endpoint sirve como muestra de ese endpoint; no extrapoles sus resultados a todo el catálogo, proveedor, códec o dispositivo. Diferencia “declarado”, “observado”, “ejecutado”, “fallido” y “desconocido”. No conviertas ausencia de error visible en garantía de calidad.

Conserva hashes de entradas, configuraciones y salidas relevantes. Haz las operaciones idempotentes: repetir una auditoría no debe duplicar registros ni cambiar silenciosamente el resultado. Antes de publicar una transformación, prepara rollback hacia la entrada y el estado anterior. No prometas una latencia inferior a 30 ms ni otro umbral de rendimiento sin medición reproducible, condiciones de prueba y hardware identificados.

## Criterio de cierre

Cierra una auditoría solo cuando cada afirmación importante tenga su clase de evidencia, la fuente permanezca trazable, los campos no verificados estén marcados y la salida pueda repetirse o revertirse. Declara de forma visible las convenciones 4K/Premium6K, el carácter experimental de cualquier modo visual, la diferencia entre escalado local y recodificación, y los límites del muestreo. Si una condición no se pudo verificar, conserva el desconocido: la honestidad del contrato prevalece sobre la apariencia de cobertura.

## Referencias técnicas oficiales

- [RFC 8216 — HTTP Live Streaming](https://www.rfc-editor.org/rfc/rfc8216)
- [FFmpeg — documentación de filtros](https://ffmpeg.org/ffmpeg-filters.html)
- [FFmpeg — documentación de códecs](https://ffmpeg.org/ffmpeg-codecs.html)
- [Kodi inputstream.adaptive — tipos y propiedades de selección de streams](https://github.com/xbmc/inputstream.adaptive/wiki/Stream-selection-types-properties)
