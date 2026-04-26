# NET SHIELD Fase 3 — Auditoría y explicación línea por línea

Captura del estado en el VPS `178.156.147.234` del 2026-04-21.
El WireGuard está **LIVE desde 2026-04-20**, contrario a lo que decía la memoria ("PENDING").
Este documento explica qué hace cada línea real — **no se tocó nada en el VPS**.

---

## 1. Topología real (no la planeada)

```
┌────────────────────────┐           UDP 51820 (WireGuard)             ┌──────────────────────────┐
│  ONN 4K (Android TV)   │◀══════════════════════════════════════════▶│  VPS Hetzner 178.156.147.234 │
│  LAN HFRC, Bogotá      │   full-tunnel 0.0.0.0/0 vía túnel WG         │  eth0 → Internet              │
│  (salida pública       │                                              │  wg0  10.200.0.1              │
│   ETB 181.63.176.21)   │   Subred túnel: 10.200.0.0/24                │  unbound 53 (Fase 1)          │
│   Peer IP 10.200.0.2   │                                              │  MASQUERADE eth0              │
└────────────────────────┘                                              └──────────────────────────┘
```

Cliente real: **Walmart Onn 4K Android TV box**, no un PC Windows.
Split-tunnel: **no existe** — el AllowedIPs del cliente es `0.0.0.0/0` = full-tunnel.

---

## 2. `/etc/wireguard/wg0.conf` — explicación línea por línea

### `[Interface]` — parámetros del server local

| Línea | Significado |
|---|---|
| `PrivateKey = SD3o5rm...E2A=` | Clave privada Curve25519 del server. Se empareja con `server_public.key = 9W984X9W/...ACE=`. |
| `Address = 10.200.0.1/24` | IP que tendrá `wg0` dentro del túnel. `/24` define la subred WireGuard `10.200.0.0/24`. El server es `.1`. |
| `ListenPort = 51820` | Puerto UDP donde el kernel escucha paquetes WG. Abierto en UFW regla 9, `ALLOW IN Anywhere`. |
| `MTU = 1380` | Maximum Transmission Unit del túnel. Conservador (default WG = 1420). ETB Colombia suele tener MTU pesado + encapsulado WG (~60 bytes overhead) → 1380 evita fragmentación en rutas PPPoE/ATM. |

### Bloque `PostUp` — se ejecuta tras levantar `wg0`

Son comandos shell que corre `wg-quick` al traer la interfaz arriba. Cada línea es iptables:

| Comando | Efecto |
|---|---|
| `iptables -I INPUT 1 -i wg0 -j ACCEPT` | Acepta paquetes que entren al host **desde** el túnel (ej: ONN 4K consultando unbound en `10.200.0.1:53`). `-I … 1` = inserta al tope. |
| `iptables -I FORWARD 1 -i wg0 -j ACCEPT` | Permite paquetes que **entran** por wg0 y deben ser ruteados hacia otras interfaces (p.e. hacia eth0 → Internet). |
| `iptables -I FORWARD 1 -o wg0 -j ACCEPT` | Permite paquetes que **salen** por wg0 (respuestas desde Internet hacia el cliente). |
| `iptables -I FORWARD 1 -s 10.200.0.0/24 -j ACCEPT` | Redundancia por source: cualquier paquete con IP origen del túnel es aceptado en FORWARD. |
| `iptables -I FORWARD 1 -d 10.200.0.0/24 -j ACCEPT` | Idem por destino. |
| `iptables -A FORWARD -i wg0 -j ACCEPT` | **Duplicado** de la regla `-I 1 -i wg0`; se agrega al final. Residuo histórico del tuneo aggressive. |
| `iptables -A FORWARD -o wg0 -j ACCEPT` | Idem duplicado. |
| `iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE` | **NAT crítico**: reescribe la IP origen de cualquier paquete que salga por eth0 a la IP pública del VPS. Es lo que permite que el ONN 4K navegue Internet desde `10.200.0.2`. |
| `…DSCP --set-dscp-class EFPostUp = … DSCP --set-dscp-class EF` | **⚠ ANOMALÍA**: dos `PostUp =` quedaron concatenados en una sola línea física. Ver sección Anomalías abajo. A pesar del bug de formato, `iptables-save` muestra las 2 reglas DSCP PREROUTING wg0 y POSTROUTING wg0 aplicadas — probablemente `wg-quick` las ejecutó como una línea bash donde iptables tolera o se re-aplicaron manualmente. |
| `iptables -t mangle -A FORWARD -o wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu` | **MSS clamping en SYN salientes**: ajusta el Maximum Segment Size de TCP al Path MTU descubierto, previene black-holes por paquetes fragmentados. Crítico con MTU 1380. |
| `…FORWARD -i wg0 …TCPMSS` | Idem para SYN entrantes. |
| `…OUTPUT -o wg0 …TCPMSS` | MSS clamp para TCP originado desde el propio host (ej: unbound respondiendo). |

### Bloque `PostDown` — se ejecuta al bajar `wg0`

Son las contra-reglas `-D` (delete) de las PostUp, para limpiar iptables si se detiene el servicio. Mismo comentario sobre la anomalía de línea concatenada en `PostDown … EFPostDown = … EF`.

### `[Peer]` — cliente autorizado

| Línea | Significado |
|---|---|
| `# ONN 4K (HFRC)` | Comentario etiquetando el peer. |
| `PublicKey = 5idLPkMF...DEjM=` | Clave pública del cliente. Paquetes entrantes firmados por esta key se asocian a este peer. |
| `PresharedKey = fjAq890B...qtE=` | Capa extra de simetría AES-256 sobre la sesión. Si alguien rompe Curve25519 en el futuro (computación cuántica), el PSK sigue protegiendo. |
| `AllowedIPs = 10.200.0.2/32` | **Crypto-routing**: el server solo aceptará paquetes de este peer con IP origen `10.200.0.2`, y enrutará hacia él paquetes con destino `10.200.0.2`. |

---

## 3. `/etc/wireguard/onn.conf` — explicación línea por línea (lado cliente)

| Línea | Significado |
|---|---|
| `PrivateKey = QCuUgvz...UGM=` | Privkey del ONN 4K. Se importa al box Android TV via QR (está generado en `/tmp/onn_wg_qr.png`). |
| `Address = 10.200.0.2/32` | IP que tendrá el cliente dentro del túnel. `/32` = solo su IP, no toda la subred. |
| `DNS = 10.200.0.1` | El cliente resolverá DNS preguntando al VPS vía túnel → el unbound de Fase 1 responde (cache hit 39× vs DNS ETB). |
| `MTU = 1380` | Debe coincidir con la del server. |
| `PublicKey = 9W984X9W...ACE=` | Pubkey del server — autentica al endpoint. |
| `PresharedKey = fjAq890B...qtE=` | Misma PSK que en wg0.conf. |
| `Endpoint = 178.156.147.234:51820` | Dirección pública del server. |
| `AllowedIPs = 0.0.0.0/0` | **FULL-TUNNEL**: todo el tráfico IP del ONN 4K sale por el VPS. NO es split-tunnel selectivo. |
| `PersistentKeepalive = 15` | El cliente envía un paquete vacío cada 15s para mantener la sesión NAT viva contra el router ETB. Más agresivo que el default 25s (ETB tiene NAT timeouts cortos). |

---

## 4. QoS / DSCP — marcado EF (Expedited Forwarding)

El VPS marca TODO el tráfico IPTV con `DSCP 0x2e (EF = 46 decimal)`. Esto es relevante si algún hop en el camino respeta DiffServ:

```
mangle PREROUTING  -i wg0                            → DSCP 0x2e   (entra del túnel → marcado EF)
mangle POSTROUTING -o wg0                            → DSCP 0x2e   (sale hacia el túnel → EF)
mangle OUTPUT      -d 149.18.45.78/32                → DSCP 0x2e   (tráfico local del VPS a x1megaott origin)
mangle OUTPUT      -d 149.18.45.119/32               → DSCP 0x2e
mangle OUTPUT      -d 149.18.45.189/32               → DSCP 0x2e
mangle OUTPUT      -d 91.208.115.23/32               → DSCP 0x2e   (line.tivi-ott)
mangle OUTPUT      -d 172.110.220.61/32              → DSCP 0x2e   (ky-tv.cc)
```

EF = clase de servicio para VoIP/video en tiempo real. No todos los ISPs lo respetan, pero no daña y puede ayudar en peering de calidad.

---

## 5. Rutas estáticas hacia origins IPTV

Además del DSCP, el VPS tiene rutas explícitas con ventana de congestión inicial grande:

```
91.208.115.0/24  via 172.31.1.1 dev eth0 initcwnd 100 rto_min lock 40ms initrwnd 100
149.18.45.0/24   via 172.31.1.1 dev eth0 initcwnd 100 rto_min lock 40ms initrwnd 100
172.110.220.0/24 via 172.31.1.1 dev eth0 initcwnd 100 rto_min lock 40ms initrwnd 100
```

- `initcwnd 100` + `initrwnd 100`: congestion/receive window inicial de 100 MSS — arranca transferencias a toda velocidad en lugar del default 10.
- `rto_min lock 40ms`: retransmit timeout mínimo bajado a 40ms (default 200ms) → reacción más rápida a pérdidas.

Esto está tuneado explícitamente para HLS segments donde latencia del primer byte importa más que throughput sostenido.

---

## 6. Integración con Fase 1 unbound

`/etc/unbound/unbound.conf.d/iptv-ape.conf`:
```
interface: 178.156.147.234     # público (181.63.176.21 directo)
interface: 127.0.0.1           # localhost
interface: 10.200.0.1          # ← escucha también dentro del túnel
access-control: 127.0.0.1/32     allow
access-control: 10.200.0.0/24    allow   # peers WG resuelven
access-control: 181.63.176.21/32 allow   # HFRC directo (whitelist IP)
access-control: 0.0.0.0/0        refuse
```

Flujo DNS del ONN 4K: consulta → `10.200.0.1:53` (unbound) → cache hit/fetch → respuesta.
Métricas del cache están en Fase 1 dashboard (`iptv-ape.duckdns.org/monitor/`).

---

## 7. ⚠ Anomalías detectadas (no corregidas — opción D)

### A1. Línea concatenada en `PostUp`/`PostDown` DSCP

En `wg0.conf` aparece:
```
PostUp = iptables -t mangle -A PREROUTING -i wg0 -j DSCP --set-dscp-class EFPostUp = iptables -t mangle -A POSTROUTING -o wg0 -j DSCP --set-dscp-class EF
```

Dos directivas `PostUp =` en la misma línea física. `wg-quick` parsea line-by-line; la segunda `PostUp` queda como parte de los args de `iptables` de la primera. A pesar del bug, **ambas reglas DSCP están activas** (verificado en `iptables-save`). Posibles explicaciones:
- `iptables` acepta el `--set-dscp-class EF` leyendo solo los chars válidos y el resto se convierte en comando shell aparte.
- Las reglas se re-aplicaron manualmente fuera del PostUp.

**Riesgo**: si `wg-quick@wg0` se reinicia, puede que la segunda regla NO se re-aplique y el marcado DSCP POSTROUTING desaparezca. Recomendado separar en dos líneas, pero requiere tocar el VPS — fuera de alcance de opción D.

### A2. Reglas FORWARD duplicadas

`iptables-save` muestra `-A FORWARD -i wg0 -j ACCEPT` y `-A FORWARD -o wg0 -j ACCEPT` **dos veces cada una**. Causa: el `PostUp` hace `-I 1` (insert) Y `-A` (append) de las mismas reglas. Duplicidad inocua pero ruidosa.

### A3. `MASQUERADE` sin restricción de source

La regla NAT actual es:
```
-A POSTROUTING -o eth0 -j MASQUERADE
```

Enmascara **TODO** lo que salga por eth0, incluyendo tráfico del host que no venga del túnel. Funcional pero laxa. Cleaner sería `-s 10.200.0.0/24 -o eth0 -j MASQUERADE`.

### A4. Archivos de backup de wg0.conf

`wg0.conf.bak_1776653125` y `wg0.conf.bak2` existen en `/etc/wireguard/`. Si alguna vez alguien confunde el archivo activo, podría recargar una config obsoleta.

---

## 8. Checklist de salud (al momento del audit)

| Check | Estado | Dato |
|---|---|---|
| `wg-quick@wg0` activo | ✅ | since 2026-04-20 01:52:54 UTC (2 días) |
| `unbound` activo | ✅ | pid 433593 |
| UFW activo con port 51820/udp | ✅ | rule [ 9] |
| `ip_forward = 1` | ✅ | sysctl |
| IPv6 forwarding apagado | ✅ | `net.ipv6.conf.all.forwarding = 0` |
| Peer ONN 4K handshake reciente | ✅ | hace 60s |
| Tráfico del peer | ✅ | RX 877 MiB / TX 52.3 GiB (productivo) |
| Fase 1 unbound escucha en 10.200.0.1 | ✅ | `/etc/unbound/unbound.conf.d/iptv-ape.conf` |
| DSCP rules en mangle | ✅ | aplicadas a pesar de A1 |
| MSS clamping | ✅ | 3 reglas |

---

## 9. Gap contra el diseño original de Fase 3 (split-tunnel selectivo)

| Atributo | Diseño Fase 3 (plan) | Estado real (LIVE) |
|---|---|---|
| Subred | `10.66.0.0/24` | `10.200.0.0/24` |
| AllowedIPs cliente | 4 entradas selectivas IPTV | `0.0.0.0/0` (full-tunnel) |
| PersistentKeepalive | 25s | 15s |
| MTU | 1420 | 1380 |
| Preshared key | no planeado | sí (PSK AES layer) |
| QoS DSCP EF | no planeado | sí, 8 reglas mangle |
| Rutas estáticas con initcwnd 100 | no planeado | sí, 3 /24 |
| Cliente objetivo | Windows PC | Android TV (ONN 4K) |
| Integración unbound vía túnel | previsto | confirmado |

**Diagnóstico**: lo que está LIVE es un diseño **más completo** que el plan Fase 3 original — salvo por el split-tunnel (que es full-tunnel en el real). La config LIVE añadió valor con PSK, DSCP EF, y tuning cwnd. El cambio de cliente (ONN 4K vs PC Windows) explica el full-tunnel: un box TV no necesita split, todo el consumo es IPTV.
