package com.ape.rea;

import android.content.Context;
import android.opengl.GLES20;
import androidx.media3.common.VideoFrameProcessingException;
import androidx.media3.common.util.GlProgram;
import androidx.media3.common.util.GlUtil;
import androidx.media3.common.util.Size;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.effect.BaseGlShaderProgram;
import androidx.media3.effect.GlEffect;
import androidx.media3.effect.GlShaderProgram;

/** Adaptive spatial reconstruction for Media3 1.3.1.
 * HDR precondition: linear BT.2020, 1.0 == 10000 nits (PQ working domain).
 * The host must exclude HLG until it supplies the correct HLG OOTF/output contract.
 * This effect does not encode PQ, set display metadata, or invent HDR capability.
 * Geometry is fixed per instance; quality and image controls can change per frame.
 */
@UnstableApi
public final class ReaAdaptiveEffect implements GlEffect {
  public static final long TEXTURE_MARGIN_BYTES = 16L * 1024L * 1024L;
  public static final float HDR_REFERENCE_WHITE = .0203f;
  private static final double RESERVE_MULTIPLIER = 1.125;
  private final Context appContext;
  private final ReaState state;
  private final boolean upscale;
  private final int scaleLevel;
  private final int maxProcessingHeight;
  private final long memoryBudgetBytes;

  public ReaAdaptiveEffect(Context context, ReaState state, boolean upscale) {
    if (context == null || state == null) throw new IllegalArgumentException("Context and REA state required");
    Context application = context.getApplicationContext();
    this.appContext = application == null ? context : application;
    this.state = state;
    this.upscale = upscale;
    this.scaleLevel = clampInt(state.scaleLevel, 0, 2);
    this.maxProcessingHeight = state.maxProcessingHeight;
    this.memoryBudgetBytes = state.memoryBudgetBytes;
    if (maxProcessingHeight <= 0 || memoryBudgetBytes <= 0)
      throw new IllegalArgumentException("Positive processing height and texture budget required");
  }

  @Override public boolean isNoOp(int width, int height) {
    // Mutable controls must not let Media3 optimize this effect away permanently.
    return false;
  }

  @Override public GlShaderProgram toGlShaderProgram(Context context, boolean useHdr)
      throws VideoFrameProcessingException {
    return new Program(context == null ? appContext : context, useHdr);
  }

  private static int clampInt(int value, int min, int max) {
    return Math.max(min, Math.min(max, value));
  }

  private static float control(float value) {
    if (Float.isNaN(value) || Float.isInfinite(value)) return 0f;
    return Math.max(0f, Math.min(1f, value));
  }

  /** One input + two output textures, 12.5% driver reserve and 16 MiB margin.
   * Decoder, display, and other graph allocations are outside this effect budget.
   */
  public static long estimateTextureBytes(int width, int height, int outputWidth,
      int outputHeight, int bytesPerPixel) {
    if (width <= 0 || height <= 0 || outputWidth <= 0 || outputHeight <= 0 ||
        (bytesPerPixel != 4 && bytesPerPixel != 8))
      throw new IllegalArgumentException("Invalid texture dimensions or pixel size");
    double pixels = (double) width * height + 2.0 * outputWidth * outputHeight;
    double bytes = Math.ceil(pixels * bytesPerPixel * RESERVE_MULTIPLIER) + TEXTURE_MARGIN_BYTES;
    return bytes >= Long.MAX_VALUE ? Long.MAX_VALUE : (long) bytes;
  }

  public static final class Geometry {
    public final int width, height, requestedWidth, requestedHeight;
    public final long estimatedBytes;
    public final boolean limited;
    public final String reason;
    private Geometry(int width, int height, int requestedWidth, int requestedHeight,
        long estimatedBytes, boolean limited, String reason) {
      this.width = width; this.height = height;
      this.requestedWidth = requestedWidth; this.requestedHeight = requestedHeight;
      this.estimatedBytes = estimatedBytes; this.limited = limited; this.reason = reason;
    }
  }

  /** Pure geometry policy, also exercised by the desktop JVM validation harness.
   * Uses landscape-equivalent short-side tiers and preserves portrait/aspect ratio.
   * A constraint that cannot hold the native source rejects REA instead of reducing
   * source resolution. GL_MAX_RENDERBUFFER_SIZE does not cap a texture-backed FBO.
   */
  public static Geometry resolveGeometry(int width, int height, int scaleLevel,
      boolean upscale, int maxProcessingHeight, long memoryBudgetBytes,
      int maxTextureSize, int maxViewportWidth, int maxViewportHeight,
      int bytesPerPixel, boolean fragmentHighp) {
    if (width <= 0 || height <= 0 || maxProcessingHeight <= 0 || memoryBudgetBytes <= 0 ||
        maxTextureSize <= 0 || maxViewportWidth <= 0 || maxViewportHeight <= 0 ||
        (bytesPerPixel != 4 && bytesPerPixel != 8))
      throw new IllegalArgumentException("Invalid dimensions, GPU limits, or texture budget");
    if (width > maxTextureSize || height > maxTextureSize ||
        width > maxViewportWidth || height > maxViewportHeight)
      throw new IllegalArgumentException("Native source exceeds measured GPU limits; bypass REA");
    long nativeBytes = estimateTextureBytes(width, height, width, height, bytesPerPixel);
    if (nativeBytes > memoryBudgetBytes)
      throw new IllegalArgumentException("Native source exceeds REA texture budget; bypass REA");
    int shortSide = Math.min(width, height);
    int boxLong, boxShort;
    if (shortSide <= 720) { boxLong = 2560; boxShort = 1440; }
    else if (shortSide < 2160) { boxLong = 3840; boxShort = 2160; }
    else if (shortSide == 2160) { boxLong = 5760; boxShort = 3240; }
    else { boxLong = Math.max(width, height); boxShort = shortSide; }
    int boxWidth = width >= height ? boxLong : boxShort;
    int boxHeight = width >= height ? boxShort : boxLong;
    double targetScale = Math.max(1.0, Math.min((double) boxWidth / width, (double) boxHeight / height));
    int level = clampInt(scaleLevel, 0, 2);
    double requestedScale = !upscale || level == 0 ? 1.0 :
        (level == 1 ? 1.0 + (targetScale - 1.0) * .5 : targetScale);
    int requestedWidth = scaledDimension(width, requestedScale);
    int requestedHeight = scaledDimension(height, requestedScale);
    double textureScale = Math.min((double) maxTextureSize / width, (double) maxTextureSize / height);
    double viewportScale = Math.min((double) maxViewportWidth / width, (double) maxViewportHeight / height);
    // Preserve existing source pixels even when input already exceeds the height preference.
    double heightScale = Math.max(1.0, (double) maxProcessingHeight / shortSide);
    double rawBudget = (memoryBudgetBytes - TEXTURE_MARGIN_BYTES) / RESERVE_MULTIPLIER;
    double inputBytes = (double) width * height * bytesPerPixel;
    double memoryScale = Math.sqrt(Math.max(0.0, (rawBudget - inputBytes) / (2.0 * inputBytes)));
    double precisionScale = fragmentHighp ? requestedScale : 1.0;
    double scale = Math.min(requestedScale, Math.min(precisionScale,
        Math.min(heightScale, Math.min(textureScale, Math.min(viewportScale, memoryScale)))));
    if (scale < 1.0 - 1.0e-9)
      throw new IllegalArgumentException("Native source cannot be preserved within limits; bypass REA");
    scale = Math.max(1.0, scale);
    int outWidth = scaledDimension(width, scale), outHeight = scaledDimension(height, scale);
    long bytes = estimateTextureBytes(width, height, outWidth, outHeight, bytesPerPixel);
    if (bytes > memoryBudgetBytes)
      throw new IllegalArgumentException("Final texture estimate exceeds budget; bypass REA");
    boolean limited = outWidth < requestedWidth || outHeight < requestedHeight;
    StringBuilder reason = new StringBuilder();
    if (!fragmentHighp && requestedScale > 1.0) appendReason(reason, "fragment_highp");
    if (heightScale + 1.0e-9 < requestedScale) appendReason(reason, "processing_height");
    if (textureScale + 1.0e-9 < requestedScale) appendReason(reason, "texture");
    if (viewportScale + 1.0e-9 < requestedScale) appendReason(reason, "viewport");
    if (memoryScale + 1.0e-9 < requestedScale) appendReason(reason, "texture_budget");
    if (reason.length() == 0) reason.append(requestedScale == 1.0 ? "native" : "target");
    return new Geometry(outWidth, outHeight, requestedWidth, requestedHeight, bytes, limited, reason.toString());
  }

  private static int scaledDimension(int dimension, double scale) {
    double result = Math.floor(dimension * scale + 1.0e-7);
    if (result > Integer.MAX_VALUE) throw new IllegalArgumentException("Output dimension overflow");
    return Math.max(dimension, (int) result);
  }

  private static void appendReason(StringBuilder text, String reason) {
    if (text.length() > 0) text.append(',');
    text.append(reason);
  }

  private final class Program extends BaseGlShaderProgram {
    private final GlProgram program;
    private final boolean hdr;
    private final float[] texel = new float[2];
    private boolean released;
    private boolean configured;
    private boolean reconstruct;
    private int precisionQualityCeiling = 2;

    Program(Context context, boolean useHdr) throws VideoFrameProcessingException {
      super(useHdr, 1);
      hdr = useHdr;
      try {
        program = new GlProgram(context, "shaders/rea_vertex.glsl", "shaders/rea_adaptive.glsl");
        program.setBufferAttribute("aFramePosition", GlUtil.getNormalizedCoordinateBounds(), 4);
      } catch (Exception error) {
        throw new VideoFrameProcessingException(error);
      }
    }

    @Override public Size configure(int width, int height) throws VideoFrameProcessingException {
      if (released) throw new VideoFrameProcessingException("REA effect released");
      configured = false;
      int[] texture = new int[1], renderbuffer = new int[1], viewport = new int[2];
      int[] precision = new int[1], range = new int[2];
      try {
        GLES20.glGetIntegerv(GLES20.GL_MAX_TEXTURE_SIZE, texture, 0);
        GLES20.glGetIntegerv(GLES20.GL_MAX_RENDERBUFFER_SIZE, renderbuffer, 0);
        GLES20.glGetIntegerv(GLES20.GL_MAX_VIEWPORT_DIMS, viewport, 0);
        GLES20.glGetShaderPrecisionFormat(GLES20.GL_FRAGMENT_SHADER, GLES20.GL_HIGH_FLOAT, range, 0, precision, 0);
        GlUtil.checkGlError();
        boolean highp = precision[0] > 0;
        state.glMaxTextureSize = texture[0];
        state.glMaxRenderbufferSize = renderbuffer[0];
        state.glMaxViewportWidth = viewport[0];
        state.glMaxViewportHeight = viewport[1];
        state.fragmentHighpBits = precision[0];
        if (hdr && !highp) throw new IllegalArgumentException("Native HDR processing requires fragment highp; bypass REA");
        precisionQualityCeiling = highp ? 2 : 0;
        Geometry geometry = resolveGeometry(width, height, scaleLevel, upscale, maxProcessingHeight,
            memoryBudgetBytes, texture[0], viewport[0], viewport[1], hdr ? 8 : 4, highp);
        texel[0] = 1f / width; texel[1] = 1f / height;
        reconstruct = geometry.width > width || geometry.height > height;
        state.inputWidth = width; state.inputHeight = height;
        state.outputWidth = geometry.width; state.outputHeight = geometry.height;
        state.requestedOutputWidth = geometry.requestedWidth;
        state.requestedOutputHeight = geometry.requestedHeight;
        state.estimatedTextureBytes = geometry.estimatedBytes;
        state.configuredScaleLevel = scaleLevel;
        state.geometryLimited = geometry.limited;
        state.geometryReason = geometry.reason;
        state.reconstructing = reconstruct;
        state.hdr = hdr;
        state.colorDomain = hdr ? "BT2020_PQ_LINEAR_10000_NITS" : "BT709_LINEAR";
        state.status = "REA " + width + "x" + height + " > " + geometry.width + "x" + geometry.height + " (" + geometry.reason + ")";
        configured = true;
        return new Size(geometry.width, geometry.height);
      } catch (GlUtil.GlException error) {
        state.status = "REA GL capability query failed";
        throw new VideoFrameProcessingException(error);
      } catch (IllegalArgumentException error) {
        state.status = error.getMessage();
        throw new VideoFrameProcessingException(error);
      }
    }

    @Override public void drawFrame(int textureId, long presentationTimeUs) throws VideoFrameProcessingException {
      if (released || !configured) throw new VideoFrameProcessingException("REA effect not configured", presentationTimeUs);
      long startNanos = System.nanoTime();
      boolean bypass = state.forceBypass;
      int quality = Math.min(clampInt(state.quality, 0, 2),
          Math.min(clampInt(state.qualityCeiling, 0, 2), precisionQualityCeiling));
      try {
        program.use();
        program.setSamplerTexIdUniform("uTexSampler", textureId, 0);
        program.setFloatsUniform("uTexelSize", texel);
        program.setFloatUniform("uQuality", quality);
        program.setFloatUniform("uReconstruct", !bypass && reconstruct ? 1f : 0f);
        program.setFloatUniform("uSharpen", bypass ? 0f : control(state.sharpen));
        program.setFloatUniform("uDenoise", bypass ? 0f : control(state.denoise));
        program.setFloatUniform("uVibrance", bypass ? 0f : control(state.vibrance));
        program.setFloatUniform("uContrast", bypass ? 0f : control(state.contrast));
        program.setFloatUniform("uHdr", hdr ? 1f : 0f);
        program.setFloatUniform("uReferenceWhite", hdr ? HDR_REFERENCE_WHITE : 1f);
        program.bindAttributesAndUniforms();
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        GlUtil.checkGlError();
        long elapsed = Math.max(0L, System.nanoTime() - startNanos);
        state.lastCpuSubmitNanos = elapsed;
        long previous = state.cpuSubmitEmaNanos;
        state.cpuSubmitEmaNanos = previous == 0L ? elapsed : previous + (elapsed - previous) / 8L;
        state.activeQuality = quality;
        state.renderedFrames++;
      } catch (GlUtil.GlException error) {
        state.status = "REA draw failed";
        throw new VideoFrameProcessingException(error, presentationTimeUs);
      }
    }

    @Override public void release() throws VideoFrameProcessingException {
      if (released) return;
      released = true;
      configured = false;
      try { super.release(); }
      finally {
        try { program.delete(); }
        catch (GlUtil.GlException error) { throw new VideoFrameProcessingException(error); }
      }
    }
  }
}
