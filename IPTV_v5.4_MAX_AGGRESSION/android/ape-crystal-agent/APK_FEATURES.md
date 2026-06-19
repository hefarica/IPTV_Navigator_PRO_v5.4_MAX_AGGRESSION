# APE Crystal Agent — APK launcher-shield: TODO lo que debe tener (spec de build)

> Checklist completo y autoritativo de lo que el APK DEBE incluir (decisiones LOCKED del propietario).
> Cada item se construye y se compila (toolchain local: JDK17 + Android SDK 34 + Gradle 8.5 + AGP 8.2.2).
> Doctrina: autopista (si el VPS cae, NO se rompe la reproducción) · truth-guards (sin claims falsos) · honesto.

## 1. Entry point / launcher
- [ ] El APK ES el punto de entrada: se abre y **carga la lista por dentro**.
- [ ] Idempotente al abrir: revisa estado (enrolado? túnel? ADB? versión?) y ejecuta **solo lo que falte**.
- [ ] Si ya está instalado → **NO reinstala**; self-update solo si hay versión nueva.
- [ ] Persistencia: foreground service + `BootReceiver` + `START_STICKY` + `onTaskRemoved` (sobrevive reboot, re-levanta túnel).

## 2. WireGuard embebido (red/shield)
- [ ] Librería `com.wireguard.android:tunnel` (GoBackend) sobre `VpnService` (el APK ES la VPN; sin app WG aparte).
- [ ] **Full-tunnel** `AllowedIPs=0.0.0.0/0`, `DNS=10.200.0.1`, `Endpoint=178.156.147.234:51820`, `PersistentKeepalive=25`.
- [ ] Consent VPN de Android (1 vez). Reconexión automática con backoff.
- [ ] Resultado: **TODO el tráfico + DNS del device sale por el VPS** → unbound redirige los dominios del proveedor al shield.

## 3. Auto-enrolamiento (provisioning)
- [ ] Genera keypair WG (privada en `EncryptedSharedPreferences`).
- [ ] **Secreto de enrolamiento baked** → `POST https://iptv-ape.duckdns.org/ara/enroll` {secret, device_pubkey, device_id, model}.
- [ ] Recibe `{assigned_ip 10.200.0.x, server_pubkey, endpoint, dns, allowed_ips}` → configura y sube el túnel.
- [ ] Idempotente (si ya enrolado → reusa su IP). Maneja errores (timeout/secreto) sin romper.

## 4. ADB self-grant (estilo Shizuku, sin PC)
- [ ] Pantalla que GUÍA: activar **Opciones de Desarrollador** + **Depuración inalámbrica** + aceptar el diálogo de emparejamiento.
- [ ] Emparejar con ADB en **localhost** (wireless debugging) → el APK se concede solo `WRITE_SECURE_SETTINGS` (+ lo necesario).
- [ ] Si ya está concedido → skip. Honesto: los toggles los toca el usuario; el resto lo automatiza el APK.

## 5. ARA agent (aplicador pleno + QoE server-side)
- [ ] Cliente **SSE** `ape-feedforward-stream.php` (device-keyed, Bearer) → recibe `device_settings`.
- [ ] `SettingsApplier` con **13 levers PQ** (`pq_ai_sr_enable`, `ai_sr_level`, `ai_pq_mode`, `aipq_enable`, `pq_sharpness_enable`,
      `pq_*_dnr_enable`, `pq_ai_fbc_enable`, `pq_hdr_enable`, `match_content_frame_rate`, `hdr_conversion_mode`, ...) + los 4 actuales,
      con **allowlist estricta + regex de valor + SoC-existence check** (si la key no existe en el SoC → skip).
- [ ] **Heartbeat** periódico → `POST conviva-event` (event_type=heartbeat) = liveness (ara_heartbeats).
- [ ] **Enforcer** 30s (re-aplica si derivó) + **offline cache** (last_good; si SSE cae, mantiene levers).
- [ ] **Sin `READ_LOGS`** → la QoE la reconstruye el VPS server-side por IP. El APK solo aplica + heartbeat.

## 6. Player (reproducción)
- [ ] **ExoPlayer / `androidx.media3`** embebido.
- [ ] `ListLoader` que descarga + parsea la lista en **streaming** (memoria-segura; 22.595 canales / ~390 MB).
- [ ] UI mínima de TV (Leanback): grilla/lista de canales + **zap** + playback. (MVP; no paridad TiviMate al inicio.)
- [ ] Reproduce sobre el túnel (todo ya sale por el shield).

## 7. Self-update
- [ ] Compara `/ara/version` (versionCode + sha256) vs el local.
- [ ] Si nueva → descarga `/ara/agent.apk` → verifica sha256 → instala (`REQUEST_INSTALL_PACKAGES`, consent 1x) → `MY_PACKAGE_REPLACED` re-arranca.
- [ ] Si igual → nada.

## 8. Seguridad / honestidad
- [ ] Secreto baked rotable (si se filtra, rotar en el VPS + revocar peers). Token ARA en `EncryptedSharedPreferences`.
- [ ] Allowlist estricta de settings; sin escribir nada fuera de ella.
- [ ] Autopista: si VPS/enroll/SSE caen, **la reproducción NO se afecta** (degradación silenciosa).
- [ ] Sin claims falsos: el hardware post-procesa, el VPS comanda; el bitstream es el que es.

## 9. Permisos (AndroidManifest)
- [ ] `BIND_VPN_SERVICE` (VpnService) · `INTERNET` · `ACCESS_NETWORK_STATE` · `FOREGROUND_SERVICE` (+ `FOREGROUND_SERVICE_SPECIAL_USE` si targetSdk≥34)
      · `RECEIVE_BOOT_COMPLETED` · `WRITE_SECURE_SETTINGS` (grant por self-ADB) · `REQUEST_INSTALL_PACKAGES` (self-update)
      · `uses-feature` leanback/touchscreen not-required.

## 10. Build / dependencias
- [ ] `com.wireguard.android:tunnel`, `androidx.media3:media3-exoplayer` + `media3-ui` + `media3-exoplayer-hls`,
      `androidx.security:security-crypto` (EncryptedSharedPreferences), okhttp (ya), coroutines (ya).
- [ ] minSdk 22 / targetSdk: evaluar (28 conserva libertad de servicio en Fire OS; VpnService + media3 piden APIs recientes →
      posible subir compileSdk/targetSdk y manejar FGS types). Decisión técnica en F1.
- [ ] Cada fase COMPILA (`gradlew :app:assembleDebug`) antes de avanzar.

## Orden de build (cada fase compila)
F1 WireGuard+enrol · F2 ADB self-grant + 13 levers · F3 player (ExoPlayer+ListLoader) · F4 ARA full (SSE+heartbeat+enforcer+self-update) · F5 E2E.

## Estado de build (2026-06-18) — toolchain local OK
Toolchain instalado y verificado: **JDK 17 + Android SDK 34 + Gradle 8.5 + AGP 8.2.2** (`gradlew` generado).
- ✅ **APK compila** (`gradlew :app:assembleDebug` → `app-debug.apk`, 4.11 MB).
- ✅ **F4 parcial (de los 3 docs):** `QoEReporter` (heartbeat/quality_change → conviva-event), `IDataClient` (ape-match round-trip),
  `SelfUpdateManager` (/ara/version + /ara/agent.apk + sha256 + FileProvider) — cableados en `AgentService`, compilan.
- ✅ Ya existía: `FeedForwardClient` (SSE IDA), `SettingsApplier` (allowlist), `Config`, `BootReceiver`, `AgentService`.
- ⏳ **Pendiente (las piezas grandes):** F1 WireGuard embebido + auto-enrol (full-tunnel), F2 ADB self-grant (Shizuku-style) +
  ampliar `SettingsApplier` a 13 levers + SoC-check, F3 player (ExoPlayer + `ListLoader` streaming).
- Reconciliación con los docs: Item 1 `/ara/events` YA LIVE; Item 3 `/lists/` deny-all NO era el bloqueo (GET ya abierto);
  los docs OMITEN WireGuard → se mantiene (decisión LOCKED del propietario).
