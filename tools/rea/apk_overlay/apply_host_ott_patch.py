#!/usr/bin/env python3
"""Strict, reproducible integration patch for the supplied APE 651 APK.

Changes are confined to listed host/ottshim methods and an external-player manifest entry.
Run before the final side-by-side package rewrite. Every original file is backed up.
"""
from pathlib import Path
import argparse
import difflib
import hashlib
import json
import re

BASE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--apk-root', type=Path, default=BASE.parent / 'apk')
parser.add_argument('--dry-run', action='store_true')
parser.add_argument('--dash-manifest-only', action='store_true',
                    help='Add only the DASH MIME filter to an already integrated APK; preserve package/version.')
parser.add_argument('--native-recovery-guards-only', action='store_true',
                    help='Guard the three host setVideoEffects sites in an already integrated APK.')
args = parser.parse_args()
apk = args.apk_root.resolve()
changes = {}
methods = {}

def locate(name):
    found = list(apk.glob('smali*/' + name))
    if len(found) != 1:
        raise RuntimeError(f'Expected one {name}, found {len(found)}')
    return found[0]

def load(path):
    if path not in changes:
        changes[path] = [path.read_text(), path.read_text()]
    return changes[path][1]

def method(path, signature, transform):
    text = load(path)
    pattern = re.compile(r'^\.method [^\n]* ' + re.escape(signature) + r'\n.*?^\.end method', re.M | re.S)
    found = list(pattern.finditer(text))
    if len(found) != 1:
        raise RuntimeError(f'Method {signature}: found {len(found)} in {path}')
    m = found[0]
    new = transform(m.group())
    if new == m.group():
        raise RuntimeError(f'No change for {signature}')
    changes[path][1] = text[:m.start()] + new + text[m.end():]
    methods.setdefault(str(path.relative_to(apk)), []).append(signature)

def once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError(f'Expected one anchor ({text.count(old)}): {old[:100]}')
    return text.replace(old, new, 1)

def body(text, instructions):
    return text.split('\n', 1)[0] + '\n' + instructions.rstrip() + '\n.end method'

def guard_host_effects(text):
    """All direct host calls must use the same bypass guard, including openMedia.

    The Context register chosen at each call is dead immediately before the
    original invoke; local register counts and parameter mappings are unchanged.
    """
    descriptor = 'Lcom/ape/rea/ReaBridge;->applyHostEffects(Landroid/content/Context;Ljava/lang/Object;Ljava/util/List;)V'
    direct = 'Landroidx/media3/exoplayer/ExoPlayer;->setVideoEffects(Ljava/util/List;)V'
    if descriptor in text:
        if text.count(descriptor) != 3 or direct in text:
            raise RuntimeError('Partial or conflicting native-recovery guards')
        return text
    if text.count(direct) != 3:
        raise RuntimeError('Expected exactly three direct host setVideoEffects sites')
    replacements = [
        ('openMedia(Landroidx/media3/exoplayer/ExoPlayer;Ljava/lang/String;Ljava/lang/String;Ljava/util/Map;)V',
         '    invoke-interface {p1, v4}, ' + direct, 'v1', 'v1, p1, v4'),
        ('build()Landroidx/media3/exoplayer/ExoPlayer;',
         '    invoke-interface {v6, v10}, ' + direct, 'v8', 'v8, v6, v10'),
        ('refreshEffects()V',
         '    invoke-interface {v1, v4}, ' + direct, 'v2', 'v2, v1, v4'),
    ]
    for signature, old, context_register, arguments in replacements:
        pattern = re.compile(r'^\.method [^\n]* ' + re.escape(signature) + r'\n.*?^\.end method', re.M | re.S)
        found = list(pattern.finditer(text))
        if len(found) != 1:
            raise RuntimeError('Native recovery method is missing/ambiguous: ' + signature)
        match = found[0]
        new = '    # REA_NATIVE_RECOVERY_v1: an empty list still enables the Media3 graph.\n' + \
            '    iget-object ' + context_register + ', p0, Lcom/ape/crystalagent/ApePlayer;->ctx:Landroid/content/Context;\n' + \
            '    invoke-static {' + arguments + '}, ' + descriptor
        updated = once(match.group(), old, new)
        text = text[:match.start()] + updated + text[match.end():]
    if direct in text or text.count(descriptor) != 3:
        raise RuntimeError('Not all host effect calls were guarded')
    return text

fluid = locate('com/ape/fluid/FluidBridge.smali')
session = locate('com/ape/fluid/FluidBridge$Session.smali')
image = locate('com/ape/crystalagent/ImageEnhancer.smali')
player = locate('com/ape/crystalagent/ApePlayer.smali')
activity = locate('com/ape/crystalagent/PlayerActivity.smali')
main = locate('com/ape/crystalagent/MainActivity.smali')
home = locate('com/ape/fluid/FluidHomeActivity.smali')
tap = locate('dev/venice/ottshim/SessionTap.smali')
manifest = apk / 'AndroidManifest.xml'

if args.native_recovery_guards_only:
    if 'Lcom/ape/rea/ReaBridge;->effects' not in fluid.read_text():
        raise RuntimeError('Native guards require the existing REA host integration')
    before = player.read_text()
    after = guard_host_effects(before)
    receipt = {'status': 'already-applied' if before == after else ('dry-run' if args.dry_run else 'applied'),
               'scope': 'native-recovery-host-guards', 'guarded_sites': 3,
               'before_sha256': hashlib.sha256(before.encode()).hexdigest(),
               'after_sha256': hashlib.sha256(after.encode()).hexdigest()}
    if before != after and not args.dry_run:
        evidence = BASE / 'evidence'; evidence.mkdir(exist_ok=True)
        backup = evidence / 'host_before_native_recovery.smali'
        if backup.exists() and backup.read_text() != before:
            raise RuntimeError('Native-recovery backup differs; inspect the prior receipt')
        backup.write_text(before)
        player.write_text(after)
        (evidence / 'native_recovery_patch_receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))
    raise SystemExit(0)

if args.dash_manifest_only:
    before = manifest.read_text()
    activity_pattern = re.compile(r'<activity\b[^>]*android:name="com\.ape\.rea\.ReaExternalPlayerActivity"[^>]*>.*?</activity>', re.S)
    matches = list(activity_pattern.finditer(before))
    if len(matches) != 1:
        raise RuntimeError('Expected exactly one existing REA external-player activity')
    match = matches[0]
    block = match.group()
    if 'android:mimeType="application/dash+xml"' in block:
        print(json.dumps({'status': 'already-applied', 'scope': 'dash-mime-only'}))
        raise SystemExit(0)
    anchor = re.compile(r'(?m)^([ \t]*)<data android:mimeType="application/vnd\.apple\.mpegurl"\s*/>$')
    if len(anchor.findall(block)) != 1:
        raise RuntimeError('Expected exactly one HLS MIME anchor in REA external-player filter')
    updated = anchor.sub(lambda m: m.group() + '\n' + m.group(1) + '<data android:mimeType="application/dash+xml" />', block)
    after = before[:match.start()] + updated + before[match.end():]
    receipt = {'status': 'dry-run' if args.dry_run else 'applied', 'scope': 'dash-mime-only',
               'before_sha256': hashlib.sha256(before.encode()).hexdigest(),
               'after_sha256': hashlib.sha256(after.encode()).hexdigest()}
    if not args.dry_run:
        evidence = BASE / 'evidence'
        evidence.mkdir(exist_ok=True)
        backup = evidence / 'manifest_before_dash.xml'
        if backup.exists() and backup.read_text() != before:
            raise RuntimeError('DASH manifest backup already differs; inspect the prior receipt')
        backup.write_text(before)
        manifest.write_text(after)
        (evidence / 'dash_manifest_patch_receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))
    raise SystemExit(0)

receipt_path = BASE / 'evidence' / 'host_ott_patch_receipt.json'
if 'Lcom/ape/rea/ReaBridge;->effects' in fluid.read_text():
    if not receipt_path.exists():
        raise RuntimeError('Patch markers exist without a receipt; refusing an ambiguous mutation.')
    receipt = json.loads(receipt_path.read_text())
    for relative, data in receipt['files'].items():
        actual = hashlib.sha256((apk / relative).read_bytes()).hexdigest()
        if actual != data['after_sha256']:
            raise RuntimeError(f'Already patched file changed: {relative}; review final identity edits separately.')
    print(json.dumps({'status': 'already-applied', 'files': len(receipt['files'])}))
    raise SystemExit(0)

method(fluid, 'effectsFor(Landroid/content/Context;Ljava/lang/String;)Ljava/util/List;', lambda t: body(t, '''    .locals 1
    :rea_effects_try
    invoke-static {p0, p1}, Lcom/ape/rea/ReaBridge;->effects(Landroid/content/Context;Ljava/lang/String;)Ljava/util/List;
    move-result-object v0
    :rea_effects_end
    .catch Ljava/lang/Exception; {:rea_effects_try .. :rea_effects_end} :rea_effects_failed
    return-object v0
    :rea_effects_failed
    move-exception v0
    invoke-static {}, Ljava/util/Collections;->emptyList()Ljava/util/List;
    move-result-object v0
    return-object v0'''))

method(fluid, 'attach(Landroid/content/Context;Ljava/lang/Object;Ljava/lang/String;Ljava/lang/String;)V', lambda t: once(t, '    :goto_0\n    return-void', '''    :goto_0
    :rea_attach_try
    invoke-static {p0, p1}, Lcom/ape/rea/ReaBridge;->attach(Landroid/content/Context;Ljava/lang/Object;)V
    :rea_attach_end
    .catch Ljava/lang/Exception; {:rea_attach_try .. :rea_attach_end} :rea_attach_failed
    goto :rea_attach_done
    :rea_attach_failed
    move-exception v0
    :rea_attach_done
    return-void'''))

method(fluid, 'detach(Ljava/lang/Object;)V', lambda t: once(t, '    .locals 2\n', '''    .locals 2
    :rea_detach_try
    invoke-static {p0}, Lcom/ape/rea/ReaBridge;->detach(Ljava/lang/Object;)V
    :rea_detach_end
    .catch Ljava/lang/Exception; {:rea_detach_try .. :rea_detach_end} :rea_detach_failed
    goto :rea_detach_done
    :rea_detach_failed
    move-exception v0
    :rea_detach_done
'''))

method(image, 'applyDefaults(Landroid/content/Context;)V', lambda t: body(t, '''    .locals 0
    invoke-static {p1}, Lcom/ape/rea/ReaBridge;->applyDefaults(Landroid/content/Context;)V
    return-void'''))

method(image, 'applyVpp(Landroid/content/Context;ZLjava/util/Map;)V', lambda t: once(t, '    if-eqz p2, :cond_b', '''    invoke-static {p1}, Lcom/ape/fluid/FluidStore;->prefs(Landroid/content/Context;)Landroid/content/SharedPreferences;
    move-result-object v0
    const-string v1, "enhance_enabled"
    const/4 v2, 0x1
    invoke-interface {v0, v1, v2}, Landroid/content/SharedPreferences;->getBoolean(Ljava/lang/String;Z)Z
    move-result v1
    if-eqz v1, :rea_vpp_skip
    const-string v1, "image_profile"
    const-string v2, "crystal_uhd"
    invoke-interface {v0, v1, v2}, Landroid/content/SharedPreferences;->getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    const-string v1, "natural"
    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v0
    if-eqz v0, :rea_vpp_continue
    :rea_vpp_skip
    return-void
    :rea_vpp_continue
    if-eqz p2, :cond_b'''))

method(session, 'checkImageLoad(J)V', lambda t: body(t, '''    .locals 0
    # REA's decoder-window supervisor owns image-load adaptation.
    return-void'''))
method(session, 'reduceImage()V', lambda t: body(t, '''    .locals 4
    :rea_reduce_try
    iget-object v0, p0, Lcom/ape/fluid/FluidBridge$Session;->context:Landroid/content/Context;
    iget-object v1, p0, Lcom/ape/fluid/FluidBridge$Session;->player:Ljava/lang/Object;
    const-string v2, "playback_guard_video_stall"
    invoke-static {v0, v1, v2}, Lcom/ape/rea/ReaBridge;->reduceImage(Landroid/content/Context;Ljava/lang/Object;Ljava/lang/String;)V
    :rea_reduce_end
    .catch Ljava/lang/Exception; {:rea_reduce_try .. :rea_reduce_end} :rea_reduce_failed
    return-void
    :rea_reduce_failed
    move-exception v3
    return-void'''))

def patch_open_media(t):
    t = once(t, '    invoke-static {}, Lkotlin/collections/CollectionsKt;->emptyList()Ljava/util/List;\n\n    move-result-object v4', '''    iget-object v4, p0, Lcom/ape/crystalagent/ApePlayer;->ctx:Landroid/content/Context;
    invoke-static {v4}, Lcom/ape/fluid/FluidBridge;->effects(Landroid/content/Context;)Ljava/util/List;
    move-result-object v4''')
    t = once(t, '    const-string v6, "SDR effects off: "', '    const-string v6, "SDR effects unavailable: "')
    # Global caching before HLS would cache playlists/keys and nest a second cache.
    start = t.index('    :try_start_1\n')
    end = t.index('    new-instance v5, Lcom/ape/crystalagent/StatsDataSource$Factory;', start)
    t = t[:start] + '''    move-object v4, v1
    check-cast v4, Landroidx/media3/datasource/DataSource$Factory;

''' + t[end:]
    start = t.index('    new-instance v6, Landroidx/media3/exoplayer/hls/HlsMediaSource$Factory;')
    end = t.index('    const-string v7, "createMediaSource(...)"', start)
    t = t[:start] + '''    invoke-static {p2}, Landroidx/media3/common/MediaItem;->fromUri(Ljava/lang/String;)Landroidx/media3/common/MediaItem;
    move-result-object v7
    iget-object v6, p0, Lcom/ape/crystalagent/ApePlayer;->ctx:Landroid/content/Context;
    invoke-static {v6, v5, v7}, Lcom/ape/rea/ReaMediaSources;->create(Landroid/content/Context;Landroidx/media3/datasource/DataSource$Factory;Landroidx/media3/common/MediaItem;)Landroidx/media3/exoplayer/source/MediaSource;
    move-result-object v6

''' + t[end:]
    # Suppress the one host log that printed raw credentials and signed URLs.
    anchor = '    invoke-virtual {p0}, Lcom/ape/crystalagent/ApePlayer;->refreshEffects()V'
    pos = t.index(anchor) + len(anchor)
    tail = t[pos:]
    assert 'playChannel HEVC-first no-downscale ua=' in tail and 'Log;->i' in tail
    t = t[:pos] + '\n\n    return-void\n.end method'
    assert 'FluidBridge;->dataSource' not in t
    return t

method(player, 'openMedia(Landroidx/media3/exoplayer/ExoPlayer;Ljava/lang/String;Ljava/lang/String;Ljava/util/Map;)V', patch_open_media)
changes[player][1] = guard_host_effects(load(player))
methods.setdefault(str(player.relative_to(apk)), []).extend([
    'native guard: openMedia', 'native guard: build', 'native guard: refreshEffects'])

def add_ui(t):
    matches = list(re.finditer(r'^    invoke-virtual[^\n]*;->setContentView\(Landroid/view/View;\)V$', t, re.M))
    if len(matches) != 1: raise RuntimeError('Expected one setContentView for UI integration')
    m = matches[0]
    return t[:m.end()] + '\n\n    invoke-static/range {p0 .. p0}, Lcom/ape/rea/ReaUi;->install(Landroid/app/Activity;)V' + t[m.end():]
method(main, 'onCreate(Landroid/os/Bundle;)V', add_ui)
method(home, 'buildUi()V', add_ui)
method(activity, 'onCreate(Landroid/os/Bundle;)V', lambda t: once(t,
    '    invoke-virtual {v0, v7}, Lcom/ape/crystalagent/ApePlayer$Companion;->setSuppressVideoEffects(Z)V',
    '    invoke-virtual {v0, v7}, Lcom/ape/crystalagent/ApePlayer$Companion;->setSuppressVideoEffects(Z)V\n\n    invoke-static/range {p0 .. p0}, Lcom/ape/rea/ReaBridge;->onPlayerActivity(Landroid/app/Activity;)V'))
assert 'onNewIntent(Landroid/content/Intent;)V' not in load(activity)
changes[activity][1] += '''

.method protected onNewIntent(Landroid/content/Intent;)V
    .locals 0
    invoke-super {p0, p1}, Landroid/app/Activity;->onNewIntent(Landroid/content/Intent;)V
    invoke-virtual {p0, p1}, Landroid/app/Activity;->setIntent(Landroid/content/Intent;)V
    # Rebuild the renderer, including its source color and output transfer contract.
    invoke-virtual {p0}, Landroid/app/Activity;->recreate()V
    return-void
.end method
'''

method(tap, 'poll()V', lambda t: once(t,
    '    iget-object v0, p0, Ldev/venice/ottshim/SessionTap;->controller:Landroid/media/session/MediaController;\n',
    '    iget-object v0, p0, Ldev/venice/ottshim/SessionTap;->controller:Landroid/media/session/MediaController;\n\n    invoke-static {p0, v0}, Lcom/ape/rea/ReaOttBridge;->observe(Landroid/content/Context;Landroid/media/session/MediaController;)V\n'))
assert 'onDestroy()V' not in load(tap) and 'onListenerDisconnected()V' not in load(tap)
changes[tap][1] += '''

.method private reaDisconnect()V
    .locals 3
    const/4 v0, 0x0
    iput-boolean v0, p0, Ldev/venice/ottshim/SessionTap;->polling:Z
    iput v0, p0, Ldev/venice/ottshim/SessionTap;->nullStreak:I
    iget-object v1, p0, Ldev/venice/ottshim/SessionTap;->handler:Landroid/os/Handler;
    invoke-virtual {v1, v0}, Landroid/os/Handler;->removeCallbacksAndMessages(Ljava/lang/Object;)V
    iget-object v1, p0, Ldev/venice/ottshim/SessionTap;->controller:Landroid/media/session/MediaController;
    iput-object v0, p0, Ldev/venice/ottshim/SessionTap;->controller:Landroid/media/session/MediaController;
    if-eqz v1, :rea_disconnected
    :rea_unregister_try
    iget-object v2, p0, Ldev/venice/ottshim/SessionTap;->callback:Ldev/venice/ottshim/SessionTap$callback$1;
    invoke-virtual {v1, v2}, Landroid/media/session/MediaController;->unregisterCallback(Landroid/media/session/MediaController$Callback;)V
    :rea_unregister_end
    .catch Ljava/lang/Exception; {:rea_unregister_try .. :rea_unregister_end} :rea_unregister_failed
    goto :rea_disconnected
    :rea_unregister_failed
    move-exception v2
    :rea_disconnected
    invoke-static {p0}, Lcom/ape/rea/ReaOttBridge;->clear(Landroid/content/Context;)V
    return-void
.end method

.method public onListenerDisconnected()V
    .locals 0
    invoke-direct {p0}, Ldev/venice/ottshim/SessionTap;->reaDisconnect()V
    return-void
.end method

.method public onDestroy()V
    .locals 0
    invoke-direct {p0}, Ldev/venice/ottshim/SessionTap;->reaDisconnect()V
    invoke-super {p0}, Landroid/service/notification/NotificationListenerService;->onDestroy()V
    return-void
.end method
'''

text = load(manifest)
changes[manifest][1] = once(text, '    </application>', '''        <activity android:name="com.ape.rea.ReaExternalPlayerActivity" android:label="REA · Reproductor externo" android:exported="true" android:noHistory="true">
            <intent-filter>
                <action android:name="android.intent.action.VIEW"/>
                <category android:name="android.intent.category.DEFAULT"/>
                <category android:name="android.intent.category.BROWSABLE"/>
                <data android:scheme="http"/>
                <data android:scheme="https"/>
                <data android:mimeType="video/*"/>
                <data android:mimeType="application/x-mpegURL"/>
                <data android:mimeType="application/vnd.apple.mpegurl"/>
                <data android:mimeType="application/dash+xml"/>
            </intent-filter>
        </activity>
    </application>''')

receipt = {'status': 'applied', 'schema': 1, 'source_apk_sha256': '8d3b145811c0bab3a10952329a81cadc477b08bd365b70f173cfe34ff52aa6e4',
           'files': {}, 'method_edits': methods,
           'scope': 'Host effects routing, guarded defaults, adaptive supervision hooks, UI, HTTP(S) HLS/progressive/DASH external player (no DRM license configuration), classic MediaSession metadata observation and cleanup.'}
diff = []
for path, (before, after) in changes.items():
    relative = str(path.relative_to(apk))
    receipt['files'][relative] = {'before_sha256': hashlib.sha256(before.encode()).hexdigest(), 'after_sha256': hashlib.sha256(after.encode()).hexdigest()}
    diff.extend(difflib.unified_diff(before.splitlines(True), after.splitlines(True), fromfile='original/' + relative, tofile='patched/' + relative))
    if not args.dry_run:
        backup = BASE / 'host_ott_originals' / relative
        backup.parent.mkdir(parents=True, exist_ok=True)
        if backup.exists() and backup.read_text() != before: raise RuntimeError(f'Original backup already differs: {relative}')
        backup.write_text(before)
        path.write_text(after)
if not args.dry_run:
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
    (receipt_path.parent / 'host_ott_patch.diff').write_text(''.join(diff))
print(json.dumps({'status': 'dry-run' if args.dry_run else 'applied', 'files': len(changes), 'edited_methods': sum(map(len, methods.values()))}))
