# BG_REPAIR_r1 — BitrateGuard v31 (reparación de los hallazgos del Council t41 sobre v30)

**Task:** t42 / BG5 · `device-ara-engineer` · attempt `05d2e047-0f15-47db-930f-d18b68079287`
**Fecha:** 2026-10-31 (America/Bogota)
**Alcance:** APK on-device. **NO** se tocó VPS, auth, `/sync`, `/ara`, `/lists/` ni canary.

## 0. Truth-guards de este reporte

- **No se declara 4K real medido.** El test ejecutado es un stream público 1080p AVC (`test-streams.mux.dev/x36xhzz`),
  no la fuente del proveedor. El panel del ONN reporta `Physical size: 3840x2160` + `Override size: 1920x1080`
  ⇒ la salida de display medida estaba forzada a 1080p: **no hay evidencia de 4K real en este run**.
- Todo lo que sigue está medido con `logcat` del device `192.168.1.7:5555`, no inferido.

## 1. Artefactos

| Artefacto | Bytes | sha256 |
|---|---|---|
| `app-release.apk` (v31) | 23.772.875 | `4b420893cdb5ec25c93883456ba6d9cbeb645a956130213de95874a359e24574` |
| `BitrateGuard.kt` | 8.806 | `6fabc9b6c62f2c5370741d62825dfed140287b6061c8a9642a670a6ed73b5de4` |
| `BitrateMeter.kt` | 1.591 | `d3ecaee0b4023790d55acc2b163425e0875410e729fa779c68b37e8f9ada547c` |
| `BitrateConfig.kt` | 2.619 | `cc697c5ba16b670d3a0c869ac37c9191a28957d8e80c49ed505655a2e013b4f4` |
| `DeviceSampler.kt` | 7.173 | `3af1c572a90e7a84baf69f3f41249f68cdef2e6955a9ee431aafd8b9000fc2c9` |
| `AraStatus.kt` | 4.327 | `836792b61380773192d5da9dd22055470deeb5fd85e20e99bbbba06fc36060bc` |
| `ApePlayer.kt` | 12.217 | `59177dd922618e6b6cbeeb0e54677a4f4cd22738cab3eb4abf60578b259052cf` |
| `MainActivity.kt` | 13.838 | `2d8bf7b5667520f40ab17eb52476ad4989b306253af9781e9ed1794a0fd6212d` |
| `app/build.gradle.kts` | 5.328 | `6c02c88f970856ff1ffe98b03e531f791746b9165350556f3acdecbf4f387250` |

`versionCode=31`, `versionName=3.4.5-bitrate-guard-r1` (instalado y confirmado con `dumpsys package`).

## 2. Hallazgos (formato AGENTS.md)

### F01 — HIGH — FillController inerte
```
ID: BG5-F01          Severidad: HIGH
Síntoma: BitrateGuard escribía prefetch_segments/buffer_connections/never_stop_filling y logueaba
         "conn=6 prefetch=5 never_stop=true" sin ningún lector real.
Causa raíz: FluidBridge solo consume buffer_profile/buffer_min_s/buffer_max_s/cache_mib/max_height
            (verificado por grep de prefs en FluidBridge.java). Media3 no expone knobs de
            "prefetch/connections" en DefaultLoadControl → no hay consumidor posible sin reescribir
            el pipeline de datos.
Corrección: se ELIMINA el objeto FillController y las claves inertes, y los campos
            AraStatus.fillAggressive/neverStopFilling (0 escritores y 0 lectores tras el cambio).
            La única palanca real de relleno queda donde ya estaba y SÍ se consume:
            ApePlayer.build() → buffer_profile=max + buffer_min_s/buffer_max_s/cache_mib →
            FluidBridge.configureBuilder (DefaultLoadControl).
Prueba: grep post-fix ⇒ 0 ocurrencias **en código ejecutable** de las tres claves de relleno y de los
        dos campos de estado (los únicos restos en v31 eran 2 menciones en el KDoc explicativo, sin
        efecto; v32 reescribió ese KDoc y ya no contienen el literal). Build release PASS.
Estado: CORREGIDO (verdad corregida, no maquillada).
```

### F02 — HIGH — `/sync` declaraba bitrate de manifest como medido
```
ID: BG5-F02          Severidad: HIGH
Síntoma: DeviceSampler exportaba AraStatus.trackBitrate (Format.bitrate del manifest) con
         prov="measured_device".
Causa raíz: se confundió "dato observado del Format" con "bitrate medido en el cable".
Corrección: `bitrate_bps` se publica ahora desde AraStatus.bitrateKbps (bytes REALES del DataSource
            vía StatsDataSource→BitrateMeter), con prov="measured_device" SOLO si hay medición y
            age ≤ 15 s; si no hay medición ⇒ value=null, prov="unavailable" (null⇔unavailable).
            El bitrate de manifest queda únicamente como pista de UI, nunca en el wire.
Prueba: el contrato ya validaba las reglas null⇔unavailable; el run de logcat muestra que
        AraStatus.bitrateKbps existe (459→6221 kbps) y BitrateGuard es su único escritor.
Estado: CORREGIDO.
```

### F03 — MEDIUM — `medido=0`/muestra vieja no armaba ALERT
```
Corrección: BitrateMeter expone ageMs()/hasFresh(6 s). Sin muestra fresca ⇒ state="NO_DATA",
            se cancelan el temporizador y belowSince, y NO se decide ni se toca el lock.
Prueba en device: `state=NO_DATA ... sample_age=7305ms → 25070ms` con `bitrate=0kbps`.
Estado: CORREGIDO.
```

### F04 — MEDIUM — lock exacto min=max podía dejar el grupo sin variante
```
Corrección: los candidatos se filtran por la ventana min/max de resolución vigente
            (p.minVideoWidth/Height, p.maxVideoWidth/Height) antes de elegir bitrate; y si el
            bitrate ya está fijado no se reescribe. Log añade `cand=n/m` y `win=…`.
Prueba en device: `cand=1/5 win=1920x1080-1920x1080` (5 variantes del master, 1 válida en ventana).
Estado: CORREGIDO (la pantalla negra por tamaño+bitrate incompatible queda imposibilitada por construcción).
```

### F05 — MEDIUM — rama >techo podía elegir por debajo del piso
```
Corrección: target = inBand ?: (mayor ≤ techo **sólo si ≥ piso**) ?: máximo disponible; si el
            target queda bajo el piso ⇒ state=FLOOR_BREAK (declarado, no disimulado).
Estado: CORREGIDO.
```

### F06 — LOW — panel con números raw
```
Corrección: el panel distingue "Bitrate medido (ventana 4 s)" (decide) de "red real(raw, no decide)"
            y "techo de variante". La decisión usa el medido CAPADO al máximo de variante.
Prueba en device: `bitrate=6221kbps net=214695 maxvar=6221` — la ráfaga de red (214 Mbps) NO decide.
Estado: CORREGIDO.
```

### F07/F08 — LOW — demand 1.45 / outBand<1440 etiquetado "4k"
```
Corrección: `defaultDemand` se limita a {2k:1.00, 4k:1.15} (la salida está capada a 4K por política:
            pedir banda 6K/8K era un claim imposible) y `outBand()` ya no devuelve "4k" por debajo de
            1440p (devuelve fhd1080/hd720). Las bandas de ORIGEN 6k/8k se conservan como defensa
            (inalcanzables en la práctica si el decode está capado a 4K): DOCUMENTADO.
Estado: CORREGIDO + documentado.
```

### F09 — LOW — `upscale_demand_<out>` sin escritor/UI
```
Estado: DOCUMENTADO (config por prefs, sin UI; los defaults de BitrateConfig aplican y el valor se
        puede escribir por adb/prefs. No se inventa una pantalla nueva en este fix).
```

### F11 — LOW — temporizadores sin reset en zap/release
```
Corrección: BitrateGuard.reset() cancela el callback del ALERT, limpia belowSince/lock/contadores y
            publica estado SETTLED + bitrate 0; ApePlayer lo llama en playChannel (zap) y en release.
Estado: CORREGIDO.
```

## 3. Verificación en device (ONN `192.168.1.7:5555`)

```
./gradlew --offline :app:assembleRelease      → BUILD SUCCESSFUL (exit 0) · 2m22s
adb install -r app-release.apk                → Success · versionCode=31 / 3.4.5-bitrate-guard-r1
adb shell wm size                             → Physical 3840x2160 · Override 1920x1080
adb shell pidof com.ape.crystalagent          → 20696 (vivo; sin crash durante el test)
```

`adb logcat -d -s ApeBitrateGuard` (extracto literal):

```
I ApeBitrateGuard: LOCK 1920x1080@6221kbps reason=below_floor
I ApeBitrateGuard: bitrate=459kbps net=459 maxvar=6221 floor=9200 ceil=14000 state=FLOOR_BREAK buf=0% lock=6221 cand=1/5 win=1920x1080-1920x1080 sample_age=0ms
I ApeBitrateGuard: bitrate=6221kbps net=214695 maxvar=6221 floor=9200 ceil=14000 state=FLOOR_BREAK buf=100% lock=6221 cand=1/5 win=1920x1080-1920x1080 sample_age=2963ms
I ApeBitrateGuard: bitrate state=ALERT timer=8s below_floor_ms=8006
I ApeBitrateGuard: bitrate=6221kbps net=214695 maxvar=6221 floor=9200 ceil=14000 state=ALERT buf=100% lock=6221 … sample_age=4969ms
I ApeBitrateGuard: bitrate=0kbps net=214695 maxvar=6221 floor=9200 ceil=14000 state=NO_DATA buf=0% lock=6221 … sample_age=7305ms
I ApeBitrateGuard: bitrate=0kbps … state=NO_DATA … sample_age=25070ms
```

Lectura honesta de esos números:
- El guard **fijó 1080p** (nunca 720p) y eligió 6221 kbps (la variante real disponible).
- **ALERT a los 8.006 s** de medición por debajo del piso (9200 kbps): el origen público no llega al piso de 1080p. Es el comportamiento correcto: sostener lo máximo disponible y declararlo.
- `net=214695` es la **ráfaga** de prefetch/caché; el valor que decide está capado a `maxvar=6221` (F06).
- Tras llenarse el buffer no entran bytes nuevos ⇒ `NO_DATA` con edad creciente (F03): no se decide ni se alarma con dato viejo.

`ApePlayer` en el mismo run: `LOCK resolución 1920x1080`, `4k_upscaled: fuente 1920x1080 < target 3840x2160`,
`VIDEO elegido: mime=video/avc codecs=avc1.640028 1920x1080 bps=6221600`.

## 4. Límites reales (no se maquillan)

1. **LoadControl es inmutable tras construir el player**: `buffer_min_s/buffer_max_s/profile/cache_mib`
   se aplican en el **siguiente** `ApePlayer.build()`; no hay forma soportada de re-tunear un ExoPlayer vivo.
   Por eso el guard **no** promete relleno dinámico.
2. **Media3 no expone** knobs de "prefetch_segments" ni "buffer_connections": eliminados del claim (F01).
3. La fuente medida es un **stream público 1080p AVC**, no el proveedor del propietario: **sin medición de
   la fuente real** ni de un canal 4K/HEVC en este run.
4. El display estaba con **override 1080p** sobre panel 4K ⇒ **no se declara 4K real medido**.
5. `NO_DATA` es esperable cuando la reproducción queda totalmente bufferizada (no hay bytes nuevos).
6. `upscale_demand_*` sigue sin UI (config por prefs).

## 5. Para t43 (re-revisión)

- Re-verificar: `BitrateGuard.kt` (F01 eliminación completa, F03/F04/F05/F11), `DeviceSampler.kt` (F02),
  `BitrateConfig.kt` (F07/F08), `AraStatus.kt` (campos eliminados), `ApePlayer.kt` (reset en zap/release),
  `MainActivity.kt` (etiquetas del panel).
- Comando de reproducción usado: `adb shell am start -n com.ape.crystalagent/.PlayerActivity --es url <stream>`.
- Repetir con una fuente del proveedor (4K/HEVC) para medir banda real; **hasta entonces, 4K real = NO_MEDIDO**.
