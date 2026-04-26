# NET SHIELD — Runbook Etapa 0 + 1

**Alcance**: captura baseline completa (Etapa 0) + hardening determinista (Etapa 1) del WireGuard server en `178.156.147.234`.
**Downtime esperado**: **cero**. Se aplica hot-swap de iptables sin reiniciar `wg-quick@wg0`.
**Duración estimada**: 25–40 min incluyendo validación.
**Prerequisito**: acceso SSH root al VPS, control de tu terminal local (no corriendo sobre el propio túnel WG — si usas el ONN 4K como salida, valida que puedes SSH **directamente** antes de empezar).
**Producto final**: `wg0.conf` saneado, reglas iptables limpias, backup verificable, criterios de aceptación formales.

---

## 0. Variables del runbook

Exporta estas variables en la terminal local al inicio de la ventana. El runbook las referencia en todos los comandos.

```bash
export NS_VPS="178.156.147.234"
export NS_USER="root"
export NS_TS="$(date -u +%Y%m%d_%H%M%S)"
export NS_BACKUP_REMOTE="/root/net-shield/backup_pre_stage1_${NS_TS}"
export NS_BACKUP_LOCAL="${PWD}/backup_pre_stage1_${NS_TS}"
export NS_WG_IF="wg0"
export NS_WG_SUBNET="10.200.0.0/24"
export NS_PEER_PUBKEY="5idLPkMF3/53qLQk04u6wyngXKgEC8XxcMnPV8NDEjM="
```

Verifica SSH sin lag y sin pasar por el túnel WG que vas a intervenir:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=5 "${NS_USER}@${NS_VPS}" "echo SSH_OK && hostname && date -u"
```

Resultado esperado: `SSH_OK`, hostname `ubuntu-2gb-ash-1`, fecha UTC. Si no devuelve `SSH_OK` en menos de 2 s, **aborta** — no tienes camino fuera de banda.

---

## 1. Etapa 0 — Baseline y backup

### 1.1 Verificar precondiciones de salud

```bash
ssh "${NS_USER}@${NS_VPS}" bash <<'EOF'
set -e
echo "── wg-quick active? ──"
systemctl is-active wg-quick@wg0 || { echo "ABORT: wg-quick@wg0 no activo"; exit 1; }
echo "── handshake reciente? ──"
HS=$(wg show wg0 latest-handshakes | awk '{print $2}' | head -1)
AGE=$(( $(date +%s) - HS ))
echo "handshake age: ${AGE}s"
(( AGE < 180 )) || { echo "ABORT: handshake stale (${AGE}s)"; exit 1; }
echo "── ip_forward ──"
sysctl -n net.ipv4.ip_forward | grep -q '^1$' || { echo "ABORT: ip_forward=0"; exit 1; }
echo "── unbound activo? ──"
systemctl is-active unbound || { echo "ABORT: unbound down"; exit 1; }
echo "── DSCP rules presentes? ──"
iptables -t mangle -S PREROUTING  | grep -q 'wg0 -j DSCP' || { echo "ABORT: falta DSCP PRE"; exit 1; }
iptables -t mangle -S POSTROUTING | grep -q 'wg0 -j DSCP' || { echo "ABORT: falta DSCP POST"; exit 1; }
echo "── MSS clamp presente? ──"
iptables -t mangle -S FORWARD | grep -q TCPMSS || { echo "ABORT: falta MSS clamp"; exit 1; }
echo "[OK] precondiciones satisfechas"
EOF
```

Si alguna precondición falla → **STOP, investigar, no continuar**. El plan asume baseline saludable; si no lo está, primero restaurar, luego hardening.

### 1.2 Dump completo al VPS

```bash
ssh "${NS_USER}@${NS_VPS}" bash <<EOF
set -e
install -d -m 700 "${NS_BACKUP_REMOTE}"
cd "${NS_BACKUP_REMOTE}"

# Configs WG (incluye claves; dir restringido a 700)
cp -a /etc/wireguard/wg0.conf                      wg0.conf
cp -a /etc/wireguard/onn.conf                      onn.conf
cp -a /etc/wireguard/server_private.key            server_private.key
cp -a /etc/wireguard/server_public.key             server_public.key
cp -a /etc/wireguard/onn_private.key               onn_private.key
cp -a /etc/wireguard/onn_public.key                onn_public.key
cp -a /etc/wireguard/onn_preshared.key             onn_preshared.key
cp -a /etc/wireguard/wg0.conf.bak_1776653125       wg0.conf.bak_1776653125 2>/dev/null || true
cp -a /etc/wireguard/wg0.conf.bak2                 wg0.conf.bak2 2>/dev/null || true

# Runtime
wg show all dump                                 > wg-show-dump.txt
wg show all                                      > wg-show-human.txt
ip -br addr show                                 > ip-addr.txt
ip route show                                    > ip-route.txt
ip -6 route show                                 > ip6-route.txt
ip rule show                                     > ip-rule.txt
ss -lntup                                        > ss-listen.txt

# Firewall completo
iptables-save                                    > iptables-save.txt
ip6tables-save                                   > ip6tables-save.txt
ufw status numbered                              > ufw-numbered.txt
ufw status verbose                               > ufw-verbose.txt

# sysctl relevantes
sysctl -a 2>/dev/null | grep -E 'ip_forward|forwarding|rp_filter|tcp_mtu_probing|conntrack' > sysctl.txt

# Unbound integración
cp -a /etc/unbound/unbound.conf                     unbound.conf 2>/dev/null || true
cp -a /etc/unbound/unbound.conf.d/                  unbound.conf.d/ 2>/dev/null || true

# systemd
systemctl status wg-quick@wg0 --no-pager -n 50 > systemd-wg.txt 2>&1
systemctl status unbound      --no-pager -n 20 > systemd-unbound.txt 2>&1
journalctl -u wg-quick@wg0 --no-pager -n 200   > journal-wg.txt 2>&1

# Checksum de archivos críticos
sha256sum wg0.conf onn.conf *.key iptables-save.txt unbound.conf > SHA256SUMS

chmod 700 "${NS_BACKUP_REMOTE}"
chmod 600 "${NS_BACKUP_REMOTE}"/*
ls -la "${NS_BACKUP_REMOTE}"
EOF
```

### 1.3 Traer backup al local (cifrado y read-only)

```bash
mkdir -p "${NS_BACKUP_LOCAL}"
chmod 700 "${NS_BACKUP_LOCAL}"
scp -r "${NS_USER}@${NS_VPS}:${NS_BACKUP_REMOTE}/" "${NS_BACKUP_LOCAL}/"
chmod -R u=rX,go= "${NS_BACKUP_LOCAL}"
ls -la "${NS_BACKUP_LOCAL}/${NS_BACKUP_REMOTE##*/}/"
```

### 1.4 Crear tarball cifrado como snapshot inmutable

```bash
ssh "${NS_USER}@${NS_VPS}" \
  "cd /root/net-shield && tar -czf backup_pre_stage1_${NS_TS}.tar.gz backup_pre_stage1_${NS_TS}/ && sha256sum backup_pre_stage1_${NS_TS}.tar.gz"
scp "${NS_USER}@${NS_VPS}:/root/net-shield/backup_pre_stage1_${NS_TS}.tar.gz" "${NS_BACKUP_LOCAL}/"
sha256sum "${NS_BACKUP_LOCAL}/backup_pre_stage1_${NS_TS}.tar.gz"
```

### 1.5 Registrar punto de baseline

```bash
echo "baseline:${NS_TS}:${NS_VPS}:$(sha256sum ${NS_BACKUP_LOCAL}/backup_pre_stage1_${NS_TS}.tar.gz | awk '{print $1}')" \
  >> "${NS_BACKUP_LOCAL}/../net-shield-baseline.log"
```

### ✅ Criterios de aceptación Etapa 0

| # | Check | Comando verificador |
|---|---|---|
| 0.1 | Precondiciones baseline OK | `ssh … bash -s` de §1.1 retorna `[OK]` |
| 0.2 | Backup remoto existe y es legible | `ssh … ls ${NS_BACKUP_REMOTE}` muestra ≥14 archivos |
| 0.3 | Tarball replicado local | `test -s ${NS_BACKUP_LOCAL}/backup_pre_stage1_${NS_TS}.tar.gz` |
| 0.4 | Checksums coinciden remoto↔local | `diff <(ssh … sha256sum …tar.gz) <(sha256sum ${NS_BACKUP_LOCAL}/…tar.gz)` = vacío |
| 0.5 | `wg-quick` sigue activo tras dump | `ssh … systemctl is-active wg-quick@wg0` = `active` |

Si 0.1–0.5 pasan → procedes a Etapa 1. Si no, investiga y repite §1.1.

---

## 2. Etapa 1 — Hardening determinista

**Filosofía**: cambios **en caliente primero** (hot-swap de iptables sin restart), luego sustituir `wg0.conf` a disk. Así no cortas el túnel y no corres el riesgo del `wg-quick restart` que con el PostDown mal formado podría dejar reglas huérfanas.

### 2.1 Generar `wg0.conf.hardened` localmente y revisar

El archivo hardened queda en el repo para trazabilidad antes de subirlo:

```bash
# Trabaja en una copia local del wg0.conf actual extraído del backup
cp "${NS_BACKUP_LOCAL}/backup_pre_stage1_${NS_TS}/wg0.conf" /tmp/wg0.conf.current
```

Crea [wg0.conf.hardened](../wireguard/AUDIT_2026-04-21/wg0.conf.hardened) con este contenido exacto:

```ini
# NET SHIELD wg0 — hardened (Stage 1, timestamp: ${NS_TS})
# Diff vs baseline:
#   - PostUp DSCP separado en dos líneas (A1 fix)
#   - PostDown DSCP separado en dos líneas (A1 fix)
#   - MASQUERADE restringido a -s 10.200.0.0/24 (A3 fix)
#   - Eliminados -A FORWARD duplicados (A2 fix)
[Interface]
PrivateKey = __KEEP_EXISTING_PRIVKEY__
Address    = 10.200.0.1/24
ListenPort = 51820
MTU        = 1380

PostUp = iptables -I INPUT 1 -i wg0 -j ACCEPT
PostUp = iptables -I FORWARD 1 -i wg0 -j ACCEPT
PostUp = iptables -I FORWARD 1 -o wg0 -j ACCEPT
PostUp = iptables -I FORWARD 1 -s 10.200.0.0/24 -j ACCEPT
PostUp = iptables -I FORWARD 1 -d 10.200.0.0/24 -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -s 10.200.0.0/24 -o eth0 -j MASQUERADE
PostUp = iptables -t mangle -A PREROUTING  -i wg0 -j DSCP --set-dscp-class EF
PostUp = iptables -t mangle -A POSTROUTING -o wg0 -j DSCP --set-dscp-class EF
PostUp = iptables -t mangle -A FORWARD -o wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
PostUp = iptables -t mangle -A FORWARD -i wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
PostUp = iptables -t mangle -A OUTPUT  -o wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu

PostDown = iptables -D INPUT -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -o wg0 -j ACCEPT
PostDown = iptables -D FORWARD -s 10.200.0.0/24 -j ACCEPT
PostDown = iptables -D FORWARD -d 10.200.0.0/24 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s 10.200.0.0/24 -o eth0 -j MASQUERADE
PostDown = iptables -t mangle -D PREROUTING  -i wg0 -j DSCP --set-dscp-class EF
PostDown = iptables -t mangle -D POSTROUTING -o wg0 -j DSCP --set-dscp-class EF
PostDown = iptables -t mangle -D FORWARD -o wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
PostDown = iptables -t mangle -D FORWARD -i wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
PostDown = iptables -t mangle -D OUTPUT  -o wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu

[Peer]
# ONN 4K (HFRC)
PublicKey    = 5idLPkMF3/53qLQk04u6wyngXKgEC8XxcMnPV8NDEjM=
PresharedKey = __KEEP_EXISTING_PSK__
AllowedIPs   = 10.200.0.2/32
```

> `__KEEP_EXISTING_PRIVKEY__` y `__KEEP_EXISTING_PSK__` son placeholders; la construcción real del archivo preserva los valores actuales vía `awk`/`sed` en la etapa 2.3 — no los tipees a mano.

### 2.2 Diff humano-revisable

```bash
# Generar hardened real desde el current preservando secretos
awk '
/^PrivateKey/    { print; next }
/^PresharedKey/  { print; next }
/^PostUp|^PostDown/ { next }
/^\[Interface\]/ { intf=1 }
{ print }
' /tmp/wg0.conf.current > /tmp/wg0.conf.skeleton
# → ahora inyecta los PostUp/PostDown del bloque 2.1 (scripted abajo en 2.3).

# Diff estructural a ojo
diff -u /tmp/wg0.conf.current /tmp/wg0.conf.hardened | less
```

**Revisa manualmente** que el diff contiene **solo** estas 6 categorías de cambio:

1. 2 líneas `PostUp` DSCP separadas (antes: 1 concatenada)
2. 2 líneas `PostDown` DSCP separadas (antes: 1 concatenada)
3. `MASQUERADE` ahora con `-s 10.200.0.0/24` (antes: sin `-s`)
4. Eliminadas las 2 líneas `PostUp = iptables -A FORWARD …` (duplicadas)
5. PostDown sincronizado con PostUp simétricamente (añadidas las `-D` que faltaban de las `-I`)
6. Comentarios de cabecera añadidos

Si aparece **cualquier otro cambio** → aborta, algo se está reescribiendo que no debe.

### 2.3 Construir `wg0.conf.hardened` en el VPS (preservando secretos in-place)

```bash
ssh "${NS_USER}@${NS_VPS}" bash <<EOF
set -e
cd /etc/wireguard

# Extraer líneas de secretos del actual
CURRENT_PRIV=\$(awk -F' = ' '/^PrivateKey/ {print \$2}' wg0.conf)
CURRENT_PSK=\$(awk -F' = ' '/^PresharedKey/ {print \$2}' wg0.conf)

[[ -n "\$CURRENT_PRIV" ]] || { echo "ABORT: no se pudo leer PrivateKey"; exit 1; }
[[ -n "\$CURRENT_PSK"  ]] || { echo "ABORT: no se pudo leer PresharedKey"; exit 1; }

# Construir wg0.conf.hardened
umask 077
cat > wg0.conf.hardened <<HARD
# NET SHIELD wg0 — hardened (Stage 1, ${NS_TS})
[Interface]
PrivateKey = \${CURRENT_PRIV}
Address    = 10.200.0.1/24
ListenPort = 51820
MTU        = 1380

PostUp = iptables -I INPUT 1 -i wg0 -j ACCEPT
PostUp = iptables -I FORWARD 1 -i wg0 -j ACCEPT
PostUp = iptables -I FORWARD 1 -o wg0 -j ACCEPT
PostUp = iptables -I FORWARD 1 -s 10.200.0.0/24 -j ACCEPT
PostUp = iptables -I FORWARD 1 -d 10.200.0.0/24 -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -s 10.200.0.0/24 -o eth0 -j MASQUERADE
PostUp = iptables -t mangle -A PREROUTING  -i wg0 -j DSCP --set-dscp-class EF
PostUp = iptables -t mangle -A POSTROUTING -o wg0 -j DSCP --set-dscp-class EF
PostUp = iptables -t mangle -A FORWARD -o wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
PostUp = iptables -t mangle -A FORWARD -i wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
PostUp = iptables -t mangle -A OUTPUT  -o wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu

PostDown = iptables -D INPUT -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -o wg0 -j ACCEPT
PostDown = iptables -D FORWARD -s 10.200.0.0/24 -j ACCEPT
PostDown = iptables -D FORWARD -d 10.200.0.0/24 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s 10.200.0.0/24 -o eth0 -j MASQUERADE
PostDown = iptables -t mangle -D PREROUTING  -i wg0 -j DSCP --set-dscp-class EF
PostDown = iptables -t mangle -D POSTROUTING -o wg0 -j DSCP --set-dscp-class EF
PostDown = iptables -t mangle -D FORWARD -o wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
PostDown = iptables -t mangle -D FORWARD -i wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
PostDown = iptables -t mangle -D OUTPUT  -o wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu

[Peer]
# ONN 4K (HFRC)
PublicKey    = ${NS_PEER_PUBKEY}
PresharedKey = \${CURRENT_PSK}
AllowedIPs   = 10.200.0.2/32
HARD

chmod 600 wg0.conf.hardened

# Validar parseo con wg-quick strip
if ! wg-quick strip ./wg0.conf.hardened > /dev/null 2>&1; then
    echo "ABORT: wg-quick strip falla en hardened — NO continuar"
    diff wg0.conf wg0.conf.hardened || true
    exit 1
fi
echo "[OK] wg0.conf.hardened construido y validado (wg-quick strip OK)"
EOF
```

### 2.4 Hot-swap de iptables (sin restart de wg-quick)

**Sin downtime.** Aplica los cambios en caliente al iptables vivo. Si algo sale mal en cualquier paso, el §4 rollback in-caliente lo revierte en segundos.

```bash
ssh "${NS_USER}@${NS_VPS}" bash <<'EOF'
set -e
echo "── Snapshot iptables pre-hotswap ──"
iptables-save > /tmp/iptables.pre_hotswap.txt

echo "── Fix A3: MASQUERADE restringido ──"
# Añadir la nueva regla ANTES de quitar la vieja (evita ventana sin NAT)
iptables -t nat -I POSTROUTING 1 -s 10.200.0.0/24 -o eth0 -j MASQUERADE
# Quitar la vieja catch-all
iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

echo "── Fix A2: eliminar FORWARD duplicados ──"
# Hay 2 reglas '-A FORWARD -i wg0 -j ACCEPT' redundantes (y 2 para -o wg0).
# Las que quedan al final son los '-A' (append). Eliminamos UNA copia de cada.
iptables -D FORWARD -i wg0 -j ACCEPT
iptables -D FORWARD -o wg0 -j ACCEPT

echo "── Verificar conteo de duplicados ──"
# Esperado: UNA sola regla -i wg0 y UNA sola -o wg0 en FORWARD
I_COUNT=$(iptables -S FORWARD | grep -c '\-i wg0 -j ACCEPT$')
O_COUNT=$(iptables -S FORWARD | grep -c '\-o wg0 -j ACCEPT$')
echo "FORWARD -i wg0: ${I_COUNT}  |  FORWARD -o wg0: ${O_COUNT}"
# (los PostUp originales también tienen reglas con -I 1 insertadas al tope — esas se quedan)

echo "── A1 ya activo en memoria — las 2 DSCP rules están presentes, no tocar ──"
iptables -t mangle -S PREROUTING  | grep -q 'wg0 -j DSCP'
iptables -t mangle -S POSTROUTING | grep -q 'wg0 -j DSCP'

echo "── Snapshot iptables post-hotswap ──"
iptables-save > /tmp/iptables.post_hotswap.txt
echo "[OK] hot-swap completado"
EOF
```

### 2.5 Verificar que el tráfico sigue cursando

```bash
ssh "${NS_USER}@${NS_VPS}" bash <<'EOF'
echo "── Handshake actual ──"
wg show wg0 latest-handshakes
echo "── Transfer counters (antes/después al comparar) ──"
wg show wg0 transfer
EOF

# Espera 30s y re-ejecuta para ver si los contadores avanzan
sleep 30
ssh "${NS_USER}@${NS_VPS}" "wg show wg0 transfer"
```

Si `tx` no avanza en 30 s → posible ruptura. Ejecuta rollback §4 inmediato.

### 2.6 Sustituir `wg0.conf` a disk (no reinicia nada)

Este paso solo reemplaza el archivo en disco. La interfaz sigue corriendo en memoria con las reglas ya hotswaped. El archivo hardened queda listo para que el **próximo** restart de `wg-quick` aplique PostUp/PostDown correctos.

```bash
ssh "${NS_USER}@${NS_VPS}" bash <<EOF
set -e
cd /etc/wireguard

# Snapshot final pre-swap del disco
cp -a wg0.conf wg0.conf.bak_pre_hardening_${NS_TS}

# Swap atómico
mv wg0.conf.hardened wg0.conf
chmod 600 wg0.conf
chown root:root wg0.conf

# Verificación
echo "── wg0.conf nuevo ──"
head -5 wg0.conf
echo "── parseable? ──"
wg-quick strip /etc/wireguard/wg0.conf > /dev/null && echo "[OK]"

# Limpiar backups antiguos confusos
mv /etc/wireguard/wg0.conf.bak_1776653125 /etc/wireguard/OLD_wg0.conf.bak_1776653125 2>/dev/null || true
mv /etc/wireguard/wg0.conf.bak2           /etc/wireguard/OLD_wg0.conf.bak2           2>/dev/null || true
ls -la /etc/wireguard/
EOF
```

### 2.7 Validación simulada de restart (opcional, con permiso explícito del user)

> ⚠ **Este paso reinicia wg-quick@wg0**. Corta el túnel ~2–5 s. Requiere autorización explícita en la ventana. **Omítelo si el user dijo "no restart"** — el hardening en memoria ya está aplicado y el conf en disco queda coherente para el próximo reboot no planificado.

```bash
# SOLO si el user autoriza restart en la ventana:
ssh "${NS_USER}@${NS_VPS}" bash <<'EOF'
set -e
iptables-save > /tmp/iptables.pre_restart.txt
systemctl restart wg-quick@wg0
sleep 3
iptables-save > /tmp/iptables.post_restart.txt

# Diff esperado: solo reglas re-creadas por PostDown+PostUp, sin duplicados
diff /tmp/iptables.pre_restart.txt /tmp/iptables.post_restart.txt | head -40 || true

# Validar reglas DSCP presentes
iptables -t mangle -S PREROUTING  | grep 'wg0 -j DSCP' || { echo "FAIL: DSCP PRE faltante"; exit 1; }
iptables -t mangle -S POSTROUTING | grep 'wg0 -j DSCP' || { echo "FAIL: DSCP POST faltante"; exit 1; }

# Validar MASQUERADE restringido
iptables -t nat -S POSTROUTING | grep -E 'wg0|10.200' || true
iptables -t nat -S POSTROUTING | grep -q '\-s 10.200.0.0/24' || { echo "FAIL: MASQUERADE sin -s"; exit 1; }

# Validar handshake reconectado
sleep 10
HS=$(wg show wg0 latest-handshakes | awk '{print $2}' | head -1)
AGE=$(( $(date +%s) - HS ))
(( AGE < 30 )) || { echo "FAIL: handshake post-restart stale (${AGE}s)"; exit 1; }

echo "[OK] restart validation pasó"
EOF
```

---

## 3. Validación post-Etapa 1 — los 6 checks

```bash
ssh "${NS_USER}@${NS_VPS}" bash <<'EOF'
set -e
pass=0; fail=0
check(){ if eval "$2"; then echo "  [PASS] $1"; pass=$((pass+1)); else echo "  [FAIL] $1 :: $2"; fail=$((fail+1)); fi; }

echo "═══ Stage 1 acceptance checks ═══"

# C1: wg-quick activo
check "C1 wg-quick@wg0 active" \
  "systemctl is-active --quiet wg-quick@wg0"

# C2: handshake reciente
check "C2 handshake < 120s" \
  '[[ $(( $(date +%s) - $(wg show wg0 latest-handshakes | awk "{print \$2}" | head -1) )) -lt 120 ]]'

# C3: DSCP 2 reglas
check "C3 DSCP PRE+POST (2 rules)" \
  '[[ $(iptables -t mangle -S | grep -c "wg0 -j DSCP") -ge 2 ]]'

# C4: MASQUERADE con -s 10.200.0.0/24 presente
check "C4 MASQUERADE restringido" \
  'iptables -t nat -S POSTROUTING | grep -q "10.200.0.0/24 -o eth0 -j MASQUERADE"'

# C5: MASQUERADE catch-all eliminado
check "C5 sin MASQUERADE catch-all" \
  '! iptables -t nat -S POSTROUTING | grep -qE "^-A POSTROUTING -o eth0 -j MASQUERADE$"'

# C6: sin duplicados FORWARD
check "C6 FORWARD sin duplicados wg0" \
  '[[ $(iptables -S FORWARD | grep -c "\-i wg0 -j ACCEPT$") -le 1 && $(iptables -S FORWARD | grep -c "\-o wg0 -j ACCEPT$") -le 1 ]]'

# Bonus C7: tráfico del peer avanza
T1=$(wg show wg0 transfer | awk '{print $3}')
sleep 20
T2=$(wg show wg0 transfer | awk '{print $3}')
check "C7 tráfico ONN 4K avanza" "[[ $T2 -gt $T1 ]]"

echo ""
echo "Resultado: ${pass} PASS / ${fail} FAIL"
exit $fail
EOF
```

### ✅ Criterios de salida de Etapa 1

- **7/7 checks PASS** (C1–C7)
- Tarball backup Stage 0 presente local y remoto, checksum coincide
- `/etc/wireguard/wg0.conf` parsea con `wg-quick strip` sin error
- Transferencia del ONN 4K continúa avanzando (no hay corte al stream IPTV)
- `journalctl -u wg-quick@wg0 --since -10m` no muestra errores nuevos

Si **1 o más** checks fallan → ejecuta Rollback (§4) y abre ticket de investigación.

---

## 4. Rollback — 2 niveles

### 4.1 Rollback in-caliente (si algo falla entre §2.4 y §2.6)

Revierte solo los cambios de iptables sin tocar wg-quick ni el archivo:

```bash
ssh "${NS_USER}@${NS_VPS}" bash <<'EOF'
set -e
# Restaurar MASQUERADE catch-all
iptables -t nat -D POSTROUTING -s 10.200.0.0/24 -o eth0 -j MASQUERADE 2>/dev/null || true
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# Re-añadir duplicados FORWARD (para volver a estado original pre-hotswap)
iptables -A FORWARD -i wg0 -j ACCEPT
iptables -A FORWARD -o wg0 -j ACCEPT

echo "[OK] rollback in-caliente aplicado. Comparar contra /tmp/iptables.pre_hotswap.txt"
diff <(iptables-save) /tmp/iptables.pre_hotswap.txt | head -30 || true
EOF
```

### 4.2 Rollback total (si además hay que restaurar `wg0.conf`)

```bash
ssh "${NS_USER}@${NS_VPS}" bash <<EOF
set -e
cd /etc/wireguard
# Si ya hiciste §2.6, hay que restaurar el conf original:
if [[ -f wg0.conf.bak_pre_hardening_${NS_TS} ]]; then
    cp -a wg0.conf wg0.conf.hardened_rollbackdto_${NS_TS}
    cp -a wg0.conf.bak_pre_hardening_${NS_TS} wg0.conf
    chmod 600 wg0.conf
    echo "[OK] wg0.conf restaurado desde backup"
fi

# Si el rollback in-caliente ya aplicó, no hace falta restart.
# Si necesitas forzar reset completo (corta túnel ~5s):
# systemctl restart wg-quick@wg0
EOF
```

### 4.3 Rollback nuclear (último recurso)

Solo si los rollbacks anteriores no recuperan el estado:

```bash
# Restaurar TODO desde el tarball verificado
ssh "${NS_USER}@${NS_VPS}" bash <<EOF
cd /root/net-shield
tar -xzf backup_pre_stage1_${NS_TS}.tar.gz
cp -a backup_pre_stage1_${NS_TS}/wg0.conf /etc/wireguard/wg0.conf
cp -a backup_pre_stage1_${NS_TS}/onn.conf /etc/wireguard/onn.conf
chmod 600 /etc/wireguard/*.conf
iptables-restore < backup_pre_stage1_${NS_TS}/iptables-save.txt
systemctl restart wg-quick@wg0
sleep 3
systemctl is-active wg-quick@wg0
EOF
```

---

## 5. Post-runbook — qué dejar documentado

Tras validar Etapa 1 exitosa:

1. **Commit en repo** de:
   - `AUDIT_2026-04-21/wg0.conf.hardened.sanitized` (versión redactada del nuevo conf)
   - `RUNBOOK_STAGE0_1.md` (este archivo)
   - `backup_pre_stage1_${NS_TS}/SHA256SUMS` (checksum, no los archivos con keys)
2. **Actualizar memoria** `reference_net_shield_architecture.md`:
   - Marcar anomalías A1–A4 como **RESUELTAS en ${NS_TS}**
   - Añadir ruta del backup verificable
3. **Abrir entrada de log operacional** en `net-shield/docs/OPS_LOG.md`:
   - Fecha UTC de la ventana
   - Checks 7/7 o desglose
   - Cualquier incidente observado

---

## 6. Ventana siguiente — Etapa 2

**No abrir Etapa 2 en la misma ventana**. Deja 24–48 h de observación pasiva antes de instalar el validador systemd. Criterios para abrir Etapa 2:

- 0 regresiones en `journalctl -u wg-quick@wg0 --since "${NS_TS}"`
- Tráfico del peer promedio estable (no cae vs baseline pre-hardening)
- Si hay un reboot no planificado del VPS en ese intervalo y todo se re-aplica limpio (DSCP, MASQUERADE restringido, FORWARD sin duplicados) → **señal fuerte** de que la Etapa 1 quedó bien.

El runbook de Etapa 2 (`netshield-validator.sh` + unidad systemd + timer 30s) es el siguiente entregable. No se incluye aquí para respetar el principio del plan: **una etapa por ventana, con período de observación entre ellas**.

---

## 7. Tabla resumen de comandos críticos

| Fase | Acción | Downtime | Reversible |
|---|---|---|---|
| 0 | Backup y snapshots | 0 | N/A (solo lectura) |
| 1.1 | Validar precondiciones | 0 | N/A |
| 2.4 | Hot-swap iptables | 0 | Sí, §4.1 |
| 2.6 | Sustituir wg0.conf | 0 | Sí, §4.2 |
| 2.7 (opcional) | Restart wg-quick | 2–5 s | Sí, §4.3 |
| Validación C1–C7 | 7 checks post | 0 | N/A |

---

**Última línea**: no ejecutes este runbook si no tienes ≥30 min ininterrumpidos y el user visible en canal. Los checks automáticos cubren lo medible; los cortes al streaming en vivo solo los detecta el usuario final en tiempo real.
