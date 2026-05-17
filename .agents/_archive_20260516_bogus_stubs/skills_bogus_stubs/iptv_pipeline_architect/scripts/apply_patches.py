#!/usr/bin/env python3
"""
apply_patches.py v2.0 vNext — Aplica parches del Plan Maestro v23 al generador APE

Uso:
    python apply_patches.py <generador.js> [--version 23.0.0-OMEGA-CRYSTAL-UNIVERSAL] [--output file.js]

Parches automatizables:
    B5+A7  — URL limpia (eliminar ape_sid, ape_nonce, profile de URL)
    A10    — Semaforo FrontCDN (evitar doble ejecucion)
    D4     — Conectar buildUniversalUrl al flujo principal
    D5     — Desactivar funcion huerfana
    D6     — Unificar VERSION string

Parches manuales (no automatizables):
    Paso 3  — Consolidar pipeline EXTHTTP + OVERFLOW
    Paso 4  — JWT real (generateJWT68Fields)
    Paso 5  — resolveStreamExtension()
    Paso 8  — ESSENTIAL_KEYS

Fallback:
    Si un regex no matchea, intenta alternativas.
    Crea backup automatico antes de parchear.
"""

import re
import sys
import os
import shutil
import argparse
import json


def patch_b5_clean_url(src):
    """Paso 1: Eliminar parametros APE de la URL (Bug B5 + A7)"""
    modified = False

    # Eliminar bloque de inyeccion de ape_sid
    new_src = re.sub(
        r'if\s*\(primaryUrl\)\s*\{[^}]*ape_sid=[^}]*\}',
        '// [PATCH B5] ape_sid removido de URL — viaja en EXTHTTP CAPA A',
        src
    )
    if new_src != src:
        modified = True
        src = new_src

    # Reemplazar getTierUrl
    old_tier = re.search(r'const getTierUrl\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\}', src)
    if old_tier:
        replacement = """const getTierUrl = (url) => {
    if (!url) return '';
    return url
        .replace(/[?&]ape_sid=[^&]*/g, '')
        .replace(/[?&]ape_nonce=[^&]*/g, '')
        .replace(/[?&]profile=[^&]*/g, '')
        .replace(/&&+/g, '&')
        .replace(/\\?&/g, '?')
        .replace(/[?&]$/, '');
}; // [PATCH B5+A7] URL limpia"""
        src = src[:old_tier.start()] + replacement + src[old_tier.end():]
        modified = True

    return src, modified


def patch_a10_frontcdn_semaphore(src):
    """Paso 2: Guardia de ejecucion unica en FrontCDN (A10)"""
    if '__APE_FRONTCDN_RESOLVING__' in src:
        return src, False  # Ya parcheado

    semaphore = """
    // [PATCH A10] Semaforo — evita doble ejecucion v2.0+v3.0
    if (window.__APE_FRONTCDN_RESOLVING__) {
        console.log('[FrontCDN] Pre-resolucion ya en curso — omitiendo duplicado');
        return window.__APE_FRONTCDN_RESOLVE_PROMISE__ || Promise.resolve();
    }
    window.__APE_FRONTCDN_RESOLVING__ = true;
    window.__APE_FRONTCDN_RESOLVE_PROMISE__ = (async () => { try {
"""
    match = re.search(r'async function preResolveFrontCDNRedirects\s*\([^)]*\)\s*\{', src)
    if match:
        insert_pos = match.end()
        close_match = re.search(r'\n\}', src[insert_pos:])
        if close_match:
            end_pos = insert_pos + close_match.start()
            src = (
                src[:insert_pos] + semaphore +
                src[insert_pos:end_pos] +
                "\n    } finally { window.__APE_FRONTCDN_RESOLVING__ = false; }\n    })();\n    return window.__APE_FRONTCDN_RESOLVE_PROMISE__;" +
                src[end_pos:]
            )
            return src, True
    return src, False


def patch_d4_connect_universal_url(src):
    """Paso 6: Conectar buildUniversalUrl() al flujo principal (D4)"""
    if 'buildUniversalUrl' not in src:
        return src, False
    if re.search(r'primaryUrl\s*=\s*buildUniversalUrl\s*\(', src):
        return src, False  # Ya conectado

    old_call = re.search(
        r'let primaryUrl\s*=\s*\(typeof buildChannelUrl\s*===\s*[\'"]function[\'"]\)[^;]+;',
        src
    )
    if old_call:
        replacement = """let primaryUrl = '';
    const _usaCreds = (() => {
        const sid = channel.serverId || channel._source || channel.server_id || '';
        return credentialsMap[sid] || credentialsMap['__current__'] || {};
    })();
    if (typeof detectServerFingerprint === 'function' && typeof buildUniversalUrl === 'function') {
        const _fp = detectServerFingerprint(_usaCreds.baseUrl || '', _usaCreds);
        primaryUrl = buildUniversalUrl(channel, _usaCreds, _fp, profile) || '';
    }
    if (!primaryUrl && typeof buildChannelUrl === 'function') {
        primaryUrl = buildChannelUrl(channel, jwt, profile, index, credentialsMap);
    }
    if (!primaryUrl) primaryUrl = channel.url || channel.src || '';
    if (typeof getTierUrl === 'function') primaryUrl = getTierUrl(primaryUrl);
    // [PATCH D4] buildUniversalUrl conectado"""
        src = src[:old_call.start()] + replacement + src[old_call.end():]
        return src, True

    return src, False


def patch_d5_remove_orphan(src):
    """Paso 7a: Desactivar funcion huerfana __getOmegaGodTierDirectives"""
    new_src = re.sub(
        r'(function __getOmegaGodTierDirectives)',
        r'// [PATCH D5] Funcion huerfana desactivada\n// \1',
        src
    )
    return new_src, new_src != src


def patch_d6_unify_version(src, new_version):
    """Paso 7b: Unificar VERSION string"""
    modified = False
    new_src = re.sub(
        r"(const VERSION\s*=\s*)['\"][^'\"]*['\"]",
        f"\\1'{new_version}'",
        src
    )
    if new_src != src:
        modified = True
        src = new_src

    new_src = re.sub(
        r'(//.*APE.*Generator.*v)[0-9]+\.[0-9]+[^\n]*',
        f'// APE M3U8 Generator v{new_version}',
        src,
        count=1
    )
    if new_src != src:
        modified = True
        src = new_src

    return src, modified


def main():
    parser = argparse.ArgumentParser(description='Aplicar parches Plan Maestro v23')
    parser.add_argument('js_path', help='Ruta al generador')
    parser.add_argument('--version', default='23.0.0-OMEGA-CRYSTAL-UNIVERSAL')
    parser.add_argument('--output', help='Archivo de salida')
    parser.add_argument('--json', action='store_true', help='Output JSON')
    args = parser.parse_args()

    if not os.path.exists(args.js_path):
        print(f"ERROR: {args.js_path} no encontrado")
        sys.exit(1)

    output = args.output or args.js_path.replace('.js', '_PATCHED.js')

    # Backup
    backup = args.js_path + '.backup'
    shutil.copy2(args.js_path, backup)

    with open(args.js_path, 'r', encoding='utf-8', errors='ignore') as f:
        src = f.read()

    patches_def = [
        ('B5+A7 — URL limpia', lambda s: patch_b5_clean_url(s)),
        ('A10 — Semaforo FrontCDN', lambda s: patch_a10_frontcdn_semaphore(s)),
        ('D4 — buildUniversalUrl', lambda s: patch_d4_connect_universal_url(s)),
        ('D5 — Funcion huerfana', lambda s: patch_d5_remove_orphan(s)),
        ('D6 — VERSION unificada', lambda s: patch_d6_unify_version(s, args.version)),
    ]

    applied = []
    skipped = []

    for name, fn in patches_def:
        before_len = len(src)
        src, did_modify = fn(src)
        delta = len(src) - before_len
        if did_modify:
            applied.append({"name": name, "delta": delta})
        else:
            skipped.append({"name": name, "reason": "no match or already applied"})

    with open(output, 'w', encoding='utf-8') as f:
        f.write(src)

    # Score
    score = int((len(applied) / len(patches_def)) * 100) if patches_def else 0
    nivel = "PRODUCCION" if score >= 85 else ("ACEPTAR_CON_RIESGO" if score >= 70 else "RECHAZAR")

    result = {
        "output": output,
        "version": args.version,
        "backup": backup,
        "applied": applied,
        "skipped": skipped,
        "score": score,
        "nivel": nivel,
        "manual_pending": [
            "Paso 3: Consolidar pipeline EXTHTTP + OVERFLOW",
            "Paso 4: JWT real (generateJWT68Fields)",
            "Paso 5: resolveStreamExtension()",
            "Paso 8: ESSENTIAL_KEYS",
        ]
    }

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"\nBackup: {backup}")
        print(f"\nAplicando {len(patches_def)} parches a: {os.path.basename(args.js_path)}")
        for p in applied:
            print(f"  [OK] {p['name']} ({'+' if p['delta'] >= 0 else ''}{p['delta']} chars)")
        for s in skipped:
            print(f"  [SKIP] {s['name']} — {s['reason']}")
        print(f"\nTotal: {len(applied)} aplicados, {len(skipped)} omitidos")
        print(f"Archivo: {output}")
        print(f"Version: {args.version}")
        print(f"\nSCORE: {score}/100 — {nivel}")
        if result["manual_pending"]:
            print(f"\nParches manuales pendientes:")
            for mp in result["manual_pending"]:
                print(f"  - {mp}")
            print(f"  Ver: references/plan_maestro_v23.md")

    sys.exit(0 if score >= 70 else 1)


if __name__ == '__main__':
    main()
