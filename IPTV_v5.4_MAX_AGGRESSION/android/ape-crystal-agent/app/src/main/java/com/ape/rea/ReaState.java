package com.ape.rea;

/** Shared renderer controls. Geometry controls take effect on effect reconstruction.
 * CPU submission timings are not GPU timings or playback frame-rate measurements.
 */
public final class ReaState {
  public volatile int quality = 1;
  public volatile int qualityCeiling = 2;
  public volatile int scaleLevel = 2;
  public volatile float sharpen = .4f;
  public volatile float denoise = .16f;
  public volatile float vibrance = .07f;
  public volatile float contrast = .08f;
  public volatile long memoryBudgetBytes = 256L * 1024L * 1024L;
  public volatile int maxProcessingHeight = 3240;
  public volatile int inputWidth;
  public volatile int inputHeight;
  public volatile int outputWidth;
  public volatile int outputHeight;
  public volatile boolean hdr;
  public volatile long renderedFrames;
  public volatile String status = "REA waiting for video";
  public volatile boolean forceBypass;

  public volatile int activeQuality;
  public volatile int configuredScaleLevel;
  public volatile int requestedOutputWidth;
  public volatile int requestedOutputHeight;
  public volatile long estimatedTextureBytes;
  public volatile long lastCpuSubmitNanos;
  public volatile long cpuSubmitEmaNanos;
  public volatile int glMaxTextureSize;
  public volatile int glMaxRenderbufferSize;
  public volatile int glMaxViewportWidth;
  public volatile int glMaxViewportHeight;
  public volatile int fragmentHighpBits;
  public volatile boolean geometryLimited;
  public volatile boolean reconstructing;
  public volatile String geometryReason = "unconfigured";
  public volatile String colorDomain = "unconfigured";
}
