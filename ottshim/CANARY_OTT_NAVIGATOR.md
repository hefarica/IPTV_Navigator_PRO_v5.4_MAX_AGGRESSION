# Canary JIT con OTT Navigator y OTTShim

Base revisada: `ae7a171ae433ad3ffdfd200124613af4d7156752`. Este cambio no modifica el catálogo original, el servidor ni la ruta heredada `/source.m3u8`.

**Ruta piloto:** OTT Navigator → `/canary/catalog.m3u` de OTTShim → `/canary/media.m3u8` del canal elegido → `/pulse/<id>.m3u8` (`m=proxy`) → recursos `/seg/v2.…` del mismo VPS. El reproductor recibe los recursos mediante `/canary/resource`. ApePlayer no interviene.

## Antes de usar en ONN

1. Preparar una **copia derivada** de exactamente tres canales con `#EXTM3U`, un `#EXTINF` con `tvg-id` por canal, un solo `#EXTSHIMOTT` válido (`ver=1`, `id` igual a `tvg-id`, `tgt` incluye `ott`) y una URL HTTPS `/pulse/<id>.m3u8?…&m=proxy` en el mismo VPS que aloja el catálogo. No incluir cabeceras de origen ni credenciales en la lista que recibe OTT. El original no se toca. El piloto reduce los atributos del catálogo derivado a nombre e identidad; no activa guía, archivo ni reproductor externo.
2. Confirmar del lado servidor que `/pulse/` y `/seg/` tienen exclusión efectiva por **cuenta** y no hay otro consumidor externo que abra la misma cuenta. El VPS debe devolver HLS de segmentos, no máster ni redirección, y rutas firmadas `/seg/v2.<payload>.<firma>`, también para mapas y claves AES‑128 de identidad cuando apliquen. El cliente no verifica la firma; la verifica el VPS. No utilizar este piloto con LL-HLS o DRM.
3. Desde la raíz del repositorio y con SDK Android 34: `git apply --check <parche>` y `git apply <parche>`. Desde `ottshim/`: `bash gradlew :app:testDebugUnitTest :app:assembleDebug`. No sustituir una instalación firmada con otra clave. Instalar solo tras autorizar la prueba.
4. En OTTShim, indicar como fuente la copia HTTPS y arrancar el puente. En OTT Navigator agregar un proveedor tipo Lista de reproducción con la dirección `canary=` que muestra OTTShim. Ambos deben correr en el mismo ONN. El puerto es dinámico: si cambia al reiniciar, actualizar la dirección del proveedor y recargar. Ajustar el proveedor a una conexión y desactivar previsualización, multivista y grabación durante la prueba.

## Aceptación

- Importación 3/3, primera imagen y audio, y 30 segundos sin pausas. Las líneas de OTTShim `manifest_served` y `resource_served` acreditan tránsito y bytes, no decodificación ni fotogramas presentados.
- A→B→A sin intervención. En el VPS, comprobar que el máximo de solicitudes simultáneas al origen por cuenta sea 1 y que la sesión anterior libere antes de abrir la siguiente. `max-conn=1` no reemplaza esta comprobación. Si el VPS responde 403 o 503, el puente no redirige al origen ni transforma la denegación en 200.
- Para atribuir mejoras a JIT, obtener recibo del motor activo (`requested`, `applied`, `output`, `engine_sha256`) y medir un segmento efectivamente entregado. Sin recibo, no declarar filtros, 4K, 6K u 8K ejecutados. El parche no activa el lazo JIT ni cambia el motor VPS.
