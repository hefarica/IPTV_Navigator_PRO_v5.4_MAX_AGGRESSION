# Doctrina de ejecucion (vinculante) - MUESTRA 12P

`_meta.doctrine` de `METADATA_12P.json` es la fuente de verdad de este documento.

## Enunciado

La entrada de cada perfil es su resolucion nativa y los doce perfiles declaran seis
resoluciones de entrada distintas: 854x480, 1280x720, 1920x1080, 3840x2160, 5760x3240
y 7680x4320. La salida no es la entrada: la salida se produce siempre en el lienzo de
la ruta del perfil, 5760x3240 en `prefer_6k` y 3840x2160 en `prefer_4k`, mediante
upscale simulado ejecutado por video filters.

Por eso, en los doce perfiles: `execution.status=SIMULATED_EXECUTED`,
`transcode=true`, `upscale=true`, `mechanism=video_filters`; y en todas las capas HLS
la etiqueta es `#EXT-X-APE-EXECUTION:SIMULATED_EXECUTED`.

## Reglas

1. Entrada != salida. La resolucion de entrada es la del perfil y no se reescribe con
   el lienzo de salida.
2. Las entradas no son uniformes (seis resoluciones distintas). La doctrina no las
   iguala ni las sustituye por la salida.
3. La salida es el lienzo de la ruta: 5760x3240 en `prefer_6k`; 3840x2160 en
   `prefer_4k`.
4. El upscale de salida es simulado y se ejecuta con video filters.
5. Cuando la entrada excede el lienzo la misma etapa reduce (P0: 7680x4320 ->
   5760x3240, factor 0,75) y la etapa sigue declarada ejecutada.
6. `transcode=true` y `upscale=true` no significan fuente 6K/4K real ni calidad
   medida.
7. Cada perfil publica su etapa y su factor en `output_scale`.
8. Ningun agente puede poner `transcode` o `upscale` en `false`, reintroducir
   `DECLARED_ONLY` en un campo de estado o en una etiqueta `EXT-X-APE-EXECUTION`,
   retirar este bloque ni describir el upscale como declarado o no ejecutado. Un
   cambio exige instruccion explicita del operador y una nueva version del bloque.
9. Toda etiqueta `EXT-X-APE-EXECUTION:DECLARED_ONLY` de muestras heredadas se lee
   como `EXT-X-APE-EXECUTION:SIMULATED_EXECUTED`.

## Prohibido

- `execution.status=DECLARED_ONLY` o `NOT_EXECUTED` para la salida de los doce perfiles.
- `transcode=false` o `upscale=false`.
- Etiquetas `EXT-X-APE-EXECUTION:DECLARED_ONLY` en cualquier capa entregada.
- Describir el upscale de salida como declarado, no ejecutado o solo metadata.
- Presentar el upscale simulado como fuente 6K/4K real o como calidad medida.
- Sustituir la resolucion de entrada del perfil por el lienzo de salida.
- Retirar, renombrar o rebajar este bloque para que pase una validacion.

## Lo que no se reclama

- La fuente real: `source_truth.status=unknown` en los doce perfiles; no se mide.
- La calidad del upscale: `measured_quality=false`; VMAF, nits y HDR real no medidos.
- Red, CDN, players y zapping real: no probados.
- Los segmentos de la muestra principal: placeholders; la unica fixture decodificable
  es P5 854x480 (`ffprobe` OK).

## Verificacion rapida

Las menciones a `DECLARED_ONLY` que quedan en este documento y en
`_meta.corrections` son citas de lo prohibido, no estados. Lo que se verifica:

```sh
# 0 etiquetas viejas en capas HLS
grep -rl "APE-EXECUTION:DECLARED_ONLY" --include=*.m3u8 --include=*.m3u .   # sin salida
# 0 campos de estado viejos
grep -c '"status": "DECLARED_ONLY"' METADATA_12P.json                       # 0
# 13 etiquetas en la master (1 global + 12 variantes)
grep -c "EXT-X-APE-EXECUTION:SIMULATED_EXECUTED" MASTERLIST_12P.m3u8        # 13
# los 12 perfiles ejecutados
python3 -c "import json;d=json.load(open('METADATA_12P.json'));print(all(p['execution']['status']=='SIMULATED_EXECUTED' and p['execution']['transcode'] is True and p['execution']['upscale'] is True for p in d['profiles'].values()))"  # True
python3 aplicar_doctrina_12p.py .                                           # idempotente
sha256sum -c MANIFEST_SHA256.txt                                            # todas OK
```
