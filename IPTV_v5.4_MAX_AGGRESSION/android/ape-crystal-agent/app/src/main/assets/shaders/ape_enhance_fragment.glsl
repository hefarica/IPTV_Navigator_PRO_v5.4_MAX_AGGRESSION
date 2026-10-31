#version 100
// Spatial SDR enhancement. This pass does not perform temporal interpolation
// or neural super-resolution. Compatible with the existing Media3 program.
precision mediump float;

uniform sampler2D uTexSampler;
uniform vec2 uTexelSize;  // Host-provided (1 / input width, 1 / input height).
uniform float uSharpen;
uniform float uDenoise;
varying vec2 vTexCoord;

// Gate each neighbour independently, including chromatic edges. Large colour
// differences contribute no blur; small differences can suppress local noise.
float neighbourWeight(vec3 centre, vec3 neighbour) {
  vec3 delta = abs(neighbour - centre);
  float difference = max(delta.r, max(delta.g, delta.b));
  return 1.0 - smoothstep(0.025, 0.12, difference);
}

void main() {
  vec4 centre = texture2D(uTexSampler, vTexCoord);
  float denoise = clamp(uDenoise, 0.0, 1.0) * 0.45;
  float sharpen = clamp(uSharpen, 0.0, 1.0);

  // Preserve exact identity, including alpha, with both controls disabled.
  // A missing/invalid texel size also leaves the sampled image unchanged.
  if ((denoise == 0.0 && sharpen == 0.0) ||
      uTexelSize.x <= 0.0 || uTexelSize.y <= 0.0) {
    gl_FragColor = centre;
    return;
  }

  vec2 dx = vec2(uTexelSize.x, 0.0);
  vec2 dy = vec2(0.0, uTexelSize.y);
  vec3 left = texture2D(uTexSampler, clamp(vTexCoord - dx, 0.0, 1.0)).rgb;
  vec3 right = texture2D(uTexSampler, clamp(vTexCoord + dx, 0.0, 1.0)).rgb;
  vec3 up = texture2D(uTexSampler, clamp(vTexCoord - dy, 0.0, 1.0)).rgb;
  vec3 down = texture2D(uTexSampler, clamp(vTexCoord + dy, 0.0, 1.0)).rgb;

  float wl = neighbourWeight(centre.rgb, left);
  float wr = neighbourWeight(centre.rgb, right);
  float wu = neighbourWeight(centre.rgb, up);
  float wd = neighbourWeight(centre.rgb, down);
  // The centre has weight 1, so the divisor cannot vanish.
  vec3 base = (centre.rgb + wl * left + wr * right + wu * up + wd * down)
            / (1.0 + wl + wr + wu + wd);
  vec3 denoised = mix(centre.rgb, base, denoise);

  // Positive high-pass contribution sharpens. Bound both the increment and
  // the result to avoid overshoot beyond the original local RGB envelope.
  vec3 detail = clamp(denoised - base, vec3(-0.04), vec3(0.04));
  vec3 localMin = min(centre.rgb, min(min(left, right), min(up, down)));
  vec3 localMax = max(centre.rgb, max(max(left, right), max(up, down)));
  vec3 enhanced = clamp(denoised + sharpen * detail, localMin, localMax);
  gl_FragColor = vec4(clamp(enhanced, 0.0, 1.0), centre.a);
}
