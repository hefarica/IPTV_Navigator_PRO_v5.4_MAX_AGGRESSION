import sys, re

# Filtra una lista M3U8 por perfil usando el X-APE-Profile del EXTHTTP de cada canal.
# Uso: filter_profile.py <in.m3u8> <out.m3u8> <P1|P3|P4|P5|...> [--with-templates]
# Conserva la cabecera del original (incluidas las plantillas de perfil si las hay)
# y solo los bloques de canal cuyo #EXTHTTP declara el perfil pedido.

if len(sys.argv) < 4:
    print("uso: filter_profile.py <in> <out> <perfil>", file=sys.stderr)
    sys.exit(2)

src, dst, want = sys.argv[1], sys.argv[2], sys.argv[3].strip()
pat = re.compile(r'"X-APE-Profile"\s*:\s*"' + re.escape(want) + r'"')

head = []          # lineas antes del primer #EXTINF
blocks = []        # (tiene_perfil, [lineas])
cur = None
with open(src, encoding="utf-8", errors="replace") as f:
    for raw in f:
        line = raw.rstrip("\n")
        if line.startswith("#EXTINF"):
            if cur is not None:
                blocks.append(cur)
            cur = {"want": False, "lines": [line]}
            continue
        if cur is None:
            if line.strip():
                head.append(line)
            continue
        cur["lines"].append(line)
        if line.startswith("#EXTHTTP") and pat.search(line):
            cur["want"] = True
if cur is not None:
    blocks.append(cur)

kept = [b for b in blocks if b["want"]]
out = list(head)
for b in kept:
    out.extend(b["lines"])

with open(dst, "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")

total = len(blocks)
print(f"  perfil {want}: {len(kept)} de {total} canales")
print(f"  salida: {dst}")
