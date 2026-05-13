---
description: Programación backend (Go/Java/Rust) - Compilación Ahead-of-Time & Opt. en Tiempo de Compilación
---
# Compilación Ahead-of-Time & Opt. en Tiempo de Compilación

## 1. Definición Operativa
Generar ejecutables binarios estáticos sin máquinas virtuales (JVM overhead), precalculando matemáticas en fase de construir.

## 2. Capacidades Específicas
- Manejo de Macros y Const Generics (Rust)
- GraalVM Native Image (Java)
- Stripping de binarios y link estático extremo

## 3. Herramientas y Tecnologías
**GraalVM, LLVM Opt, Go CGO config**

## 4. Métrica de Dominio
**Métrica Clave:** Tiempo de arranque (cold start) del microservicio inferior a 10 milisegundos listo para enrutar tráfico.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Ejecución de Worker serverless de decodificador M3U8 en Cloudflare Workers donde arranca, resuelve, compila y muere en sub 5ms.
