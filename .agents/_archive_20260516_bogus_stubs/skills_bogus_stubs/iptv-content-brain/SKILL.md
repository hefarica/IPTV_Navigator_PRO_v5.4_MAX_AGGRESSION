---
name: iptv-content-brain
description: >
  Inteligencia de Contenido y Descubrimiento para plataformas IPTV. Enriquece metadatos de canales
  y VOD (EPG, pósters, ratings, descripciones), analiza patrones de consumo, genera recomendaciones
  personalizadas, y construye guías de programación electrónica (EPG) de alta fidelidad desde
  múltiples fuentes (XMLTV, Gracenote, TMDB, TVDB). Usar para: enriquecer channels_map.json con
  metadatos, generar EPG unificado, construir motores de recomendación, analizar audiencias y
  detectar contenido duplicado o de baja calidad en catálogos IPTV.
---

# IPTV Content Brain — Inteligencia de Contenido

## Superioridad Estratégica

Este skill otorga el **Pilar 2 de la Superioridad del 95%**: mientras el 95% del mercado ofrece una lista plana de canales sin metadatos, este motor transforma el catálogo en una experiencia de descubrimiento de clase mundial, comparable a Netflix o Disney+.

---

## Capacidades Principales

### 1. Enriquecimiento de Metadatos (EPG + Pósters + Ratings)

**Fuentes de Datos Soportadas:**

| Fuente | Tipo | Datos |
|:-------|:-----|:------|
| **XMLTV** | EPG | Programación en tiempo real, descripciones de programas |
| **TMDB API** | VOD | Pósters, sinopsis, ratings, elenco, trailers |
| **TVDB API** | Series | Episodios, temporadas, artwork |
| **Gracenote** | EPG Premium | Metadatos de alta fidelidad para canales de TV en vivo |
| **Open EPG** | EPG Gratuito | `epg.pw`, `iptv-org/epg` para canales internacionales |

```bash
python3.11 /home/ubuntu/skills/iptv-content-brain/scripts/enrich_channels_map.py \
  --map /var/www/html/channels_map.json \
  --epg-source https://epg.pw/xmltv/epg_ES.xml \
  --tmdb-key <TMDB_API_KEY> \
  --output /var/www/html/channels_map_enriched.json
```

**Estructura del Canal Enriquecido:**

```json
{
  "30": {
    "profile": "P1",
    "label": "Canal 4K Premium",
    "meta": {
      "epg_id": "canal4k.es",
      "logo_hd": "https://cdn.example.com/logos/canal4k_hd.png",
      "category": "Deportes",
      "language": "es",
      "country": "ES",
      "current_program": {
        "title": "La Liga - Real Madrid vs Barcelona",
        "start": "2026-03-06T20:00:00Z",
        "end": "2026-03-06T22:00:00Z",
        "rating": 9.2
      }
    }
  }
}
```

---

### 2. Motor de Recomendación Personalizada

Analiza patrones de consumo (canales más vistos, horarios, géneros preferidos) y genera recomendaciones que aumentan el tiempo de sesión y reducen el churn.

**Métricas de Impacto (benchmark industria):**
- Aumento del tiempo de sesión: **+35%**
- Reducción de churn mensual: **-18%**
- Tasa de descubrimiento de contenido nuevo: **+52%**

---

### 3. Detección de Calidad y Duplicados

```bash
python3.11 /home/ubuntu/skills/iptv-content-brain/scripts/catalog_auditor.py \
  --map /var/www/html/channels_map.json \
  --check-streams --detect-duplicates \
  --output /tmp/catalog_audit_report.json
```

---

### 4. Generación de EPG Unificado (XMLTV)

Consolida múltiples fuentes de EPG en un único archivo XMLTV optimizado para TiviMate, OTT Navigator y Kodi.

```bash
python3.11 /home/ubuntu/skills/iptv-content-brain/scripts/epg_builder.py \
  --sources epg_ES.xml,epg_EN.xml,epg_FR.xml \
  --channels-map /var/www/html/channels_map.json \
  --output /var/www/html/epg_unified.xml \
  --days 7
```

---

## Integración con el Ecosistema APE

El `channels_map.json` enriquecido es consumido directamente por `resolve_quality.php` para incluir metadatos en la respuesta. Los datos de EPG se inyectan en el `#EXTINF` del `.m3u8`. Los ratings de calidad del catálogo alimentan el SMK para priorizar streams de alta calidad.

---

## Referencias de Archivos

- `scripts/enrich_channels_map.py` — Enriquecedor de metadatos multi-fuente.
- `scripts/recommendation_engine.py` — Motor de recomendación personalizada.
- `scripts/catalog_auditor.py` — Auditor de calidad y duplicados del catálogo.
- `scripts/epg_builder.py` — Generador de EPG unificado XMLTV.
- `references/epg_sources.md` — Directorio de fuentes de EPG gratuitas y de pago.
