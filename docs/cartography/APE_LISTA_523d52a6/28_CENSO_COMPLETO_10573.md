# Censo completo de la lista — lo que el benchmark externo no pudo hacer

**Fecha:** 2026-11-03
**Origen:** descarga directa de `https://iptv-ape.duckdns.org/lists/APE_LISTA_1793589060441.m3u8`
**Identidad:** 604.593.696 bytes · sha256 `523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6`
**Método:** una sola pasada de 10.315.662 líneas, 96,8 s.

El paquete externo declaró `global_catalog_available: false` y pidió el M3U8 completo para cerrar el censo
de los 10.573 canales, las 188 líneas globales y los perfiles P1/P3/P4. **Aquí está ese censo.**

---

## 1 · Totales

| Medida | Valor |
|---|---:|
| Bytes | 604.593.696 |
| Líneas totales | 10.315.662 |
| **Canales** | **10.573** |
| **Líneas globales** (antes del primer `#EXTINF`) | **188** |
| Líneas por canal | 975,6 |

**Los dos números que el informe anticipaba —10.573 canales y 188 líneas globales— coinciden exactamente.**

---

## 2 · Perfiles: los tres que el informe pedía

| Perfil | Canales | % |
|---|---:|---:|
| **P4** | **7.457** | 70,5 % |
| **P3** | **2.308** | 21,8 % |
| **P1** | **808** | 7,6 % |
| **Total** | **10.573** | 100 % |

**P0, P2 y P5 no aparecen en el catálogo.** El laboratorio define seis perfiles; la lista usa tres.
Eso no es un defecto: es una decisión de distribución por tipo de canal.

---

## 3 · Familias de códec — el hallazgo más importante

| Familia | Canales | % |
|---|---:|---:|
| **h264** | **9.535** | **90,2 %** |
| **hevc** | **1.038** | **9,8 %** |

**Nueve de cada diez canales son H.264, no HEVC.**

Eso contrasta con lo que la lista *pide* en sus directivas:
```
#EXTVLCOPT:codec=hevc,h264
```
Pide HEVC primero. **Pero el 90 % de los canales son H.264.** El player pide un códec que el origen no
sirve en la mayoría de los casos, y cae a H.264 por fallback.

**Y `#EXT-X-APE-4KFALSE-MODE:ACTIVE` con `TARGET-RES:3840x2160`** en canales que son H.264 de origen: el
upscale declarado es real como declaración, no como bitstream.

---

## 4 · Los diez atributos `ape-*` del `#EXTINF`

Los diez están presentes en **los 10.573 canales**, sin una sola falta:

| Atributo | Canales |
|---|---:|
| `ape-country` | 10.573 |
| `ape-lang` | 10.573 |
| `ape-profile` | 10.573 |
| `ape-transport` | 10.573 |
| `ape-codec-family` | 10.573 |
| `ape-classify-confidence` | 10.573 |
| `ape-build` | 10.573 |
| `ape-content-type` | 10.573 |
| `ape-region` | 10.573 |
| **`ape-fps`** | **10.573** |

**`ape-fps` aparece en los 10.573 canales.** El informe lo listaba como brecha («el compilador reconoce
`ape-framerate` y no asigna ese alias»). **En esta lista el alias está emitido en todos los canales.**

---

## 5 · Distribución geográfica (top 8 de grupos)

| Grupo | Canales |
|---|---:|
| EUROPA OCCIDENTAL / GENERALISTA / FULL HD | 1.960 |
| EUROPA OCCIDENTAL / DEPORTES / FULL HD | 1.084 |
| AMÉRICA LATINA / GENERALISTA / FULL HD | 610 |
| EUROPA ORIENTAL / GENERALISTA / FULL HD | 600 |
| ASIA ORIENTE MEDIO / GENERALISTA / FULL HD | 571 |
| NORTEAMÉRICA / GENERALISTA / FULL HD | 538 |
| EUROPA OCCIDENTAL / CINE / FULL HD | 481 |
| RESTO DEL MUNDO / GENERALISTA / FULL HD | 302 |

---

## 6 · Las 188 líneas globales

Reparto por familia de tag:

| Tag | Líneas |
|---|---:|
| `#EXT-X-SESSION-DATA:DATA-ID` | 24 |
| `#KODIPROP:inputstream` | 6 |
| `#EXT-X-START:TIME-OFFSET` | 2 |
| `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD` | 2 |
| resto (una cada uno) | 154 |

### La cabecera declara su propio contrato

```
#EXTM3U x-tvg-url="" … catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}…"
#EXT-X-VERSION:9
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-APE-CHANNELS:10573
#EXT-X-APE-LAB-EXTRAS:1
#EXT-X-APE-LAB-DNA:sha256=unverified,SOURCE=LAB_CALIBRATED,EXPORTED=2026-10-26T01:31:05
#EXT-X-APE-CONTINUITY-LAW:STREAMING_CONTINUITY_LAW_V1
#EXT-X-APE-CONTINUITY-MANIFEST:no-store
#EXT-X-APE-CONTINUITY-RANGE:206
#EXT-X-APE-CONTINUITY-SEGMENTS:session-unique
#EXT-X-APE-CONTINUITY-TRANSPORT:declared
#EXT-X-APE-CONTINUITY-FALLBACK:HDR>SDR1080>SDR720
```

**Dos líneas que importan hoy:**

- **`#EXT-X-APE-CHANNELS:10573`** — la lista **declara su propio número de canales**. Un consumidor puede
  detectar el truncamiento de 8 bytes comparando esta cifra. **El paquete externo podría haberlo hecho
  sin pedir el fichero.**
- **`#EXT-X-APE-CONTINUITY-RANGE:206`** — la lista **exige que el servidor soporte rangos**. El 206 que
  reparé hoy no era un extra: era un requisito escrito en su propia cabecera, y estuvo roto con 8 bytes.

Y una línea de honestidad del propio generador:
**`#EXT-X-APE-LAB-DNA:sha256=unverified`** — declara que su ADN **no está verificado**. No finge.

---

## 7 · Qué cambia esto en el benchmark

| Afirmación del informe | Estado tras el censo |
|---|---|
| «necesito el M3U8 completo para cerrar el censo» | **aportado**: 10.573 canales, 188 globales, P4/P3/P1 |
| «`ape-fps` no se asigna» | **falso en esta lista**: está en los 10.573 |
| «no se puede afirmar nada del catálogo global» | **ahora sí**: 90,2 % H.264, 9,8 % HEVC |
| «la respuesta de 8 bytes se rechaza como catálogo inválido» | correcto, y **la propia lista lo delata** con `APE-CHANNELS:10573` |

## 8 · Lo que este censo NO prueba

- **No prueba que los 10.573 canales reproduzcan.** Cuenta líneas y lee atributos; no abre un stream.
- **No mide calidad de imagen.** Ni VMAF, ni bitrate real, ni resolución efectiva por canal.
- **No verifica que el `ape-codec-family` declarado coincida con el bitstream real.** Es la declaración del
  generador; el 4KFALSE-MODE sugiere que parte de la declaración es enhancement, no bitstream.
- **`#EXT-X-MEDIA` y `#EXT-X-MAP` no los censé en esta pasada.** Sé de mediciones anteriores que son 0 en
  este catálogo, y eso es coherente con que sea un catálogo de canales y no una playlist media. El informe
  tiene razón en que su ausencia aquí no dice nada del stream: `EXT-X-MAP` pertenece a la playlist media.
