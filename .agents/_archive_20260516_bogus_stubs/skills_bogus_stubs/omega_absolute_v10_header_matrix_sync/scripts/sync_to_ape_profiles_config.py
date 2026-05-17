#!/usr/bin/env python
"""
Sincroniza APE_OMEGA_PROFILES_v10.0_FINAL.json -> DEFAULT_PROFILES en
ape-profiles-config.js, preservando todo lo demás del archivo intacto.

Modo: ADDITIVE-AWARE — solo reemplaza el bloque DEFAULT_PROFILES (líneas
detectadas dinámicamente). NO toca HEADER_CATEGORIES (antes), NO toca
DEFAULT_HEADER_VALUES (después), NO toca la clase ni los métodos.

Uso:
    python sync_to_ape_profiles_config.py [json_path] [target_js_path]

Defaults:
    json_path   = c:/Users/HFRC/Downloads/APE_OMEGA_PROFILES_v10.0_FINAL.json
    target_js   = ape-profiles-config.js (cwd)

Salida:
    - Reescribe el target_js
    - Imprime reporte: líneas reemplazadas, headerOverrides por perfil
    - Verifica con node -c (si node está disponible)
"""
import json
import os
import re
import subprocess
import sys

JSON_PATH = sys.argv[1] if len(sys.argv) > 1 else "c:/Users/HFRC/Downloads/APE_OMEGA_PROFILES_v10.0_FINAL.json"
TARGET_JS = sys.argv[2] if len(sys.argv) > 2 else "ape-profiles-config.js"

PROFILE_ORDER = ["P0", "P1", "P2", "P3", "P4", "P5"]


def load_json(path):
    if not os.path.isfile(path):
        sys.exit(f"FAIL: JSON no existe en {path}")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    profiles = data.get("profiles", data)
    missing = [k for k in PROFILE_ORDER if k not in profiles]
    if missing:
        sys.exit(f"FAIL: perfiles faltantes en JSON: {missing}")
    return profiles


def render_profile_block(pid, profile, base_indent="        "):
    """
    Renderiza un perfil P0..P5 como JS literal con indentación de 8 espacios
    y comillas dobles en todas las keys (compatible JSON-style).
    """
    body = json.dumps(profile, ensure_ascii=False, indent=4)
    # Re-indent every line by base_indent (except the first which already lives
    # inside the parent indent).
    lines = body.split("\n")
    out = [f'{base_indent}"{pid}": {lines[0]}']
    for ln in lines[1:]:
        out.append(base_indent + ln)
    return "\n".join(out)


def render_default_profiles_block(profiles):
    """
    Genera el bloque completo:
        const DEFAULT_PROFILES = {
            "P0": {...},
            "P1": {...},
            ...
        };
    Indentación de 4 espacios al nivel de la declaración (matchea el resto).
    """
    out = ["    const DEFAULT_PROFILES = {"]
    for i, pid in enumerate(PROFILE_ORDER):
        block = render_profile_block(pid, profiles[pid], base_indent="        ")
        if i < len(PROFILE_ORDER) - 1:
            block += ","
        out.append(block)
        if i < len(PROFILE_ORDER) - 1:
            out.append("")  # blank line between profiles
    out.append("    };")
    return "\n".join(out)


def find_default_profiles_region(lines):
    """
    Localiza la línea de inicio (`const DEFAULT_PROFILES = {`) y la línea de
    cierre (la `};` en el mismo nivel de indentación). Retorna (start_idx, end_idx)
    como índices 0-based, ambos inclusivos.
    """
    start_re = re.compile(r"^\s*const\s+DEFAULT_PROFILES\s*=\s*\{\s*$")
    start_idx = None
    for i, ln in enumerate(lines):
        if start_re.match(ln):
            start_idx = i
            break
    if start_idx is None:
        sys.exit("FAIL: 'const DEFAULT_PROFILES = {' no encontrado.")

    # Find the next line that is exactly `    };` at the same indentation
    # AFTER the start. Use brace-depth tracking that ignores braces inside strings.
    depth = 0
    in_string = False
    string_char = None
    escape_next = False

    for i in range(start_idx, len(lines)):
        ln = lines[i]
        for c in ln:
            if escape_next:
                escape_next = False
                continue
            if c == "\\":
                escape_next = True
                continue
            if in_string:
                if c == string_char:
                    in_string = False
                    string_char = None
            else:
                if c == '"' or c == "'":
                    in_string = True
                    string_char = c
                elif c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        return (start_idx, i)
    sys.exit(
        f"FAIL: cierre de DEFAULT_PROFILES no encontrado (depth final={depth}). "
        f"El archivo está corrupto. Inicio detectado en línea {start_idx + 1}."
    )


def fallback_find_close(lines, start_idx):
    """
    Fallback: si el archivo está corrupto y el brace-depth no funciona,
    busca el patrón estructural conocido: una línea con SOLO `};` seguida por
    el comentario `// VALORES DEFAULT DE HEADERS` o por `const DEFAULT_HEADER_VALUES`.
    """
    close_re = re.compile(r"^\s*\};\s*$")
    next_marker_re = re.compile(
        r"^\s*(//.*VALORES DEFAULT|//.*HEADER VALUES|const\s+DEFAULT_HEADER_VALUES)"
    )
    for i in range(start_idx + 1, len(lines)):
        if close_re.match(lines[i]):
            # Check next non-empty line(s)
            for j in range(i + 1, min(i + 8, len(lines))):
                if next_marker_re.match(lines[j]):
                    return i
    return None


def main():
    print(f"=== APE Profile Sync v10.0 ===")
    print(f"JSON source: {JSON_PATH}")
    print(f"Target JS:   {TARGET_JS}")

    profiles = load_json(JSON_PATH)
    print(f"\nPerfiles cargados del JSON:")
    for pid in PROFILE_ORDER:
        ho = len(profiles[pid].get("headerOverrides", {}))
        h = len(profiles[pid].get("headers", {}))
        nm = profiles[pid].get("name", "")
        print(f"  {pid}: {nm}  headerOverrides={ho}  headers={h}")

    if not os.path.isfile(TARGET_JS):
        sys.exit(f"FAIL: target JS no existe: {TARGET_JS}")

    with open(TARGET_JS, encoding="utf-8") as f:
        lines = f.readlines()
    print(f"\nArchivo actual: {len(lines)} líneas")

    # Try brace-depth detection first (works on healthy files)
    try:
        start_idx, end_idx = find_default_profiles_region(lines)
        print(f"Detección por brace-depth OK: líneas {start_idx + 1}..{end_idx + 1}")
    except SystemExit:
        # Fallback for corrupted files
        print("Brace-depth falló (archivo corrupto). Intentando fallback estructural...")
        start_re = re.compile(r"^\s*const\s+DEFAULT_PROFILES\s*=\s*\{\s*$")
        start_idx = None
        for i, ln in enumerate(lines):
            if start_re.match(ln):
                start_idx = i
                break
        if start_idx is None:
            sys.exit("FAIL: no se encontró 'const DEFAULT_PROFILES = {'")
        end_idx = fallback_find_close(lines, start_idx)
        if end_idx is None:
            sys.exit(
                "FAIL: no se pudo localizar el cierre estructural de DEFAULT_PROFILES. "
                "Revisar manualmente."
            )
        print(f"Fallback OK: líneas {start_idx + 1}..{end_idx + 1}")

    # Render the new block
    new_block = render_default_profiles_block(profiles)
    new_block_lines = [ln + "\n" for ln in new_block.split("\n")]

    # Splice
    before = lines[:start_idx]
    after = lines[end_idx + 1:]
    new_lines = before + new_block_lines + after

    # Stats
    old_block_count = end_idx - start_idx + 1
    new_block_count = len(new_block_lines)
    delta = new_block_count - old_block_count
    print(f"\nReemplazo:")
    print(f"  Bloque antiguo: {old_block_count} líneas")
    print(f"  Bloque nuevo:   {new_block_count} líneas")
    print(f"  Delta:          {delta:+d}")
    print(f"  Total antes:    {len(lines)}")
    print(f"  Total después:  {len(new_lines)}")

    # Write
    with open(TARGET_JS, "w", encoding="utf-8", newline="\n") as f:
        f.writelines(new_lines)
    print(f"\nOK: archivo reescrito: {TARGET_JS}")

    # Syntax check with node
    try:
        r = subprocess.run(
            ["node", "-c", TARGET_JS],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r.returncode == 0:
            print("\n[OK] node -c PASSED")
        else:
            print("\n[FAIL] node -c FAILED:")
            print(r.stderr)
            sys.exit(1)
    except FileNotFoundError:
        print("\n⚠ node no disponible para validación. Validar manualmente.")
    except subprocess.TimeoutExpired:
        print("\n⚠ node -c timeout")


if __name__ == "__main__":
    main()
