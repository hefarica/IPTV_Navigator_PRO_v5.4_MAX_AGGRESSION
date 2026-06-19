#version 100
// UltraEnhance GPU-directo (F6): denoise (box-blur mix) + unsharp mask sobre CADA frame del video.
// Recodificación perceptual de borde — post-decode, on-device, nunca vuelve a la red.
precision mediump float;
uniform sampler2D uTexSampler;
uniform vec2 uTexelSize;   // (1/w, 1/h)
uniform float uSharpen;    // intensidad unsharp
uniform float uDenoise;    // mezcla denoise [0..1]
varying vec2 vTexCoord;
void main() {
  vec4 c = texture2D(uTexSampler, vTexCoord);
  vec4 blur = (texture2D(uTexSampler, vTexCoord + vec2(-uTexelSize.x, 0.0))
             + texture2D(uTexSampler, vTexCoord + vec2( uTexelSize.x, 0.0))
             + texture2D(uTexSampler, vTexCoord + vec2(0.0, -uTexelSize.y))
             + texture2D(uTexSampler, vTexCoord + vec2(0.0,  uTexelSize.y))) * 0.25;
  vec4 den = mix(c, blur, uDenoise);                       // denoise (atenúa ruido MPEG)
  vec3 outc = den.rgb + uSharpen * (den.rgb - blur.rgb);   // unsharp (realza detalle)
  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), c.a);
}
