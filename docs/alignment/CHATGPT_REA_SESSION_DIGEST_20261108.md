# Sesión REA (ChatGPT) — destilado de 331 turnos útiles

**Fuente:** `https://chatgpt.com/share/6aefc66f-ad28-83e9-8cd5-79e8ef5d2109` — título *«ChatGPT - Analiza y
mejora APK»*. Recuperado el 2026-11-08.

**Cómo se pudo leer** (el `web_fetch` falla y el HTML no trae la conversación):

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
curl -sSL -A "$UA" -H "Accept: application/json" \
  "https://chatgpt.com/backend-anon/share/6aefc66f-ad28-83e9-8cd5-79e8ef5d2109" -o share.json
# 200 · 3.413.396 bytes · application/json
# el HTML (2,3 MB) solo trae el titulo: la conversacion se hidrata por API
```

Turnos con texto: **331** (los `tool` salen redactados, `The output of this plugin was redacted.`).
El arco: turno 0 pide REA sobre la APK → 40 pregunta por ottshim/MediaSession → 54 pide el link de la
APK → 111 pega el repo y pide alinear VPS+APP+listas+Excel+LAB → 330 entrega el paquete final.

---

## 1 · LA VERDAD QUE GOBIERNA TODA LA INTEGRACIÓN CON OTT NAVIGATOR

> **«el `ottshim` de tu APK ya se conecta con OTT Navigator mediante `MediaSession`, pero esa conexión
> actualmente solo observa la reproducción: no recibe los fotogramas para escalarlos.»**

Es la frase que ordena el resto. Desglose medido sobre el código de la APK (`SessionTap`,
`ProxyService`, `LoopbackProxy`, `AbrPolicy`, `ApePlayer`):

| Componente | Qué hace de verdad | ¿Sirve para imagen? |
|---|---|---|
| **`SessionTap`** | Busca la sesión de `studio.scillarium.ottnavigator`; consulta estado, posición y búfer **cada 200 ms** | **No.** Aporta estado. No entrega imágenes |
| Detección de corte | Puede emitir `ZAP` si la posición retrocede o pasa de playing a buffering | Puede coordinar recuperación; **no prueba** freeze |
| **`ProxyService`** | Recibe la fuente por configuración `src`, `ua`, `targetKbps` | La URL llega de **config, no de MediaSession** |
| **`LoopbackProxy`** | Servidor local, reescribe manifiestos HLS, reenvía segmentos | **Transporte y caché. No decodifica, no reescala, no convierte a HDR** |
| **`AbrPolicy` / `QoeEngine`** | Ajustan variante y transporte | Continuidad, **no sustituyen al procesador de imagen** |
| **APE / Crystal / REA** | Ruta de efectos GL del reproductor propio | **Único punto real** donde conectar escalado y color |

**Por qué `MediaSession` no puede inyectar el shader:** `SessionTap` usa el
`android.media.session.MediaController` clásico. Ese API permite estado, metadatos y controles. Un
controlador **Media3** puede trabajar con una superficie **solo si la sesión compatible ofrece el
comando**; en sesiones clásicas o de compatibilidad, las llamadas para establecer superficie
**se ignoran**. Y explícitamente:

> **«Cambiar el nombre del controlador o enviar un comando llamado "upscale" no habilita esa
> cooperación.»**

⇒ Dos objetivos que NO se pueden confundir:

| Objetivo | Situación verificada |
|---|---|
| Elegir canal en OTT y reproducirlo con el motor REA | **Viable por reproductor externo** |
| Meter filtros al renderizador interno de OTT desde `SessionTap` | **La APK examinada no contiene esa integración.** Exigiría una interfaz de vídeo o mecanismo de extensión que OTT ofrezca |

**La arquitectura correcta:**

```
OTT Navigator --(URI + cabeceras)--> Reproductor APE/REA --> GPU: escalado y color --> Pantalla
OTT Navigator -.-(estado de reproducción).-> ottshim/SessionTap --> Diagnóstico
Controles ---(MediaSession de REA)---> Reproductor REA
```

Coste declarado: durante la reproducción externa **se pierden los controles propios de OTT**
(información de programas, cambio de canales, navegación de archivo).

---

## 2 · Trampas medidas del camino OTT → REA

| # | Trampa | Detalle |
|---|---|---|
| T1 | **La posición estancada no es un freeze** | `«la posición publicada por una sesión puede actualizarse de forma poco frecuente. Que ese número permanezca quieto durante un intervalo **no equivale a haber medido fotogramas congelados**»` |
| T2 | **`PlayerActivity` original siempre construye HLS** | Leer parámetros propios y forzar HLS rompe formatos progresivos. Hay que adaptar la construcción y gestionar **llegada de un canal nuevo a una actividad ya abierta** |
| T3 | **`User-Agent` por parámetro pisa el de las cabeceras** | Detectado: puede impedir abrir una fuente válida. Debe resolverse el orden de precedencia |
| T4 | **El proxy no preserva `Authorization`/`Referer`/`Cookie`** | No forzar todo el tráfico por el proxy: entregar las cabeceras recibidas al reproductor |
| T5 | **No adivinar la URI** | Solo si OTT publica la URI en metadatos. **Nunca** derivarla del nombre del canal, un póster o un id interno |
| T6 | **Permisos de sesión** | Acceder a sesiones ajenas depende de permisos o notificaciones habilitadas por el usuario; **no** hace falta para que OTT abra un reproductor externo por Intent |
| T7 | **`prepare()` no reconstruye el contrato de color** | Vaciar efectos y volver a `prepare()` no rehace el color: la recuperación **reconstruye el reproductor completo una vez**, preservando la fuente |

---

## 3 · El motor espacial, con sus tres escalones

Tabla del turno 111 — **coincide exactamente con lo derivado en `REA_UPSCALING_LAW.md` §2** (tercera
confirmación independiente):

| Fuente | Objetivo completo | Escalón intermedio (L1 = mitad) |
|---|---|---|
| 1280 × 720 | **2560 × 1440 — QHD** (el «2K» del propietario) | 1920 × 1080 |
| 1920 × 1080 | **3840 × 2160 — 4K** | 2880 × 1620 |
| 3840 × 2160 | **5760 × 3240 — 6K** | 4800 × 2700 |

Proporción conservada: `854 × 480 → 2560 × 1438`. **«Estas dimensiones corresponden al procesamiento
interno; la pantalla conserva su resolución física.»**

Tres niveles de tratamiento:

| Nivel | Procesamiento |
|---|---|
| **Ligero** | muestreo sencillo · reducción de ruido limitada por bordes · realce moderado |
| **Equilibrado** | reconstrucción **bicúbica** · limpieza · detalle controlado |
| **Detalle** | reconstrucción espacial más costosa, **con límites para contener halos y sobreoscilación** |

Gobernador: usa pérdida de fotogramas y térmica. **«No interpreta una espera por red como prueba de que
el filtro esté sobrecargando la GPU.»**

### Truth-guard sobre los modelos embebidos

> **«Los filtros desarrollados aquí son procesamiento espacial real. Los modelos pequeños incluidos en
> la APK original realizan mezcla de imágenes, promediado y enfoque; su contenido no corresponde a una
> implementación completa de Real-ESRGAN o RIFE con estimación de movimiento.»**

⇒ Prohibido vender «ESRGAN/RIFE aplicado». Es mezcla/promediado/enfoque.

---

## 4 · HDR: lo que quedó y lo que faltaba

Ruta SDR→PQ conectada: leer formato/color de fuente → conversión reconocida SDR BT.709 a lineal
BT.2020 → intermedio **FP16** → codificación **PQ en la etapa final de Media3** → pedir superficie
compatible. Requiere **Android 13 / API 33+** y capacidades declaradas de pantalla y EGL.

**Pendiente detectado entonces (y resuelto en la 652/653 por la ruta nativa):**

> «su dominio lineal relativo **no debe tratarse directamente como luminancia PQ normalizada**. Antes de
> empaquetar hay que incorporar la protección que lo devuelva a reproducción nativa, o completar y
> verificar su transformación específica.»

En el fuente de `ReaAdaptiveEffect` que leí: `The host must exclude HLG until it supplies the correct
HLG OOTF/output contract` → la 652 lo resuelve **excluyendo HLG** (ruta nativa), no falseándolo.

---

## 5 · Dos bugs que anulaban los ajustes de imagen

| Bug | Efecto |
|---|---|
| La **construcción del reproductor** restablecía `image_profile` y los porcentajes de imagen | El usuario cambiaba el perfil y el arranque lo pisaba |
| Una rama identificada por **`/sdr/`** vaciaba la lista de efectos | Canales con esa ruta quedaban sin procesado |

Ambos corregidos pasando las entradas por un **resolvedor común**.

---

## 6 · Entregables del turno final (los enlaces que importan)

El asistente entregó **tres descargas** y un informe:

| Artefacto | Enlace (file_id de la librería) |
|---|---|
| **APK 653** `APE_REA_653_OTT_DASH_2K_4K_6K_TEST_20261108.apk` | `libfile_fde3_f-91e5c110d9708191aaa8cdde6eeb0ecc_9df7af4dd40c81918a6ce94770f356d0` |
| **LAB_CALIBRATED_REA_v1.json** | `libfile_fde3_f-79e87282a6508191aa04c6cfbb1e0b0b_9df7af4dd40c81918a6ce94770f356d0` |
| **REA_ALIGNMENT_20261108.patch** | `libfile_fde3_f-7ef89be6b1748191978917e6ae150b8a_9df7af4dd40c81918a6ce94770f356d0` |
| Informe completo | `docs/audits/REA_ALIGNMENT_20261108.md` |

**El parche es de 77 archivos y aplica limpiamente a `272f417…`**, reproduciendo el árbol revisado.
**Es la pieza que falta en este repo:** verifiqué que `contracts/rea/`, `tools/rea/`, los cuatro tests
nuevos y `artifacts/` **no existen** en este árbol.

---

## 7 · La pregunta que quedó abierta al operador (sin responder)

> **«¿Autorizas la excepción a esa regla de `AGENTS.md` para crear un PR en borrador con este parche y
> las dos pruebas de interfaz señaladas como pendientes? La autorización sería únicamente para el PR; el
> merge y el despliegue quedarían pendientes.»**

Sigue sin respuesta. Nota de esta sesión: **una excepción para el PR no autoriza merge ni despliegue**,
y el propio informe lo dice.

---

## 8 · Conteos de prueba de la sesión (en su momento, no del estado final)

| Parte | Estado en el turno 111 |
|---|---|
| Geometría del motor | 32 comprobaciones JVM |
| Gobernador | 15 |
| Shaders espaciales | 22 EGL/GLES |
| SDR→PQ | 9 casos EGL |
| Protección HLG | **pendiente** (después resuelta por ruta nativa) |
| APK firmada | **pendiente** en ese turno; entregada en el 330 como 653 |

Las cifras finales del entregable están en `REA_VALIDATION_20261108.json` (23 gates: 20 PASS + 1
PASS_REUSED + 2 BLOCKED_ENVIRONMENT, **0 fallos de producto**) y en
`REA_APK_653_VERIFICATION.json` (253 aserciones de interop + 138 de recuperación/gobernador).
