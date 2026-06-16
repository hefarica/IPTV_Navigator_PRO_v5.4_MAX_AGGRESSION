#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════
# APE — ASR → TRADUCCIÓN → SUBTÍTULOS LIVE (MOTOR 4) · backend conmutable
#
# Captura el audio de los segmentos YA TRANSITANDO/CACHEADOS por el intercept del
# VPS (NO abre 2ª conexión al proveedor → evita HTTP 509), lo transcribe, lo
# traduce al idioma del setting del player y publica un WebVTT rodante en /dev/shm
# que nginx sirve por LINK 2 (#EXT-X-MEDIA:TYPE=SUBTITLES). Por-canal (1 worker
# compartido entre todos los viewers de ese canal, NO por sesión).
#
# BACKEND CONMUTABLE (council: 1-canal on-box vs offload):
#   --backend local   : faster-whisper int8 on-box. PILOTO ~1 canal en CPX21
#                       (3vCPU/4GB, sin GPU), latencia 3-6s, precisión degradada.
#   --backend offload : POST del chunk de audio a un GPU box / API; escala a N
#                       canales. Recomendado para producción multi-canal.
#
# LEGAL/ÉTICA (S10 council): accesibilidad EFÍMERA sobre contenido AUTORIZADO.
#   - hereda el gate de autorización del sistema (no abre uno propio),
#   - output RAM-only TTL corto (NUNCA persiste/cataloga/redistribuye la obra),
#   - 1 transcripción por canal, ring-buffer de cues, sin dataset.
# AUTOPISTA: corre como daemon async FUERA del path de reproducción; jamás frena
#   el stream (el tap es read-only sobre segmentos ya en /dev/shm).
# ══════════════════════════════════════════════════════════════════════════
from __future__ import annotations
import argparse
import os
import subprocess
import sys
import time
from collections import deque

# Dependencias pesadas se importan LAZY dentro de cada backend (py_compile-safe,
# y el worker arranca aunque falten — reporta y no rompe el VPS).


def log(msg: str) -> None:
    sys.stderr.write("[ape-asr][{}] {}\n".format(time.strftime("%H:%M:%S"), msg))
    sys.stderr.flush()


def fmt_ts(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return "{:02d}:{:02d}:{:06.3f}".format(h, m, s)


def probe_duration(segment_path: str, fallback: float) -> float:
    # Duración REAL del segmento (ffprobe) → evita drift del subtítulo vs audio
    # cuando TARGETDURATION != --segment-sec (council S5 2026-06-11).
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration",
           "-of", "default=noprint_wrappers=1:nokey=1", segment_path]
    try:
        r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
        d = float((r.stdout or b"").decode("utf-8", "ignore").strip() or "0")
        return d if d > 0 else fallback
    except Exception:
        return fallback


def extract_audio_wav(segment_path: str, wav_out: str) -> bool:
    # ffmpeg: solo audio, 16kHz mono PCM (lo que pide Whisper). READ-ONLY sobre el .ts.
    cmd = ["ffmpeg", "-nostdin", "-y", "-i", segment_path,
           "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", wav_out]
    try:
        r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
        return r.returncode == 0 and os.path.isfile(wav_out) and os.path.getsize(wav_out) > 0
    except Exception as exc:
        log("ffmpeg fail: {}".format(exc))
        return False


# ── BACKENDS ──────────────────────────────────────────────────────────────
class LocalBackend:
    """faster-whisper int8 on-box (PILOTO 1 canal). Lazy import."""
    def __init__(self, model_name: str, target_lang: str):
        self.target_lang = target_lang
        self._model = None
        self._model_name = model_name
        self._translator = None

    def _ensure(self):
        if self._model is None:
            from faster_whisper import WhisperModel  # lazy
            # int8 = la única forma viable en CPU sin GPU
            self._model = WhisperModel(self._model_name, device="cpu", compute_type="int8")
            log("faster-whisper '{}' int8 cargado (CPU)".format(self._model_name))

    def transcribe_translate(self, wav_path: str):
        self._ensure()
        # Whisper task=translate va SIEMPRE a inglés. Para idioma arbitrario del player:
        # transcribimos en idioma origen y traducimos aparte (argos/NLLB) si target != en.
        segments, info = self._model.transcribe(wav_path, vad_filter=True, beam_size=1)
        out = []
        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            translated = self._translate(text, info.language, self.target_lang)
            out.append((seg.start, seg.end, translated))
        return out

    def _translate(self, text: str, src: str, tgt: str) -> str:
        if not tgt or tgt == src or tgt == "orig":
            return text
        if self._translator is None:
            try:
                import argostranslate.translate as at  # lazy, opcional
                self._translator = at
            except Exception:
                self._translator = False
                log("traductor local no disponible → texto en idioma origen")
        if self._translator:
            try:
                return self._translator.translate(text, src, tgt)
            except Exception:
                return text
        return text


class OffloadBackend:
    """POST del audio a un GPU box / API. Escala a N canales. Lazy import requests."""
    def __init__(self, url: str, target_lang: str, token: str = ""):
        self.url = url
        self.target_lang = target_lang
        self.token = token

    def transcribe_translate(self, wav_path: str):
        import requests  # lazy
        with open(wav_path, "rb") as f:
            data = f.read()
        headers = {"X-Target-Lang": self.target_lang}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        r = requests.post(self.url, data=data,
                          headers={**headers, "Content-Type": "audio/wav"}, timeout=20)
        r.raise_for_status()
        j = r.json()
        # contrato esperado del offload: {"cues":[{"start":s,"end":e,"text":t}]}
        return [(c.get("start", 0.0), c.get("end", 0.0), c.get("text", "")) for c in j.get("cues", [])]


# ── WebVTT rodante (efímero, ring-buffer en /dev/shm) ──────────────────────
class RollingVTT:
    def __init__(self, out_path: str, max_cues: int = 40):
        self.out_path = out_path
        self.cues = deque(maxlen=max_cues)   # solo los últimos N → efímero, sin histórico
        self._n = 0

    def add(self, start: float, end: float, text: str):
        if not text.strip():
            return
        self._n += 1
        self.cues.append((self._n, start, end, text.strip()))
        self._flush()

    def _flush(self):
        body = ["WEBVTT", ""]
        for n, s, e, t in self.cues:
            body.append(str(n))
            body.append("{} --> {}".format(fmt_ts(s), fmt_ts(e)))
            body.append(t)
            body.append("")
        tmp = self.out_path + ".tmp"
        d = os.path.dirname(self.out_path)
        if d and not os.path.isdir(d):
            os.makedirs(d, exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as f:
            f.write("\n".join(body))
        os.replace(tmp, self.out_path)   # escritura atómica


def make_backend(args):
    if args.backend == "offload":
        if not args.offload_url:
            log("ERROR: --backend offload requiere --offload-url")
            sys.exit(2)
        return OffloadBackend(args.offload_url, args.target_lang, args.offload_token)
    return LocalBackend(args.model, args.target_lang)


def run(args) -> int:
    backend = make_backend(args)
    vtt = RollingVTT(args.out_vtt, max_cues=args.max_cues)
    processed = set()           # segmentos ya transcritos (dedup por-canal)
    base_ts = 0.0
    wav_tmp = os.path.join("/dev/shm", "ape_asr_{}.wav".format(os.getpid()))
    log("worker canal={} backend={} target={} → {}".format(args.channel_key, args.backend, args.target_lang, args.out_vtt))

    idle = 0
    while True:
        try:
            if not os.path.isdir(args.segments_dir):
                time.sleep(args.poll_sec); idle += 1
                if idle * args.poll_sec > args.max_idle_sec:
                    log("canal inactivo > {}s → salgo (efímero)".format(args.max_idle_sec)); break
                continue
            segs = sorted(s for s in os.listdir(args.segments_dir)
                          if s.endswith((".ts", ".m4s", ".aac")) and s not in processed)
            if not segs:
                time.sleep(args.poll_sec); idle += 1
                if idle * args.poll_sec > args.max_idle_sec:
                    log("sin segmentos nuevos > {}s → salgo".format(args.max_idle_sec)); break
                continue
            idle = 0
            for seg in segs[-args.batch:]:
                path = os.path.join(args.segments_dir, seg)
                processed.add(seg)
                if not extract_audio_wav(path, wav_tmp):
                    continue
                try:
                    cues = backend.transcribe_translate(wav_tmp)
                except Exception as exc:
                    log("ASR backend error: {}".format(exc)); continue
                for (s, e, t) in cues:
                    vtt.add(base_ts + s, base_ts + e, t)
                # avance de timeline con la duración REAL del segmento (anti-drift, council S5)
                base_ts += probe_duration(path, args.segment_sec)
                if len(processed) > 5000:           # acota memoria del set (efímero)
                    processed = set(list(processed)[-2000:])
        except KeyboardInterrupt:
            break
        except Exception as exc:
            log("loop error: {}".format(exc)); time.sleep(args.poll_sec)
    try:
        if os.path.isfile(wav_tmp):
            os.unlink(wav_tmp)
    except Exception:
        pass
    return 0


def build_argparser():
    p = argparse.ArgumentParser(description="APE Motor 4 — ASR→traducción→subtítulos live (backend conmutable)")
    p.add_argument("--channel-key", required=True, dest="channel_key")
    p.add_argument("--segments-dir", required=True, dest="segments_dir",
                   help="dir /dev/shm de segmentos YA cacheados del canal (read-only)")
    p.add_argument("--out-vtt", required=True, dest="out_vtt",
                   help="/dev/shm/ape_subs/<key>.<lang>.vtt (efímero, lo sirve nginx por Link 2)")
    p.add_argument("--target-lang", default="orig", dest="target_lang",
                   help="idioma del setting del player (es/en/pt/...); 'orig' = sin traducir")
    p.add_argument("--backend", choices=["local", "offload"], default="local")
    p.add_argument("--model", default="small", help="faster-whisper model (tiny/base/small) para --backend local")
    p.add_argument("--offload-url", default="", dest="offload_url")
    p.add_argument("--offload-token", default="", dest="offload_token")
    p.add_argument("--poll-sec", type=float, default=1.0, dest="poll_sec")
    p.add_argument("--segment-sec", type=float, default=3.0, dest="segment_sec")
    p.add_argument("--batch", type=int, default=2)
    p.add_argument("--max-cues", type=int, default=40, dest="max_cues")
    p.add_argument("--max-idle-sec", type=float, default=120.0, dest="max_idle_sec")
    return p


def main() -> int:
    args = build_argparser().parse_args()
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
