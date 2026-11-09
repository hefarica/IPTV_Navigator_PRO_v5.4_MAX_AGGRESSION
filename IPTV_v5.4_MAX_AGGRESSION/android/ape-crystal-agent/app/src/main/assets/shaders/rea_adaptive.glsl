#version 100
// Working-space spatial reconstruction. HDR input is linear BT.2020, 1 = 10000 nits.
// This shader neither encodes PQ nor changes output surface color metadata.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
precision highp sampler2D;
#else
precision mediump float;
precision mediump sampler2D;
#endif
uniform sampler2D uTexSampler;
uniform vec2 uTexelSize;
uniform float uQuality;       // q0 bilinear, q1 4-tap cubic B-spline, q2 16-tap Catmull-Rom
uniform float uReconstruct;   // false for native processing or immediate bypass
uniform float uSharpen;
uniform float uDenoise;
uniform float uVibrance;
uniform float uContrast;
uniform float uHdr;
uniform float uReferenceWhite;
#ifdef GL_FRAGMENT_PRECISION_HIGH
varying highp vec2 vTexCoord;
#else
varying mediump vec2 vTexCoord;
#endif

vec4 tap(vec2 uv) {
  return texture2D(uTexSampler, clamp(uv, 0.5 * uTexelSize, 1.0 - 0.5 * uTexelSize));
}
vec4 weights(float x, bool interpolating) {
  float x2 = x * x, x3 = x2 * x;
  if (interpolating) return vec4(-0.5*x+x2-0.5*x3,
      1.0-2.5*x2+1.5*x3, 0.5*x+2.0*x2-1.5*x3, -0.5*x2+0.5*x3);
  float inverse = 1.0 - x;
  return vec4(inverse*inverse*inverse, 4.0-6.0*x2+3.0*x3,
      1.0+3.0*x+3.0*x2-3.0*x3, x3) / 6.0;
}
vec3 reconstruct(vec2 uv) {
  vec2 p = uv / uTexelSize - 0.5, ix = floor(p), f = fract(p);
  vec4 wx = weights(f.x, uQuality > 1.5), wy = weights(f.y, uQuality > 1.5);
  if (uQuality < 1.5) {
    vec2 gx = vec2(wx.x + wx.y, wx.z + wx.w), gy = vec2(wy.x + wy.y, wy.z + wy.w);
    vec2 a = (ix - 1.0 + vec2(wx.y/gx.x, wy.y/gy.x) + 0.5) * uTexelSize;
    vec2 b = (ix + 1.0 + vec2(wx.w/gx.y, wy.w/gy.y) + 0.5) * uTexelSize;
    return gy.x*(gx.x*tap(vec2(a.x,a.y)).rgb + gx.y*tap(vec2(b.x,a.y)).rgb)
         + gy.y*(gx.x*tap(vec2(a.x,b.y)).rgb + gx.y*tap(vec2(b.x,b.y)).rgb);
  }
  vec3 first = tap((ix - vec2(0.5)) * uTexelSize).rgb;
  vec3 value = vec3(0.0), lo = first, hi = first;
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    vec3 v = (x == 0 && y == 0) ? first :
        tap((ix + vec2(float(x)-1.0,float(y)-1.0) + 0.5) * uTexelSize).rgb;
    value += v * wx[x] * wy[y];
    lo = min(lo, v); hi = max(hi, v);
  }
  return clamp(value, lo, hi);
}
float edgeWeight(vec3 a, vec3 b, float scale) {
  vec3 delta = abs(a - b) / scale;
  return 1.0 - smoothstep(0.025, 0.14, max(delta.r, max(delta.g, delta.b)));
}
void main() {
  vec4 centre = tap(vTexCoord);
  vec3 base = uQuality < 0.5 || uReconstruct < 0.5 ? centre.rgb : reconstruct(vTexCoord);
  if (uSharpen <= 0.0 && uDenoise <= 0.0 && uVibrance <= 0.0 && uContrast <= 0.0) {
    gl_FragColor = vec4(base, centre.a); return;
  }
  // Common 5-fetch neighborhood; reconstruction adds 4 or 16 fetches for q1/q2.
  vec2 dx = vec2(uTexelSize.x, 0.0), dy = vec2(0.0, uTexelSize.y);
  vec3 left = tap(vTexCoord-dx).rgb, right = tap(vTexCoord+dx).rgb;
  vec3 top = tap(vTexCoord-dy).rgb, bottom = tap(vTexCoord+dy).rgb;
  vec3 luma = uHdr > 0.5 ? vec3(0.2627,0.6780,0.0593) : vec3(0.2126,0.7152,0.0722);
  float white = max(uReferenceWhite, 1.0e-6);
  float scale = uHdr > 0.5 ? max(white, dot(base, luma)) : white;
  float wl = edgeWeight(base,left,scale), wr = edgeWeight(base,right,scale);
  float wt = edgeWeight(base,top,scale), wb = edgeWeight(base,bottom,scale);
  vec3 mean = (base + wl*left + wr*right + wt*top + wb*bottom) / (1.0+wl+wr+wt+wb);
  vec3 clean = mix(base, mean, clamp(uDenoise,0.0,1.0)*0.45);
  vec3 detail = clean - mean;
  float noiseGate = smoothstep(0.002,0.018,length(detail)/scale);
  vec3 outRgb = clean + clamp(uSharpen,0.0,1.0)*noiseGate*
      clamp(detail,vec3(-0.035*scale),vec3(0.035*scale));
  vec3 lo = min(base,min(min(left,right),min(top,bottom)));
  vec3 hi = max(base,max(max(left,right),max(top,bottom)));
  // Local contrast uses the neighborhood and remains within its original envelope.
  float localDelta = dot(clean-mean,luma);
  float contrastDelta = clamp(localDelta,-0.025*scale,0.025*scale) *
      clamp(uContrast,0.0,1.0)*noiseGate*0.3;
  outRgb = clamp(outRgb + vec3(contrastDelta),lo,hi);
  float luminance = dot(outRgb,luma);
  float peak = max(outRgb.r,max(outRgb.g,outRgb.b));
  float trough = min(outRgb.r,min(outRgb.g,outRgb.b));
  float saturation = (peak-trough) / max(scale,max(abs(peak),1.0e-6));
  float colorGate = 1.0 - smoothstep(0.25,0.95,saturation);
  float highlightGate = uHdr > 0.5 ? 1.0/(1.0+max(luminance/white-1.0,0.0)*0.25) :
      1.0-smoothstep(0.85,1.0,luminance);
  vec3 chroma = outRgb - vec3(luminance);
  float gain = 1.0 + clamp(uVibrance,0.0,1.0)*0.25*colorGate*highlightGate;
  // Keep added chroma from pushing initially nonnegative channels below black.
  float lowestChroma = min(chroma.r,min(chroma.g,chroma.b));
  if (trough >= 0.0 && lowestChroma < -1.0e-6) gain = min(gain,luminance/(-lowestChroma));
  outRgb = vec3(luminance) + chroma*gain;
  if (uHdr < 0.5) outRgb = clamp(outRgb,0.0,1.0);
  // FP16 HDR values above one are retained; output pipeline owns tone mapping/OETF.
  gl_FragColor = vec4(outRgb,centre.a);
}
