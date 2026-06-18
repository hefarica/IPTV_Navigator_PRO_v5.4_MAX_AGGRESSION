package com.ape.crystalagent

import android.content.Context
import android.graphics.Bitmap
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES20
import android.opengl.GLUtils
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * GLSL offscreen (Motor 4) — EGL14 pbuffer + GLES20 FBO. Dos passes:
 *  1) denoise bilateral (suaviza ruido MPEG, preserva bordes)
 *  2) unsharp mask (nitidez contornos/líneas)
 *
 * NOTA INGENIERÍA: este path Bitmap↔GL es la API CONCEPTUAL/test. En producción (F3) los mismos shaders
 * se ejecutan GPU-directo sobre el video vía `androidx.media3:media3-effect` (GlShaderProgram), sin Bitmap.
 * Render en el hilo que llame process() (con su propio EGL context). Autopista: error → null (passthrough).
 */
class GlslEnhancePipeline(private val ctx: Context) {

    @Volatile private var sharpness = 0.6f
    @Volatile private var denoise = 0.2f
    private var eglDisplay: EGLDisplay = EGL14.EGL_NO_DISPLAY
    private var eglContext: EGLContext = EGL14.EGL_NO_CONTEXT
    private var eglSurface: EGLSurface = EGL14.EGL_NO_SURFACE
    private var ready = false
    private val programs = HashMap<String, Int>()

    fun configure(sharpness: Float, denoise: Float) {
        this.sharpness = sharpness.coerceIn(0f, 1.5f)
        this.denoise = denoise.coerceIn(0f, 1f)
    }

    fun process(frame: Bitmap): Bitmap? = runCatching {
        if (!ensureEgl()) return null
        val pass1 = render(frame, denoiseFsh(denoise)) ?: frame
        render(pass1, unsharpFsh(sharpness))
    }.getOrElse { Log.w(TAG, "GLSL: ${it.message}"); null }

    // ── EGL ───────────────────────────────────────────────────────────────────
    @Synchronized private fun ensureEgl(): Boolean {
        if (ready) return true
        eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        if (eglDisplay == EGL14.EGL_NO_DISPLAY) return false
        val ver = IntArray(2)
        if (!EGL14.eglInitialize(eglDisplay, ver, 0, ver, 1)) return false
        val cfgAttr = intArrayOf(
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
            EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT,
            EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8,
            EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_NONE
        )
        val cfgs = arrayOfNulls<EGLConfig>(1); val n = IntArray(1)
        if (!EGL14.eglChooseConfig(eglDisplay, cfgAttr, 0, cfgs, 0, 1, n, 0) || n[0] == 0) return false
        eglContext = EGL14.eglCreateContext(
            eglDisplay, cfgs[0], EGL14.EGL_NO_CONTEXT,
            intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0
        )
        if (eglContext == EGL14.EGL_NO_CONTEXT) return false
        eglSurface = EGL14.eglCreatePbufferSurface(
            eglDisplay, cfgs[0], intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0
        )
        if (!EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext)) return false
        ready = true
        Log.i(TAG, "EGL pbuffer listo")
        return true
    }

    private fun render(src: Bitmap, fsh: String): Bitmap? {
        val w = src.width; val h = src.height
        // textura de entrada
        val inTex = genTex()
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, inTex)
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, src, 0)
        // textura de salida + FBO
        val outTex = genTex()
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, outTex)
        GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, w, h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null)
        val fbo = IntArray(1); GLES20.glGenFramebuffers(1, fbo, 0)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fbo[0])
        GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, outTex, 0)
        if (GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER) != GLES20.GL_FRAMEBUFFER_COMPLETE) {
            cleanup(intArrayOf(inTex, outTex), fbo); return null
        }
        GLES20.glViewport(0, 0, w, h)
        val prog = program(fsh)
        GLES20.glUseProgram(prog)
        // quad fullscreen (UV con flip vertical para que el readPixels quede top-down)
        val quad = floatBuf(floatArrayOf(
            -1f, -1f, 0f, 1f,
            1f, -1f, 1f, 1f,
            -1f, 1f, 0f, 0f,
            1f, 1f, 1f, 0f
        ))
        val aPos = GLES20.glGetAttribLocation(prog, "a_Position")
        val aUv = GLES20.glGetAttribLocation(prog, "a_UV")
        quad.position(0); GLES20.glEnableVertexAttribArray(aPos)
        GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 16, quad)
        quad.position(2); GLES20.glEnableVertexAttribArray(aUv)
        GLES20.glVertexAttribPointer(aUv, 2, GLES20.GL_FLOAT, false, 16, quad)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, inTex)
        GLES20.glUniform1i(GLES20.glGetUniformLocation(prog, "u_Tex"), 0)
        GLES20.glUniform2f(GLES20.glGetUniformLocation(prog, "u_TS"), 1f / w, 1f / h)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        // readback
        val buf = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder())
        GLES20.glReadPixels(0, 0, w, h, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, buf)
        val outBmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        buf.rewind(); outBmp.copyPixelsFromBuffer(buf)
        cleanup(intArrayOf(inTex, outTex), fbo)
        return outBmp
    }

    private fun program(fsh: String): Int = programs.getOrPut(fsh) {
        val vs = compile(GLES20.GL_VERTEX_SHADER, VERT)
        val fs = compile(GLES20.GL_FRAGMENT_SHADER, fsh)
        val p = GLES20.glCreateProgram()
        GLES20.glAttachShader(p, vs); GLES20.glAttachShader(p, fs); GLES20.glLinkProgram(p)
        GLES20.glDeleteShader(vs); GLES20.glDeleteShader(fs)
        p
    }

    private fun compile(type: Int, src: String): Int {
        val s = GLES20.glCreateShader(type)
        GLES20.glShaderSource(s, src); GLES20.glCompileShader(s)
        val ok = IntArray(1); GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0)
        if (ok[0] == 0) Log.w(TAG, "shader err: " + GLES20.glGetShaderInfoLog(s))
        return s
    }

    private fun genTex(): Int {
        val t = IntArray(1); GLES20.glGenTextures(1, t, 0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t[0])
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        return t[0]
    }

    private fun cleanup(texs: IntArray, fbo: IntArray) {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        GLES20.glDeleteFramebuffers(1, fbo, 0)
        GLES20.glDeleteTextures(texs.size, texs, 0)
    }

    private fun floatBuf(a: FloatArray): FloatBuffer =
        ByteBuffer.allocateDirect(a.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(a); rewind() }

    private fun denoiseFsh(strength: Float) = """
        precision mediump float;
        uniform sampler2D u_Tex; uniform vec2 u_TS; varying vec2 v_UV;
        void main() {
          vec4 c = texture2D(u_Tex, v_UV); vec4 sum = vec4(0.0); float w = 0.0;
          for (int x=-2;x<=2;x++){ for (int y=-2;y<=2;y++){
            vec2 o = vec2(float(x),float(y))*u_TS; vec4 s = texture2D(u_Tex, v_UV+o);
            float d = length(s.rgb-c.rgb);
            float ww = exp(-float(x*x+y*y)*0.5)*exp(-d*d/${(strength*0.04f).coerceAtLeast(0.0001f)});
            sum += s*ww; w += ww;
          }}
          gl_FragColor = (w>0.0)? sum/w : c;
        }
    """.trimIndent()

    private fun unsharpFsh(strength: Float) = """
        precision mediump float;
        uniform sampler2D u_Tex; uniform vec2 u_TS; varying vec2 v_UV;
        void main() {
          vec4 c = texture2D(u_Tex, v_UV);
          vec4 blur = texture2D(u_Tex, v_UV+vec2(-u_TS.x,0.0))*0.25
                    + texture2D(u_Tex, v_UV+vec2( u_TS.x,0.0))*0.25
                    + texture2D(u_Tex, v_UV+vec2(0.0,-u_TS.y))*0.25
                    + texture2D(u_Tex, v_UV+vec2(0.0, u_TS.y))*0.25;
          gl_FragColor = c + ${strength}*(c-blur);
        }
    """.trimIndent()

    fun release() {
        runCatching {
            if (eglDisplay != EGL14.EGL_NO_DISPLAY) {
                EGL14.eglMakeCurrent(eglDisplay, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
                if (eglSurface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(eglDisplay, eglSurface)
                if (eglContext != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(eglDisplay, eglContext)
                EGL14.eglTerminate(eglDisplay)
            }
        }
        ready = false
    }

    companion object {
        const val TAG = "ApeGlslPipeline"
        private const val VERT = """
            attribute vec2 a_Position; attribute vec2 a_UV; varying vec2 v_UV;
            void main() { v_UV = a_UV; gl_Position = vec4(a_Position, 0.0, 1.0); }
        """
    }
}
