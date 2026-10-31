#version 100
// Crystal SDR: separable cubic B-spline reconstruction and bounded spatial
// enhancement. Requires GL_LINEAR sampling and the source texture dimensions.
// At most 9 texture fetches: 1 centre + 4 reconstruction + 4 neighbours.
// No temporal interpolation, neural super-resolution, or HDR conversion.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uTexSampler;
uniform vec2 uTexelSize;
uniform float uSharpen;
uniform float uDenoise;
uniform float uVibrance;
uniform float uLocalContrast;
uniform float uBicubic;
varying vec2 vTexCoord;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 readRgb(vec2 uv) {
  vec2 halfTexel = uTexelSize * 0.5;
  return texture2D(uTexSampler, clamp(uv, halfTexel, vec2(1.0) - halfTexel)).rgb;
}

vec4 cubicWeights(float f) {
  float f2 = f * f;
  float f3 = f2 * f;
  float inv = 1.0 - f;
  return vec4(inv * inv * inv,
              3.0 * f3 - 6.0 * f2 + 4.0,
              -3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0,
              f3) / 6.0;
}

vec3 cubicReconstruction(vec2 uv) {
  vec2 pixel = uv / uTexelSize - vec2(0.5);
  vec2 index = floor(pixel);
  vec2 phase = fract(pixel);
  vec4 wx = cubicWeights(phase.x);
  vec4 wy = cubicWeights(phase.y);
  vec2 gx = vec2(wx.x + wx.y, wx.z + wx.w);
  vec2 gy = vec2(wy.x + wy.y, wy.z + wy.w);
  // Each pair sum stays >= 1/6. These coordinates combine adjacent cubic
  // weights into the texture unit's bilinear interpolation in both axes.
  vec2 p0 = (index - vec2(1.0) + vec2(wx.y / gx.x, wy.y / gy.x)
             + vec2(0.5)) * uTexelSize;
  vec2 p1 = (index + vec2(1.0) + vec2(wx.w / gx.y, wy.w / gy.y)
             + vec2(0.5)) * uTexelSize;
  vec3 top = gx.x * readRgb(vec2(p0.x, p0.y))
           + gx.y * readRgb(vec2(p1.x, p0.y));
  vec3 bottom = gx.x * readRgb(vec2(p0.x, p1.y))
              + gx.y * readRgb(vec2(p1.x, p1.y));
  return gy.x * top + gy.y * bottom;
}

float edgeWeight(vec3 centre, vec3 neighbour) {
  vec3 difference = abs(neighbour - centre);
  float edge = max(difference.r, max(difference.g, difference.b));
  return 1.0 - smoothstep(0.025, 0.14, edge);
}

float gamutScale(vec3 chroma, float brightness) {
  float scale = 1.0;
  if (chroma.r > 0.0) scale = min(scale, (1.0 - brightness) / chroma.r);
  else if (chroma.r < 0.0) scale = min(scale, brightness / -chroma.r);
  if (chroma.g > 0.0) scale = min(scale, (1.0 - brightness) / chroma.g);
  else if (chroma.g < 0.0) scale = min(scale, brightness / -chroma.g);
  if (chroma.b > 0.0) scale = min(scale, (1.0 - brightness) / chroma.b);
  else if (chroma.b < 0.0) scale = min(scale, brightness / -chroma.b);
  return clamp(scale, 0.0, 1.0);
}

void main() {
  vec4 centre = texture2D(uTexSampler, vTexCoord);
  float sharpen = clamp(uSharpen, 0.0, 1.0);
  float denoise = clamp(uDenoise, 0.0, 1.0);
  float vibrance = clamp(uVibrance, 0.0, 1.0);
  float contrast = clamp(uLocalContrast, 0.0, 1.0);
  float cubic = clamp(uBicubic, 0.0, 1.0);
  if ((sharpen == 0.0 && denoise == 0.0 && vibrance == 0.0 &&
       contrast == 0.0 && cubic == 0.0) ||
      uTexelSize.x <= 0.0 || uTexelSize.y <= 0.0) {
    gl_FragColor = centre;
    return;
  }

  vec3 base = centre.rgb;
  if (cubic > 0.0) base = mix(base, cubicReconstruction(vTexCoord), cubic);
  vec2 dx = vec2(uTexelSize.x, 0.0);
  vec2 dy = vec2(0.0, uTexelSize.y);
  vec3 left = readRgb(vTexCoord - dx);
  vec3 right = readRgb(vTexCoord + dx);
  vec3 up = readRgb(vTexCoord - dy);
  vec3 down = readRgb(vTexCoord + dy);
  float wl = edgeWeight(base, left);
  float wr = edgeWeight(base, right);
  float wu = edgeWeight(base, up);
  float wd = edgeWeight(base, down);
  vec3 smoothBase = (base + wl * left + wr * right + wu * up + wd * down)
                   / (1.0 + wl + wr + wu + wd);
  vec3 denoised = mix(base, smoothBase, denoise * 0.40);

  // Include the reconstructed base: its 4x4 support can extend beyond the
  // cross neighbourhood. Clamping must not discard a valid reconstructed value.
  vec3 localMin = min(min(base, centre.rgb), min(min(left, right), min(up, down)));
  vec3 localMax = max(max(base, centre.rgb), max(max(left, right), max(up, down)));
  float yBase = dot(base, LUMA);
  float yCentre = dot(centre.rgb, LUMA);
  float yLeft = dot(left, LUMA);
  float yRight = dot(right, LUMA);
  float yUp = dot(up, LUMA);
  float yDown = dot(down, LUMA);
  float yMin = min(min(yBase, yCentre), min(min(yLeft, yRight), min(yUp, yDown)));
  float yMax = max(max(yBase, yCentre), max(max(yLeft, yRight), max(yUp, yDown)));
  float edgeGuard = 1.0 - smoothstep(0.06, 0.35, yMax - yMin);

  vec3 detail = denoised - smoothBase;
  vec3 absDetail = abs(detail);
  float noiseGate = smoothstep(0.002, 0.02,
                               max(absDetail.r, max(absDetail.g, absDetail.b)));
  float sharpGain = sharpen * mix(0.18, 0.85, edgeGuard) * noiseGate;
  vec3 enhanced = denoised + sharpGain * clamp(detail, vec3(-0.035), vec3(0.035));
  float neighbourhoodLuma = (yBase + yLeft + yRight + yUp + yDown) * 0.2;
  float microContrast = clamp((dot(denoised, LUMA) - neighbourhoodLuma)
                             * contrast * 0.35 * edgeGuard, -0.025, 0.025);
  enhanced = clamp(enhanced + vec3(microContrast), localMin, localMax);

  // Saturation acts on chroma only. Neutral pixels stay neutral, strongly
  // saturated colours receive less gain, and gamut fitting preserves luma.
  float oldLuma = dot(enhanced, LUMA);
  float brightness = clamp(oldLuma, yMin, yMax);
  float high = max(enhanced.r, max(enhanced.g, enhanced.b));
  float low = min(enhanced.r, min(enhanced.g, enhanced.b));
  float saturation = (high - low) / max(high, 0.05);
  float neutralGate = smoothstep(0.015, 0.08, high - low);
  float colourGain = 1.0 + 0.25 * vibrance * neutralGate
                    * (1.0 - smoothstep(0.15, 0.75, saturation));
  vec3 chroma = (enhanced - vec3(oldLuma)) * colourGain;
  vec3 result = vec3(brightness) + chroma * gamutScale(chroma, brightness);
  gl_FragColor = vec4(clamp(result, 0.0, 1.0), centre.a);
}
