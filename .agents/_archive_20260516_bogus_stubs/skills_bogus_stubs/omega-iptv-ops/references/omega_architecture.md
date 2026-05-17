# Referencia: Arquitectura OMEGA v5.2

## 1. Single Source of Truth (SSOT)
- **Resolver Primario**: `resolve_quality_unified.php`
- **Rol**: Sustituye a todos los resolvers antiguos (v3, v4, v5, proxy). Es el único punto de contacto con el reproductor para manejar listas.
- **Entrada**: Exige codificación Base64 en el parámetro `ctx` y un `mode=200ok` forzado para flujos OMEGA, más el parámetro `url=` con la URL original encoded.

## 2. Pilar 5 - Córtex JS
- Controlador JavaScript que intercepta llamados `fetch` e `XHR`.
- Aplica un índice de rotación de User-Agent ante respuestas HTTP 4xx (400, 401, 403, 405, 429).
- Genera Cache-Busting ciego con `&m3u8_busted`.

## 3. Scorecard de 120/120 (Métricas Puras)
- Presencia de `#EXTM3U`
- Presencia del Pilar 5 JS en el frontend.
- Cero TypeErrors (vía uso de `?.` Optional Chaining en objetos locales).
- Fallback Direct protegido por proxy HTTPS y HMAC.

## 4. Cadena de Degradación
1. Intento de Modo Absoluto (Cero Redirecciones, 200 OK proxy iterativo).
2. Degradación 1: Rotación de User-Agent Local Automática vía Backend.
3. Degradación 2: Salto hacia `fallback_proxy.php` si la transmisión directa cae por firewall local L7.
