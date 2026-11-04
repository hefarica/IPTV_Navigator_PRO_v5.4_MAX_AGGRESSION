# Plan de implementación — Canary-Resolve one-shot por zapping

**Estado:** PLAN. Nada desplegado.
**Norma que lo rige:** [Regla Canónica del Streaming en Tiempo Real](../policies/REGLA_CANONICA_STREAMING_TIEMPO_REAL.md)
**Principio rector:** el canary **prevalece**. Sin medición no hay declaración.

---

## El gate que no se salta

```
CADA FASE TIENE UN GATE.
NO SE PASA A LA FASE SIGUIENTE SI EL GATE NO DA PASS.
SI UN GATE FALLA, SE ARREGLA ESA FASE. NO SE SALTEA.
```

**Un gate es un comando con salida verificable.** No es "parece que funciona".

---

## Fase 0 · Inventario real (sólo lectura)

**Objetivo:** saber qué existe antes de escribir una línea.

| Comprobación | Comando | Esperado |
|---|---|---|
| El controlador existe | `test -x /usr/local/bin/ape-canaryctl` | exit 0 |
| El script existe | `test -x /usr/local/bin/ape-visual-emulate.sh` | exit 0 |
| El gate de skills pasa | `/usr/local/bin/ara-skill check --for-canary` | `ARA-SKILL CHECK PASS (canary=1)` |
| Directorios | `ls -la /etc/ara/canary /var/lib/ara/canary /var/log/ara` | existen |
| ffmpeg + libx265 | `ffmpeg -version \| head -1` | versión con libx265 |
| El unit existe | `systemctl list-unit-files 'ape-canary@*'` | template presente |

**GATE 0:** los seis pasan. Si `ara-skill check --for-canary` no da PASS, **nada más se intenta**: el unit ni siquiera llega a ejecutar el script (`ape-visual-emulate.sh:38`).

**Rollback:** ninguno. Sólo lectura.

---

## Fase 1 · El productor arranca (una vez, a mano)

**Objetivo:** que el canary ejecute y muera limpiamente, produciendo su salida.

```bash
ID="test$(date +%s)"
cp /etc/ara/canary/env.template /etc/ara/canary/$ID.env
sed -i "s|^CANARY_SOURCE_URL=.*|CANARY_SOURCE_URL=<URL_REAL_DE_PRUEBA>|" /etc/ara/canary/$ID.env
chown root:www-data /etc/ara/canary/$ID.env
chmod 640 /etc/ara/canary/$ID.env

ape-canaryctl start "$ID" --source-url "<URL_REAL_DE_PRUEBA>" --seconds 6
ape-canaryctl status "$ID"
```

**GATE 1:** existe `/var/lib/ara/canary/<ID>/status.json`.

```bash
test -f /var/lib/ara/canary/$ID/status.json && echo "GATE 1 PASS"
```

**Si falla:** leer `/var/log/ara/` y `journalctl -u ape-canary@$ID`. **No se continúa.** Sin esta salida no hay nada que consumir.

**Rollback:** `ape-canaryctl stop "$ID"` y borrar `/etc/ara/canary/$ID.env`.

---

## Fase 2 · El productor produce un dato utilizable

**Objetivo:** confirmar que el `status.json` tiene los campos que el resolve necesita, **con valores reales**.

```bash
cat /var/lib/ara/canary/$ID/status.json | python3 -m json.tool
```

**Campos que el resolve necesita, como mínimo:**

| Campo | Ejemplo aceptable | Ejemplo inaceptable |
|---|---|---|
| resolución | `"3840x2160"` | `"unknown"`, `null`, ausente |
| bitrate | `41.2` (Mbps) | `0`, ausente |
| fps | `60` | `0`, ausente |

**GATE 2:** los tres campos presentes y no vacíos.

**Si el `status.json` usa otros nombres de campo**, esta fase **falla honestamente**: hay que mapear los nombres reales antes de escribir el consumidor. **No se adivinan.**

**Rollback:** ninguno. Sólo lectura.

---

## Fase 3 · El consumidor, probado contra el dato real

**Objetivo:** escribir el endpoint **sólo ahora**, y probarlo contra el `status.json` de la Fase 2.

**Regla de esta fase:** el endpoint **primero lee un `status.json` que ya existe**. No invoca el canary todavía. Eso aísla el PHP del canary: si falla, falla una sola pieza.

```php
// v1 del endpoint: SÓLO lee. No invoca nada.
$status = json_decode(file_get_contents("/var/lib/ara/canary/$id/status.json"), true);
if (!is_array($status)) { header('Location: ' . $u, true, 302); exit; }
// componer cartucho con $status
```

**GATE 3:** con el `status.json` de la Fase 2 en disco:

```
GET /prisma/api/canary-resolve.php?u=<url>&d=<device>
→ 200
→ #EXT-X-APE-CANARY-REAL-RES:3840x2160     (coincide con el status.json)
→ #EXT-X-APE-CANARY-BITRATE:41.2           (coincide con el status.json)
```

**La prueba es la coincidencia:** el valor del manifiesto debe ser **el mismo número** que hay en el `status.json`. Si no coincide, el consumidor inventa.

**Si `status.json` no existe:** el endpoint debe dar **302**, no 200.

```bash
mv /var/lib/ara/canary/$ID/status.json /tmp/x.json
curl ... → debe dar 302
mv /tmp/x.json /var/lib/ara/canary/$ID/status.json
```

**GATE 3b:** el 302 aparece cuando falta el dato. **Ese es el fallback correcto, y hay que verificarlo explícitamente.**

**Rollback:** retirar el fichero del VPS (ya existe el step de limpieza en el workflow).

---

## Fase 4 · El consumidor invoca al productor

**Objetivo:** conectar el one-shot por zapping. **Sólo ahora**, con las dos piezas ya verificadas por separado.

```php
// v2: si no hay status fresco, invoca el canary UNA vez
if (!status_fresco($id)) {
    exec(escapeshellcmd(CTL) . ' start ' . escapeshellarg($id)
       . ' --source-url ' . escapeshellarg($u)
       . ' --seconds 6 2>&1', $out, $rc);
    esperar_status($id, 12);   // polling con deadline
}
```

**GATE 4:** borrar el `status.json`, pedir el endpoint, y comprobar:

```
→ 200
→ el status.json se creó durante la petición (fecha de mtime dentro de la ventana)
→ el valor del manifiesto coincide con el status.json recién creado
```

**Y medir el coste real:**

```bash
time curl ... → tiempo total. Debe ser < 15 s (6 de captura + margen)
```

**Si supera 15 s**, el canary es demasiado lento para servir síncrono. **Eso cambia el diseño:** habría que servir 302 en la primera petición y medir en background. **Es una decisión, no un parche.**

**Rollback:** volver a la v1 (sólo lectura).

---

---

## El procesamiento completo del VPS — inventario de capas

El canary es el productor, pero no es todo el VPS. Estas son las capas que el cartucho debe
llevar juntas, y el estado medido de cada una:

| # | Capa | Origen | Volumen | Estado |
|---|---|---|---|---|
| 1 | **Cartucho base** | `url2-cartridge.php` | 369 KB de plantilla | ✅ 200 en producción |
| 2 | **Tags de paridad** | `APE_VPS_PARITY_TAGS` | 186 tags, 0 dinámicos | ✅ desplegado y verificado |
| 3 | **Paquete de prioridades** | `APE_PRIORITY_PACKAGE` | 18 directivas | ✅ desplegado |
| 4 | **Perfil por device** | `url2-cartridge.php` dinámico | P0/P3/P5 medidos | ✅ desplegado |
| 5 | **CMAF enriquecido** | `#EXT-X-CMAF-*` en el cartucho | 24 directivas | 🟡 estático hoy |
| 6 | **Datos medidos** | `status.json` del canary | 3 campos mínimo | ⏳ esta implementación |

### Por qué el CMAF importa aquí

El cartucho ya declara 24 directivas CMAF:

```
#EXT-X-CMAF-LATENCY  #EXT-X-CMAF-CHUNK-DURATION  #EXT-X-CMAF-PART-TARGET
#EXT-X-CMAF-PART-HOLD-BACK  #EXT-X-CMAF-CONTAINER  #EXT-X-CMAF-INIT-SEGMENT
#EXT-X-CMAF-CODEC-FALLBACK  #EXT-X-CMAF-AUDIO-FALLBACK  #EXT-X-CMAF-HDR
#EXT-X-CMAF-HDR-METADATA  #EXT-X-CMAF-LCEVC  #EXT-X-CMAF-AI-SR
#EXT-X-CMAF-AI-FI  #EXT-X-CMAF-VRR  (+10 más)
```

**Hoy son estáticas.** Con el canary midiendo, tres de ellas pueden derivarse del dato real:

| Directiva | Hoy | Con medición |
|---|---|---|
| `#EXT-X-CMAF-CHUNK-DURATION` | valor fijo | `GOP / fps_medido` |
| `#EXT-X-CMAF-HDR` | declarado | el `video_range` que devolvió el canary |
| `#EXT-X-CMAF-CODEC-FALLBACK` | cadena fija | derivado del códec que el canary detectó |

**No se derivan más porque no hay más dato medido.** Derivar una directiva de una suposición
es exactamente lo que la Regla Canónica prohíbe.

### Por qué `manifest-4k.php` no entra en este plan

`manifest-4k.php` (2.783 B) sirve un master 4K desde el SSOT `/etc/ape-uhdx/ape_4k_manifest.json`.
**No consume el canary y no tiene perfiles P0-P5**: es un endpoint de un solo manifiesto.

**Decisión:** no se toca en esta implementación. Mezclarlo con el resolve por device añadiría
dos caminos que declaran 4K con criterios distintos, y el jugador no sabría cuál gana.

### Orden de composición del cartucho final

```
1. plantilla por perfil        (url2-cartridge.php, P0-P5)
2. + tags de paridad           (186, del resolver PHP)
3. + paquete de prioridades    (18, del panel)
4. + overrides por device      (caché, perfil, codec)
5. + overrides por medición    (CMAF chunk, HDR real, fallback real)   ← cuando el canary midió
6. + idempotencia              (SEED = hash(u + device))
7. → manifiesto
```

**Cada capa es aditiva y verificable por separado.** Si la capa 5 no tiene medición, se omite
y el manifiesto lo declara con `#EXT-X-APE-CANARY-VERIFIED:NO`, no se rellena con un valor inventado.


## Fase 5 · Integración con el cartucho completo

**Objetivo:** que el cartucho lleve **lo medido + todo el procesamiento del VPS**.

Las tres capas que ya existen y funcionan:

| Capa | Origen | Estado |
|---|---|---|
| **186 tags de paridad** | `APE_VPS_PARITY_TAGS` en el generador | ✅ desplegado |
| **18 directivas del paquete** | `APE_PRIORITY_PACKAGE` | ✅ desplegado |
| **Datos medidos** | `status.json` del canary | ⏳ esta implementación |
| **Perfil por device** | `url2-cartridge.php` dinámico | ✅ desplegado (P0/P3/P5 medidos) |

**GATE 5:** el manifiesto contiene las cuatro:

```
#EXT-X-APE-URL2-CARTRIDGE         (cartucho base)
#EXT-X-APE-CANARY-REAL-RES        (medición)
#EXT-X-APE-PROFILE                (device)
#EXT-X-APE-IDEMPOTENCIA:SEED      (reproducibilidad)
```

**Idempotencia:** mismo `(u, device)` → mismo `SEED`. Verificable pidiendo dos veces y comparando.

---

## Fase 6 · Despliegue y validación

**Sólo si las cinco fases anteriores dieron PASS.**

1. `php -l` en el CI (ya existe el gate en el workflow)
2. Deploy con `mode=apply` + `confirm="DESPLIEGO EL GENERADOR AL VPS"`
3. **Comparar sha local contra servido** — nunca el estado del run
4. Verificar los cuatro códigos:

```
200  con status.json fresco
302  sin status.json
429  tras 21 peticiones en 60 s (rate limit)
400  sin parámetro u
```

**GATE 6:** los cuatro códigos aparecen donde deben.

**Rollback:** `git revert` + deploy. El step de limpieza retira el fichero del VPS.

---

## Lo que este plan NO hace

- **No crea el `<id>.env` del VPS.** Requiere una URL real y credenciales que decide el operador.
- **No ejecuta el canary.** Eso es la Fase 1, y es manual y supervisada.
- **No toca `iptables`, no instala `fail2ban`, no usa secretos por defecto.** El diseño original los pedía; este plan los elimina.
- **No sirve `206`** sobre el manifiesto: es imposible y el plan no promete imposibles.
- **No despliega nada hoy.**

---

## Riesgos conocidos y sin resolver

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El canary tarda >15 s | El endpoint síncrono no sirve | Servir 302 en la 1ª petición y medir en background |
| `status.json` con nombres de campo distintos | El consumidor lee `null` | Fase 2 lo detecta antes de escribir el consumidor |
| 3 vCPU saturadas con zapping rápido | Los canary se encolan | Rate limit + cache por canal; medir en Fase 4 |
| El proveedor bloquea la IP del VPS por las peticiones del canary | Pérdida de servicio | **No resuelto.** El canary hace peticiones reales a la fuente |
| `ape-visual-emulate.sh` no produce los campos esperados | Fase 2 falla | Se mapean los nombres reales, no se adivinan |

---

## Orden de ejecución, en una línea

```
0 inventario → 1 arranca → 2 produce dato → 3 consumidor lee → 4 consumidor invoca → 5 integra → 6 despliega
```

**Cada flecha es un gate. Ninguna se salta.**
