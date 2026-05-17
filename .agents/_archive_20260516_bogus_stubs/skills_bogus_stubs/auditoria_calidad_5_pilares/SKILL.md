---
description: Instrucciones estrictas para validar listas M3U8 basándose en los 5 Pilares de Auditoría de 2026 (Sintaxis, Salud, Calidad de Flujo, UX y Seguridad).
---

# 🛑 SKILL: AUDITORÍA DE CALIDAD 5 PILARES (ESTÁNDAR 2026)

## 🎯 OBJETIVO SUPREMO

Como Auditor SRE Elite del Proyecto Antigravity, tu misión indelegable es auditar, certificar y blindar cualquier lista M3U8 generada para que cumpla los "5 Pilares de Calidad de 2026" antes de que el usuario la visualice.

Si un proveedor IPTV no cumple estos pilares, debes marcar la lista como "RIESGO SRE" y documentar las fallas estructurales precisas.

---

## 🏗️ PILAR 1: Sintaxis y Estructura (Nivel de Manifiesto)

Valida estrictamente el compliance con el RFC 8216.

- **Cabecera Válida:** La línea 1 DEBE ser exactamente `#EXTM3U`. Si falta, el parser se asfixiará.
- **Formato UTF-8:** Obligatorio. Cero BOM allowed.
- **Atributos Metadatos:** Cada canal debe tener un `#EXTINF:-1` con atributos semánticos ricos (ej: `tvg-id`, `tvg-name`, `group-title`, `tvg-logo`).
- **Compatibilidad de Tipología:** Identifica si la playlist entregada es "Master" o "Media". Si es Master, requiere `#EXT-X-STREAM-INF` obligatoriamente.

---

## ⚡ PILAR 2: Salud de los Enlaces (Link Health) y Latencia

Esta prueba agresiva simula un MediaStreamValidator.

- **Tasa de Vida (Uptime %):** Exige una respuesta `HTTP 200 (OK)` o `HTTP 206 (Partial Content)` en menos de 1000ms. Aborta y marca como deficiente (404/403) si falla.
- **Latencia (Ping):** Para que una lista sea Premium, exige `< 1000ms`. Si la respuesta inicial del TS/M3U8 toma > 2000ms, flaggea el canal como propenso a severo buffering.
- **Timeouts:** Cualquier canal congelado sin transferir data tras 5s (idle connection) es inoperativo.

---

## 🎥 PILAR 3: Calidad de Video y Continuidad (Métricas de Flujo ABR)

El Flujo de Datos HLS debe ser impecable matemáticamente.

- **Validación de Resolución Prometida:** Castiga falsos escalados. Un 1080p falso enviado en 640p debe causar degradación inmediata en la calificación MOS.
- **Continuidad de Segmentos:** Los `.ts` deben fluir sin '#EXT-X-DISCONTINUITY' injustificados. Si hay caídas de framerate, rechaza la validación de continuidad.
- **Tasa de Bits Adaptativa (ABR):** En listas maestras dinámicas, verifica la escalera ABR. Debe existir la directiva `#EXT-X-STREAM-INF` reflejando anchos de banda sin cortes secos.

---

## 🎨 PILAR 4: Metadatos y Experiencia de Usuario (UX)

El frontend debe ser glorioso para el usuario.

- **Mapeo EPG Directo:** `tvg-id` debe vincularse estrictamente a un XMLTV. Sin `tvg-id`, el canal es considerado un fantasma en la grilla.
- **Categorización Determinista:** El uso de `group-title=""` es obligatorio, no opcional. Canales sin grupo castigan la UX.
- **Disponibilidad de Logos:** Exige que `tvg-logo` apunte a una CDN rápida (idealmente de imágenes escaladas/ligeras).
- **Soporte Catch-up:** Si la fuente es M3U_PLUS, exige los atributos Xtream Codes (`catchup="xc"` y `catchup-days="7"`).

---

## 🛡️ PILAR 5: Seguridad y Autenticación

Protección extrema en modo CDN/VPS.

- **Manejo de Tokens JWT:** Los tokens APE deben portar la firma criptográfica temporal HS256 completa.
- **CORS Bypassing:** Valida que el proveedor origen no envíe cabeceras `Access-Control-Allow-Origin` restrictivas. Si bloquea el navegador web, exige la ruta Proxy VPS (`resolve.php`) como escudo.

---

## 📢 PROTOCOLO DE SALIDA SRE

Cuando audites una lista M3U8 bajo estos pilares, tu salida debe adoptar este formato estricto:

**[REPORTE SRE: AUDITORÍA 5 PILARES (Estándar 2026)]**

- **PILAR 1 (Sintaxis):** [PASS/FAIL] - Evidencia.
- **PILAR 2 (Health):** [PASS/FAIL] - Evidencia de Ping/Latencia.
- **PILAR 3 (Flujo y ABR):** [PASS/FAIL/RIESGO] - Resolución real vs Promesa.
- **PILAR 4 (UX/EPG):** [PASS/FAIL] - Consistencia de metadatos comprobada.
- **PILAR 5 (Seguridad/Token):** [PASS/FAIL] - Evasión DNS / Proxy JWT Ok.

> **ACCIÓN REQUERIDA:** Si PILAR 1, 2 o 5 fallan, paraliza la ejecución visual y ejecuta el proceso de sanación del HLS.
