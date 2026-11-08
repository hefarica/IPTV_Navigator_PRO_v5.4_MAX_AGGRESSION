# REA Android: fuentes del overlay de la APK suministrada

Este directorio conserva las fuentes Java, shaders y parches usados sobre la APK
auditada de APE, versión 651. No representa una compilación del proyecto Gradle
histórico que declara otra versión. Los parches verifican sus puntos de inserción;
el proceso rechaza una APK base con otro SHA-256.

Base requerida:

```text
8d3b145811c0bab3a10952329a81cadc477b08bd365b70f173cfe34ff52aa6e4
```

La variante REA usa `com.ape.crystalagent.rea`. Se instala junto al paquete
original `com.ape.crystalagent`; conserva sus controles y añade un reproductor
externo que recibe la fuente y sus cabeceras desde OTT Navigator. MediaSession
gestiona controles y metadatos. El procesamiento de vídeo requiere que el canal
se reproduzca dentro de REA.

## Reconstrucción

Se requieren Linux, Python 3.9 o superior y Java 17. El script prepara las
herramientas verificadas por SHA-256, decodifica la base, aplica los parches,
compila las clases, añade DASH 1.3.1, alinea y firma. Los módulos Media3 existentes
permanecen en el APK; no se empaquetan copias duplicadas desde el classpath.

```bash
python3 tools/rea/rebuild_apk.py \
  --base-apk /ruta/privada/base-651.apk \
  --work-dir /ruta/privada/rea-rebuild-653 \
  --keystore /ruta/privada/ape-rea-test.p12 \
  --password-file /ruta/privada/password.txt
```

La clave PKCS12 debe usar el alias `ape-rea`. Para actualizar una instalación REA
existente, se requiere su misma identidad de firma. La clave y su contraseña
se conservan fuera de este repositorio; tampoco se publica aquí la APK base.
`--tools-dir` permite reutilizar un caché local cuyos archivos se verifican antes
de compilar. El directorio de trabajo debe estar vacío y fuera del checkout.

El resultado se escribe en `deliverables/`, junto al directorio de trabajo.
El script no instala una APK, modifica el VPS ni publica una release. Las
marcas temporales del empaquetado pueden cambiar el hash del APK reconstruido;
la comprobación de equivalencia debe considerar DEX, recursos, manifiesto y firma.

## Comprobaciones

Desde el directorio padre del workspace preparado:

```bash
python3 rea-rebuild-653/integration/tests/run_external_interop.py
python3 rea-rebuild-653/integration/tests/run_native_recovery.py
python3 rea-rebuild-653/integration/tests/check_final_dex.py \
  --apk deliverables/APE_REA_653_OTT_DASH_2K_4K_6K_TEST_20261108.apk \
  --smali-root rea-rebuild-653/apk \
  --aapt2 rea-rebuild-653/tools/sdk/android-14/aapt2 \
  --output rea-rebuild-653/integration/evidence/final_dex_structure.json
```

Las pruebas de interoperabilidad usan las implementaciones Java reales de los
contenedores Android y las fábricas oficiales Media3. No reproducen un canal en
un dispositivo. La firma, la ausencia de clases duplicadas y la resolución de
los métodos insertados tampoco acreditan fluidez ni HDR físico.

## Contrato del reproductor

- HLS, DASH con extensión `.mpd` o MIME `application/dash+xml`, y formatos
  progresivos admitidos por el dispositivo. No se añade configuración de licencias DRM.
- Hasta 256 cabeceras; 16.384 bytes UTF-8 agregados entre nombres y valores,
  incluyendo el User-Agent efectivo; 8.192 bytes por valor. Los pares en arrays
  o listas admiten hasta 512 elementos. CR/LF, controles y nombres inválidos se rechazan.
- Hasta 720 de dimensión menor: rectángulo 2560×1440. De 721 a 2159:
  3840×2160. Exactamente 2160: 5760×3240. Fuentes mayores: tamaño nativo.
  Se conservan aspecto y orientación, sin reducir la fuente para caber en el rectángulo.
- El dispositivo decide el tamaño aplicado y el coste de los efectos. Las
  dimensiones objetivo de las listas son solicitudes, no resultados medidos.
- HDR nativo se conserva cuando la ruta es compatible. SDR BT.709 conocido
  sólo se convierte a PQ si la API, pantalla y salida EGL cumplen las condiciones
  del contrato. Un fallo del procesamiento debe reiniciar la ruta nativa completa.

El contrato compartido está en `contracts/rea/rea-processing-v1.json`. El estado
de la distribución y las pruebas se documenta en el informe de alineación.
