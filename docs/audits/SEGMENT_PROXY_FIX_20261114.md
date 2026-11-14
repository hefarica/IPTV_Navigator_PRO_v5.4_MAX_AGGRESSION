# EVIDENCIA DEL ARREGLO — proxy de segmentos /seg/ · 2026-11-14

## Sintoma que reporto el operador
"LA RESOLUCION DEL CANAL ES SD, PERO LA PANTALLA ES 4K Y NO LO AJUSTA A LA
RELACION DEL TV, POR LO TANTO SE VE UN CUADRO DE IMAGEN MUY PEQUENO"
Captura previa: artifacts/quality_now.png (47.127 B) -> "Buffering: 0%", fondo negro.

## Causa raiz, medida en los dos extremos
Manifest: 200 por el VPS, 677 B, valido, x-ape-pulse: cache=hit
Segmentos apuntaban a: http://103.252.221.159:80/hls/<hash>/1312008_NNN.ts

  DESDE EL DEVICE (ONN 4K 192.168.1.3):
    ping 103.252.221.159 -> 2/2 paquetes, 0% loss, rtt 202 ms
    puerto 80            -> CERRADO
  DESDE EL VPS:
    puerto 80 -> http=200  bytes=13.130.672  ttfb=0.254 s

El VPS alcanzaba el video, el device no. Manifest si, segmentos no.

## Por que existia el candado que bloqueaba el camino
sites-enabled-default.conf:42
  location ~ ^/cdn/.*\.(ts|m4s|mp4)$ { return 404; }
Comentario literal en el conf: "el gateway descargaba y devolvia video POR EL VPS
(corrupto por el rebase)". El candado protegia de una implementacion que
TRANSFORMABA bytes. Se mantiene intacto.

## Arreglo desplegado
1) pulse.php  ape_seg_serve()          -> /seg/<b64url>, escribe al output los bytes
                                          que curl lee (CURLOPT_RETURNTRANSFER=false).
                                          Cero rebase, cero filtro, cero recompresion.
2) pulse.php  ape_pulse_route_segments() -> reescribe las URIs del media playlist a
                                          /seg/<b64url> RELATIVO (sin hardcodear host).
3) url2-cartridge.conf  location ^~ /seg/ -> /prisma/api/pulse.php

## Dos defectos de despliegue encontrados por el camino
A) url2-cartridge.conf NO estaba en _vps_stage/deploy/manifest.tsv: el deploy daba
   success sin copiar nada. Un deploy verde puede no haber hecho nada.
B) El fichero del repo YA difería del desplegado (repo 71f1f670 vs VPS 7b1a7a15).
   Meterlo "tal cual" habria pisado produccion. Se resolvio trayendo el fichero real
   por base64, verificando sha256 byte a byte (7b1a7a15 IDENTICO) y anadiendo el
   bloque /seg/ encima. Repo resultante: sha256 cbfae5e26c335e3d...

## Medicion DESPUES (run 43603766513, todos los jobs success)
nginx -T tiene /seg/                      : 1 ocurrencia
manifest -> segmentos /seg/               : 6 de 6 · 0 crudos
GET /seg/<b64>                            : HTTP 200 · content-type video/mp2t
                                            x-ape-seg: served;raw=1
                                            12.503.316 B
primeros 8 bytes                          : 47 40 11 18 00 42 f0 25
sync 0x47 en byte 0 y byte 188            : 47 y 47  (MPEG-TS valido)
bitrate medido                            : 20 segs / 285.562.174 B
                                            13,62 MB/seg = 11,42 Mbps (a 10 s/seg)

## Composicion en pantalla (la prueba de que se ve)
SurfaceView[studio.scillarium.ottnavigator/.PlayerActivity]#25182
displayFrame=[0 0 3840 2160]              <- PANTALLA COMPLETA 4K
sourceCrop=[0 0 3840.000000 2160.000000]
dataspace=BT2020_ITU_PQ (298188800)       <- HDR10 / BT.2020 PQ
CPU del player                            : 70,2 %
Audio                                     : [c2.android.aac.decoder#607]
Playback                                  : VideoRenderQualityTracker: content time
                                            jumped 420 ms forward (200 -> 620)

## FALSO NEGATIVO que casi me engana
screencap devuelve 46.744 B (pantalla casi vacia) TAMBIEN con el video reproduciendo.
screencap NO captura una SurfaceView compuesta por hardware. Lo advirtio t56:
"screencap captura el buffer de composicion ANTES del VPP y del HDMI".
La imagen esta en el televisor; el PNG no la ve. No usar screencap para verificar video.

## Lo que NO esta arreglado
- zapping p50 0,650 s · p90 5,043 s · p99 7,180 s (los 502 del proveedor, t53: 75,2 %)
- display base 1920x1080 con rng tope 1920: sin root no se sube a 4K de composicion
- OttShim sin sesion (OTT Navigator no registra MediaSession) -> /source.m3u8 no sirve
- latencia de primer frame en device: NO_COMPUTADO (no se midio con instrumentacion)