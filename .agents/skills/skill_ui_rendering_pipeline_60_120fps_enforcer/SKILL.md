---
description: Desarrollo mobile (iOS/Android nativo) - UI Rendering Pipeline (60-120fps Enforcer)
---
# UI Rendering Pipeline (60-120fps Enforcer)

## 1. Definición Operativa
Engañar al compositor gráfico anulando el GPU Overdraw, aplanando jerarquías y dibujando de forma explícita Custom Views en Canvas / Metal.

## 2. Capacidades Específicas
- Creación de Vistas Personales anulando el XML o SwiftUI genérico
- Perfección L1 L2 cache hit en repintado (invalidate clipping)
- Integración profunda del Vsync

## 3. Herramientas y Tecnologías
**Android Canvas API, iOS CoreAnimation / Metal, Android Systrace**

## 4. Métrica de Dominio
**Métrica Clave:** Dibujado de animaciones y gráficos complejos a 120Hz estables (0 frames dropped / lag).

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> El EPG (Guía de programación electrónica IPTV) escroleando 5,000 programas de la semana como mantequilla sin dropear frames.
