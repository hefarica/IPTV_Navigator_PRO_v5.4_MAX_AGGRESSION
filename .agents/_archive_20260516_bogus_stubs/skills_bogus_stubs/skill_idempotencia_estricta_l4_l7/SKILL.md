---
description: Ingeniería de APIs (REST/GraphQL/gRPC) - Idempotencia Estricta L4-L7
---
# Idempotencia Estricta L4-L7

## 1. Definición Operativa
Sistema heurístico de APIs donde la re-ejecución accidental o maliciosa del mismo request masivo nunca alterará dos veces el ecosistema.

## 2. Capacidades Específicas
- Inyección de Idempotency-Keys por UUIDv7
- Uso de Redis SETNX y transacciones ACID post-check
- Safe Retries invisibles transparentes

## 3. Herramientas y Tecnologías
**Redis, Custom HTTP Middleware, UUIDv7**

## 4. Métrica de Dominio
**Métrica Clave:** Cumplimiento del 100% de consistencia de transacción financiera/operativa si falla el ACK de red pero se ejecuta el comando.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> El UI Frontend envia su Guardar 💾 al SSOT Whitelist 3 veces por microcortes. El API solo encripta la data y la fusiona 1 única vez evadiendo sobreescritura sucia.
