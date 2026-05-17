# Referencia: DuckDNS Setup & Troubleshooting DNS

## 1. Verificación Local (Cliente Windows)
- Problema más común: Bloqueo de resolución DNS por parte del ISP (ej. `ipconfig /flushdns` falla al corregirlo o `nslookup` arroja `Server failed`).
- Corrección Primaria: Cambio de DNS en la placa de red a `8.8.8.8` y vaciado de caché.

## 2. DuckDNS en el VPS
**Ruta del Script:** `~/duckdns/duck.sh`

```bash
echo url="https://www.duckdns.org/update?domains=TU_DOMINIO&token=TU_TOKEN&ip=" | curl -k -o ~/duckdns/duck.log -K -
```

**CronJob Asignado:**
```text
*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1
```

## 3. Integración OMEGA
`inject_phantom_single_url.py` asume que el host primario es `iptv-ape.duckdns.org`.
Asegurarse de usar SSL (HTTPS) con un certificado vigente para evitar bloqueos del reproductor.
