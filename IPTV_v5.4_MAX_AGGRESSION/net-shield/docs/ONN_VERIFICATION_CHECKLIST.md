# Checklist de verificación desde el ONN 4K (Walmart Onn Android TV)

**Fecha ventana hardening+quantum**: 2026-04-22 `NS_TS=20260422_045906`
**VPS endpoint**: `178.156.147.234:51820/udp`
**IP tu ONN en túnel**: `10.200.0.2`

El ONN 4K **no necesita tocarse**. Todos los cambios fueron server-side. Lo que puedes comprobar desde tu TV es:

---

## 1. Verificación instantánea (ya mismo, <10 segundos)

Abre cualquier app IPTV que venga usando (TiviMate, IPTV Smarters, Kodi, etc). Si está reproduciendo fluido = todo OK. Durante toda la ventana de tuning el stream NO se interrumpió (handshake nunca pasó de 120s, tráfico continuo).

---

## 2. Verificación desde el ONN app oficial WireGuard

1. Abrir la app WireGuard
2. Tocar el túnel activo
3. Ver:
   - **"Last handshake"** debería ser reciente (< 2 minutos)
   - **"Transfer"** debería mostrar bytes subidos/bajados creciendo al reproducir

---

## 3. Speedtest desde el ONN (prueba real el path WG optimizado)

Descarga **Speedtest by Ookla** (Google Play). Ejecuta con túnel ACTIVO:

| Métrica | Esperado con quantum tuning |
|---|---|
| **Ping** | < 60ms (Hetzner Ashburn ↔ Bogotá ETB son ~50-70ms base) |
| **Download** | >100 Mbps si tu plan ETB lo da (buffers 128 MB permiten picos) |
| **Upload** | Limitado por uplink de casa |
| **Jitter** | < 5ms (CAKE queue av_delay = 1μs en tráfico EF) |
| **Packet loss** | 0% (CAKE drops = 5×10⁻⁷, prácticamente cero) |

Compara contra el mismo speedtest SIN el túnel (desactiva WG un momento). Si con túnel es **igual o mejor que sin túnel** → optimización está trabajando.

> 🎯 Normalmente un VPN añade ~5-15% overhead por la encriptación. Con BBR+FQ+CAKE+DSCP EF el overhead puede ser **negativo** (el VPS con BBR puede escalar mejor que tu link directo ETB, especialmente en horas pico cuando ETB hace throttling).

---

## 4. Test de streaming 4K real

1. Abre algo que sepas que es 4K (8-20 Mbps):
   - YouTube canal 4K
   - Un stream IPTV 4K (si lo tienes)
2. Mientras reproduce, en otra ventana abre algo que compita (descarga grande, otro stream)
3. **El 4K debería seguir fluido** aunque compitas con tráfico bulk. Esto porque:
   - CAKE mete el tráfico IPTV en tin "Voice" (DSCP EF)
   - El tráfico de descargas cae en tin "Best Effort"
   - Best Effort cede ancho de banda a Voice automáticamente

---

## 5. Latencia fina — ping al VPS (opcional, requiere terminal)

Si tienes Termux o una app terminal en el ONN:

```bash
# Ping al server wg0 (dentro del túnel, latencia pura del path)
ping -c 20 10.200.0.1

# Ping al endpoint público del VPS (latencia cruda ETB → Hetzner)
ping -c 20 178.156.147.234
```

| Ping a | Valor esperado | Significado |
|---|---|---|
| `10.200.0.1` | 45-70ms | Latencia ETB→Hetzner + encapsulado WG |
| `178.156.147.234` | 45-70ms (mismo) | Latencia ETB→Hetzner cruda |
| Diferencia | < 5ms | El overhead de cifrado WG es trivial |

Si `10.200.0.1` sube más de 100ms: algo en el path WAN degradó, no es nuestro tuning.

---

## 6. Test "congestion ladder" (el test duro)

Con el túnel activo, abre **4 streams IPTV simultáneos diferentes**. CAKE + BBR deberían:

- Dividir el uplink/downlink equitativamente entre los 4 (fq_codel pacing)
- Ninguno debería bufferear más que los otros
- Si hay un quinto flow Best Effort (ej: update de Netflix), ese cede primero

Si los 4 IPTV se mantienen sin buffering → el stack `wg0 fq + CAKE diffserv4 + DSCP EF` está clavado.

---

## 7. Observabilidad server-side

Si quieres ver desde mi terminal el estado en vivo del túnel de tu ONN:

```bash
# ver cuánto tráfico y el handshake actual
ssh root@178.156.147.234 "wg show wg0"

# ver la distribución de tráfico por prioridad
ssh root@178.156.147.234 "tc -s qdisc show dev eth0 | head -40"

# ver latencia de cola actual en wg0
ssh root@178.156.147.234 "tc -s qdisc show dev wg0"
```

Esos comandos los puedes pedir a cualquier hora. Los números `av_delay` en CAKE son en microsegundos (1 microsegundo = 1 millonésima de segundo).

---

## 8. Qué hacer si algo empeora

Si notas **algún** síntoma de degradación (buffering mayor, stuck, resolución menor):

1. Envíame un ping y reviso inmediatamente:
   - `wg show wg0` (handshake + contadores)
   - Logs kernel recientes (`dmesg | tail -50`)
   - Estado CAKE / fq
2. Rollback del tuning quantum está listo en 3 segundos:
   ```bash
   ssh root@178.156.147.234 "rm /etc/sysctl.d/99-netshield-quantum.conf && sysctl --system"
   ```
3. Rollback del fq qdisc en wg0:
   ```bash
   ssh root@178.156.147.234 "tc qdisc del dev wg0 root 2>/dev/null; tc qdisc show dev wg0"
   ```
   (volverá a `noqueue`, sin downtime)

---

## 9. Resumen de qué cambió hoy en el VPS

| Capa | Cambio aplicado | Beneficio ONN 4K |
|---|---|---|
| `wg0.conf` | PostUp/PostDown DSCP separados (A1) | Garantía de QoS tras reinicio |
| `wg0.conf` | MASQUERADE `-s 10.200.0.0/24` (A3) | Trazabilidad NAT precisa |
| `wg0.conf` | FORWARD duplicados eliminados (A2) | iptables más rápido |
| `wg0.conf` | `tc qdisc replace dev wg0 root fq pacing` | Pacing BBR activo en WG |
| `sysctl` | Buffers TCP 64→128 MB | Absorbe picos 4K sin drops |
| `sysctl` | `netdev_max_backlog 5k→16k` | Ráfagas HLS sin packet loss |
| `sysctl` | `tcp_limit_output_bytes 1M→128K` | Menos latencia de encolado |
| `sysctl` | `dev_weight 64→128` | Menos context switches kernel |
| `sysctl` | `tcp_min_rtt_wlen 300s→30s` | BBR se adapta 10× más rápido |
| `sysctl` | `udp_mem` ampliado | WG UDP encapsulation más holgado |
| `backups` | `OLD_*` renombrados (A4) | Sin confusión en reboots |

**No se cambió en el cliente ONN 4K**. Todo es server-side, transparente.

---

## 10. Lo que NO se tocó (roadmap para siguientes ventanas)

- **MTU 1380 → 1420**: requiere bajar/subir wg0 y test canary con peer secundario. ETB drop ICMP impide PMTU discovery real.
- **Etapa 2 validator systemd**: 24-48h de observación antes (plan §6).
- **Etapa 3 collector + scorer JSONL**: depende de Etapa 2.
- **Etapa 4-5 adaptive routing**: depende de Etapa 3.
