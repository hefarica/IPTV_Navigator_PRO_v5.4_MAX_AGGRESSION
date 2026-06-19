package com.ape.crystalagent

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.CompatibilityList
import org.tensorflow.lite.gpu.GpuDelegate
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

/**
 * Wrapper TFLite genérico con GPU delegate automático (fallback CPU). Soporta modelos de 1 entrada
 * (denoise/unsharp) y 2 entradas (blend). El modelo se carga de assets/; si no existe → load()=false
 * (motor OFF, autopista). Float32 NHWC [0..1]. Los modelos tienen shape espacial DINÁMICO → se hace
 * resizeInput+allocateTensors por frame (cacheado por tamaño; solo re-aloca cuando cambia W×H).
 */
class TfliteInferenceEngine(
    private val ctx: Context,
    private val modelName: String,
    private val useGpu: Boolean = true
) {
    private var interpreter: Interpreter? = null
    private var gpuDelegate: GpuDelegate? = null
    private var lastW = -1
    private var lastH = -1

    private fun ensureShape(interp: Interpreter, nInputs: Int, w: Int, h: Int) {
        if (w == lastW && h == lastH) return
        val shape = intArrayOf(1, h, w, 3)
        for (i in 0 until nInputs) interp.resizeInput(i, shape)
        interp.allocateTensors()
        lastW = w; lastH = h
    }

    fun load(): Boolean = runCatching {
        val model = loadModelFile()
        val opts = Interpreter.Options()
        if (useGpu) {
            runCatching {
                val compat = CompatibilityList()
                if (compat.isDelegateSupportedOnThisDevice) {
                    gpuDelegate = GpuDelegate(compat.bestOptionsForThisDevice)
                    opts.addDelegate(gpuDelegate)
                    Log.i(TAG, "$modelName: GPU delegate")
                } else { opts.numThreads = 4; Log.i(TAG, "$modelName: CPU x4 (GPU n/a)") }
            }.onFailure { opts.numThreads = 4; Log.w(TAG, "$modelName: GPU delegate err → CPU: ${it.message}") }
        } else opts.numThreads = 4
        interpreter = Interpreter(model, opts)
        Log.i(TAG, "$modelName cargado OK")
        true
    }.getOrElse { Log.w(TAG, "$modelName load: ${it.message}"); false }

    /** Inferencia 1 entrada (denoise / unsharp). */
    fun infer(input: Bitmap): Bitmap? = runCatching {
        val interp = interpreter ?: return null
        ensureShape(interp, 1, input.width, input.height)
        val out = interp.getOutputTensor(0).shape()      // [1,H,W,3]
        val h = out[1]; val w = out[2]
        val outBuf = ByteBuffer.allocateDirect(h * w * 3 * 4).order(ByteOrder.nativeOrder())
        interp.run(toBuffer(input), outBuf)
        toBitmap(outBuf, w, h)
    }.getOrElse { Log.w(TAG, "$modelName infer1: ${it.message}"); null }

    /** Inferencia 2 entradas (blend: f0+f1 → mid). */
    fun infer(f0: Bitmap, f1: Bitmap): Bitmap? = runCatching {
        val interp = interpreter ?: return null
        ensureShape(interp, 2, f0.width, f0.height)
        val out = interp.getOutputTensor(0).shape()
        val h = out[1]; val w = out[2]
        val outBuf = ByteBuffer.allocateDirect(h * w * 3 * 4).order(ByteOrder.nativeOrder())
        val inputs = arrayOf<Any>(toBuffer(f0), toBuffer(f1))
        val outputs = HashMap<Int, Any>(); outputs[0] = outBuf
        interp.runForMultipleInputsOutputs(inputs, outputs)
        toBitmap(outBuf, w, h)
    }.getOrElse { Log.w(TAG, "$modelName infer2: ${it.message}"); null }

    private fun loadModelFile(): MappedByteBuffer {
        ctx.assets.openFd(modelName).use { afd ->
            afd.createInputStream().use { fis ->
                return fis.channel.map(FileChannel.MapMode.READ_ONLY, afd.startOffset, afd.declaredLength)
            }
        }
    }

    private fun toBuffer(bmp: Bitmap): ByteBuffer {
        val buf = ByteBuffer.allocateDirect(bmp.width * bmp.height * 3 * 4).order(ByteOrder.nativeOrder())
        val px = IntArray(bmp.width * bmp.height)
        bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
        for (p in px) {
            buf.putFloat(((p shr 16) and 0xFF) / 255f)
            buf.putFloat(((p shr 8) and 0xFF) / 255f)
            buf.putFloat((p and 0xFF) / 255f)
        }
        buf.rewind(); return buf
    }

    private fun toBitmap(buf: ByteBuffer, w: Int, h: Int): Bitmap {
        buf.rewind()
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val px = IntArray(w * h)
        for (i in px.indices) {
            val r = (buf.float.coerceIn(0f, 1f) * 255).toInt()
            val g = (buf.float.coerceIn(0f, 1f) * 255).toInt()
            val b = (buf.float.coerceIn(0f, 1f) * 255).toInt()
            px[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
        }
        bmp.setPixels(px, 0, w, 0, 0, w, h)
        return bmp
    }

    fun close() { runCatching { interpreter?.close() }; runCatching { gpuDelegate?.close() } }
    companion object { const val TAG = "ApeTfliteEngine" }
}
