# Auditoría de alineación REA — 8 de noviembre de 2026

## Dictamen

**El conjunto inicial no estaba alineado. Esta propuesta corrige el código y
entrega una APK REA 653 reconstruida y un LAB derivado, con evidencia local. No
constituye un despliegue ni una certificación de reproducción en Android/TV.**

La comprobación pública del VPS sigue mostrando la APK original 651 y el
frontend anterior. El Excel con macros no fue modificado, y las 475 exportaciones
históricas inventariadas no fueron regeneradas. Esas tres diferencias permanecen
expresas; no se presenta el estado local como el estado de producción.

Base revisada: `feat/adb-generic-visual-enhancement-installer`, commit
`272f417e88468183404569f8ae4d3ce8001abd05`. La rama `master` observada al inicio
tenía otro commit. El detalle verificable del estado previo está en
[REA_ALIGNMENT_BASELINE_20261107.json](REA_ALIGNMENT_BASELINE_20261107.json).

## Una política de procesamiento, tres dominios distintos

El contrato `contracts/rea/rea-processing-v1.json` define `rea-adaptive-v1`.
Lo consumen el frontend, la extensión del LAB y las declaraciones de las listas;
las fuentes de la APK implementan la misma geometría. Las dimensiones son
objetivos sujetos a capacidad, no dimensiones que se puedan atribuir a la fuente.

| Dimensión menor de la entrada | Rectángulo objetivo REA | Ejemplo 16:9 |
|---|---|---|
| Hasta 720 | 2560×1440 | 1280×720 → 2560×1440 |
| 721–2159 | 3840×2160 | 1920×1080 → 3840×2160 |
| Exactamente 2160 | 5760×3240 | 3840×2160 → 5760×3240 |
| Más de 2160 | Tamaño nativo | Se evita reducir una fuente mayor |

Se conserva el aspecto y se intercambia el rectángulo para vídeo vertical.
Por ejemplo, 854×480 produce 2560×1438 y 640×480 produce 1920×1440. En esta
implementación, el nombre comercial «2K» se concreta como un rectángulo QHD
2560×1440; no se confunde con DCI 2048×1080.

El contrato no promete aplicar el máximo coste en todos los dispositivos. El
gobernador dispone de niveles ligeros, equilibrados y de detalle, y puede
recuperar la reproducción nativa cuando el procesamiento no se sostiene. Los
campos de resultado exigidos para una certificación no se presentan como
mediciones que ya existan.

Los otros dos dominios conservan su identidad:

- Las recetas CLI históricas mantienen sus objetivos y capacidades declaradas.
  No acreditan que un reproductor haya ejecutado sus filtros.
- El JIT legado del VPS conserva su modo opt-in de 6144×3456. Esa salida es
  distinta del objetivo REA de 5760×3240. Modificar su código no prueba que ese
  servicio esté activo en el VPS ni que pueda codificar 6K en tiempo real.

### HDR

La ruta SDR→PQ requiere color BT.709 conocido, Android API 33 o superior,
capacidad HDR10 de pantalla y una salida EGL de 10 bits/PQ compatible. Color
desconocido no se trata como BT.709. PQ nativo se conserva cuando la ruta es
compatible; HLG utiliza la ruta nativa prevista. La mera presencia de una
etiqueta HDR, un shader o una pantalla compatible no demuestra salida HDR física.

**«Siempre HDR» no está certificado.** Forzar la etiqueta sin esas condiciones
puede alterar la imagen y no crea una salida HDR real. Se conserva una alternativa
válida para los equipos que no cumplen las condiciones.

## APK 653 e integración con OTT Navigator

Se reconstruyó desde la APK suministrada 651 mediante el overlay público
`tools/rea/apk_overlay/`. El proceso rechaza una base con otro hash y conserva
los guards de los puntos de inserción. Usa una identidad de desarrollo separada:

| Campo | Resultado |
|---|---|
| Paquete | `com.ape.crystalagent.rea` |
| versionCode | 653 |
| versionName | `3.9.7-rea-interop-test` |
| Nombre | APE Crystal REA (Prueba) |
| Tamaño | 24.362.980 bytes |
| SHA-256 | `4b0c4ef397a6ea7066b5f51951d4fefb94820b0e94aeaf07f3f879ca6674d341` |
| Firma y alineación ZIP | Verificadas |
| Estructura DEX | 9 DEX; 14.685 clases únicas; sin duplicados detectados |
| Integración host | 16 métodos insertados referenciados en 19 puntos de llamada |
| Bibliotecas nativas | Las 20 bibliotecas originales conservadas byte por byte |
| Reproducción física | Pendiente |

La variante se instala junto al paquete original. No sustituye automáticamente
la distribución 651 del servidor ni sus identificadores del instalador ADB.

**OTT debe entregar el canal al reproductor externo REA para procesar sus
fotogramas.** MediaSession y ottshim trasladan controles/metadatos; no exponen
por sí solos el vídeo decodificado dentro de OTT Navigator.

Se añadió el módulo oficial DASH **1.3.1**, alineado con la versión Media3 del
host, con selección por `.mpd` o MIME `application/dash+xml`. Las fábricas DASH
conservan las cabeceras para manifiesto y segmentos. HLS y formatos progresivos
compatibles permanecen disponibles. No se añadió configuración de licencias DRM.

Se corrigió la recuperación nativa: retirar efectos de Media3 no desmontaba su
grafo de vídeo. Ahora la recuperación de un grafo activo solicita recrear la
Activity, conserva el Intent, URL, cabeceras y posición VOD, y bloquea la reentrada
automática hasta una fuente nueva o un ajuste explícito. Tres llamadas directas
del host pasan por el wrapper que evita reactivar un compositor vacío. El
diagnóstico distingue reinicio pendiente, reapertura necesaria y fotogramas
nativos observados. La interrupción real de esa recreación aún debe medirse.

## Listas y todos los formatos expuestos

El contrato completo está en `contracts/rea/formats-v1.json`. El finalizer
compartido se aplica al generador TypedArrays y a seis emisores históricos.

| Formato/ruta | Comportamiento corregido | Límite |
|---|---|---|
| M3U8 de catálogo | DIRECTA/CDN/AMBAS/SESS; fuente observada o desconocida y solicitud REA separadas | Metadata no demuestra procesamiento |
| M3U Plus | Misma frontera de datos; extensión `.m3u` coherente | Capacidades dependen del reproductor |
| `.m3u8.gz` / `.m3u.gz` | Compresión antes del destino; AMBAS genera dos salidas desde una generación | Fallback Blob retiene los bytes en RAM |
| HLS media de origen | Conserva segmentos, claves, mapas, discontinuidades, CRLF y partes | No implica generar LL-HLS |
| DASH para reproducir | Una M3U de un canal con URL MPD absoluta del primer JIT activo | No es un MPD multicanal |
| `.mpd` diagnóstico | Snapshot explícito, XML original conservado | Archivo local no equivale a directo autónomo |
| JSON / JSON gzip | Un catálogo con URLs originales y `transportApplied:false` | No se inventa reescritura CDN ni segunda copia |
| CSV | Columnas de fuente/procesamiento separadas; quoting y neutralización de fórmulas | Cabeceras se representan en una celda JSON |
| XLSX de canales | Hojas `Channels` y `REA_Contract` | No sustituye el libro LAB con macros |
| LAB JSON | Base certificada más extensión REA aditiva | No modifica VBA |
| TXT | Diagnóstico/telemetría | No se presenta como playlist reproducible |

Sólo un sondeo asociado a la URL exacta acredita resolución, codec, rango,
bitrate o fps. Un sondeo del mismo host/perfil se conserva como estimación.
Se retiraron las atribuciones automáticas de AAC, Dolby/Atmos, HDR y dimensiones
de destino a la señal de origen. Si falta `BANDWIDTH` observado, se conserva la
entrada IPTV y no se inventa una variante HLS `EXT-X-STREAM-INF`.

URLs firmadas, orden de query, `%`, `+`, puerto `:80` y servidor propio del canal
se conservan. No se toman credenciales de otro servidor cuando falta el asociado.
Las entradas sin fuente resoluble se conservan con diagnóstico.

### Cabeceras y memoria

Se preservan las cabeceras propias de cada canal, entre ellas Authorization,
Cookie, Referer y User-Agent. `EXTHTTP` se sitúa después del `EXTINF` correcto,
evitando asignar autenticación al canal vecino. Los límites se comprueban en
bytes UTF-8 tras incorporar todas las cabeceras:

- Productor: 200 cabeceras y 8.192 bytes de JSON.
- APK: 256 cabeceras; 16.384 bytes agregados de nombres/valores, incluyendo
  el User-Agent efectivo; 8.192 bytes por valor.

Si las cabeceras necesarias no caben, se informa del error y no se exporta una
autenticación incompleta. Los límites internos no garantizan aceptación por todos
los proveedores. Esta cobertura **no incluye** el transporte de cabeceras
estructuradas del JIT legado hacia ffprobe/FFmpeg, que sigue utilizando URL y UA.

El productor respeta la demanda del lector. AMBAS espera a ambos destinos y
comprime cada rama. Si File System Access no está disponible, Blob retiene la
salida completa; dos salidas pueden duplicar esa carga. Las listas históricas
de aproximadamente 1,3 GB no se consideran certificadas en ese modo.

## LAB y Excel

El LAB `LAB_CALIBRATED_BULLETPROOF_20261026_015604.json` del equipo coincide
exactamente con `contracts/lab/APE_LAB_CANONICAL_BULLETPROOF.json`:
`345783e33142791b23b4662d396c0c83c8051d77cd7c166dc21ef4990c093094`.

La salida derivada `LAB_CALIBRATED_REA_v1.json` conserva los campos originales
y añade política/procedencia. Su hash es
`f2b97084a02288c20c6d5d52830c5424aaf38399b061a7b53c65d73a9bd13bbc`.
Se entrega por un canal privado; no se añade al repositorio público porque
contiene los datos originales del LAB. La política y el overlay sin ese catálogo
se mantienen en Git. Se pueden reconstruir con:

```bash
node tools/rea/build_processing_policy.js --lab-output artifacts/LAB_CALIBRATED_REA_v1.json
```

La importación/exportación y recarga conservan la extensión REA y los perfiles
importados. Se corrigió una regresión que restauraba los fps embebidos encima de
un perfil importado. No se modificaron las calibraciones de origen para esconder
el desacuerdo con el Excel.

El libro real `APE_M3U8_LAB_v8_FIXED.xlsm` tiene 55 hojas y VBA. En
`6_NIVEL_2_PROFILES!B32:G32` contiene seis valores 120; el JSON certificado
posterior contiene P0…P5 = 30, 60, 30, 60, 30, 30. Son configuraciones heredadas
con semántica mezclada, no mediciones de los canales. El libro no tiene hoja REA
y sus macros no exportan la extensión nueva. **El XLSM original permanece
pendiente de migración explícita; no se afirma que ya esté alineado.**

Se inventariaron 475 archivos de listas/catálogos por nombre, tamaño y fecha.
No se analizaron íntegramente ni se regeneraron todos. Las nuevas reglas se
aplican a nuevas exportaciones realizadas con este frontend.

## Recetas y JIT legado

Se corrigieron las seis cadenas ATADENOISE: usaban `s` inválidos y una opción
`r` inexistente. Las ventanas actuales son 7, 9, 11, 13, 15 y 15; los valores
anteriores quedan registrados como inválidos. Se retiró la homologación VLC
no demostrada. Las seis cadenas nuevas ejecutan el filtro con FFmpeg 6.1.1;
las seis previas reproducen su error. Esto demuestra ejecutabilidad, no una
calibración perceptual de la imagen.

El JIT ahora preserva las fuentes 4K/HDR cuando corresponde, evita bajar 4K SDR
a 1080p, conserva fps y audio compatible, y deriva CICP/rango de la salida
observada. No etiqueta H.264 como HEVC ni HLG como PQ; no inventa mastering
display, MaxCLL o MaxFALL. Un audio incompatible produce diagnóstico en lugar
de convertirse silenciosamente a estéreo.

Se comprobaron seis casos reales FFmpeg: AVC 4K SDR, AVC 4K PQ, HEVC 4K PQ,
HEVC 4K HLG, SDR 640×360 convertido a 1080p PQ y HLG 720p conservado. Los casos
de copia mantienen hashes de paquetes de vídeo; todos mantienen los de audio,
50 fps y seis canales en esos fixtures. No equivalen a una prueba con las
señales del usuario ni a codificación 6K sostenida.

## Evidencia y pruebas

El recibo `REA_VALIDATION_20261108.json` recoge los comandos y resultados finales.
Las suites de escritorio no se suman como una tasa de éxito de reproducción.

- APK: 253 aserciones de petición/contenedores/routing/fábricas DASH; 103 de
  recuperación nativa e Intent y 35 del gobernador. Compilación API34.
- Estructura final: firma, alineación ZIP, checksums DEX, ausencia de clases
  duplicadas, resolución de métodos y componentes del manifiesto.
- Frontend: política, persistencia del LAB, fuente/procesamiento, siete emisores,
  cabeceras UTF-8, dos canales con autenticación distinta, formatos, gzip,
  cancelación, límites de streaming y URL DASH absoluta.
- JIT: 213 aserciones y seis fixtures FFmpeg; recetas: 82 comprobaciones de
  dialecto y ejecución real de las seis cadenas ATADENOISE.
- Despliegue: parser de versión Android, variables del worker, input literal
  tratado como datos y correspondencia del inventario HTTP.

El E2E heredado `e2e-bulletproof-full-audit.js` produjo inicialmente **24 PASS /
1 FAIL**: activaba `dictatorMode` y después esperaba 105.000 ms de caché del LAB,
aunque ese modo impone 500 ms. El mismo fallo se reprodujo en el commit base.
Se corrigió la prueba separando ambos escenarios: mantiene las 25 aserciones
LAB originales sin dictator y añade tres comprobaciones del override de 500 ms.
El resultado final es **28 PASS / 0 FAIL**. La política de buffers de producción
permanece intacta y el recibo conserva el fallo histórico y su resolución.

Las 19 suites consolidadas pasan (una reutiliza evidencia JIT con inputs
idénticos). Además, los gates de prefetch unitario y loopback exigidos por
`AGENTS.md` pasan **43/43 y 11/11**. Los otros dos gates de interfaz quedan
**bloqueados por el entorno**, no aprobados: Chrome 157 se descargó del origen
oficial y responde a `--version`, pero al arrancar falla su socket con `EPERM`;
el puerto CDP no está disponible. El equipo remoto autorizado estaba fuera de
línea al intentar la alternativa. No se alteraron las restricciones del entorno.

El balance total es **21 gates aprobados, incluidos los de evidencia reutilizada,
y 2 bloqueados**. Como `AGENTS.md` exige todos verdes antes del commit, se
entrega un parche revisable y **no se crea commit ni PR**. Para publicar el PR
falta ejecutar esos dos gates en un equipo disponible o una excepción expresa
del usuario a esa norma; ninguna excepción autoriza por sí sola merge/despliegue.

La revisión cubrió arquitectura IPTV, HLS/CMAF, codecs, color/HDR, LAB/Excel,
nginx/despliegue, Linux/ADB, red/memoria, interoperabilidad de reproductores y
seguridad de cabeceras. La cobertura no elimina los límites físicos pendientes.

## Producción: estado y pasos de cierre

La revisión pública del 8 de noviembre devuelve `/ara/version` con paquete
`com.ape.crystalagent`, versión 651 y hash de la base original. El índice servido
también coincide con el commit previo. Las comprobaciones HTTP no demuestran
que exista procesamiento de píxeles en el VPS. No había dispositivo ADB
conectado ni autenticación SSH disponible para esta revisión.

El workflow manual existente sigue teniendo un alcance superior a una publicación
estática: incluye PHP, sincronizadores, configuración PHP-FPM y worker ADB.
Su rollback es por archivo y no restaura todo el lote ni sus `.gz`. El modo
`verify-only` no instala destinos de producción, pero sí utiliza temporales
remotos. Por ello **no se ejecutó como supuesto despliegue REA aislado**.
Se corrigieron las rutas temporales del nuevo inventario, pero no se presenta
ese cambio como una solución de sus limitaciones operativas preexistentes.

Antes de publicar en producción se necesita una unidad estática explícita
(20 scripts e índice), respaldo/restauración del lote y de sus `.gz`, y
verificación HTTP sin/con compresión. La distribución REA 653 y los
identificadores del instalador requieren un cambio separado y comprobado;
reemplazar únicamente `version.json` sería insuficiente.

La norma del repositorio `CLAUDE.md`, sección «REALIDAD MEDIDA DEL VPS», impide
reactivar motores especulativos para hacer coincidir promesas y configuración.
No se activaron Crystal, Rust, netshield ni transcodificadores como parte de
esta auditoría. La propuesta queda para revisión como parche; no se creó commit
ni PR, y no se hizo merge ni despliegue.

Para certificar el resultado faltan reproducción real desde OTT hacia REA,
medición de dropped frames, estabilidad térmica, rebuffering, recuperación,
dimensiones efectivas y salida HDR del panel en equipos representativos. No
hay evidencia para prometer 6K fluido en cualquier dispositivo ni latencia
extremo a extremo inferior a dos segundos.

## Referencias primarias

- [Android: controlar la reproducción mediante MediaSession](https://developer.android.com/media/media3/session/control-playback).
- [Android: reproducción DASH y módulo correspondiente](https://developer.android.com/media/media3/exoplayer/dash).
- [RFC 8216: HLS](https://www.rfc-editor.org/info/rfc8216/).
- [FFmpeg: opciones de atadenoise](https://ffmpeg.org/ffmpeg-filters.html#atadenoise).

Las versiones de bibliotecas del overlay están fijadas por hash. Los ejemplos
actuales de documentación no cambian la dependencia Media3 1.3.1 del host.
