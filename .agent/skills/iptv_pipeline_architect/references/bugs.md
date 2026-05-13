# Catalogo de Bugs del Pipeline APE — vNext

## Bugs Originales (B1-B6)

| ID | Bug | Sev | Deteccion | Fix |
|---|---|---|---|---|
| B1 | STREAM-INF no pegado a URL | CRITICO | audit script, grep -A1 | Reordenar bloque |
| B2 | FrontCDN CORS fetch directo | CRITICO | log ERR_FAILED | VPS proxy o _frontCDNHost |
| B3 | ApeModuleManager.getStatus | MEDIO | TypeError en consola | Guardia typeof |
| B4 | preferHttps() invierte proto | CRITICO | HttpDataSourceException | Passthrough |
| B5 | ape_sid/nonce en URL | CRITICO | grep ape_sid lista.m3u8 | getTierUrl limpiador |
| B6 | Extension hardcodeada | MEDIO | playlist vs TS mismatch | resolveStreamExtension() |

## Anomalias (A7-A13)

| ID | Anomalia | Sev | Deteccion | Fix |
|---|---|---|---|---|
| A7 | &profile= duplicado | CRITICO | grep profile URL | Limpiador regex |
| A10 | FrontCDN x2 sin semaforo | CRITICO | 1992 fetch en log | __APE_FRONTCDN_RESOLVING__ |
| A9 | Chunks 50MB → HTTP 413 | MEDIO | error upload | 5MB chunks |
| A11 | connectXuiApi sin HTTPS detect | MEDIO | redirect loop | HEAD probe |
| A12 | Boton Generar se congela | MEDIO | UI no responde | try/catch/finally |
| A13 | resolve_redirect.php no deploy | MEDIO | 404 VPS | Crear archivo PHP |

## Deuda Arquitectural (D1-D6)

| ID | Deuda | Sev | Deteccion | Fix |
|---|---|---|---|---|
| D1 | Dos pipelines EXTHTTP | CRITICO | diagnose script | Pipeline unificado |
| D2 | JWT stub | CRITICO | decode JWT = vacio | 30+ claims reales |
| D3 | OVERFLOW no emitido | CRITICO | grep APE-OVERFLOW = 0 | Emitir base64 |
| D4 | buildUniversalUrl muerto | CRITICO | grep primaryUrl = 0 | Conectar + fallback |
| D5 | Funcion huerfana | COSMETICO | grep calls = 0 | Eliminar/comentar |
| D6 | VERSION x3 strings | COSMETICO | grep VERSION | Unificar |

## Patrones de Cascada

Un bug puede enmascarar otro:
- B5 (URL sucia) enmascara D4 (USA desconectado) — ambos causan 403
- D1 (dos pipelines) enmascara D3 (OVERFLOW) — si build_exthttp gana, L2 no emite
- A10 (FrontCDN doble) enmascara B2 (CORS) — el bucle UA parece ser el problema
