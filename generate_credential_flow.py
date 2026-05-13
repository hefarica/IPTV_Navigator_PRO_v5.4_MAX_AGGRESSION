"""
Signal Cartography — IPTV Credential Flow Diagram v2
Refined: larger text, cleaner spacing, no overlaps.
"""

from PIL import Image, ImageDraw, ImageFont
import math

W, H = 2800, 3800
BG       = (8, 10, 16)
CYAN     = (0, 210, 235)
CYAN_DIM = (0, 100, 120)
AMBER    = (255, 185, 50)
AMBER_DIM= (140, 100, 25)
WHITE    = (235, 235, 240)
WHITE_DIM= (120, 125, 140)
RED      = (220, 55, 65)
GREEN    = (45, 210, 115)
GRID     = (16, 20, 28)
NODE_BG  = (12, 18, 28)

FONTS = r"C:\Users\HFRC\.claude\skills\canvas-design\canvas-fonts"

def F(name, size):
    try: return ImageFont.truetype(f"{FONTS}/{name}", size)
    except: return ImageFont.load_default()

f_title   = F("BigShoulders-Bold.ttf", 80)
f_sub     = F("GeistMono-Regular.ttf", 26)
f_node    = F("GeistMono-Bold.ttf", 26)
f_node_sm = F("GeistMono-Regular.ttf", 20)
f_code    = F("IBMPlexMono-Regular.ttf", 18)
f_code_b  = F("IBMPlexMono-Bold.ttf", 19)
f_phase   = F("Outfit-Bold.ttf", 34)
f_phase_sm= F("Outfit-Regular.ttf", 22)
f_label   = F("DMMono-Regular.ttf", 17)
f_tiny    = F("GeistMono-Regular.ttf", 15)
f_footer  = F("PoiretOne-Regular.ttf", 20)
f_doctrine= F("CrimsonPro-Italic.ttf", 22)

img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# ── Helpers ──
def rrect(xy, fill=None, outline=None, r=14, w=2):
    draw.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=w)

def node(cx, cy, nw, nh, title, sub=None, color=CYAN):
    x0, y0, x1, y1 = cx-nw//2, cy-nh//2, cx+nw//2, cy+nh//2
    for i in range(4, 0, -1):
        gc = tuple(max(0, c//3 + i*8) for c in color)
        rrect((x0-i*2, y0-i*2, x1+i*2, y1+i*2), outline=gc, r=16, w=1)
    rrect((x0, y0, x1, y1), fill=NODE_BG, outline=color, r=14, w=2)
    bb = draw.textbbox((0,0), title, font=f_node)
    tw = bb[2]-bb[0]
    ty = cy - (14 if sub else 6)
    draw.text((cx-tw//2, ty), title, fill=color, font=f_node)
    if sub:
        bb2 = draw.textbbox((0,0), sub, font=f_node_sm)
        draw.text((cx-((bb2[2]-bb2[0])//2), cy+10), sub, fill=WHITE_DIM, font=f_node_sm)
    return (x0, y0, x1, y1)

def arrow(x0, y0, x1, y1, color=CYAN, w=2, dash=False):
    length = math.sqrt((x1-x0)**2+(y1-y0)**2)
    if length < 1: return
    dx, dy = (x1-x0)/length, (y1-y0)/length
    if dash:
        pos = 0
        while pos < length - 14:
            sx, sy = x0+dx*pos, y0+dy*pos
            ex, ey = x0+dx*min(pos+10, length-14), y0+dy*min(pos+10, length-14)
            draw.line([(sx,sy),(ex,ey)], fill=color, width=w)
            pos += 18
    else:
        draw.line([(x0,y0),(x1,y1)], fill=color, width=w)
    ang = math.atan2(y1-y0, x1-x0)
    al = 12
    draw.polygon([(x1,y1),
                  (x1-al*math.cos(ang-.4), y1-al*math.sin(ang-.4)),
                  (x1-al*math.cos(ang+.4), y1-al*math.sin(ang+.4))], fill=color)

def varrow(x, y0, y1, color=CYAN, w=2):
    arrow(x, y0, x, y1, color, w)

def txt(x, y, t, c=WHITE_DIM, f=f_code):
    draw.text((x, y), t, fill=c, font=f)

def ctxt(cx, y, t, c=WHITE, f=f_phase):
    bb = draw.textbbox((0,0), t, font=f)
    draw.text((cx-(bb[2]-bb[0])//2, y), t, fill=c, font=f)

def phase(y, label, num):
    draw.line([(80, y), (W-80, y)], fill=GRID, width=1)
    cx = 140
    r = 22
    draw.ellipse((cx-r, y-r, cx+r, y+r), fill=CYAN)
    bb = draw.textbbox((0,0), str(num), font=f_node)
    draw.text((cx-(bb[2]-bb[0])//2, y-12), str(num), fill=BG, font=f_node)
    draw.text((cx+35, y-15), label, fill=WHITE, font=f_phase)

# ── Grid ──
for gx in range(0, W, 80):
    draw.line([(gx,0),(gx,H)], fill=GRID, width=1)
for gy in range(0, H, 80):
    draw.line([(0,gy),(W,gy)], fill=GRID, width=1)

# ══════════════════════════════════════
# TITLE
# ══════════════════════════════════════
ctxt(W//2, 50, "CREDENTIAL FLOW", WHITE, f_title)
ctxt(W//2, 140, "IPTV NAVIGATOR PRO v5.4  \u2014  THE SACRED PIPELINE", CYAN_DIM, f_sub)
draw.line([(300, 180), (W-300, 180)], fill=CYAN_DIM, width=1)
ctxt(W//2, 194, "Las credenciales guardadas son la verdad absoluta. Nadie las cambia. Nadie las sobrescribe.", AMBER_DIM, f_doctrine)

# ══════════════════════════════════════
# P1: CONEXION
# ══════════════════════════════════════
Y1 = 260
phase(Y1, "CONEXION DEL SERVIDOR", 1)

form_y = Y1 + 80
form_cx = 550
node(form_cx, form_y, 340, 90, "FORMULARIO UI", "index-v4.html:1139", CYAN)

fx = form_cx + 200
txt(fx, form_y-35, "baseUrl    = http://tu-servidor.com", WHITE_DIM, f_code)
txt(fx, form_y-12, "username   = tu_usuario", WHITE_DIM, f_code)
txt(fx, form_y+11, "password   = tu_password", WHITE_DIM, f_code)

conn_y = form_y + 160
conn_cx = 550
node(conn_cx, conn_y, 360, 80, "connectServer()", "app.js:4812", CYAN)

cx2 = conn_cx + 220
txt(cx2, conn_y-30, "1. normalizeXtreamBase(url)", WHITE_DIM, f_code)
txt(cx2, conn_y-7, "2. Genera server ID unico (srv_xxx)", WHITE_DIM, f_code)
txt(cx2, conn_y+16, "3. Conecta a player_api.php del servidor", WHITE_DIM, f_code)

varrow(form_cx, form_y+50, conn_y-45, CYAN)

# Credential lock annotation
lock_y = conn_y + 55
txt(conn_cx - 120, lock_y, "Si exito:", CYAN_DIM, f_code_b)
txt(conn_cx + 10, lock_y, "_lockedUsername = username", AMBER, f_code_b)
txt(conn_cx + 10, lock_y+22, "_lockedPassword = password", AMBER, f_code_b)
txt(conn_cx + 390, lock_y+5, "\u2190 INMUTABLES", GREEN, f_code_b)

# ══════════════════════════════════════
# P2: ALMACENAMIENTO
# ══════════════════════════════════════
Y2 = lock_y + 75
phase(Y2, "ALMACENAMIENTO  \u2014  4 COPIAS SINCRONIZADAS", 2)

store_y = Y2 + 100

# 4 storage nodes
positions = [
    (380,  "app.state",           "RAM \u2014 activeServers[]"),
    (980,  "localStorage",        "iptv_server_library"),
    (1580, "IndexedDB",           "Backup asincrono"),
    (2180, "whitelist_dynamic",   "VPS \u2014 api_whitelist.php"),
]

for px, title, sub in positions:
    node(px, store_y, 320, 85, title, sub, AMBER)

# Labels under each
txt(250, store_y+55, "_lockedUsername", AMBER_DIM, f_code_b)
txt(250, store_y+77, "_lockedPassword", AMBER_DIM, f_code_b)

txt(855, store_y+55, "username, password", AMBER_DIM, f_code_b)
txt(855, store_y+77, "baseUrl, id, name", AMBER_DIM, f_code_b)

txt(1460, store_y+55, "activeServers snapshot", AMBER_DIM, f_code_b)
txt(1460, store_y+77, "currentServer state", AMBER_DIM, f_code_b)

txt(2050, store_y+55, "host -> {user, pass}", AMBER_DIM, f_code_b)
txt(2050, store_y+77, "POST desde frontend", AMBER_DIM, f_code_b)

# Distribution line
dist_y = Y2 + 45
draw.line([(380, dist_y), (2180, dist_y)], fill=AMBER, width=2)
for px, _, _ in positions:
    varrow(px, dist_y, store_y-48, AMBER)
    draw.ellipse((px-5, dist_y-5, px+5, dist_y+5), fill=AMBER)

# Connect from lock to distribution
varrow(conn_cx, lock_y+50, dist_y-5, AMBER)

# ══════════════════════════════════════
# P3: GENERACION M3U8
# ══════════════════════════════════════
Y3 = store_y + 130
phase(Y3, "GENERACION M3U8  \u2014  AGREGACION DE CREDENCIALES", 3)

bcm_y = Y3 + 90
bcm_cx = W//2
node(bcm_cx, bcm_y, 440, 75, "buildCredentialsMap()", "m3u8-typed-arrays:5566", CYAN)

# Sources feeding in (dashed from storage)
arrow(380, store_y+48, bcm_cx-180, bcm_y-42, AMBER_DIM, 1, True)
arrow(980, store_y+48, bcm_cx-60, bcm_y-42, AMBER_DIM, 1, True)
arrow(1580, store_y+48, bcm_cx+60, bcm_y-42, AMBER_DIM, 1, True)

# Output: credentialsMap
map_y = bcm_y + 110
map_cx = W//2
node(map_cx, map_y, 520, 110, "credentialsMap{}", "Mapa indexado por servidor", CYAN)

txt(map_cx-230, map_y-20, 'map["srv_123"]      = {baseUrl, user, pass}', WHITE, f_code)
txt(map_cx-230, map_y+5,  'map["host:dom.com"]  = {baseUrl, user, pass}', WHITE_DIM, f_code)
txt(map_cx-230, map_y+28, 'map["__current__"]   = {baseUrl, user, pass}', CYAN_DIM, f_code)

varrow(bcm_cx, bcm_y+42, map_y-60, CYAN)

# ══════════════════════════════════════
# P4: CONSTRUCCION URL
# ══════════════════════════════════════
Y4 = map_y + 105
phase(Y4, "CONSTRUCCION DE URL POR CANAL", 4)

bcu_y = Y4 + 85
bcu_cx = W//2
node(bcu_cx, bcu_y, 400, 70, "buildChannelUrl()", "m3u8-typed-arrays:5692", CYAN)
varrow(map_cx, map_y+60, bcu_y-40, CYAN)

# 5 steps
sx = bcu_cx + 240
labels = [
    ("1.", "serverId exacto en credentialsMap", GREEN),
    ("2.", "hostname en credentialsMap", CYAN),
    ("3.", "serverId en app.state.activeServers", CYAN_DIM),
    ("4.", "hostname en activeServers", CYAN_DIM),
    ("5.", "__current__ (solo sin serverId)", WHITE_DIM),
]
for i, (n, desc, c) in enumerate(labels):
    sy = bcu_y - 30 + i*26
    txt(sx, sy, n, c, f_code_b)
    txt(sx+30, sy, desc, WHITE_DIM, f_code)

# URL output box
url_y = bcu_y + 95
rrect((W//2-500, url_y, W//2+500, url_y+95), fill=(4, 10, 18), outline=CYAN, r=10, w=2)

txt(W//2-475, url_y+10, "URL FINAL:", CYAN, f_code_b)
txt(W//2-370, url_y+10, "{baseUrl}/{live|movie}/{username}/{password}/{streamId}.{ext}", WHITE, f_code_b)

txt(W//2-475, url_y+38, "PARAMS:", CYAN_DIM, f_code_b)
txt(W//2-370, url_y+38, "?ape_sid=xxx&ape_nonce=yyy&profile=P5", WHITE_DIM, f_code)

txt(W//2-475, url_y+64, "REGLA:", AMBER, f_code_b)
txt(W//2-370, url_y+64, "Credenciales van TAL CUAL fueron guardadas. CERO transformacion.", AMBER, f_code_b)

varrow(bcu_cx, bcu_y+40, url_y-5, CYAN)

# ══════════════════════════════════════
# P5: M3U8 OUTPUT
# ══════════════════════════════════════
Y5 = url_y + 130
phase(Y5, "ARCHIVO M3U8 GENERADO", 5)

m3u_y = Y5 + 65
rrect((W//2-520, m3u_y, W//2+520, m3u_y+170), fill=(3, 6, 12), outline=CYAN_DIM, r=12, w=1)

lines_m3u = [
    ("#EXTM3U", GREEN),
    ('#EXTINF:-1 tvg-name="Canal ESPN" group-title="Deportes",Canal ESPN', WHITE_DIM),
    ("#EXTVLCOPT:network-caching=60000", (50,55,70)),
    ('#EXTHTTP:{"User-Agent":"...","Origin":"..."}     (8KB max)', (50,55,70)),
    ('#EXT-X-STREAM-INF:BANDWIDTH=25000000,CODECS="avc1.64...",RESOLUTION=3840x2160', CYAN_DIM),
    ("http://TU-SERVIDOR/live/TU-USER/TU-PASS/12345.ts?ape_sid=...&profile=P5", CYAN),
    ("                        ^^^^^^^^ ^^^^^^^ ", AMBER),
]

for i, (line, c) in enumerate(lines_m3u):
    txt(W//2-495, m3u_y+12 + i*22, line, c, f_code)

txt(W//2+10, m3u_y+12 + 6*22, "INTACTAS desde Phase 2", AMBER, f_code_b)

varrow(W//2, url_y+100, m3u_y-5, CYAN)

# ══════════════════════════════════════
# P6: UPLOAD & PLAYBACK
# ══════════════════════════════════════
Y6 = m3u_y + 210
phase(Y6, "SUBIDA AL VPS Y REPRODUCCION", 6)

up_y = Y6 + 85
up_cx = 650
node(up_cx, up_y, 340, 70, "Upload Gateway", "upload_chunk.php \u2192 VPS", CYAN)

ott_y = Y6 + 85
ott_cx = 1700
node(ott_cx, ott_y, 360, 70, "OTT Navigator", "Lee M3U8 \u2192 reproduce URL", GREEN)

arrow(up_cx+175, up_y, ott_cx-185, ott_y, CYAN_DIM, 1, True)
ctxt(W//2, up_y-28, "https://iptv-ape.duckdns.org/lista.m3u8", WHITE_DIM, f_code)

varrow(W//2, m3u_y+175, up_y-55, CYAN, 1)
arrow(W//2, up_y-55, up_cx+60, up_y-40, CYAN, 1)

# Final server
srv_y = up_y + 100
node(ott_cx, srv_y, 380, 60, "SERVIDOR IPTV UPSTREAM", "Reproduce con credenciales intactas", GREEN)
varrow(ott_cx, ott_y+40, srv_y-35, GREEN)

# ══════════════════════════════════════
# P7: RESOLVER BACKEND
# ══════════════════════════════════════
Y7 = srv_y + 90
phase(Y7, "RESOLVER BACKEND (cuando aplica)", 7)

res_y = Y7 + 80
res_cx = W//2
node(res_cx, res_y, 500, 70, "resolve_quality_unified.php", "rq_resolve_server_credentials()", CYAN)

# Current behavior (green box)
gb_y = res_y + 65
rrect((res_cx-500, gb_y, res_cx+500, gb_y+140), fill=(3, 12, 8), outline=GREEN, r=10, w=2)

txt(res_cx-475, gb_y+10, "REGLA ACTUAL (POST-FIX):", GREEN, f_code_b)
txt(res_cx-475, gb_y+38, "1. Lee param  srv  del request  (host|user|pass)", WHITE, f_code)
txt(res_cx-475, gb_y+62, "2. Si srv vacio  -->  ERROR + log, no adivina credenciales", RED, f_code)
txt(res_cx-475, gb_y+86, "3. ApeCredentials::resolve() solo completa campos CRED_MISSING", WHITE_DIM, f_code)
txt(res_cx-475, gb_y+110, "4. JAMAS sobrescribe credenciales que ya tienen valor real", AMBER, f_code_b)

# Old behavior (red box, crossed out)
rb_y = gb_y + 160
rrect((res_cx-500, rb_y, res_cx+500, rb_y+75), fill=(18, 4, 4), outline=RED, r=10, w=2)

txt(res_cx-475, rb_y+10, "ELIMINADO:", RED, f_code_b)
txt(res_cx-475, rb_y+35, "Hardcode tivi-ott como default | Forzar password del maestro | HARA_KIRI por HTTP 403", RED, f_code)
# Strikethrough
draw.line([(res_cx-475, rb_y+48), (res_cx+420, rb_y+48)], fill=RED, width=2)

# ══════════════════════════════════════
# FOOTER
# ══════════════════════════════════════
fy = H - 110
draw.line([(80, fy-25), (W-80, fy-25)], fill=GRID, width=1)

# Legend
items = [
    (150, CYAN, "Flujo de datos"),
    (400, AMBER, "Almacenamiento / Verdad"),
    (720, GREEN, "Exito / Intacto"),
    (960, RED, "Eliminado / Error"),
]
for lx, c, label in items:
    draw.ellipse((lx, fy, lx+16, fy+16), fill=c)
    txt(lx+24, fy-2, label, c, f_label)

ctxt(W//2, fy+35, "SIGNAL CARTOGRAPHY  \u2014  IPTV NAVIGATOR PRO v5.4 MAX AGGRESSION", WHITE_DIM, f_footer)
ctxt(W//2, fy+62, "Las credenciales fluyen intactas de principio a fin. Sin salpicon.", AMBER_DIM, f_tiny)

# ══════════════════════════════════════
# SAVE
# ══════════════════════════════════════
out = r"c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\CREDENTIAL_FLOW_DIAGRAM.png"
img.save(out, "PNG")
print(f"OK: {out} ({W}x{H})")
