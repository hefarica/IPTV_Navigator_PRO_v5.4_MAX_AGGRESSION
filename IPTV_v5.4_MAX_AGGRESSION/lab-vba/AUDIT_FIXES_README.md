# Audit E2E Fixes — Roadmap completo

Resultado de la auditoría E2E del `.xlsm` ejecutada 2026-04-26. Este documento consolida los 10 hallazgos, qué se aplicó automáticamente, qué requiere acción manual, y qué decisiones de política quedan pendientes.

## Estado por hallazgo

| # | Hallazgo | Status | Acción |
|---|---|---|---|
| 1 | `Brain_EnforceMatrixScope` ERROR 449 cuando `Application.Run` lo invoca sin arg | 🔧 PATCH GENERADO | Importar `APE_AUDIT_FIXES.bas` + reemplazar string en array (ver §H1 abajo) |
| 2 | 7 named ranges en R1C1 (`F1C7:F9C7`) | ✅ AUTO-FIX | Reescritos a A1 (`$G$1:$G$9` etc) en `APE_M3U8_LAB_v8_FIXED_AUDIT_FIXED.xlsm` |
| 3 | DV `"P0..P5"` en `C9` y `C4` (drift) | ✅ AUTO-FIX | DVs eliminados |
| 4 | `{config.strip_spoofed_ips}` apunta `C18=8` debería `C21=True` | ✅ AUTO-FIX | INDEX/MATCH por nombre de parámetro |
| 5 | `22_UX_IMPACT!B33,B35` → `C4,C5` (encabezados) | ✅ AUTO-FIX | INDEX/MATCH `Client_Bandwidth_Mbps`/`Client_Latency_Ms` |
| 6 | 33 celdas explosion `2e+33` en `37_VALORES_UNIFICADOS` | ✅ AUTO-FIX | `number_format='@'` + valores normalizados |
| 7 | Secretos en claro (`14_KEYRING`, `17_SERVERS_POOL`, `98_SHIELD_IMMUTABLE`) | 🔓 DECISIÓN | Ver §H7 — política requerida |
| 8 | 40 calls `WScript.Shell`/`powershell.exe`/`curl.exe` sin sandboxing | 🔧 WRAPPER GENERADO | Importar `APE_AUDIT_FIXES.bas` + migrar 40 sitios (ver §H8) |
| 9 | 18,217 canales en `33_CHANNELS_FROM_FRONTEND` sin `last_status/content_type/ttfb_ms` | 🔬 ETL EXTERNO | Ver §H9 — script Python recomendado |
| 10 | Scorecard `00_OMEGA_SCORECARD` 84.6/110 | 🔄 DEPENDIENTE | Re-correrá tras 1-9 fixed |

**Total**: 5 auto-fixed (#2,#3,#4,#5,#6), 2 patches VBA importables (#1, #8), 2 decisiones policy (#7, #9), 1 dependiente (#10).

---

## §H1 — Brain_EnforceMatrixScope ERROR 449

**Bug:** `APE_LAB_BRAIN.bas:2730` declara `Public Sub Brain_EnforceMatrixScope(target As Range)` (arg obligatorio). `APE_WIRING.bas:1586` lo incluye en un array de macro names que luego ejecuta con `Application.Run` SIN argumento → error 449.

**Fix:**

1. **Importar `APE_AUDIT_FIXES.bas`** (sección H1) — define `Brain_EnforceMatrixScope_Safe` que acepta arg opcional.

2. En `APE_WIRING.bas:1586`, reemplazar:
   ```vb
   "Brain_EnforceMatrixScope", _
   ```
   Por:
   ```vb
   "Brain_EnforceMatrixScope_Safe", _
   ```

3. **NO modificar** el `Workbook_SheetChange` (línea 14 de `ThisWorkbook.cls`) — esa llamada ya pasa `target` correctamente, sigue usando el original.

**Verificación:** `Alt+F8` → ejecutar `Brain_EnforceMatrixScope_Safe` (sin pasar arg) → debería completar sin error 449, escaneando toda la matriz `H4:BC<lastRow>` de hoja `8_MATRIX_3D`.

---

## §H7 — Secretos expuestos (DECISIÓN POLICY)

**Inventario verificado:**

| Hoja | Tipo | Cantidad |
|---|---|---|
| `14_KEYRING` | JWT secrets, AES keys, HMAC, IV | 5 keys (`jwt_v1`, `aes_main`, `hmac_session`, `iv_static`, `hydra_key`) — actuales son placeholders `your-XXX-change-me` |
| `17_SERVERS_POOL` | Credenciales Xtream proveedores | 6+ pares user/password reales (KEMOTV1, TIVISION, 123SAT, 4K-26, DNDNS, etc) |
| `98_SHIELD_IMMUTABLE` | `SHIELD_MASTER_TOKEN` SHA1-like | 1 token hex 40 chars |
| `99_DEAD_CHANNELS_BLACKLIST` | Lista de stream_id muertos | No-secret pero contiene paths upstream |

**Riesgos:**
- Si el `.xlsm` se compartiera, los proveedores Xtream verían sus credenciales expuestas a otros revendedores
- `SHIELD_MASTER_TOKEN` permite control total del shield NGINX si filtra

**3 opciones de policy:**

### Opción A — Quitar secretos del Excel (recomendado)
- Mover `14_KEYRING` y `17_SERVERS_POOL` a un archivo `.env` o JSON encriptado fuera del workbook
- VBA se modifica para leer de archivo externo en runtime (con prompt de master password)
- El `.xlsm` queda limpio para compartir/auditar

**Costo:** modificación ~15 macros que leen estos valores. Requiere refactor.

### Opción B — Encriptar in-place + master password
- Hojas con secretos quedan ocultas (Hidden=2 = VeryHidden)
- Valores se almacenan encriptados con AES-256 (master password en VBA)
- Función `Brain_DecryptSecret(name)` desencripta al acceder
- VBA lee siempre via función, nunca celda directa

**Costo:** integrar lib AES VBA (existe pública). Riesgo: master password en el .xlsm también es vulnerable.

### Opción C — Status quo + protect sheet (mínimo)
- Aplicar password de protección a hojas (`Tools → Protection → Protect Sheet`)
- VBA tiene la password, lee normal. Usuarios ven hoja oculta + bloqueada
- Excel password protection es débil (cracker en minutos), pero disuade casual sharing

**Costo:** 5 minutos. Mínima protección efectiva.

**Recomendación:** Opción A para producción real. Opción C como mitigación inmediata mientras planeas A.

---

## §H8 — Shell exec hardening

**Inventario:** 40 llamadas detectadas, principalmente:

```
APE_LAB_BRAIN.bas:107  psScript = "C:\tmp\import_frontend_ultrafast.ps1"
APE_LAB_BRAIN.bas:117  cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ..."
APE_LAB_BRAIN.bas:3759 If dir(Environ("SystemRoot") & "\System32\curl.exe") = "" Then ...
APE_WIRING.bas:1335    Dim sh As Object: Set sh = CreateObject("WScript.Shell")
APE_WIRING.bas:1343    cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\tmp\scorecard_v2_full.ps1"" ..."
APE_WIRING.bas:1992    Const PROGRESS_FILE As String = "C:\tmp\scorecard_progress.txt"
```

**Fix con `APE_AUDIT_FIXES.bas`:**

1. Importar el módulo (incluye `SafeShellRun`)

2. Reemplazar gradualmente los 40 sitios. Patrón:

   **Antes:**
   ```vb
   Dim sh As Object: Set sh = CreateObject("WScript.Shell")
   sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\tmp\scorecard.ps1", 0, True
   ```

   **Después:**
   ```vb
   Dim result As String: result = SafeShellRun("C:\tmp\scorecard.ps1", "", 120, "scorecard_run")
   If Left(result, 2) <> "OK" Then MsgBox "Shell call failed: " & result, vbExclamation
   ```

3. Auditoría: `Alt+F8` → `Brain_AuditShellCalls` → muestra MsgBox con todas las llamadas raw que faltan migrar.

**Beneficios:**
- Whitelist de paths (solo `C:\tmp\`, `%LOCALAPPDATA%\APE_LAB\`, `System32`)
- Log estructurado en `C:\tmp\ape_shell_audit.log` (timestamp|action|script|args|caller|extra)
- Timeout configurable
- Detección de llamadas no migradas via `Brain_AuditShellCalls`

---

## §H9 — Per-channel validation ETL

**Estado:** `33_CHANNELS_FROM_FRONTEND` tiene 18,217 filas sin columnas `last_status`, `content_type`, `ttfb_ms`. Sin esos datos, no puedes:
- Detectar canales muertos antes de generar lista (los emite y el player falla)
- Priorizar servidores rápidos vs lentos
- Validar codec compatibility por canal

**Recomendación:** ETL Python externo, NO macro VBA, porque:
- 18,217 probes HTTP HEAD = 30+ min con paralelismo limitado de VBA
- VBA blocking calls congelan Excel
- Python con `httpx.AsyncClient` paraleliza 100+ a la vez

**Skeleton del script (entregable separado, NO en este patch):**

```python
# scripts/probe_channels.py
import asyncio, httpx, openpyxl, time
async def probe(client, url):
    t0 = time.time()
    try:
        r = await client.head(url, timeout=10, follow_redirects=True)
        return {'status': r.status_code, 'content_type': r.headers.get('content-type', ''), 'ttfb_ms': int((time.time() - t0) * 1000)}
    except Exception as e:
        return {'status': 0, 'content_type': str(e)[:60], 'ttfb_ms': -1}

async def main():
    wb = openpyxl.load_workbook('APE_M3U8_LAB_v8_FIXED.xlsm', keep_vba=True)
    ws = wb['33_CHANNELS_FROM_FRONTEND']
    # Asumiendo URL en col B, escribiendo last_status col 56, content_type 57, ttfb_ms 58
    async with httpx.AsyncClient(headers={'User-Agent': 'APE-Probe/1.0'}, http2=True) as client:
        sem = asyncio.Semaphore(50)
        async def task(row, url):
            async with sem:
                res = await probe(client, url)
                ws.cell(row=row, column=56).value = res['status']
                ws.cell(row=row, column=57).value = res['content_type']
                ws.cell(row=row, column=58).value = res['ttfb_ms']
        await asyncio.gather(*[task(r, ws.cell(row=r, column=2).value) for r in range(2, ws.max_row+1) if ws.cell(row=r, column=2).value])
    # Headers
    ws.cell(row=1, column=56).value = 'last_status'
    ws.cell(row=1, column=57).value = 'content_type'
    ws.cell(row=1, column=58).value = 'ttfb_ms'
    wb.save('APE_M3U8_LAB_v8_FIXED.xlsm')

asyncio.run(main())
```

**Tiempo estimado:** ~5-10 min con paralelismo 50, depende del network.

**Cron sugerido:** semanal (los stream_ids cambian semana a semana en proveedores Xtream).

---

## Pasos de instalación (orden recomendado)

1. **Cerrar Excel COMPLETAMENTE.** Verificar con `tasklist | findstr EXCEL`.

2. **Backup defensivo del original:** ya existe en `_audit_snapshot/2026-04-26_audit_e2e_replicated/APE_M3U8_LAB_v8_FIXED.PRE_FIX_*.xlsm`.

3. **Reemplazar el .xlsm con el fixed:**
   ```bash
   mv "C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED_AUDIT_FIXED.xlsm" \
      "C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.xlsm"
   ```

4. **Abrir el .xlsm fixed → `Alt+F11` → VBE → File → Import File:**
   - `lab-vba/APE_AUDIT_FIXES.bas`
   - `lab-vba/APE_COHERENCE.bas` (de la sesión anterior)
   - `lab-vba/APE_CASCADE.bas` (de la sesión anterior)

5. **Aplicar §H1 fix manual:** editar `APE_WIRING.bas` línea 1586, cambiar `"Brain_EnforceMatrixScope"` → `"Brain_EnforceMatrixScope_Safe"`.

6. **Aplicar hooks de coherence/cascade:** ver `INSTRUCCIONES_HOOK.md`.

7. **Smoke test:**
   - `Alt+F8` → `Brain_EnforceMatrixScope_Safe` → debe correr sin error 449
   - `Alt+F8` → `Brain_AuditShellCalls` → muestra cuántas llamadas shell quedan no-migradas
   - `Alt+F8` → `Brain_CascadeAll` → propaga 3 niveles
   - `Alt+F8` → `Brain_OmegaScorecard` (existente) → re-corre scorecard

8. **Re-export JSON al toolkit** desde `25_JSON_EXPORT`.

9. **Decisión policy H7** (secretos) — discutir antes de producción.

10. **Programar ETL H9** — script Python semanal.

---

## Re-scorecard esperado

Antes: **84.6 / 110 grade B** (faltan CMCD, Master Integrator, frag retries, maxLiveSyncPlaybackRate, bufferTargetSec, DNS/TTFB, LAB markers).

Después de aplicar 1-8 + LAB SSOT (sesiones anteriores):
- ✅ bufferTargetSec coherente (CASCADE R1)
- ✅ frag_retries calibrado por solver + cascade
- ✅ maxLiveSyncPlaybackRate via `opt.maxLiveSyncPlaybackRate`
- ✅ LAB markers identificables (23 tags `#EXT-X-APE-LAB-*` ya emitidos por toolkit)
- ⚠️ CMCD requiere implementación nueva (no cubierto en audit)
- ⚠️ Master Integrator requiere análisis específico (no cubierto)
- ⚠️ DNS/TTFB requiere ETL H9

Score esperado tras 1-8: **~95-100 / 110**. Post H9: **~105+ / 110**.
