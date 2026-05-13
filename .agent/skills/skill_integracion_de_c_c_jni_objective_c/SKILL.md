---
description: Desarrollo mobile (iOS/Android nativo) - Integración de C/C++ (JNI & Objective-C++)
---
# Integración de C/C++ (JNI & Objective-C++)

## 1. Definición Operativa
Salto matemático de la Máquina Virtual a metal (C/C++) para aceleración de video y criptografía cruda super-sónica.

## 2. Capacidades Específicas
- Fusión NDK/JNI (Java Native Interface)
- Uso de punteros de memoria directos y buffers C
- Pasar punteros de Video Render Texture sin duplicar RAM

## 3. Herramientas y Tecnologías
**Android NDK, CMake, Objective-C++, Metal API**

## 4. Métrica de Dominio
**Métrica Clave:** Aceleración en procesamiento (ej codec de audio) de 30x por encima del lenguaje manejado nativo.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Usar FFMpeg C Core directamente interactuando con el ExoPlayer MediaCodec surface para el protocolo God-Tier VLC HW Acceleration.
