---
description: DevOps avanzado (CI/CD) - Gestión Transaccional de Artefactos
---
# Gestión Transaccional de Artefactos

## 1. Definición Operativa
Firma criptográfica inmutable sobre las imágenes Docker o binarios para evitar inyecciones Supply-Chain Attacks (ataque en cadena de suministro).

## 2. Capacidades Específicas
- Generación de SBOM (Software Bill of Materials) automatizada
- Firma y Verificación Transaccional Llenando Cosign
- Escaneos SAST y DAST integrados sin bloqueo de pipeline L1

## 3. Herramientas y Tecnologías
**Sigstore/Cosign, Trivy, SonarQube, Nexus**

## 4. Métrica de Dominio
**Métrica Clave:** Garantizar el SLSA (Supply chain Levels for Software Artifacts) Nivel 4 total en todo empaquetado crítico de infraestructura.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Verificación del paquete `.ZIP` de despliegue OMEGA antes de inyectarse en el nginx asegurando que no se haya modificado con shells PHP durante la red.
