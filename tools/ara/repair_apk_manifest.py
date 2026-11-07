#!/usr/bin/env python3
"""
tools/ara/repair_apk_manifest.py

Repara el AndroidManifest.xml BINARIO (AXML) de un APK ya compilado, sin Gradle,
sin descompilar y sin tocar recursos. Pensado para el defecto medido el 2026-11-07:

    android:icon="@android:drawable/ic_media_play"
    android:banner="@android:drawable/ic_media_play"

Ese id (0x01080024) es un recurso del FRAMEWORK que no resuelve en el framework
del dispositivo, y PackageManager rechaza el paquete completo con
"No se instaló la app porque parece que el paquete no es válido"
(INSTALL_FAILED_INVALID_APK). Verificado: los 19 APK de ara-x/app-dist daban
`aapt dump badging` rc=1 con "ERROR getting 'android:icon' attribute".

QUE HACE
  1. Localiza los elementos <manifest> y <application> en el AXML.
  2. Neutraliza android:icon / android:banner (dataType=TYPE_NULL, data=0), que es
     equivalente a no declararlos: el sistema usa el icono por defecto.
  3. Opcionalmente sube android:versionCode para que reemplace cualquier version.
  4. Reescribe el APK conservando el metodo de compresion de cada entrada
     (resources.arsc DEBE seguir STORED en Android 11+).
  5. zipalign -p 4 y firma con apksigner (v1+v2+v3) si se le pasan las rutas.

TODO SE HACE EN SITIO (in-place): cada parche escribe los mismos bytes que lee,
asi que el chunk no cambia de tamano y no hay que reescribir el string pool.

USO
  python tools/ara/repair_apk_manifest.py --in agent.apk --out agent_fixed.apk \
      --version-code 600 \
      --zipalign <sdk>/build-tools/34.0.0/zipalign.exe \
      --apksigner <sdk>/build-tools/34.0.0/apksigner.bat \
      --keystore ~/.android/debug.keystore --ks-pass android --ks-alias androiddebugkey

EXIT
  0 = APK reparado (y firmado si se pidió)
  1 = no se pudo reparar
  2 = error de argumentos / fichero ausente

Sin dependencias externas (solo stdlib + las herramientas del SDK si se pasan).
"""

from __future__ import annotations

import argparse
import os
import shutil
import struct
import subprocess
import sys
import zipfile

# ── Constantes del formato AXML ──────────────────────────────────────────────
RES_XML_TYPE = 0x0003
RES_STRING_POOL_TYPE = 0x0001
RES_XML_START_ELEMENT_TYPE = 0x0102

TYPE_NULL = 0x00
TYPE_REFERENCE = 0x01
TYPE_INT_DEC = 0x10

ANDROID_NS = "http://schemas.android.com/apk/res/android"


def _read_len8(data: bytes, p: int):
    """Longitud estilo UTF-8 (1 o 2 bytes) del string pool UTF-8."""
    v = data[p]
    if v & 0x80:
        v = ((v & 0x7F) << 8) | data[p + 1]
        return v, p + 2
    return v, p + 1


def _read_len16(data: bytes, p: int):
    """Longitud UTF-16 (1 o 2 words)."""
    v = struct.unpack_from("<H", data, p)[0]
    if v & 0x8000:
        v2 = struct.unpack_from("<H", data, p + 2)[0]
        return ((v & 0x7FFF) << 16) | v2, p + 4
    return v, p + 2


def parse_string_pool(data: bytes, off: int):
    _, _hsize, _size = struct.unpack_from("<HHI", data, off)
    string_count, _style_count, flags, strings_start, _styles_start = struct.unpack_from(
        "<IIIII", data, off + 8
    )
    utf8 = bool(flags & 0x100)
    offsets = struct.unpack_from("<%dI" % string_count, data, off + 28)
    base = off + strings_start
    out = []
    for o in offsets:
        p = base + o
        if utf8:
            _n1, p = _read_len8(data, p)
            n2, p = _read_len8(data, p)
            out.append(data[p : p + n2].decode("utf-8", "replace"))
        else:
            n, p = _read_len16(data, p)
            out.append(data[p : p + n * 2].decode("utf-16-le", "replace"))
    return out


def find_patch_sites(manifest: bytes):
    """
    Recorre los chunks y devuelve:
      - offsets de typedValue (dataType) de android:icon y android:banner en <application>
      - offset de typedValue (data) de android:versionCode en <manifest>
    """
    strings = []
    icon_sites = []
    version_site = None

    off = 8
    n = len(manifest)
    while off + 8 <= n:
        ctype, _hsize, csize = struct.unpack_from("<HHI", manifest, off)
        if csize <= 0 or off + csize > n:
            break
        if ctype == RES_STRING_POOL_TYPE:
            strings = parse_string_pool(manifest, off)
        elif ctype == RES_XML_START_ELEMENT_TYPE:
            _line, _comment = struct.unpack_from("<II", manifest, off + 8)
            _ns, name_idx = struct.unpack_from("<II", manifest, off + 16)
            attr_start, attr_size, attr_count = struct.unpack_from("<HHH", manifest, off + 24)
            elem = strings[name_idx] if name_idx < len(strings) else ""

            if attr_size >= 20 and attr_count:
                attrs_off = off + 16 + attr_start
                for i in range(attr_count):
                    a = attrs_off + i * attr_size
                    if a + 20 > n:
                        break
                    _ans, aname_idx, _raw = struct.unpack_from("<III", manifest, a)
                    aname = strings[aname_idx] if aname_idx < len(strings) else ""
                    # Layout del atributo (20 bytes):
                    #   ns(4) name(4) rawValue(4) | size(2) res0(1) dataType(1) data(4)
                    #   a+0   a+4     a+8        | a+12    a+14    a+15       a+16
                    dtype = manifest[a + 15]
                    data_val = struct.unpack_from("<I", manifest, a + 16)[0]

                    if elem == "application" and aname in ("icon", "banner"):
                        # Solo si es una REFERENCIA (lo que rompe el paquete).
                        if dtype == TYPE_REFERENCE:
                            icon_sites.append((a + 15, a + 16, aname, data_val))
                    if elem == "manifest" and aname == "versionCode":
                        if dtype == TYPE_INT_DEC:
                            version_site = (a + 15, a + 16, data_val)
        off += csize

    return icon_sites, version_site, strings


def repair_manifest_bytes(manifest: bytes, new_version_code=None, icon_ref=None):
    """
    Arregla android:icon / android:banner del <application>.

    DOS MODOS:
      - icon_ref = 0x7f...  -> REEMPLAZA la referencia rota por ese recurso PROPIO
        del APK. Es el modo recomendado en apps Android TV (leanback): quitar el
        banner de una app leanback puede dejar al launcher sin que dibujar.
      - icon_ref = None     -> ELIMINA los atributos (el sistema pone el icono por
        defecto). Valido para apps sin LEANBACK_LAUNCHER.

    Y si se pide, sube android:versionCode.

    NEUTRALIZAR a TYPE_NULL no basta: el atributo sigue presente y aapt sigue
    intentando resolverlo (medido 2026-11-07).
    """
    strings = []
    removals = {}     # chunk_offset -> (set(indices), attr_start, attr_size, attr_count)
    replacements = []  # (data_off, ref)
    version_site = None

    off = 8
    n = len(manifest)
    while off + 8 <= n:
        ctype, _hsize, csize = struct.unpack_from("<HHI", manifest, off)
        if csize <= 0 or off + csize > n:
            break
        if ctype == RES_STRING_POOL_TYPE:
            strings = parse_string_pool(manifest, off)
        elif ctype == RES_XML_START_ELEMENT_TYPE:
            _ns, name_idx = struct.unpack_from("<II", manifest, off + 16)
            attr_start, attr_size, attr_count = struct.unpack_from("<HHH", manifest, off + 24)
            elem = strings[name_idx] if name_idx < len(strings) else ""
            if attr_size >= 20 and attr_count:
                attrs_off = off + 16 + attr_start
                drop = set()
                for i in range(attr_count):
                    a = attrs_off + i * attr_size
                    if a + 20 > n:
                        break
                    _ans, aname_idx, _raw = struct.unpack_from("<III", manifest, a)
                    aname = strings[aname_idx] if aname_idx < len(strings) else ""
                    # Layout del atributo (20 bytes):
                    #   ns(4) name(4) rawValue(4) | size(2) res0(1) dataType(1) data(4)
                    #   a+0   a+4     a+8        | a+12    a+14    a+15       a+16
                    dtype = manifest[a + 15]
                    data_val = struct.unpack_from("<I", manifest, a + 16)[0]

                    if elem == "application" and aname in ("icon", "banner"):
                        if icon_ref is not None:
                            replacements.append((a + 15, a + 16, int(icon_ref)))
                            print(
                                f"[repair] {aname}: referencia 0x{data_val:08x} -> "
                                f"0x{int(icon_ref):08x} (recurso PROPIO del APK)"
                            )
                        else:
                            drop.add(i)
                            print(f"[repair] {aname}: atributo ELIMINADO (era dtype=0x{dtype:02x} 0x{data_val:08x})")
                    if elem == "manifest" and aname == "versionCode" and dtype == TYPE_INT_DEC:
                        version_site = (a + 16, data_val)
                if drop:
                    removals[off] = (drop, attr_start, attr_size, attr_count)
        off += csize

    if not removals and not replacements:
        print("[repair] no hay android:icon/banner en <application> (ya estaba limpio)")

    out = bytearray(manifest)

    # 1) Reemplazos de referencia: mismo tamano, no mueven offsets.
    for dtype_off, data_off, ref in replacements:
        out[dtype_off] = TYPE_REFERENCE
        struct.pack_into("<I", out, data_off, ref)

    # 2) Eliminaciones: reescribir el chunk (de atras hacia adelante).
    for chunk_off in sorted(removals.keys(), reverse=True):
        drop, attr_start, attr_size, attr_count = removals[chunk_off]
        csize = struct.unpack_from("<I", out, chunk_off + 4)[0]
        chunk = bytes(out[chunk_off : chunk_off + csize])
        local_attr_start = 16 + attr_start
        header = bytearray(chunk[:local_attr_start])
        attrs = [
            chunk[local_attr_start + i * attr_size : local_attr_start + (i + 1) * attr_size]
            for i in range(attr_count)
        ]
        keep = [a for i, a in enumerate(attrs) if i not in drop]
        new_count = len(keep)
        struct.pack_into("<H", header, 28, new_count)  # attributeCount
        # idIndex/classIndex/styleIndex son 1-based (0 = ninguno): remapear bien.
        for field in (30, 32, 34):
            idx = struct.unpack_from("<H", header, field)[0]
            if idx == 0:
                continue
            target = idx - 1
            if target in drop:
                struct.pack_into("<H", header, field, 0)
            else:
                shift = sum(1 for d in drop if d < target)
                struct.pack_into("<H", header, field, idx - shift)
        new_chunk = bytearray(header) + b"".join(keep)
        struct.pack_into("<I", new_chunk, 4, len(new_chunk))  # chunk size
        out[chunk_off : chunk_off + csize] = new_chunk

    if new_version_code is not None:
        if version_site is None:
            print("[repair] AVISO: no se encontro android:versionCode; no se sube")
        else:
            data_off, old = version_site
            struct.pack_into("<I", out, data_off, int(new_version_code))
            print(f"[repair] versionCode: {old} -> {int(new_version_code)}")

    struct.pack_into("<I", out, 4, len(out))  # tamano total del XML
    return bytes(out)


def rebuild_zip(src: str, dst: str, patched_manifest: bytes):
    """Reescribe el APK conservando orden, metodo de compresion y contenido."""
    replaced = False
    with zipfile.ZipFile(src, "r") as zin, zipfile.ZipFile(dst, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "AndroidManifest.xml":
                data = patched_manifest
                replaced = True
            new_info = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            new_info.compress_type = info.compress_type
            new_info.external_attr = info.external_attr
            new_info.internal_attr = info.internal_attr
            new_info.create_system = info.create_system
            zout.writestr(new_info, data)
    if not replaced:
        raise SystemExit("ERROR: el APK no contiene AndroidManifest.xml")


def run(cmd):
    print("[run]", " ".join(str(c) for c in cmd))
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.stdout.strip():
        print(r.stdout.strip())
    if r.stderr.strip():
        print(r.stderr.strip())
    return r.returncode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--version-code", type=int, default=None)
    ap.add_argument(
        "--icon-ref",
        default=None,
        help="Reemplaza android:icon/banner por este recurso PROPIO (p.ej. 0x7f050005) "
             "en vez de eliminarlos. RECOMENDADO en apps Android TV (leanback).",
    )
    ap.add_argument("--zipalign", default=None)
    ap.add_argument("--apksigner", default=None)
    ap.add_argument("--keystore", default=None)
    ap.add_argument("--ks-pass", default="android")
    ap.add_argument("--ks-alias", default="androiddebugkey")
    ap.add_argument("--key-pass", default=None)
    args = ap.parse_args()

    if not os.path.isfile(args.src):
        print(f"ERROR: no existe {args.src}")
        return 2

    with zipfile.ZipFile(args.src, "r") as z:
        manifest = z.read("AndroidManifest.xml")

    print(f"[repair] manifiesto original: {len(manifest)} bytes")
    icon_ref = int(args.icon_ref, 0) if args.icon_ref else None
    patched = repair_manifest_bytes(manifest, args.version_code, icon_ref)
    print(f"[repair] manifiesto reparado: {len(patched)} bytes ({len(patched) - len(manifest):+d})")

    tmp_unsigned = args.dst + ".unsigned"
    rebuild_zip(args.src, tmp_unsigned, patched)
    print(f"[repair] APK reconstruido: {tmp_unsigned}")

    current = tmp_unsigned
    if args.zipalign:
        aligned = args.dst + ".aligned"
        if run([args.zipalign, "-f", "-p", "4", current, aligned]) != 0:
            print("ERROR: zipalign fallo")
            return 1
        os.remove(current)
        current = aligned

    if args.apksigner and args.keystore:
        cmd = [
            args.apksigner, "sign",
            "--ks", args.keystore,
            "--ks-pass", f"pass:{args.ks_pass}",
            "--ks-key-alias", args.ks_alias,
            "--key-pass", f"pass:{args.key_pass or args.ks_pass}",
            "--v1-signing-enabled", "true",
            "--v2-signing-enabled", "true",
            "--v3-signing-enabled", "true",
            "--out", args.dst, current,
        ]
        if run(cmd) != 0:
            print("ERROR: apksigner fallo")
            return 1
        os.remove(current)
        if run([args.apksigner, "verify", "--print-certs", args.dst]) != 0:
            print("ERROR: la firma no verifica")
            return 1
    else:
        shutil.move(current, args.dst)
        print("[repair] AVISO: sin firmar (no se pasaron --apksigner/--keystore)")

    print(f"[repair] LISTO -> {args.dst} ({os.path.getsize(args.dst)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
