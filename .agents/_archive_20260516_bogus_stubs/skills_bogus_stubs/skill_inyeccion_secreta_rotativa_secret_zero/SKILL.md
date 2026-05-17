---
description: DevOps avanzado (CI/CD) - Inyección Secreta Rotativa (Secret Zero)
---
# Inyección Secreta Rotativa (Secret Zero)

## 1. Definición Operativa
Eliminar variables planas de entorno. Obligar al CI/CD a negociar rotaciones dinámicas de llaves maestras para cada stage, disueltas en inercia de RAM.

## 2. Capacidades Específicas
- Integración nativa HashiCorp Vault Injector
- OIDC (OpenID Connect) trust integration explícita
- Secrets Exfiltration Blocker L4

## 3. Herramientas y Tecnologías
**HashiCorp Vault, AWS Secrets Manager, GitHub OIDC**

## 4. Métrica de Dominio
**Métrica Clave:** Cero claves hardcoreadas, 100% tokens expirables en vida máxima < 5 minutos tras el uso dentro del despliegue.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> El runner de GitHub que despliega IPTV usa OIDC para obtener un token de SCP temporal al VPS Hetzner que caduca apenas cierra la conexión.
