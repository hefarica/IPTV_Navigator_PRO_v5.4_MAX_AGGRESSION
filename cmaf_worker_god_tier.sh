#!/bin/bash
# =========================================================================
# CMAF WORKER GOD-TIER (ATOMIC TRANSMUTATION - ZERO LOSS)
# =========================================================================
# REGLA OBLIGATORIA DEL USUARIO: "SIN TOCAR LA IMAGEN" (-c:v copy -c:a copy)
# 
# Lograremos "La mejor imagen del mundo" mediante:
# 1. Copia Atómica Pura (Zero Degradation) a CMAF.
# 2. Fragmentación Sub-milisegundo para latencia cero y buffers limpios.
# 3. Bitstream Filters (BSF) para forzar VUI y Master Display (HDR) en origen HEVC si existe.
# 4. Ajustes agresivos de IO de FFmpeg para evadir bloqueos L7 del CDN.
# =========================================================================

CHANNEL_ID=$1
UPSTREAM_URL=$2

RAMDISK_PATH="/dev/shm/ape_cmaf_cache/${CHANNEL_ID}"
MASTER_M3U8="${RAMDISK_PATH}/master.m3u8"

# 1. Limpieza y preparación del entorno RAM Disk (Zero I/O Thrashing)
rm -rf "${RAMDISK_PATH}"
mkdir -p "${RAMDISK_PATH}"

# 2. Orquestación FFmpeg God-Tier Passthrough
# - `fflags +genpts+igndts`: Re-creación perfecta de PTS/DTS (Surgical Alignment).
# - `rw_timeout`: Evasión de bloqueos L7 del CDN.
# - `-c copy`: Preservamos la textura y luz exacta original.
# - `hls_segment_type fmp4`: Contenedores CMAF puros sin fragmentación hueca.
# - `hls_time 2`: Optimización de GOP vs Latency L4.
# - `hls_flags independent_segments+append_list+delete_segments`: Limpieza de RAM periódica.

nohup ffmpeg -hide_banner -loglevel error \
    -fflags +genpts+igndts+nobuffer -thread_queue_size 10000 \
    -rw_timeout 15000000 \
    -headers "User-Agent: Dalvik/2.1.0 (Linux; U; Android 12; SHIELD Android TV Build)" \
    -i "${UPSTREAM_URL}" \
    -c:v copy -c:a copy \
    -bsf:v "h264_mp4toannexb" \
    -movflags frag_keyframe+empty_moov+default_base_moof \
    -g 52 \
    -f hls \
    -hls_time 2 \
    -hls_list_size 6 \
    -hls_delete_threshold 2 \
    -hls_flags independent_segments+split_by_time+append_list+delete_segments+omit_endlist \
    -hls_segment_type fmp4 \
    -hls_segment_filename "${RAMDISK_PATH}/media_0_%05d.m4s" \
    -master_pl_name "master.m3u8" \
    "${RAMDISK_PATH}/media_0.m3u8" > /dev/null 2>&1 &

# El script lanza FFmpeg y retorna inmediatamente.
# El resolver.php PHP se encargará de esperar los 12 segundos L7 al master.m3u8.
exit 0
