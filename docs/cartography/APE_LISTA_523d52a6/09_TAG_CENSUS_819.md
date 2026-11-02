# Anatomía completa de la lista de referencia — censo de 819 tags y metadata decodificada

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` (604.593.696 B,
sha256 `523d52a6…5049d6`) · Pasada única de lectura.

---

## 1 · Censo completo: **819 tags distintos**

| Tag | Ocurrencias | Lectura |
|---|---:|---|
| `#EXTVLCOPT` | 1.416.786 | **134 por canal** |
| `#KODIPROP` | 1.089.025 | **103 por canal** |
| `#EXTATTRFROMURL` | 570.942 | **54 por canal** |
| `#EXT-X-DATERANGE` | 10.574 | 1 global + 10.573 (uno por canal) |
| `#EXT-X-APE-QUANTUM-PIXEL` | 10.574 | 1 global + 10.573 |
| `#EXT-X-APE-AUDIO-PASSTHROUGH` | 10.574 | 1 global + 10.573 |
| `#EXTINF` · `#EXT-X-STREAM-INF` · `#EXT-X-I-FRAME-STREAM-INF` | 10.573 | uno por canal |
| `#EXTHTTP` | 10.573 | validado al 100 % en otro informe |
| ~700 familias `#EXT-X-APE-*` / `#EXT-X-VNOVA-*` / `#EXT-X-PHANTOM-HYDRA-*` | 10.573 | una por canal |
| `#EXT-X-SESSION-DATA` | 24 | global |
| `#EXT-X-APE-LAB-METADATA` | **20** | metadata chunked (ver §2) |
| `#EXT-X-KEY` | **1** | hay una clave declarada |
| `#EXT-X-MEDIA` | **0** | **confirmado: muxed, sin rendition de audio** |

**291 directivas de jugador por canal** (134 `EXTVLCOPT` + 103 `KODIPROP` + 54 `EXTATTRFROMURL`),
más el bloque de ~700 tags `APE-*`. Eso es lo que hace que la lista pese 604 MB para 10.573 canales.

Tres tags aparecen **10.574** veces en vez de 10.573: hay **una instancia global de cabecera** además de
la de cada canal. No es un error; es una duplicación de cabecera que conviene conocer.

## 2 · La metadata chunked: decodificada y válida

```
chunks:            20 / 20
índices:           1,2,…,20   ·  faltantes: NINGUNO
base64 total:      69.188 chars
decodificado:      51.890 bytes
JSON:              VÁLIDO
schema:            ape-lab-metadata-v1
profile:           P0
generated_at:      2026-11-02T03:12:27.403Z
fields:            id=P0 · name="8K Master" · level=6 · quality="ULTRA" · color=#dc2626
```

**Los 51.890 bytes coinciden exactamente con la cifra que la cartografía había registrado por otra vía.**
Dos mediciones independientes, mismo objeto.

Esto cierra el bucle de «hay JSON metadata que hace la lista excepcional»: **existe, está completo, y
decodifica**.

## 3 · El hallazgo: una integridad declarada que nadie verifica

```
#EXT-X-APE-LAB-DNA:sha256=unverified,SOURCE=LAB_CALIBRATED,EXPORTED=2026-10-26T01:31:05
```

El propio manifiesto declara que su hash **no está verificado**. Eso no es un fallo de parseo: es una
**afirmación de integridad sin garantía**. Cualquiera que lea ese campo y lo trate como una promesa se
equivoca. Y no se puede comprobar porque el manifiesto **no dice sobre qué se calcula** ese sha256 — ni el
mensaje, ni el fichero, ni los campos.

Es un hueco real y accionable: o se emite un hash de un objeto definido y comprobable, o se elimina el
campo. Un `sha256=unverified` es peor que ningún hash, porque parece uno.

## 4 · Lo que este censo confirma de las conclusiones anteriores

- **Audio throughpass imposible en esta lista:** `#EXT-X-MEDIA` = **0**. No es una interpretación; no existe
  el tag. El origen es muxed y ningún ajuste de manifiesto crea renditions.
- **La lista es homogénea:** casi todos los tags por canal aparecen exactamente 10.573 veces. No hay canales
  a medio configurar.
- **El peso está en texto, no en vídeo:** 604 MB son directivas, no segmentos.

## 5 · Lo que este censo NO dice

- No dice si los 1,4 millones de `#EXTVLCOPT` son **válidos para algún parser**: solo cuenta ocurrencias.
  Validarlos uno a uno contra la sintaxis real de VLC es otro trabajo, no hecho.
- No dice si los ~700 tags `APE-*` por canal son leídos por alguien. Un tag desconocido es **metadata inerte**
  por RFC 8216 (§6.3.1): los players lo ignoran. Que esté no significa que actúe.
- No verifica el `#EXT-X-KEY` (1 ocurrencia): no se ha comprobado qué cifra ni con qué método.
