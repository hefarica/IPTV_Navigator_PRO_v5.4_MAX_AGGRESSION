# Daemon (ape-crystal-agent) — Auditoría adversarial de concepción (2026-06-15)

**Veredicto: FLAWED · 4 BLOCK · 17 MAJOR** (workflow 6 lentes, 473k tokens).

## BLOCKs (rompen la concepción)
1. **DecodeObserver NO puede leer el decode del player 3rd-party.** Desde Android 4.1, una app **sideloaded** con `READ_LOGS` (pm grant) solo ve los logs de **su PROPIO UID** — NO los de TiviMate/OTT/ExoPlayer. En el Fire Stick real el observer ve **nada** → `onZap` nunca dispara → `CargaApplier` nunca corre. **El input que sostiene todo el daemon está roto.** (Android 13+: peor, diálogo top-app de 60s.)
2. **FeedForwardClient es código muerto.** `AgentService` nunca lo instancia ni llama `subscribe()` — el path feed-forward (SSE, el core del sistema) no está cableado. Solo corre el pull (`MatchClient`).
3. **`onPresets` cae al vacío.** No hay applier de presets; `CargaApplier.apply()` solo acepta `Carga`, no una lista de presets.
4. (= 2) feed-forward muerto.

## MAJORs clave
- El daemon **no sabe qué `listFile`/`ch`** suscribir (`currentChannelId()` → `"live"`; `getActiveSessions` lanza SecurityException sin NotificationListener). → usar modelo **device-keyed `?device=<id>`** (como MatchClient).
- Cambio de canal **no cancela el socket SSE viejo** (`readUtf8Line` con readTimeout=0 no se desbloquea con isActive) → cancelar el `Call` de OkHttp.
- `kodiprop`/`extvlcopt`/`chinaBox` se parsean pero **no se aplican** (son list-level → van por la lista, no por el daemon) — honestidad de applier-reach.
- **Seguridad:** `WRITE_SECURE_SETTINGS` sin allowlist → el VPS podría escribir cualquier global/secure setting. Token viaja en `am startservice --es token` (leak por argv/dumpsys). Falta TLS pinning.
- `inFlight` descarta cada zap durante la ventana 800ms+match → el canal donde el usuario se queda puede no matchear nunca.
- `logcat` child Process se fuga (sin destroy en finally). Persistencia: falta backstop (onTaskRemoved/JobScheduler + watchdog ADB contra FLAG_STOPPED).

## Re-concepción correcta (recomendada por la auditoría + nota propia de CargaApplier)
**El agente sirve un proxy/lista LOCAL (NanoHTTPD) al que el player apunta.** Un solo cambio resuelve 3 cosas:
- **Observa** qué variante pide el player (sin logcat cross-app) → decode real honesto.
- **Inyecta** los presets feed-forward (EXTVLCOPT/KODIPROP) en la lista que el player lee → resuelve applier-reach.
- **Aplicador puro** (sirve contenido enriquecido; no cambia canales/apps — el player se apunta al proxy local una vez en el setup).
+ Direccionamiento **device-keyed**; el VPS feed-forward alimenta el enriquecimiento del proxy local.

Alternativas: (B) MediaSession + `esperado` solamente (degradado, sin claim de decode real); (C) instalar como app privilegiada/system (root) → cambia el modelo de despliegue.
