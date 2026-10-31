package com.ape.fluid;

import android.content.Context;
import android.content.SharedPreferences;
import android.opengl.GLES20;

import androidx.media3.common.VideoFrameProcessingException;
import androidx.media3.common.util.GlProgram;
import androidx.media3.common.util.GlUtil;
import androidx.media3.common.util.Size;
import androidx.media3.effect.BaseGlShaderProgram;
import androidx.media3.effect.GlEffect;
import androidx.media3.effect.GlShaderProgram;
import androidx.media3.effect.RgbAdjustment;

/** Spatial SDR enhancement with bounded aspect-preserving GPU scaling. */
public final class CrystalGlEffect implements GlEffect {
    private final float sharpen;
    private final float denoise;
    private final float vibrance;
    private final float localContrast;
    private final int targetWidth;
    private final int targetHeight;

    public CrystalGlEffect(float sharpen, float denoise, float vibrance,
                           float localContrast, int targetWidth, int targetHeight) {
        this.sharpen = bounded(sharpen, 1f);
        this.denoise = bounded(denoise, 1f);
        this.vibrance = bounded(vibrance, 0.15f);
        this.localContrast = bounded(localContrast, 0.20f);
        this.targetWidth = Math.max(0, targetWidth);
        this.targetHeight = Math.max(0, targetHeight);
    }

    @Override public GlShaderProgram toGlShaderProgram(Context context, boolean useHdr)
            throws VideoFrameProcessingException {
        if (useHdr) {
            // Preserve Media3's HDR handling. The SDR shader and requested SDR
            // enlargement are deliberately not inserted into the HDR path.
            preferences(context).edit()
                    .putBoolean("crystal_hdr_passthrough", true)
                    .putBoolean("crystal_upscale_active", false)
                    .remove("crystal_input_width").remove("crystal_input_height")
                    .remove("crystal_output_width").remove("crystal_output_height")
                    .apply();
            return new RgbAdjustment.Builder().build().toGlShaderProgram(context, true);
        }
        return new Program(context, sharpen, denoise, vibrance, localContrast,
                targetWidth, targetHeight);
    }

    @Override public boolean isNoOp(int inputWidth, int inputHeight) {
        boolean scaleRequested = targetWidth > inputWidth && targetHeight > inputHeight
                && inputWidth > 0 && inputHeight > 0;
        return !scaleRequested && sharpen == 0f && denoise == 0f
                && vibrance == 0f && localContrast == 0f;
    }

    private static float bounded(float value, float maximum) {
        if (Float.isNaN(value) || Float.isInfinite(value)) return 0f;
        return Math.max(0f, Math.min(maximum, value));
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences("ape_fluid", Context.MODE_PRIVATE);
    }

    private static final class Program extends BaseGlShaderProgram {
        private final GlProgram glProgram;
        private final SharedPreferences preferences;
        private final float sharpen;
        private final float denoise;
        private final float vibrance;
        private final float localContrast;
        private final int targetWidth;
        private final int targetHeight;
        private final float[] texelSize = {1f, 1f};
        private int inputWidth = 1;
        private int inputHeight = 1;
        private int outputWidth = 1;
        private int outputHeight = 1;
        private boolean bicubic;
        private boolean released;

        Program(Context context, float sharpen, float denoise, float vibrance,
                float localContrast, int targetWidth, int targetHeight)
                throws VideoFrameProcessingException {
            // SDR output uses the existing eight-bit Media3 texture path.
            super(false, 1);
            this.preferences = preferences(context);
            this.sharpen = sharpen;
            this.denoise = denoise;
            this.vibrance = vibrance;
            this.localContrast = localContrast;
            this.targetWidth = targetWidth;
            this.targetHeight = targetHeight;
            GlProgram loaded = null;
            try {
                loaded = new GlProgram(context, "shaders/ape_vertex.glsl",
                        "shaders/crystal_uhd_fragment.glsl");
                loaded.setBufferAttribute("aFramePosition", GlUtil.getNormalizedCoordinateBounds(), 4);
            } catch (Exception error) {
                if (loaded != null) {
                    try { loaded.delete(); } catch (GlUtil.GlException ignored) { }
                }
                throw new VideoFrameProcessingException(error);
            }
            glProgram = loaded;
        }

        @Override public Size configure(int width, int height) throws VideoFrameProcessingException {
            if (released) throw new VideoFrameProcessingException("Crystal effect has been released");
            if (width <= 0 || height <= 0) {
                throw new VideoFrameProcessingException("Crystal effect requires positive input dimensions");
            }
            inputWidth = width;
            inputHeight = height;
            outputWidth = width;
            outputHeight = height;
            texelSize[0] = 1f / width;
            texelSize[1] = 1f / height;

            int[] maximum = new int[1];
            int[] precision = new int[1];
            int[] range = new int[2];
            boolean limitsAvailable = false;
            try {
                GLES20.glGetIntegerv(GLES20.GL_MAX_TEXTURE_SIZE, maximum, 0);
                GLES20.glGetShaderPrecisionFormat(GLES20.GL_FRAGMENT_SHADER,
                        GLES20.GL_HIGH_FLOAT, range, 0, precision, 0);
                GlUtil.checkGlError();
                limitsAvailable = maximum[0] > 0;
            } catch (GlUtil.GlException ignored) {
                // Failed capability queries must not cause speculative scaling.
            }
            boolean highPrecision = limitsAvailable && precision[0] > 0;
            if (limitsAvailable && (width > maximum[0] || height > maximum[0])) {
                throw new VideoFrameProcessingException("Input exceeds the GPU texture-size limit");
            }
            if (highPrecision && targetWidth > 0 && targetHeight > 0) {
                double targetScale = Math.min((double) targetWidth / width,
                        (double) targetHeight / height);
                double textureScale = Math.min((double) maximum[0] / width,
                        (double) maximum[0] / height);
                double scale = Math.min(2.0, Math.min(targetScale, textureScale));
                if (scale > 1.0) {
                    // Floor avoids exceeding either target or texture bounds.
                    // Integer rounding changes the ideal ratio by at most a pixel.
                    outputWidth = Math.max(width, (int) Math.floor(width * scale));
                    outputHeight = Math.max(height, (int) Math.floor(height * scale));
                }
            }
            bicubic = outputWidth != inputWidth || outputHeight != inputHeight;
            preferences.edit()
                    .putInt("crystal_input_width", inputWidth)
                    .putInt("crystal_input_height", inputHeight)
                    .putInt("crystal_output_width", outputWidth)
                    .putInt("crystal_output_height", outputHeight)
                    .putInt("crystal_max_texture_size", maximum[0])
                    .putBoolean("crystal_highp", highPrecision)
                    .putBoolean("crystal_hdr_passthrough", false)
                    .putBoolean("crystal_upscale_active", bicubic)
                    .apply();
            return new Size(outputWidth, outputHeight);
        }

        @Override public void drawFrame(int inputTexId, long presentationTimeUs)
                throws VideoFrameProcessingException {
            if (released) throw new VideoFrameProcessingException("Crystal effect has been released", presentationTimeUs);
            try {
                glProgram.use();
                glProgram.setSamplerTexIdUniform("uTexSampler", inputTexId, 0);
                glProgram.setFloatsUniform("uTexelSize", texelSize);
                glProgram.setFloatUniform("uSharpen", sharpen);
                glProgram.setFloatUniform("uDenoise", denoise);
                glProgram.setFloatUniform("uVibrance", vibrance);
                glProgram.setFloatUniform("uLocalContrast", localContrast);
                glProgram.setFloatUniform("uBicubic", bicubic ? 1f : 0f);
                // In bundled Media3 1.3.1 this binds sampler2D through
                // GlUtil.bindTexture: MIN/MAG = GL_LINEAR, WRAP_S/T =
                // GL_CLAMP_TO_EDGE. The four-fetch B-spline relies on these
                // states, which are refreshed here before every draw.
                glProgram.bindAttributesAndUniforms();
                GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
                GlUtil.checkGlError();
            } catch (GlUtil.GlException error) {
                throw new VideoFrameProcessingException(error, presentationTimeUs);
            }
        }

        @Override public void release() throws VideoFrameProcessingException {
            if (released) return;
            released = true;
            VideoFrameProcessingException failure = null;
            try {
                super.release();
            } catch (VideoFrameProcessingException error) {
                failure = error;
            }
            try {
                glProgram.delete();
            } catch (GlUtil.GlException error) {
                if (failure == null) failure = new VideoFrameProcessingException(error);
            }
            if (failure != null) throw failure;
        }
    }
}
