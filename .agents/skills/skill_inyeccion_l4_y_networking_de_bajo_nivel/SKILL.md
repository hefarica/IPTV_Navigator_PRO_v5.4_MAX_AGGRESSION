---
description: Programación backend (Go/Java/Rust) - Inyección L4 y Networking de Bajo Nivel
---
# Inyección L4 y Networking de Bajo Nivel

## 1. Definición Operativa
Modificar los comportamientos de socket crudos de un lenguaje evitando bibliotecas HTTP excesivas.

## 2. Capacidades Específicas
- Manipular EPOLL / KQUEUE crudos
- Bypass de Nagle algorithm activando TCP_NODELAY
- Afinación del Keep-Alive window de File Descriptors

## 3. Herramientas y Tecnologías
**epoll (Linux), Go net/tcp, Java NIO**

## 4. Métrica de Dominio
**Métrica Clave:** Gestión asincrónica de > 1M de WebSockets con solo 4 cores de CPU.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Creación del Resolver Proxy L4 que lee cabeceras HLS y re-distribuye streams en proxy sin el overhead de Apache/Nginx intermedio.
