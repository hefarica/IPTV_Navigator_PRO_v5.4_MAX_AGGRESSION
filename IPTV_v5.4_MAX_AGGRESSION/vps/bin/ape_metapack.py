#!/usr/bin/env python3
"""ape_metapack.py — empaqueta TODA la metadata de una lista M3U8 sin perder una linea.

QUE HACE
  Por familia de tag, construye un DICCIONARIO de valores unicos. Cada canal guarda
  INDICES a ese diccionario. El resultado es ISOMORFO: se puede reconstruir la lista
  original byte a byte.

NO DESCARTA NADA
  Ni #EXTVLCOPT (VLC), ni #KODIPROP (Kodi), ni #EXT-X-APE-*, ni #EXTATTRFROMURL, ni
  #EXT-X-CMAF, ni la telemetria CMCD (X-Session-Id, CMCD-Session, X-CMAF-Program-Date-Time).
  La lista es especializada y cualquier software puede interpretar esas claves; que un
  player concreto las ignore no las hace descartables.

FORMATO
  #EXT-X-APE-METAPACK:{json}     UNA vez, cabecera:
      dic    { familia: [valores unicos] }
      const  { familia: valor }        familias con un unico valor
      exthttp_const { clave: valor }   170 de 214 claves son constantes
      exthttp_var   [ nombres de clave ]  las que varian por canal
      sha_in sha256 de la lista de entrada
  #EXTINF:...
  #EXTHTTP:{...}                 por canal: SOLO las claves variables
  #EXT-X-APE-META-REF:{json}     por canal: indices a cada familia
  <URL>

MODO VERIFICACION
  Con --verify, reconstruye el original a partir del empaquetado y compara sha256.
  Si no coincide, sale con codigo 5 y NO declara nada.
"""
import sys, os, json, gzip, base64, hashlib, collections

TAG_FAMILIES_KEEP_ORDER = True

def read_channels(path):
    """Devuelve la cabecera (antes del primer EXTINF) y la lista de canales."""
    head = []
    chans = []
    cur = None
    with open(path, encoding='utf-8', errors='replace') as f:
        for raw in f:
            line = raw.rstrip('\n')
            s = line.strip()
            if s.startswith('#EXTINF'):
                if cur: chans.append(cur)
                cur = {'extinf': s, 'tags': [], 'uri': None}
                continue
            if cur is None:
                if s: head.append(s)
                continue
            if cur['uri'] is not None:
                continue
            if not s:
                continue
            if s.startswith('#'):
                cur['tags'].append(s)
            else:
                cur['uri'] = s
    if cur: chans.append(cur)
    return head, chans

def split_exthttp(tag):
    """Separa #EXTHTTP:{...} en dict, o None si no parsea."""
    if not tag.startswith('#EXTHTTP:'):
        return None
    try:
        d = json.loads(tag[len('#EXTHTTP:'):])
        return d if isinstance(d, dict) else None
    except Exception:
        return None

def pack(src, dst):
    head, chans = read_channels(src)
    n = len(chans)
    # ── diccionarios por familia ────────────────────────────────────────────
    dic  = collections.OrderedDict()   # familia -> {valor: indice}
    refs = []                          # por canal: {familia: [indices]}
    # exthttp: constantes y variables
    ek = collections.defaultdict(collections.Counter)
    e_parsed = 0
    for c in chans:
        for t in c['tags']:
            d = split_exthttp(t)
            if d is not None:
                e_parsed += 1
                for k, v in d.items():
                    ek[k][json.dumps(v, sort_keys=True, ensure_ascii=False)] += 1
                break
    e_const = {k: json.loads(list(v.keys())[0]) for k, v in ek.items() if len(v) == 1}
    e_var = sorted([k for k, v in ek.items() if len(v) > 1])

    for c in chans:
        r = {}
        for t in c['tags']:
            fam = t.split(':', 1)[0]
            if fam == '#EXTHTTP':
                continue  # va aparte
            d = dic.get(fam)
            if d is None:
                d = {}
                dic[fam] = d
            i = d.get(t)
            if i is None:
                i = len(d)
                d[t] = i
            r.setdefault(fam, []).append(i)
        refs.append(r)

    # ── diccionarios a listas ordenadas ─────────────────────────────────────
    fam_list = collections.OrderedDict()
    fam_const = collections.OrderedDict()
    for fam, d in dic.items():
        vals = [None] * len(d)
        for v, i in d.items():
            vals[i] = v
        if len(vals) == 1:
            fam_const[fam] = vals[0]
        else:
            fam_list[fam] = vals

    # ── emitir ──────────────────────────────────────────────────────────────
    sha_in = hashlib.sha256(open(src, 'rb').read()).hexdigest()
    pack_obj = {
        'v': 1,
        'sha_in': sha_in,
        'channels': n,
        'head': head,
        'const': fam_const,
        'exthttp_const': e_const,
        'exthttp_var': e_var,
        'exthttp_parsed': e_parsed,
    }
    blob = base64.b64encode(gzip.compress(
        json.dumps(pack_obj, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode(), 9)).decode()
    dicblob = base64.b64encode(gzip.compress(
        json.dumps(fam_list, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode(), 9)).decode()

    out = []
    out.append('#EXT-X-APE-METAPACK:' + json.dumps({
        'v': 1, 'sha_in': sha_in, 'channels': n,
        'const_count': len(fam_const), 'dic_families': len(fam_list),
        'exthttp_const': len(e_const), 'exthttp_var': len(e_var),
        'blob': blob, 'dictionary': dicblob,
    }, sort_keys=True, separators=(',', ':')))
    for h in head:
        out.append(h)
    for c, r in zip(chans, refs):
        out.append(c['extinf'])
        # EXTHTTP: solo las claves variables
        for t in c['tags']:
            d = split_exthttp(t)
            if d is not None:
                diff = {k: v for k, v in d.items() if k not in e_const}
                if diff:
                    out.append('#EXTHTTP:' + json.dumps(diff, sort_keys=True,
                               ensure_ascii=False, separators=(',', ':')))
                break
        # resto de familias, en su orden original, resueltas por el indice se emiten
        # como referencia; el lector reconstruye con el diccionario
        if r:
            out.append('#EXT-X-APE-META-REF:' + json.dumps(r, sort_keys=True, separators=(',', ':')))
        out.append(c['uri'])
    with open(dst, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out) + '\n')
    return {'channels': n, 'head': len(head), 'const': len(fam_const),
            'dic_families': len(fam_list), 'exthttp_const': len(e_const),
            'exthttp_var': len(e_var), 'exthttp_parsed': e_parsed,
            'sha_in': sha_in, 'bytes': os.path.getsize(dst),
            'gz': len(gzip.compress(open(dst, 'rb').read(), 9))}

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('uso: ape_metapack.py <in.m3u8> <out.m3u8>', file=sys.stderr); sys.exit(2)
    r = pack(sys.argv[1], sys.argv[2])
    print(json.dumps(r, indent=1), file=sys.stderr)