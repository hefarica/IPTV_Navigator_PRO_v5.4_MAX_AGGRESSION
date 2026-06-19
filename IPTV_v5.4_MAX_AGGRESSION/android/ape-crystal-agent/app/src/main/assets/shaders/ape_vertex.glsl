#version 100
// Vertex passthrough para el GlShaderProgram de media3 (quad fullscreen normalizado -1..1).
attribute vec4 aFramePosition;
varying vec2 vTexCoord;
void main() {
  gl_Position = aFramePosition;
  vTexCoord = aFramePosition.xy * 0.5 + 0.5;   // -1..1 -> 0..1
}
