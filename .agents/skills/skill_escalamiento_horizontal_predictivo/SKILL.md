---
description: Ingeniería de sistemas a gran escala - Escalamiento Horizontal Predictivo
---
# Escalamiento Horizontal Predictivo

## 1. Definición Operativa
Adelantarse matemáticamente a la carga usando modelos heurísticos de telemetría e instanciar servidores antes del impacto.

## 2. Capacidades Específicas
- Consumo de series de tiempo para disparar webhooks
- Evaluación estacional de uso y eventos especiales
- Control de cold-starts de instancias cloud

## 3. Herramientas y Tecnologías
**Prometheus, K8s HPA/VPA, AWS Auto Scaling, KEDA**

## 4. Métrica de Dominio
**Métrica Clave:** Arranque y provisión de 50 nodos bare-metal / cloud en <60 segundos justo antes de un evento pico.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Levantar 10 proxies NGINX minutos antes del saque inicial del Super Bowl IPTV previendo la tormenta HTTP.
