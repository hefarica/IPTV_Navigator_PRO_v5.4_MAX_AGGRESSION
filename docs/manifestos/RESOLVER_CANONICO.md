# RESOLVER CANÓNICO — decisión U1 (2026-10-25)

> Cierra la incógnita U1 de la ventana de despliegue: **¿qué generación de resolver manda?**
> Base: medición de `vps-edge` (T51/T56) sobre el VPS real, solo lectura. Cero despliegues.

---

## 1 · Los dos candidatos, medidos

| | **A · Desplegado** | **B · Repo (candidato)** |
|---|---|---|
| Ruta | `/var/www/html/resolve_quality_unified.php` | `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php` |
| Bytes | **6.270** | **348.758** (55×) |
| SHA-256 | `27DB7AB7A5B56F43…` | `20AC4B2631C1E877…` |
| Gemelo en repo | `IPTV_v5.4_MAX_AGGRESSION/vps/resolve_quality_unified.php` — **byte-idéntico** | — |
| Forwarder | `resolve_quality.php` 281 B `78C27DFF…` = VPS `78c27dff…` | — |
| Estado en producción | **sirviendo** | **nunca desplegado** |
| Prueba real | `GET /resolve_quality.php?ch=1&p=P3` → **HTTP 200, 8.613 B** con `#EXTINF`, `#EXTHTTP`, `#EXTVLCOPT` | no probado en producción |
| `enum PlayerType` | 0 · `enum_exists` 0 ⇒ sin redeclaración | guardado con `enum_exists` (t28) |
| Error de canal | — (responde 200) | 502 + `X-APE-Error` + derivación `srv/sid` |

## 2 · Decisión

**Manda A (el desplegado).**

Motivos:
1. **Funciona y está medido**: 200 con cuerpo válido, sin el fatal del enum.
2. **D-32**: rige la arquitectura **desplegada**; el pipeline del repo es aspiracional.
3. **B nunca corrió en producción**: subirlo sería **cambiar de componente** con tráfico encima, no «aplicar un fix» — exactamente el despliegue «para alinear» prohibido por D-25/D-31/D-32.
4. Es **55× mayor**: una diferencia de esa magnitud no es una revisión, es otra generación.

## 3 · Condiciones

- **Pin de producción**: `sha256 = 27DB7AB7A5B56F43…` (6.270 B). Cualquier cambio debe verificarse con `sha256sum`.
- **B queda como CANDIDATO**, con etiqueta explícita de **no desplegado**, y sus fixes (RC-1 guard, RC-2 502/derive, fusible A) documentados como **no activos en producción**.
- **Convergencia (Plan B)** solo con: ventana explícita del propietario, staging previo, `php -l` antes de activar, y rollback de 1 línea por paso (ver `audit_teams_REA/T56_cutover_real.md`).

## 4 · Lo que esto corrige en el acta

- Los arreglos RC-1/RC-2 de esta sesión (t28) son **válidos para el candidato**, pero **no eran necesarios en producción**: el resolver desplegado nunca sufrió el fatal.
- El «residual RC-1» (5 copias legacy con `enum PlayerType` sin guarda) es **riesgo latente, no servido**: no se toca; si acaso, bloquear `/iptv-ape/*.php` en el vhost (1 línea).
- La lista viva apunta a `resolve_quality.php` (forwarder) → A. **B no está en el camino.**

## 5 · Verificación reproducible

```bash
# En el VPS (solo lectura)
sha256sum /var/www/html/resolve_quality_unified.php   # 27db7ab7…
curl -sS -o /dev/null -w '%{http_code} %{size_download}\n' \
  'https://<host>/resolve_quality.php?ch=1&p=P3'      # 200 8613
```
