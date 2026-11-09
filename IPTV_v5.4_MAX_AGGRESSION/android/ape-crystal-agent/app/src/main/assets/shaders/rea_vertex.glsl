#version 100
attribute vec4 aFramePosition;
#ifdef GL_FRAGMENT_PRECISION_HIGH
varying highp vec2 vTexCoord;
#else
varying mediump vec2 vTexCoord;
#endif
void main() {
  gl_Position = aFramePosition;
  vTexCoord = aFramePosition.xy * 0.5 + 0.5;
}
