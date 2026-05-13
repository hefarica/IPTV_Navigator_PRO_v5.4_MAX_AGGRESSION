---
name: iptv-revenue-engine
description: >
  Motor de Monetización y Analítica de Negocio para plataformas IPTV. Rastrea KPIs de suscripción
  (MRR, ARR, ARPU, LTV, Churn Rate), analiza el comportamiento de usuarios para reducir la deserción,
  genera reportes de rentabilidad por lista/perfil/región, y optimiza la estrategia de precios.
  Integra con paneles de Xtream Codes/Stalker para extraer métricas de uso. Usar para: calcular
  métricas de negocio IPTV, analizar churn y retención, generar reportes de ingresos, identificar
  segmentos de usuarios de alto valor, y construir dashboards de KPIs para operadores IPTV.
---

# IPTV Revenue Engine — Motor de Monetización

## Superioridad Estratégica

Este skill otorga el **Pilar 4 de la Superioridad del 95%**: la mayoría de los operadores IPTV gestionan su negocio con hojas de cálculo y sin datos. Este motor convierte los datos de uso en decisiones de negocio que maximizan los ingresos y minimizan la pérdida de clientes.

---

## KPIs Fundamentales del Negocio IPTV

| KPI | Definición | Benchmark del Mercado |
|:----|:-----------|:----------------------|
| **MRR** | Monthly Recurring Revenue | Crecimiento objetivo: +10%/mes |
| **ARPU** | Average Revenue Per User | Mercado: $5-15 USD/mes |
| **LTV** | Customer Lifetime Value | Objetivo: LTV > 3x CAC |
| **Churn Rate** | % usuarios que cancelan/mes | Excelente: < 3%, Promedio: 8-12% |
| **DAU/MAU** | Daily/Monthly Active Users | Ratio saludable: > 40% |
| **Streams/User/Day** | Streams iniciados por usuario | Benchmark: 2.5 streams/día |
| **Buffer Ratio** | % tiempo en buffering | Objetivo: < 0.1% |

---

## Capacidades Principales

### 1. Dashboard de KPIs en Tiempo Real

```bash
# Generar dashboard de KPIs desde la API de Xtream Codes
python3.11 /home/ubuntu/skills/iptv-revenue-engine/scripts/kpi_dashboard.py \
  --xtream-url http://panel.example.com:8080 \
  --xtream-user admin \
  --xtream-pass <PASSWORD> \
  --output /tmp/kpi_report.html \
  --period 30d
```

**Métricas Generadas:**
- MRR y ARR actuales con tendencia de 12 meses
- Churn rate mensual y predicción de churn a 30 días
- ARPU por segmento (P0-P5) y por región geográfica
- Usuarios en riesgo de abandono (señales de baja actividad)
- Top 20 canales por tiempo de visualización

---

### 2. Análisis de Churn Predictivo

El motor analiza patrones de comportamiento para identificar usuarios con alta probabilidad de cancelación **antes** de que cancelen, permitiendo acciones de retención proactivas.

**Señales de Churn Detectadas:**

| Señal | Umbral de Alerta | Acción Recomendada |
|:------|:-----------------|:-------------------|
| Días sin actividad | > 7 días | Enviar notificación push |
| Buffering ratio alto | > 2% | Migrar a perfil de menor calidad |
| Streams fallidos consecutivos | > 3 | Escalar a soporte técnico |
| Reducción de uso | -50% vs mes anterior | Ofrecer descuento de retención |

```bash
python3.11 /home/ubuntu/skills/iptv-revenue-engine/scripts/churn_predictor.py \
  --xtream-url http://panel.example.com:8080 \
  --model gradient_boost \
  --output /tmp/churn_risk_users.csv
```

---

### 3. Optimización de Precios por Segmento

Analiza la elasticidad de precios por segmento de usuario y recomienda la estrategia de precios óptima para maximizar el MRR.

**Segmentos de Precio Recomendados:**

| Tier | Perfil APE | Precio Sugerido | Características |
|:-----|:-----------|:----------------|:----------------|
| **Basic** | P3-P4 | $4.99/mes | HD, 1 conexión, sin 4K |
| **Standard** | P2-P3 | $8.99/mes | FHD, 2 conexiones, EPG |
| **Premium** | P1-P2 | $14.99/mes | 4K, 3 conexiones, VOD |
| **Ultra** | P0-P1 | $24.99/mes | 8K, 5 conexiones, todo incluido |

---

### 4. Reportes de Rentabilidad por Lista

Cada lista `.m3u8` generada tiene un `listId` único. El Revenue Engine rastrea la rentabilidad de cada lista por separado.

```bash
python3.11 /home/ubuntu/skills/iptv-revenue-engine/scripts/list_profitability.py \
  --guardian-log /dev/shm/ape_guardian/events.jsonl \
  --period 30d \
  --output /tmp/list_profitability_report.json
```

---

### 5. Integración con Pasarelas de Pago

Conecta con Stripe, PayPal y criptomonedas para gestionar suscripciones recurrentes y renovaciones automáticas.

```bash
# Sincronizar suscripciones de Stripe con el panel Xtream
python3.11 /home/ubuntu/skills/iptv-revenue-engine/scripts/payment_sync.py \
  --stripe-key <STRIPE_SECRET_KEY> \
  --xtream-url http://panel.example.com:8080 \
  --sync-interval 300
```

---

## Referencias de Archivos

- `scripts/kpi_dashboard.py` — Generador de dashboard de KPIs en tiempo real.
- `scripts/churn_predictor.py` — Modelo predictivo de churn con ML.
- `scripts/list_profitability.py` — Análisis de rentabilidad por lista M3U8.
- `scripts/payment_sync.py` — Sincronizador de pagos Stripe/PayPal con Xtream.
- `references/xtream_api.md` — Documentación de la API de Xtream Codes.
- `references/kpi_benchmarks.md` — Benchmarks de KPIs del mercado IPTV global.
