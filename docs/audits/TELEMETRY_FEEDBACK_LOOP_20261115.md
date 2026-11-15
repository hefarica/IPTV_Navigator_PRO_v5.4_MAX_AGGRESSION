# Bucle de realimentación: la telemetría corrige la tabla — 2026-11-15

**Autor:** provider-arbiter (t78)
**Diseño, no implementación.** Cero escrituras en el VPS. No se toca el observer Lua, ni ningún `ngx.exit`, ni el slot del proveedor.
**Entregable único:** este documento.

---

## 0. Veredicto en tres líneas

La señal que importa es **"esta sesión se degradó o se cortó con el perfil que elegimos"**, y para un player nativo sólo hay **dos** fuentes medibles: el observer Lua del VPS (que **sólo ve tráfico proxeado**) y el beacon `conviva-event` del propio aparato (que **sí** lleva `data.vst_ms` y eventos `quality_change`). Todo lo que sea frames descartados, HDR realmente mostrado o TTFF tal y como lo vive el player es **NO COMPUTADO**, y lo digo con el motivo. La realimentación **nunca toca `valor` ni `procedencia`**: sólo `confianza` y una penalización con caducidad. Y la mejora se demuestra con **un par de métricas** —incidencias abajo **y** calidad servida no abajo— porque un bucle que baja el rebuffer degradando la imagen sería una violación de la ley anti-degradación, no una mejora.

---

## 1. Qué señal importa y cuál es medible (encargo 1)

### 1.1 Las cuatro candidatas, con su veredicto

| señal | ¿importa? | ¿medible con OTT Navigator? | por qué |
|---|---|---|---|
| **rebuffer** (corte con buffer a cero) | **sí, la que más** | **sí, indirecta** — `rebuffer_proxy` = huecos entre fetches de segmento > 2× duración; el observer ya usa hueco > 15 000 ms | el VPS ve los segmentos **si y sólo si** la reproducción pasa por el proxy |
| **caída a perfil inferior** | **sí, y es la que cierra el bucle** | **sí, directa** — evento `quality_change` del beacon | el aparato lo reporta él mismo; no hace falta el player del panel |
| **frames descartados** | sí (es la señal fina de decodificador) | **NO** | vive dentro del decoder del device; ni el observer ni el beacon lo exponen. Medirlo exigiría instrumentar el APK o `logcat`, y eso no es telemetría pasiva |
| **tiempo hasta el primer frame (TTFF)** | sí, pero es *startup*, no *continuidad* | **parcial** — `data.vst_ms` del beacon y `VST_proxy` del observer | son proxies distintos y **no son lo mismo**; no se pueden promediar entre sí |
| frames duplicados / Hz real / HDR mostrado | no para decidir | **NO** | `screencap` captura **antes** del VPP y del HDMI (medido en t74): un capturador sirve como disparador, **nunca** como prueba de píxeles |

### 1.2 Las dos fuentes que de verdad existen

**Fuente A — observer Lua en `log_by_lua`** (`vps/nginx/lua/qoe_server_side_observer.lua`). Ya calcula, y son las únicas que hay:

```
VST_proxy      = (first segment fetch) - (manifest fetch) por sesión
rebuffer_proxy = huecos entre segmentos consecutivos > 2 x duración  (L199-200: gap > 15000 ms)
bitrate_proxy  = body_bytes_sent / upstream_response_time
error_rate     = % 4xx/5xx por canal por ventana de 5 min
```

Y ya trae el patrón anti-ruido que este diseño **adopta en vez de inventar otro**: `if vst_proxy > 3000 → dict:incr(..., TTL 600)`, y **dispara a los 3 consecutivos** (L177-188). Ese es el dialecto de la casa: **umbral + contador con TTL + N consecutivos**. Mi regla (§3) es ese mismo patrón, generalizado.

**Fuente B — beacon `conviva-event.php` del aparato.** Es la única señal *del lado del player* que llega con un player nativo. Medido en t54: el device postea cada **~30,5 s** desde `okhttp/4.12.0`, sin un solo hueco en 12 minutos. Campos que el endpoint **usa de verdad** (no supuestos): `session_id`, `device_id`, `event_type` (`heartbeat`, `quality_change`, …), `channel.id`, `data.vst_ms` y `data` libre. Esquema: `vps/prisma/lib/conviva_event_schema.json` (v1.0).

**Lo que descarto explícitamente, con motivo:**

- **Telemetría JS del panel.** El operador zapea con OTT Navigator: player nativo, **no ejecuta JS del panel**. Cualquier métrica que dependa de `hls.js`/browser no le llega. Descartada por imposibilidad física, no por preferencia.
- **Sondear el proveedor para "verificar" la mejora.** Una sonda más **roba la única conexión** (t54: el proveedor da una por cuenta; 8 decisiones concurrentes del gate dan 8 ALLOW y el slot lo decide el `flock`, no el gate). **Cero conexiones nuevas al proveedor**: todo lo que sigue es tráfico pasivo ya existente.
- **`/image/receipt(s)` como señal de experiencia.** El recibo mide **bytes**: lee el cmdline del `ffmpeg` vivo y hace `ffprobe` sobre init+chunk. Eso describe **lo que el motor entregó**, no lo que el player sufrió. Es señal de **suministro**, y se usa para lo que sí sirve (§2.2), no como QoE.

### 1.3 El límite duro que condiciona todo el bucle

El observer sólo actúa si `is_manifest or is_segment` **en locations con `proxy_pass`**. En transporte **`provider-direct`** (el JIT sirve al player URLs del proveedor, hallado en t54) el VPS **no ve un solo segmento**. Consecuencias que hay que decir en voz alta:

> **Para las sesiones `provider-direct`, este bucle es ciego.** No hay rebuffer medible, no hay error_rate, no hay bitrate. Sólo queda el beacon del aparato (`vst_ms`, `quality_change`), que es mucho más pobre.

Por tanto la cobertura del bucle **no es "todas las sesiones", es "las sesiones proxeadas + lo que el beacon cuente"**. Cualquier afirmación de mejora tendrá que ir acotada a ese subconjunto (§5.6).

---

## 2. Qué actualiza la señal y qué no puede tocar (encargo 2, parte 1)

La tabla de t76 tiene estos campos por entrada: `clave · valor · procedencia · confianza · ts · ver_contrato · invalidacion`.

**Regla de honestidad, y es la pieza central del diseño:**

| campo | ¿la telemetría puede escribirlo? | por qué |
|---|---|---|
| `valor` (width/height/fps/hdr/codec/bitrate) | **NO, jamás** | esos números son **mediciones** (probe/classifier). La telemetría no mide píxeles: no puede afirmar una resolución. Escribirlos sería fabricar un dato, exactamente lo que el proyecto prohíbe |
| `procedencia` | **NO** | degradar `probe` a otra cosa falsearía la trazabilidad de la medida |
| `confianza` (0-100) | **SÍ** | es una **creencia**, y la experiencia es evidencia legítima sobre ella |
| `invalidacion` | **SÍ** (acortar TTL / marcar `feedback`) | la experiencia puede decir "esto caducó antes", nunca "esto es válido para siempre" |
| nuevo bloque `feedback{}` | **SÍ** | contadores, ventana, penalización y su caducidad |
| **promover** un perfil | **NO** | subir de perfil exige medida del probe o del classifier. La telemetría **sólo puede degradar** (§3.4) |

Y una consecuencia que cierra el bucle sin mentir: el recibo del JIT sí se usa, pero **para lo suyo** —comprobar que el perfil *servido* fue el *decidido* (`applied` de verdad). Eso es `suministro = demanda`; si no coinciden, la incidencia es del motor, no del player, y se cuenta en otro contador.

---

## 3. La regla de actualización (encargo 2, parte 2)

### 3.1 Unidad de actualización: la ventana, no la sesión

**La sesión individual no toca nada.** Es la defensa más fuerte contra el envenenamiento y no cuesta nada: si una muestra no puede escribir, una muestra no puede envenenar.

Se acumula por pareja **(canal, perfil)** en una ventana deslizante:

- ventana = **últimas 24 h** o **últimas 20 sesiones** cerradas, lo que llegue antes;
- **n mínimo = 5 sesiones** para que la ventana pueda producir una actualización.

### 3.2 Incidencia por sesión (definición operativa, una sola)

```
incidencia(s) = 1  si  hubo_rebuffer(s)                      # gap > 15 000 ms (mismo umbral que el observer)
                OR    hubo_quality_change_down(s)            # evento del beacon, dirección = baja
                OR    error_rate_ventana > 5 %               # mismo umbral que el observer
                OR    motor_no_sirvio_lo_decidido(s)         # recibo: applied != decided
              = 0  en cualquier otro caso
```

`p̂ = incidencias / n` sobre la ventana.

### 3.3 Por qué NO se decide con `p̂`: cota inferior de Wilson

Con 5 sesiones, `p̂ = 0` "prueba" que todo va bien y `p̂ = 0,4` condena un canal por dos fallos. Ninguna de las dos cosas es información suficiente. Se decide con la **cota inferior del intervalo de Wilson al 95 %**, que es la respuesta correcta a "¿cuánto puedo creer de esta proporción con tan pocas muestras?":

```
p_LB(n, k) = ( p̂ + z²/(2n) − z·√( (p̂(1−p̂) + z²/(4n)) / n ) ) / (1 + z²/n)      con z = 1,96
```

Ejemplos con los que se calibró la regla:

| n | k | p̂ | p_LB | lectura |
|---|---|---|---|---|
| 5 | 0 | 0,00 | **0,0000** | 5 limpias seguidas **no** demuestran nada todavía |
| 5 | 2 | 0,40 | **0,1176** | dos fallos de cinco: cota muy ancha, no se actúa con ella sola |
| 10 | 0 | 0,00 | **0,0000** | sigue sin demostrar; en la práctica se usa para **recuperar**, no para promover |
| 20 | 2 | 0,10 | **0,0279** | 10 % con 20 muestras: aún hay incertidumbre |
| 20 | 8 | 0,40 | **0,2188** | 40 % con 20 muestras: esto ya es señal |

*(Los cinco valores están calculados con la fórmula de arriba, `z = 1,959964`, no estimados a ojo.)*

### 3.4 La regla, línea a línea

```
R1  si n < 5                                  -> no se toca nada (silencio)
R2  si p_LB >= 0,80                           -> sin penalización; si había, se revisa por R6
R3  si p_LB <  0,80  y n >= 5                  -> penalización de UN escalón:
                                                 confianza := max(0, confianza − 10)
                                                 feedback.penalizado_hasta := now + 6 h
                                                 feedback.ventana_hash := hash(ventana usada)
R4  la penalización baja COMO MÁXIMO un escalón desde el incumbente, y nunca por debajo
    del suelo R4 que ya fija ape-profile-classifier.js:279
R5  NUNCA se promueve por telemetría. Promover exige probe o classifier (medida), jamás experiencia
R6  recuperación: 3 ventanas consecutivas con p_LB >= 0,80
                                                 -> confianza := min(100, confianza + 5); se limpia la penalización
R7  caducidad: toda penalización expira a las 6 h aunque no haya evidencia nueva
R8  decaimiento: si pasan 24 h sin sesiones de ese canal, feedback se resetea a cero
R9  influencia acotada: una ventana mueve confianza como máximo ±10 puntos; no hay camino
    por el que una sola ventana lleve una entrada de 100 a 0
R10 el bloque feedback se escribe SIEMPRE completo y con ts; una escritura parcial se descarta
R11 si el recibo dice applied != decided, la incidencia cuenta en motor{} y NO penaliza el perfil
    (el fallo es de suministro, no de la elección)
R12 si el beacon y el observer se contradicen (uno dice caída, el otro 0 incidencias),
    gana el que tiene más muestras en la ventana; si empatan, se marca feedback.ambiguo y NO se actúa
R13 toda decisión de degradación deja rastro con la ventana que la motivó (n, k, p_LB),
    para que sea auditable y reversible
```

### 3.5 Cómo se evita que una muestra aislada envenene la tabla para siempre

Cuatro cerraduras independientes; basta que una funcione:

1. **La sesión no escribe** (§3.1): hace falta una ventana de ≥ 5.
2. **Wilson, no `p̂`** (§3.3): una racha corta tiene cota ancha y no cruza el umbral.
3. **Influencia acotada** (R9) + **un solo escalón** (R4): no hay camino de 100 a 0.
4. **Caducidad** (R7/R8): aunque una penalización se equivoque, **muere sola** en 6 h y el contador se resetea a las 24 h sin uso. El error tiene fecha de caducidad, no memoria eterna.

Y una quinta, de gobernanza: **la penalización nunca borra `valor`**. Si mañana el canal mejora, la medida sigue ahí y no hay que re-medirlo (que costaría 1.653 ms/canal, t75).

---

## 4. El camino de escritura NO está en el de sintonización (encargo 3)

```
        ┌──────────────────────── CAMINO CALIENTE (5 ms) ────────────────────────┐
        │  sintonización → lookup en tabla (APCu 0,000 ms · SQLite 0,0029 ms)    │
        │                 LEE una instantánea. NO escribe. NO espera a nadie.    │
        └───────────────────────────────────────────────────────────────────────┘
                     ▲                                       
                     │ snapshot (sólo lectura)               
        ┌────────────┴──────────────┐        ┌─────────────────────────────────┐
        │  tabla / trust store      │◄───────│  FLUSHER (proceso aparte)       │
        │  APCu + SQLite            │  lote  │  systemd timer, cada 60 s       │
        └───────────────────────────┘        │  1. toma el buffer              │
                                             │  2. agrega ventanas             │
                                             │  3. aplica R1..R13              │
                                             │  4. escribe por lote (una vez)  │
                                             └──────────────▲──────────────────┘
                                                            │ append (O_APPEND, sin lock)
                     ┌──────────────────────────────────────┴──────────────────┐
                     │  BUFFER DE SUCESOS                                       │
                     │  una línea JSON por sesión cerrada, append-only           │
                     │  /var/lib/ape/feedback/eventos.jsonl                     │
                     └──────────────▲──────────────────────────────────────────┘
                                    │
              observer Lua (log_by_lua)      ó      beacon conviva-event
              (otro dueño: NO se toca)               (endpoint existente)
```

Los cuatro requisitos, cada uno con su mecanismo:

| requisito | mecanismo |
|---|---|
| **no en el camino de sintonización** | la sintonización sólo **lee** la tabla. El `append` al buffer lo hace `log_by_lua` (después de responder) y el beacon (petición aparte). El flusher es un **proceso distinto** con su timer |
| **diferida** | el flusher corre cada **60 s**; entre la sesión y la escritura hay hasta 60 s. Nadie espera esa escritura |
| **por lotes** | una sola escritura por ciclo y por clave, no una por sesión. Con 20 sesiones/ventana eso es ~1 escritura por minuto, no 20 |
| **fallo silencioso** | si el flusher falla (disco, lock, JSON roto), **el player no se entera**: ningún camino de error llega a la petición. El buffer es append-only, así que un fallo **no pierde** los sucesos: se reintentan en el siguiente ciclo |
| **log visible** | cada ciclo deja **una** línea en `/var/log/ara/feedback.log` con `eventos_leidos`, `ventanas`, `actualizadas`, `saltadas`, `error`, y un contador `feedback_backlog` (líneas en buffer sin procesar). Si el backlog crece 10 ciclos seguidos, eso es una alerta real |

**Garantías que se preservan:** cero conexiones nuevas al proveedor (todo es pasivo), cero escrituras en el camino de 5 ms (el lookup sigue leyendo APCu, 0,000 ms medido en t74), y el observer Lua **ni se toca ni se invoca de otra forma**: se lee su salida por donde ya escribe.

---

## 5. Cómo se demuestra que mejora, con un número (encargo 4)

### 5.1 La métrica primaria NO puede ser sola

Si el bucle degrada perfiles hasta que no haya rebuffer, el rebuffer baja y la imagen empeora. Eso es exactamente lo que la **ley anti-degradación** prohíbe. Así que la mejora es un **par**, y hay que cumplir los dos:

```
M1 (continuidad)  p_fail = P(sesión con >= 1 incidencia)          -> debe BAJAR
M2 (calidad)      perfil servido medio y P(resolución servida < incumbente)  -> NO debe EMPEORAR
```

Y un guard duro: **si M1 baja y M2 empeora, el veredicto es NO MEJORA**, aunque el rebuffer haya mejorado. Sin excepciones.

### 5.2 Diseño experimental: A/B pareado por sesión, sobre el subconjunto tratado

Comparar "antes/después" en el tiempo se confunde con la hora del día y la carga del proveedor. Comparar canales tratados con no tratados se confunde con el propio canal. Lo que queda:

**Restringir el experimento a los canales donde el bucle REALMENTE cambia la decisión** (los que reciben penalización al menos una vez). En ésos, alternar la bandera por sesión: `OFF, ON, OFF, ON…` dentro de la misma franja horaria. Cada canal es su propio control.

### 5.3 Cuántas sesiones hacen falta (número, no intención)

Para dos proporciones, con α = 0,05 bilateral y potencia 0,80:

```
n = (z_{0,025} + z_{0,20})² · [ p₁(1−p₁) + p₂(1−p₂) ] / (p₁ − p₂)²
  = (1,96 + 0,8416)² · [ p₁(1−p₁) + p₂(1−p₂) ] / Δ²
```

Para el caso de referencia **0,85 → 0,90** (bajar la tasa de fallo 5 puntos):

```
(2,8016)² = 7,849
[0,85·0,15 + 0,90·0,10] = 0,1275 + 0,09 = 0,2175
n = 7,849 × 0,2175 / 0,0025 = 682,9  ->  ~683 sesiones POR BRAZO  (~1.366 en total)
```

Y si sólo se consiguen 200 por brazo, el **efecto mínimo detectable** es:

```
MDE ≈ (z_{α/2} + z_β) · √( 2·p̄(1−p̄) / n ) = 2,8016 · √(2·0,1275/200) = 0,0927  ->  9,3 puntos
```

Comprobación de consistencia: con **n = 683** el MDE sale **5,0 puntos**, justo el efecto para el que se dimensionó. Es decir: con 200/brazo **no se puede** demostrar una mejora de 5 puntos, sólo de 9 o más. Decirlo por adelantado es lo que impide "descubrir" luego una mejora que era ruido.

### 5.4 Regla de decisión, pre-registrada (antes de mirar los datos)

```
GO      si  Δ(M1) > 0 con IC95 % que EXCLUYE el 0   Y   M2 no empeora (ver 5.5)
NO MEJORA si el IC95 % de Δ(M1) incluye el 0
NO MEJORA si Δ(M2) empeora más allá del margen
NO_COMPUTADO si no se llega a n mínimo en el subconjunto tratado
```

`NO_COMPUTADO` es una respuesta legítima y hay que aceptarla de antemano: si sólo 12 canales reciben penalización, el experimento **no se puede** hacer, y decir "mejoró" sería mentir.

### 5.5 El guard de calidad, con número

`M2` se mide como **perfil servido medio** (P0 > P1 > P2 > P3 > P4 > P5) y como **% de sesiones servidas por debajo del incumbente**. Umbral pre-registrado:

```
el experimento FALLA si  %(resolución servida < incumbente)  sube más de 2 puntos
                        o si el perfil servido medio cae más de 0,25 escalones
```

Con eso, una mejora conseguida degradando imagen queda **matemáticamente** fuera.

### 5.6 El alcance de la afirmación (lo que el experimento NO dirá)

El experimento se hace sobre **sesiones proxeadas**. No podrá decir nada de las sesiones `provider-direct`, porque el VPS no ve sus segmentos (§1.3). La frase honesta que se podrá escribir es:

> "En las sesiones proxeadas de los N canales tratados, la tasa de incidencia bajó de p₀ a p₁ (IC95 %: …) sin bajar la calidad servida."

Y **no** "el sistema va mejor", que sería generalizar más allá de lo medido.

### 5.7 Los datos que harían falta (nombrados, no inventados)

| dato | de dónde saldría | estado hoy |
|---|---|---|
| incidencia por sesión | buffer de sucesos (§4) | **no existe**: hay que implementarlo |
| `quality_change` con dirección | beacon en `conviva_event` | endpoint **existe**; falta confirmar que el aparato lo emite con dirección de bajada |
| rebuffer por sesión | `rebuffer_proxy` del observer | **existe** el cálculo; falta su vertido al buffer |
| perfil servido vs decidido | recibo del JIT (`applied` vs `decided`) | **existe** el recibo; falta el emparejamiento por sesión |
| nº de canales con penalización | tabla, bloque `feedback` | depende de §3 |

---

## 6. Riesgos y sus defensas

| riesgo | defensa |
|---|---|
| **envenenar la tabla con una racha corta** | §3.5: ventana, Wilson, ±10, caducidad |
| **bucle que degrada la imagen para bajar el rebuffer** | el par M1+M2 y el guard de §5.5; la telemetría no puede escribir `valor` ni promover |
| **el flusher cae y se pierde telemetría** | buffer append-only: un fallo no pierde, reintenta; `feedback_backlog` lo delata |
| **el observer es de otro dueño** | no se toca: se consume su salida. Si su formato cambia, el flusher descarta la línea y lo cuenta (`saltadas`), no rompe |
| **la realimentación se acopla al ABR del player** | el bucle actúa por **ventana de 24 h**, no por sesión: no puede oscilar al ritmo del ABR |
| **coste en el camino caliente** | cero: el lookup sigue en APCu (0,000 ms) y nada de esto se ejecuta en la sintonización |
| **sonda de más roba el slot** | **cero** conexiones nuevas al proveedor: todo es pasivo |
| **una caída del proveedor se lee como "canal malo"** | R12 y el contador `motor{}` separan suministro de elección; y la penalización caduca en 6 h |

---

## 7. Lo que este diseño NO afirma

- **NO COMPUTADO:** no se ha medido cuántas sesiones reales hay por canal y día, así que **no se puede decir si el experimento es alcanzable** con 683/brazo. El número de muestras es una condición, no un resultado.
- **NO COMPUTADO:** no está confirmado que el OTT Navigator emita `quality_change` con **dirección de bajada**; el endpoint acepta el evento, pero que lo emita y con qué semántica es una medida pendiente.
- **NO COMPUTADO:** el efecto real de la penalización sobre la decisión, porque el bloque `feedback` **todavía no existe** en la tabla.
- **NO IMPLEMENTADO:** nada de esto está escrito. Este documento es el diseño y el experimento; el flusher, el buffer y el bloque `feedback` son trabajo futuro.
- **No se ha tocado** el VPS, ni el observer Lua, ni ningún `ngx.exit`, ni el slot del proveedor.

---

## 8. Resumen ejecutivo para el operador

1. **La única señal honesta para su player es doble:** lo que el VPS ve del tráfico proxeado y lo que el aparato reporta por su beacon. Lo demás no existe y no se va a inventar.
2. **La telemetría no toca las medidas.** Sólo mueve la confianza, y como máximo un escalón hacia abajo. Nunca promueve.
3. **Una sesión no puede envenenar nada:** hacen falta ventanas de 5, cota de Wilson, ±10 puntos y caducidad de 6 h.
4. **La mejora se demuestra con 683 sesiones por brazo para detectar 5 puntos**, y con el guard de que la calidad servida no baje. Si no se llega, la respuesta es `NO_COMPUTADO`, no un "parece que mejora".
5. **Y hay un agujero que hay que asumir:** en `provider-direct` el bucle es ciego. La afirmación de mejora valdrá sólo para lo que se pueda ver.
