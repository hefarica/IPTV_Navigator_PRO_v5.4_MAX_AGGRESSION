#version 100
// REA SDR BT.709/SMPTE170M external decoder input to linear BT.2020.
// Destination MUST be RGBA16F; the Media3 final stage applies PQ exactly once.
#extension GL_OES_EGL_image_external : require
precision highp float;
precision highp samplerExternalOES;
uniform samplerExternalOES uTexSampler;
uniform mat4 uRgbMatrix;
uniform float uPaperWhiteNits;
uniform float uPeakNits;
uniform float uExpansion;
varying vec2 vTexSamplingCoord;

float sdrEotf(float e) {
    return e < 0.0812 ? e / 4.5 : pow((e + 0.099) / 1.099, 1.0 / 0.45);
}
void main() {
    vec4 source = texture2D(uTexSampler, vTexSamplingCoord);
    vec3 e = clamp(source.rgb, 0.0, 1.0);
    vec3 linear709 = vec3(sdrEotf(e.r), sdrEotf(e.g), sdrEotf(e.b));
    float y = dot(linear709, vec3(0.2126, 0.7152, 0.0722));
    float shoulder = smoothstep(0.60, 1.0, y);
    float white = clamp(uPaperWhiteNits, 80.0, 400.0);
    float peak = clamp(uPeakNits, white, 4000.0);
    float outY = white * y + (peak - white) * clamp(uExpansion, 0.0, 1.0) * shoulder * shoulder;
    vec3 nits709 = linear709 * (outY / max(y, 1.0e-7));
    vec3 linear2020 = vec3(
        dot(nits709, vec3(0.6274039, 0.3292830, 0.0433131)),
        dot(nits709, vec3(0.0690973, 0.9195404, 0.0113623)),
        dot(nits709, vec3(0.0163914, 0.0880133, 0.8955953))) / 10000.0;
    vec3 transformed = (uRgbMatrix * vec4(linear2020, 1.0)).rgb;
    gl_FragColor = vec4(max(transformed, vec3(0.0)), source.a);
}
