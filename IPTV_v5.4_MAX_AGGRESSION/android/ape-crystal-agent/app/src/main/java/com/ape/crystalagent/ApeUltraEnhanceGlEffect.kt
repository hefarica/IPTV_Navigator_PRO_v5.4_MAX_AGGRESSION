package com.ape.crystalagent

import android.content.Context
import android.opengl.GLES20
import androidx.media3.common.VideoFrameProcessingException
import androidx.media3.common.util.GlProgram
import androidx.media3.common.util.GlUtil
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BaseGlShaderProgram
import androidx.media3.effect.GlEffect
import androidx.media3.effect.GlShaderProgram

/**
 * FRAME-FEED REAL (F3+F6): UltraEnhance corriendo GPU-directo sobre CADA frame del video del player,
 * vía el pipeline media3-effect (sin Bitmap, sin round-trip CPU). Es la "recodificación SW en vivo":
 * post-decode, on-device, perceptual de borde (denoise + unsharp) — nunca vuelve a la red.
 *
 * Se enchufa con player.setVideoEffects(listOf(ApeUltraEnhanceGlEffect(...))). Autopista: si el shader
 * fallara, media3 propaga VideoFrameProcessingException y ExoPlayer cae a render nativo (no rompe la repro).
 */
@UnstableApi
class ApeUltraEnhanceGlEffect(
    private val sharpen: Float = 0.6f,
    private val denoise: Float = 0.2f
) : GlEffect {

    override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram =
        Program(context, useHdr, sharpen, denoise)

    private class Program(
        context: Context, useHdr: Boolean,
        private val sharpen: Float, private val denoise: Float
    ) : BaseGlShaderProgram(useHdr, /* texturePoolCapacity= */ 1) {

        private val glProgram: GlProgram = try {
            GlProgram(context, "shaders/ape_vertex.glsl", "shaders/ape_enhance_fragment.glsl")
        } catch (e: Exception) {
            throw VideoFrameProcessingException(e)
        }
        private var w = 1
        private var h = 1

        override fun configure(inputWidth: Int, inputHeight: Int): Size {
            w = inputWidth.coerceAtLeast(1)
            h = inputHeight.coerceAtLeast(1)
            return Size(inputWidth, inputHeight)   // mismo tamaño (post-proceso, no upscaling de buffer)
        }

        override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
            try {
                glProgram.use()
                glProgram.setSamplerTexIdUniform("uTexSampler", inputTexId, /* texUnitIndex= */ 0)
                glProgram.setFloatsUniform("uTexelSize", floatArrayOf(1f / w, 1f / h))
                glProgram.setFloatUniform("uSharpen", sharpen)
                glProgram.setFloatUniform("uDenoise", denoise)
                glProgram.setBufferAttribute(
                    "aFramePosition",
                    GlUtil.getNormalizedCoordinateBounds(),
                    GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
                )
                glProgram.bindAttributesAndUniforms()
                GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, /* first= */ 0, /* count= */ 4)
                GlUtil.checkGlError()
            } catch (e: GlUtil.GlException) {
                throw VideoFrameProcessingException(e, presentationTimeUs)
            }
        }

        override fun release() {
            super.release()
            try { glProgram.delete() } catch (e: GlUtil.GlException) { throw VideoFrameProcessingException(e) }
        }
    }
}
