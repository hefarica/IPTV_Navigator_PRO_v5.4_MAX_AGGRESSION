# Cableado dentro del APE CRYSTAL FLOW — integración por estación

Este documento conecta el parche `CABLEADO_CRYSTAL_CMAF.patch` con las cinco estaciones descritas en [`APE_CRYSTAL_FLOW.md`](APE_CRYSTAL_FLOW.md) y con el contrato [`contracts/ape_crystal_flow_operativa.json`](../../contracts/ape_crystal_flow_operativa.json). Su objetivo es distinguir con precisión qué quedó aplicado en el repositorio, qué se validó offline y qué sigue sin desplegarse.

La regla de lectura es simple: **aplicado en el árbol** significa que el código o la prueba existe y pasa; **no desplegado** significa que no se instaló en VPS, no se compiló la APK y no se ejecutó en un dispositivo. Ninguna afirmación de este documento convierte una prueba local en producción certificada.

## Resumen por estación

| Estación | Componente real | Qué quedó aplicado en el repo | Estado verificado | Qué no se hizo |
|---|---|---|---|---|
| 1 · GENERADOR | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | Nada. El parche no toca el generador. | Sin cambios; sintaxis del archivo activo comprobada. | No se regeneraron listas ni se validaron las 949 directivas línea a línea. |
| 2 · CABLEADO | `tools/ops/ape-cablear-lista.php`, núcleo API, listado, worker de cola | Motor streaming, clasificación, fail-safe de headers, identidad, base persistida, journal y publicación recuperable. | 42 + 76 + 94 controles, más 52 de conformidad del flujo. | No se desplegó en VPS ni se reejecutó el servicio real. |
| 3 · AGENTE (APK) | `android/ape-crystal-agent` | Nada binario. La APK consume la lista y aplica settings; el cableado no aplica settings. | Manifiesto y límites declarados comprobados por la suite de conformidad. | No se compiló el APK ni se instaló en Fire TV/dispositivo. |
| 4 · SHIM | `android/ape-crystal-agent/shim` | Nada binario. Se conserva su límite de passthrough multi-canal. | Manifiesto sin Activity/launcher y con services comprobado. | No se probó el rewriter en un master/media real de un canal. |
| 5 · MEDICIÓN | `/prisma/api/*`, logs, vigilante | El listado y el estado de tickets quedan sanitizados y con `nosniff`. | Controles de status, rutas y tokens en la suite API. | No se midió QoE, zapeo ni 4xx/5xx del VPS. |
| LAB | `tools/labs/LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json` | Se lee y valida como artefacto existente; no se reescribe. | JSON válido, 6 perfiles, duración de segmento declarada. | No se recalibró el LAB ni se añadieron perfiles. |
| CMAF | `vps/cmaf_worker.php` | Remux copy-only, una representación, tags estrictos, 2/4/6 s. | Constructor y fixture local: 300 frames idénticos, decode a null. | No se activó el servicio, ni Hydra/curl, ni LL-HLS. |

## Estación 2: qué cambia de verdad

El cableado sigue produciendo la misma lista con cada URL elegible envuelta en `/pulse/<id>.m3u8?u=…&d=…&id=…`. El parche no crea un segundo motor ni una cola paralela: amplía el motor, el núcleo, el listado y el worker existentes.

Los cambios con impacto directo en el flujo son cuatro. Primero, la lectura es por streaming y ya no corta por número de canales ni por una línea de más de 1 MiB. Segundo, la clasificación distingue catálogo, lista simple y HLS genuino; un `EXTINF` aislado no convierte un catálogo en HLS, y un master/media HLS se conserva sin inventar etiquetas ni envolver segmentos. Tercero, la identidad de la fuente y la base pública quedan persistidas en el ticket, de modo que el worker publica con la misma base con la que se encoló. Cuarto, la publicación usa un journal recuperable y no declara `done` si el recibo no cuadra con los bytes, hashes, metadata y conteos reales.

La consecuencia para las estaciones 3, 4 y 5 es que reciben exactamente el mismo contrato de URL que antes, pero con menos casos de lista truncada, doble envoltura o publicación a medias.

## Enmienda honesta al «100 % /pulse/»

El contrato operativo exige que todos los canales queden con `/pulse/`. Ese invariante se cumple para toda URI que el consumidor puede transportar. No se cumple, y no debe cumplirse, cuando la URI lleva pipes con headers o metadata HTTP de canal como `#EXTHTTP` o `EXTVLCOPT:http-*`: `pulse.php` no traduce esas capas al fetch del proveedor. Envolver esa URI perdería los headers y rompería el canal.

Por eso el motor deja esas URI **directas**, conserva sus headers y las cuenta en `sin_id`. La suite de conformidad exige ese comportamiento y rechaza un 100 % decorativo. La formulación correcta del invariante es: **100 % de las URI elegibles quedan en `/pulse/`; las no transportables quedan directas y declaradas**. Esta enmienda no cambia el contrato de las estaciones 3 a 5, que siguen consumiendo `/pulse/` cuando existe.

## APK y SHIM: lo que el cableado no debe hacer

La APK no cablea. Aplica settings de imagen que el VPS dicta, mide y reporta, y monta el overlay de upscaling. El SHIM sirve la fuente por loopback para fijar variante y mapear segmentos; con un catálogo multi-canal hace passthrough porque su rewriter no está pensado para millones de líneas.

El parche no modifica binarios, manifiestos ni código Kotlin. La suite de conformidad comprueba dos límites que sí importan: el manifiesto del SHIM no declara Activity ni launcher, y declara sus services; la APK conserva el permiso de INTERNET. Eso acredita presencia y límite declarado, no funcionamiento en dispositivo.

Para una aplicación completa en APK y SHIM haría falta compilar con Android SDK/Gradle, instalar en el dispositivo autorizado, verificar el arranque del servicio, el overlay sin robar foco y el passthrough de un master de un solo canal. Nada de eso se ejecutó aquí: **no desplegado**.

## VPS: fuentes frente a servicio

Los archivos `IPTV_v5.4_MAX_AGGRESSION/vps/...` del parche son fuentes públicas del repositorio, no módulos privados ni configuración del VPS. Aplicarlos en el servidor requiere copiar el árbol, ejecutar las suites en el host y reiniciar el worker bajo el gestor de servicios que ya exista. El parche no incluye unidades systemd, nginx, Lua, Rust ni claves.

Tampoco se reejecutó la lista privada completa en el VPS. La evidencia de la lista completa es local y sanitizada: dos pasadas idénticas y una tercera final, sin publicar contenido ni URLs. Ese resultado demuestra preservación estructural y rendimiento del motor en este entorno, no latencia del proveedor ni del VPS.

## Lista `.m3u8`: nombres, gzip y HLS

La salida conserva la extensión de origen y añade `_CABLEADA`: `.m3u` produce `_CABLEADA.m3u8` y `.m3u8` produce `_CABLEADA.m3u8`. Las variantes que ya son `_CABLEADA` o `_SHIELDED` se rechazan como fuente para evitar doble envoltura; una lista `LIGHT` legítima se acepta.

El gzip se trata como compresión de texto sin pérdida, no como compresión de vídeo. Un stub mínimo `#EXTM3U` puede usar su `.gz` como fuente real, con CRC validado y hash del contenido descomprimido; un plain con contenido autoritativo manda aunque su sidecar difiera. La publicación genera un gzip nuevo con `-n -9` y valida el CRC antes de publicar.

Un HLS genuino se conserva byte a byte, incluidas referencias relativas, `PART`, `PRELOAD-HINT`, `MAP` y `KEY`. Copiar la playlist no garantiza que sus segmentos sean alcanzables desde otra ruta: si el contexto no está presente, el staging no es automáticamente una URL reproducible. El cableado no promete LL-HLS de extremo a extremo.

## LAB calibrado y CMAF

El LAB existente declara seis perfiles calibrados y duraciones de segmento; la suite de conformidad lo lee y exige que al menos una duración sea 2, 4 o 6 segundos. No se reescribió el LAB ni se añadieron perfiles, porque eso sería recalibrar, no cablear.

El worker CMAF existente se corrigió para una sola representación de vídeo y audio en copia, sin split, sin downscale y sin `libx264`. El constructor acepta 2, 4 y 6 segundos y emite DASH/fMP4 con `movflags=+cmaf` y HLS regular. Con copia, los cortes sólo pueden caer en keyframes naturales: la duración es un objetivo, no una garantía exacta. En la fixture local de 12 segundos se observaron 1,96/2/2/2/2/2,04; 3,96/4/4,04; y 5,96/6,04, con 300 frames y hash idéntico a la fuente. Eso prueba remux sin recompresión, no LL-HLS ni calidad subjetiva.

## Upscale con videoFilter

El filtro `scale=w='max(iw,3840)':h='max(ih,2160)':force_original_aspect_ratio=increase:flags=lanczos,unsharp=…` se ejecutó **después de decodificar** y con salida a `null`. Observó 3 frames a 3840×2160 y no produjo archivo codificado. No forma parte del comando de remux.

Eso es exactamente lo que permite la prohibición de recompresión: realzar la imagen en el render local del dispositivo o en una validación offline, sin tocar el bitstream. Un stream 4K/6K nuevo y codificado requeriría un encoder y perdería la condición de copia; no se hizo. La APK no recibió un VPP nuevo ni se verificó Crystal UHD en hardware.

## Cómo verificar esta integración

Desde la raíz del repositorio, con el parche aplicado:

```bash
php -d memory_limit=32M tools/quality/test_cablear_engine.php
node tools/quality/test_list_cablear_panel.js
bash IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-cablear-queue-worker.test.sh
php tools/quality/test_cmaf_copy.php
php tools/quality/test_crystal_flow_conformance.php
node tools/check_anti_degradation_policy.js
node tools/check_crystal_4k_law.js
node tools/check_crystal_6k_law.js
```

La conformidad del flujo no necesita red ni lista privada: usa una fixture de tres canales, uno AVC, uno HEVC Main 10 con solicitud Crystal y uno con headers no transportables. Comprueba forma `/pulse/`, conteo, balance, idempotencia, constructor CMAF, contrato, LAB, manifiestos de APK/SHIM y la enmienda de `sin_id`.

## Estado final por alcance

| Alcance | Estado |
|---|---|
| Motor de cableado y sus garantías de preservación | Aplicado y probado en el repo |
| API, inventario y cola con journal | Aplicado y probado en el repo |
| Worker CMAF copy-only 2/4/6 | Aplicado y probado offline con fixture local |
| Contrato de cinco estaciones y LAB | Leído y validado; no modificado |
| APK compilada e instalada | No desplegado |
| SHIM probado en dispositivo | No desplegado |
| Servicio VPS y worker en producción | No desplegado |
| LL-HLS, QoE y cero freeze medidos | No validado |

El avance real es alto en la estación 2 y en el contrato de flujo, y deliberadamente nulo en el despliegue de las estaciones 3, 4 y 5. Presentar lo segundo como hecho sería exactamente lo que la ley anti-degradación y el truth-guard del propio contrato prohíben.
