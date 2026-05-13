---
description: Diseño de microservicios - Arquitectura Strangler Fig (Migrations L7)
---
# Arquitectura Strangler Fig (Migrations L7)

## 1. Definición Operativa
Ingeniería de ahogamiento para estrangular un monolito obsoleto, interceptando endpoints L7 hacia nuevos microservicios sin apagar nunca y migrando tráfico porcentual(1%->100%).

## 2. Capacidades Específicas
- Shadowing de Tráfico real hacia el nuevo microservicio (Leer y descartar) para prueba térmica
- Canary Deployments en API Gateway
- Routing asimétrico y fallback silencioso

## 3. Herramientas y Tecnologías
**Istio, Kong, HAProxy, Envoy**

## 4. Métrica de Dominio
**Métrica Clave:** Migración monolito->microservicios de 5,000,000 líneas de código ejecutada con 0 downtime y 0 bugs reportables por regresión asimilando rollback de 2 segundos.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Reemplazo del proxy PHP del Resolver M3U8 local por el OMEGA Backend Rust de forma que interceptamos solo peticiones .ts y luego gradualmente las playlists .m3u8 enteras ignorando el server viejo.
