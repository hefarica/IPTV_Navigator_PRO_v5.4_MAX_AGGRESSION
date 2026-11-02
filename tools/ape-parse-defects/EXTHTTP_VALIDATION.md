# Cómo consigue esa lista verse bien en OTT Navigator — verificado, no supuesto

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` (604.593.696 B,
sha256 `523d52a6…5049d6`) · **Herramienta:** `tools/ape-parse-defects/validate_exthttp.js`

Pasada única de 2,5 s, solo lectura. Valida **los 10.573 bloques `#EXTHTTP`**, que es la capa que
yo no había comprobado.

---

## 1 · El resultado: 10.573 de 10.573

| Comprobación | Resultado |
|---|---|
| bloques `#EXTHTTP` | **10.573** |
| **JSON válido** | **10.573 (100 %)** |
| JSON inválido | **0** |
| vacíos | 0 |
| que no sean objeto JSON | 0 |
| **sin `User-Agent`** | **0** |
| **sin `Referer`** | **0** |
| longitud por bloque | 7.197 – 8.124 B · media 7.790 |

**Veredicto: `TODOS_VALIDOS`.**

Esto importa porque el modo de fallo es silencioso: un `#EXTHTTP` malformado **no da error** en un
parser tolerante, se ignora, el canal sale **sin cabeceras**, el proveedor responde 461/403, y el
diagnóstico culpa al proveedor cuando el roto era el manifiesto. **Aquí no pasa en ninguno.**

## 2 · Qué lleva dentro cada bloque (12 claves, presentes en los 10.573)

Todas aparecen en **exactamente 10.573 bloques**: no hay canales «a medias».

| Grupo | Claves | Para qué sirve |
|---|---|---|
| **Identidad de transporte** | `User-Agent` | sin esto el proveedor no responde |
| **Clasificación APE** | `X-APE-Profile`, `X-APE-Tier` | qué perfil y tier se declaró al canal |
| **Declaración de medios** | `X-Codec-Full`, `X-Resolution`, `X-Framerate`, `X-Video-Range`, `X-HDR-Nits`, `X-Audio-Codec-Preferred` | el plano dice qué va a recibir **antes** de pedirlo |
| **Presupuesto de red** | `X-Expected-Bitrate`, `X-Average-Bitrate` | permite decidir sin descargar |
| **Capacidad del device** | `X-Device-Capabilities` | selector por hardware |

## 3 · La respuesta honesta a «cómo lo hizo»

No lo hace un truco de píxeles. Lo hace **uniformidad + declaración**:

1. **Una cabecera `User-Agent` en el 100 % de los canales.** Es la condición de que el upstream conteste.
2. **Seis ejes de medios declarados por canal**, presentes siempre. El player y el edge saben qué van a
   recibir sin sondear: eso es lo que separa una lista que «se ve bien» de una que se queda cargando.
3. **`X-APE-Profile` / `X-APE-Tier`** convierten la lista en un plano de control, no solo en una lista
   de URLs.

Y el matiz que evita vender humo: **estas `X-*` van dirigidas al plano APE (nginx/Lua), no al
proveedor.** Un upstream genérico las ignora. El valor real es que el **plano APE las lee** y puede
decidir; el proveedor solo ve el `User-Agent`. Declararlo así es lo correcto: la metadata es un canal
de control interno, no una mejora de píxeles.

## 4 · Lo que esto cierra y lo que no

**Cierra:** la hipótesis de que la lista se apoya en bloques de cabeceras frágiles o parciales. **No es
así: son 10.573 válidos y homogéneos.**

**No cierra:** el throughpass de audio. Sigue en `NO_COMPUTADO` porque el origen es muxed
(0 `#EXT-X-MEDIA` en 10.573 canales) y no hay packager accesible sin descargar segmentos.

## 5 · Coherencia con la medición anterior

El rango 7.197–8.124 B **explica exactamente** el hallazgo de tamaño de línea: las 10.573 líneas que
superan 4 KB y 6 KB son estos bloques `#EXTHTTP`. Las dos mediciones, hechas por separado, cuadran.

Y sigue en pie la consecuencia: **un parser con buffer de 4 KB por línea perdería la cabecera en los
10.573 canales**, y uno de 8 KB sobrevive por 59 bytes (8.124 < 8.192).

## 6 · Reproducir

```bash
node tools/ape-parse-defects/validate_exthttp.js "C:\Users\HFRC\Downloads\APE_LISTA_1793589060441.m3u8"
```
