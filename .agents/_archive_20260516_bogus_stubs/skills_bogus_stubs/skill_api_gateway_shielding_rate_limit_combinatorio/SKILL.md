---
description: Ingeniería de APIs (REST/GraphQL/gRPC) - API Gateway Shielding (Rate Limit Combinatorio)
---
# API Gateway Shielding (Rate Limit Combinatorio)

## 1. Definición Operativa
Técnicas de balanceo matemático en el Gateway para impedir rastreos abusivos aislando limitantes basados en IP + Fingerprint + Token JWT.

## 2. Capacidades Específicas
- Diseño de Token Bucket Rate Limits
- Inspección de Tráfico Asimétrica L7 (WAF Pattern Matching)
- Validación de Firmas Edge antes del Backend

## 3. Herramientas y Tecnologías
**Kong, AWS API Gateway, Nginx Lua Scrypt**

## 4. Métrica de Dominio
**Métrica Clave:** 0 Incursiones o Scrapping Masivo L7, absorción de 50k requests de bots al Gateway con 0 peticiones ladeadas al origin.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Un scraper intentando dumpear todos los Xtream Codes en 5 seg es expulsado sutilmente mediante Leaky Bucket Rate Limiting per Fingerprint.
