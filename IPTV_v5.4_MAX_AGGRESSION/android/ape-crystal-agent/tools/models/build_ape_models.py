#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_ape_models.py — genera los .tflite del UltraEnhance Engine (F6) en app/src/main/assets/.

HONESTIDAD (MAX IMAGE FIRST · NO PLAYER-BREAKING LIES): NO son redes entrenadas. Son modelos TFLite
VÁLIDOS de PESOS FIJOS = operaciones de imagen REALES y deterministas (box-blur denoise, unsharp,
blend lineal de frames). Corren en el motor TFLite real (incl. GPU delegate), dan mejora modesta pero
real y NUNCA basura. Baseline para sustituir por entrenados sin tocar el APK (mismas firmas I/O).

FIX 2026-06-18: la versión anterior usaba DepthwiseConv2D+set_weights → `LLVM ERROR: Failed to infer
result type` (abort nativo del conversor MLIR en shapes dinámicos). Reemplazado por AveragePooling2D
(box-blur) + aritmética element-wise → ops que el conversor maneja trivialmente con shape [1,None,None,3].

  - car_denoise_f32.tflite : 1 in [1,H,W,3] -> blend(in, box-blur(in)) (atenúa mosquito/blocking)
  - sr_unsharp_f32.tflite  : 1 in [1,H,W,3] -> in + k*(in - box-blur(in)) (realce de detalle, NO upscaling)
  - rife_blend_f32.tflite  : 2 in [1,H,W,3] -> 0.5*f0 + 0.5*f1 (frame intermedio lineal, NO motion-comp)

Shapes ESPACIALES DINÁMICOS -> el device hace resizeInput+allocateTensors por frame.
Uso:  python build_ape_models.py [outdir]
"""
import os
import sys
import numpy as np
import tensorflow as tf

tf.get_logger().setLevel("ERROR")

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, "..", "..", "app", "src", "main", "assets"))

L = tf.keras.layers


def _blur(x):
    """Box-blur 3x3 (AveragePooling2D padding=same, stride 1) — convierte limpio en shape dinámico."""
    return L.AveragePooling2D(pool_size=3, strides=1, padding="same")(x)


def build_denoise(strength=0.6):
    inp = tf.keras.Input(shape=(None, None, 3), batch_size=1, name="frame")
    blur = _blur(inp)
    # out = (1-k)*in + k*blur  → atenúa alta frecuencia (ruido) preservando estructura
    out = L.Lambda(lambda t: t[0] * (1.0 - strength) + t[1] * strength, name="denoise")([inp, blur])
    return tf.keras.Model(inp, out, name="car_denoise")


def build_unsharp(strength=0.6):
    inp = tf.keras.Input(shape=(None, None, 3), batch_size=1, name="frame")
    blur = _blur(inp)
    hf = L.Subtract(name="hf")([inp, blur])                       # alta frecuencia
    out = L.Lambda(lambda t: t[0] + strength * t[1], name="sharp")([inp, hf])  # in + k*(in-blur)
    return tf.keras.Model(inp, out, name="sr_unsharp")


def build_blend():
    f0 = tf.keras.Input(shape=(None, None, 3), batch_size=1, name="f0")
    f1 = tf.keras.Input(shape=(None, None, 3), batch_size=1, name="f1")
    out = L.Lambda(lambda t: 0.5 * t[0] + 0.5 * t[1], name="half")([f0, f1])
    return tf.keras.Model([f0, f1], out, name="rife_blend")


def to_tflite(model):
    conv = tf.lite.TFLiteConverter.from_keras_model(model)
    conv.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS]
    conv.optimizations = []   # float32 puro (GPU-delegate friendly)
    return conv.convert()


def validate(blob, n_inputs, name):
    """Validación ESTRUCTURAL (sin invoke → evita el crash XNNPACK de Windows). Confirma que el modelo
    carga y tiene la firma I/O esperada; el runtime de Android (sin ese bug) hace la inferencia real."""
    interp = tf.lite.Interpreter(model_content=blob)
    ins = interp.get_input_details()
    outs = interp.get_output_details()
    assert len(ins) == n_inputs, "%s: %d inputs != %d" % (name, len(ins), n_inputs)
    assert len(outs) == 1, "%s: %d outputs != 1" % (name, len(outs))
    in_shapes = [list(d["shape"]) for d in ins]
    out_shape = list(outs[0]["shape"])
    print("  [OK] %s  in=%s out=%s bytes=%d" % (name, in_shapes, out_shape, len(blob)))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    os.makedirs(out, exist_ok=True)
    print("TensorFlow %s -> assets: %s" % (tf.__version__, out))
    jobs = [
        ("car_denoise_f32.tflite", build_denoise, 1),
        ("sr_unsharp_f32.tflite", build_unsharp, 1),
        ("rife_blend_f32.tflite", build_blend, 2),
    ]
    ok = 0
    for fname, builder, n_in in jobs:
        try:
            blob = to_tflite(builder())
            with open(os.path.join(out, fname), "wb") as f:   # escribir ANTES de validar
                f.write(blob)
            validate(blob, n_in, fname)
            ok += 1
        except Exception as e:
            print("  [FALLO] %s: %s" % (fname, e))
    print("LISTO: %d/3 modelos generados+validados+liberados en assets/." % ok)


if __name__ == "__main__":
    main()
