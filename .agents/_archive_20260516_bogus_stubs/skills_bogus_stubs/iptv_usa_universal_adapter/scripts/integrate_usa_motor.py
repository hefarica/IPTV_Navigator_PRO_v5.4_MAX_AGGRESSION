#!/usr/bin/env python3
"""
integrate_usa_motor.py v2.0 vNext — Integra el motor USA en un generador M3U8 JS

Uso:
    python integrate_usa_motor.py <input.js> <output.js> [--version X.Y.Z-TAG]

El script:
1. Lee el generador JS de entrada
2. Inyecta el modulo USA_MODULE antes de buildChannelUrl
3. Reemplaza return final de buildChannelUrl por buildUniversalUrl()
4. Conecta _usaFP y _usaOverrides en generateChannelEntry
5. Inyecta _usaOverrides.extvlcopt y _usaOverrides.kodiprop
6. Actualiza VERSION si se pasa --version
7. Guarda resultado y ejecuta validacion con scoring

Fallback:
    Si un anchor no se encuentra, intenta anchors alternativos.
    Si todos fallan, reporta para intervencion manual.
"""

import sys
import re
import os


def find_usa_module():
    """Busca el modulo USA en ubicaciones conocidas."""
    candidates = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'USA_MODULE_v1.js'),
        os.path.join(os.getcwd(), 'USA_MODULE_v1.js'),
        os.path.join(os.getcwd(), 'scripts', 'USA_MODULE_v1.js'),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def integrate(input_path, output_path, new_version=None):
    if not os.path.exists(input_path):
        print(f"ERROR: Archivo no encontrado: {input_path}")
        sys.exit(1)

    with open(input_path, encoding='utf-8') as f:
        gen = f.read()

    usa_path = find_usa_module()
    if not usa_path:
        print("ERROR: No se encontro USA_MODULE_v1.js")
        print("  Buscado en:")
        print(f"    {os.path.dirname(os.path.abspath(__file__))}")
        print(f"    {os.getcwd()}")
        print("  Copiar USA_MODULE_v1.js al directorio de scripts o de trabajo")
        sys.exit(1)

    with open(usa_path, encoding='utf-8') as f:
        usa_module = f.read()

    patches = []
    failures = []

    # -- PARCHE 1: VERSION --
    if new_version:
        old_ver = re.search(r"const VERSION = '[^']+';", gen)
        if old_ver:
            gen = gen.replace(old_ver.group(), f"const VERSION = '{new_version}';", 1)
            patches.append(f"VERSION -> {new_version}")
        else:
            failures.append("VERSION (no encontrado)")

    # -- PARCHE 2: Inyectar modulo USA --
    anchors_inject = [
        "    // v10.0: Simple Xtream Codes URL builder",
        "    function buildChannelUrl(",
        "function buildChannelUrl(",
    ]
    injected = False
    for anchor in anchors_inject:
        if anchor in gen:
            gen = gen.replace(anchor, usa_module + "\n\n" + anchor, 1)
            patches.append(f"Modulo USA inyectado (anchor: {anchor[:40]}...)")
            injected = True
            break
    if not injected:
        failures.append("buildChannelUrl anchor — modulo USA no inyectado")

    # -- PARCHE 3: return de buildChannelUrl -> buildUniversalUrl --
    pattern = r"        return preferHttps\(`\$\{creds\.baseUrl\}/\$\{typePath\}/\$\{creds\.username\}/\$\{creds\.password\}/\$\{streamId\}\.\$\{ext\}`\);\s*\}"
    new_return = """        // USA v2.0: URL universal idempotente y polimorfica
        const _usaFingerprint = detectServerFingerprint(creds.baseUrl, creds);
        return buildUniversalUrl(channel, creds, _usaFingerprint, profile || 'P3');
    }"""
    match = re.search(pattern, gen)
    if match:
        gen = gen[:match.start()] + new_return + gen[match.end():]
        patches.append("buildChannelUrl -> buildUniversalUrl()")
    else:
        # Fallback: buscar cualquier return preferHttps en buildChannelUrl
        alt = re.search(r'return preferHttps\([^)]+\);\s*\}', gen)
        if alt:
            gen = gen[:alt.start()] + new_return + gen[alt.end():]
            patches.append("buildChannelUrl -> buildUniversalUrl() (fallback anchor)")
        else:
            failures.append("return de buildChannelUrl (no encontrado)")

    # -- PARCHE 4: _usaFP en generateChannelEntry --
    anchor_primary = "        let primaryUrl = (typeof buildChannelUrl === 'function')"
    alt_primary = "let primaryUrl = (typeof buildChannelUrl === 'function')"
    target = anchor_primary if anchor_primary in gen else (alt_primary if alt_primary in gen else None)
    if target:
        hook = """        // USA v2.0: fingerprint + overrides para este canal
        const _usaCredsForChannel = (() => {
            try {
                const sid = channel.server_id || channel.serverId || channel.sid;
                return credentialsMap[sid] || credentialsMap['__current__'] || {};
            } catch(e) { return {}; }
        })();
        const _usaFP = detectServerFingerprint(_usaCredsForChannel.baseUrl || '', _usaCredsForChannel);
        const _usaOverrides = getUSADirectiveOverrides(_usaFP, cfg);

        """
        gen = gen.replace(target, hook + target, 1)
        patches.append("_usaFP + _usaOverrides en generateChannelEntry")
    else:
        failures.append("anchor primaryUrl en generateChannelEntry (no encontrado)")

    # -- PARCHE 5: EXTVLCOPT USA --
    vlc_anchors = [
        "        lines.push(`#EXTVLCOPT:network-caching=${_buf796}`);",
        "lines.push(`#EXTVLCOPT:network-caching=${_buf796}`);",
    ]
    vlc_injected = False
    for anchor in vlc_anchors:
        if anchor in gen:
            inject = """        // USA v2.0: EXTVLCOPT polimorficos
        if (_usaOverrides && _usaOverrides.extvlcopt && _usaOverrides.extvlcopt.length > 0) {
            _usaOverrides.extvlcopt.forEach(opt => lines.push(opt));
        }
        """
            gen = gen.replace(anchor, inject + anchor, 1)
            patches.append("EXTVLCOPT USA inyectados")
            vlc_injected = True
            break
    if not vlc_injected:
        failures.append("anchor EXTVLCOPT network-caching (no encontrado)")

    # -- PARCHE 6: KODIPROP USA --
    kodi_anchors = [
        "        lines.push(`#KODIPROP:inputstream.adaptive.buffer_live_delay=0`);",
        "lines.push(`#KODIPROP:inputstream.adaptive.buffer_live_delay=0`);",
    ]
    kodi_injected = False
    for anchor in kodi_anchors:
        if anchor in gen:
            inject = anchor + """
        // USA v2.0: KODIPROP polimorficos
        if (typeof _usaOverrides !== 'undefined' && _usaOverrides && _usaOverrides.kodiprop && _usaOverrides.kodiprop.length > 0) {
            _usaOverrides.kodiprop.forEach(kp => lines.push(kp));
        }"""
            gen = gen.replace(anchor, inject, 1)
            patches.append("KODIPROP USA inyectados")
            kodi_injected = True
            break
    if not kodi_injected:
        failures.append("anchor KODIPROP buffer_live_delay (no encontrado)")

    # -- Guardar --
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(gen)

    print(f"\n{'=' * 60}")
    print("PARCHES APLICADOS:")
    for p in patches:
        print(f"  [OK] {p}")
    if failures:
        print(f"\nFALLIDOS (requieren intervencion manual):")
        for fail in failures:
            print(f"  [FAIL] {fail}")
    print(f"\nTotal: {len(patches)} aplicados, {len(failures)} fallidos")
    print(f"Archivo: {output_path} ({os.path.getsize(output_path) // 1024} KB)")

    # -- Verificacion critica --
    with open(output_path, encoding='utf-8') as f:
        out = f.read()
    critical = {
        'detectServerFingerprint': 'function detectServerFingerprint(' in out,
        'buildUniversalUrl': 'function buildUniversalUrl(' in out,
        'getUSADirectiveOverrides': 'function getUSADirectiveOverrides(' in out,
        '_usaOverrides.extvlcopt': '_usaOverrides.extvlcopt' in out,
        '_usaOverrides.kodiprop': '_usaOverrides.kodiprop' in out,
    }
    all_ok = all(critical.values())
    found = sum(1 for v in critical.values() if v)
    score = int((found / len(critical)) * 70 + (len(patches) / (len(patches) + len(failures))) * 30) if (len(patches) + len(failures)) > 0 else 0

    print(f"\nVerificacion: {'COMPLETO' if all_ok else 'INCOMPLETO'} ({found}/{len(critical)})")
    for k, v in critical.items():
        print(f"  {'[OK]' if v else '[FAIL]'} {k}")

    nivel = "PRODUCCION" if score >= 85 else ("ACEPTAR_CON_RIESGO" if score >= 70 else "RECHAZAR")
    print(f"\nSCORE: {score}/100 — {nivel}")

    return {"patches": patches, "failures": failures, "score": score, "nivel": nivel}


if __name__ == '__main__':
    args = sys.argv[1:]
    version = None
    if '--version' in args:
        idx = args.index('--version')
        version = args[idx + 1]
        args = [a for i, a in enumerate(args) if i not in (idx, idx + 1)]

    if len(args) < 2:
        print("Uso: python integrate_usa_motor.py <input.js> <output.js> [--version X.Y.Z-TAG]")
        sys.exit(1)

    result = integrate(args[0], args[1], version)
    sys.exit(0 if result.get("score", 0) >= 70 else 1)
