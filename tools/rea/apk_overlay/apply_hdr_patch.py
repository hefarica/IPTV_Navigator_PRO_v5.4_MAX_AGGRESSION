#!/usr/bin/env python3
"""Guarded, reproducible HDR sampler integration for CrystalAgent Media3 1.3.1.
Run after apktool 3.0.3 decode. Repeated runs verify the same result. No global HDR
assertions, API level gates or native PQ shader paths are removed.
"""
import argparse
import difflib
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXPECTED = {
    'smali/androidx/media3/exoplayer/video/CompositingVideoSinkProvider.smali': 'bfb66ba2c4355de0d16ccbf9dac5b0a4af864fa3d1f50bde3eef1beac7f9c4e6',
    'smali/androidx/media3/effect/DefaultVideoFrameProcessor.smali': 'b0f4f83dd3073772af9a928868f45313ca40c38e0dfa45127e35a0c115db07cd',
    'smali/androidx/media3/effect/DefaultShaderProgram.smali': '9a82bffb85150d42263117e204e43680d96ea2f24c86bb348a84e65f49808868',
}
def sha(data): return hashlib.sha256(data).hexdigest()
def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Expected exactly one anchor, got %d: %r' % (text.count(old), old[:140]))
    return text.replace(old, new, 1)
def method_edit(text, header, change):
    start = text.index('.method ' + header)
    end = text.index('.end method', start) + len('.end method')
    return text[:start] + change(text[start:end]) + text[end:]

def patch_provider(s):
    return method_edit(s, 'public initialize(Landroidx/media3/common/Format;)V', lambda m: once(m,
        '    :cond_2\n    move-object v8, p0',
        '''    :cond_2
    # REA_HDR_v1: use original Format metadata, before SDR canonicalization.
    iget-object v3, p0, Landroidx/media3/exoplayer/video/CompositingVideoSinkProvider;->context:Landroid/content/Context;

    iget-object v4, p1, Landroidx/media3/common/Format;->colorInfo:Landroidx/media3/common/ColorInfo;

    invoke-static {v3, v4, v1}, Lcom/ape/rea/ReaHdrBridge;->chooseOutput(Landroid/content/Context;Landroidx/media3/common/ColorInfo;Landroidx/media3/common/ColorInfo;)Landroidx/media3/common/ColorInfo;

    move-result-object v1

    move-object v8, p0'''))

def patch_processor(s):
    s = method_edit(s, 'private static checkColors(Landroidx/media3/common/ColorInfo;Landroidx/media3/common/ColorInfo;Z)V', lambda m: once(m,
        '    if-eq v0, v3, :cond_8\n\n    iget v0, p0, Landroidx/media3/common/ColorInfo;->colorSpace:I',
        '''    if-eq v0, v3, :cond_8

    # REA_HDR_v1: only supported SDR709 -> full-range BT2020/PQ.
    # ES3, valid dataspace and transfer-enable validations above remain intact.
    invoke-static {p0, p1, p2}, Lcom/ape/rea/ReaHdrBridge;->isSdrToPq(Landroidx/media3/common/ColorInfo;Landroidx/media3/common/ColorInfo;Z)Z

    move-result v4

    if-nez v4, :cond_8

    iget v0, p0, Landroidx/media3/common/ColorInfo;->colorSpace:I'''))
    return method_edit(s, 'private configureEffects(Landroidx/media3/effect/DefaultVideoFrameProcessor$InputStreamInfo;Z)V', lambda m: once(m,
        '    invoke-static {v0, v1, v2}, Landroidx/media3/effect/DefaultVideoFrameProcessor;->checkColors(Landroidx/media3/common/ColorInfo;Landroidx/media3/common/ColorInfo;Z)V',
        '''    # REA_HDR_v1: reject unmatched bitmap/texture paths and HLG scene-linear conversion.
    iget v3, p1, Landroidx/media3/effect/DefaultVideoFrameProcessor$InputStreamInfo;->inputType:I

    invoke-static {v3, v0, v1}, Lcom/ape/rea/ReaHdrBridge;->assertInputType(ILandroidx/media3/common/ColorInfo;Landroidx/media3/common/ColorInfo;)V

    invoke-static {v0, v1, v2}, Landroidx/media3/effect/DefaultVideoFrameProcessor;->checkColors(Landroidx/media3/common/ColorInfo;Landroidx/media3/common/ColorInfo;Z)V'''))

def patch_shader(s):
    return method_edit(s, 'public static createWithExternalSampler(Landroid/content/Context;Landroidx/media3/common/ColorInfo;Landroidx/media3/common/ColorInfo;Z)Landroidx/media3/effect/DefaultShaderProgram;', lambda m: once(m,
        '    invoke-static {p1}, Landroidx/media3/common/ColorInfo;->isTransferHdr(Landroidx/media3/common/ColorInfo;)Z',
        '''    # REA_HDR_v1: dedicated external sampler; native HDR code below is preserved.
    invoke-static {p1, p2, p3}, Lcom/ape/rea/ReaHdrBridge;->isSdrToHdrLinear(Landroidx/media3/common/ColorInfo;Landroidx/media3/common/ColorInfo;Z)Z

    move-result v0

    if-eqz v0, :rea_original_external

    const-string v0, "shaders/vertex_shader_transformation_es2.glsl"

    const-string v1, "shaders/rea_sdr_to_hdr_external.glsl"

    invoke-static {p0, v0, v1}, Landroidx/media3/effect/DefaultShaderProgram;->createGlProgram(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;)Landroidx/media3/common/util/GlProgram;

    move-result-object v1

    invoke-static {v1, p0}, Lcom/ape/rea/ReaHdrBridge;->configureSampler(Landroidx/media3/common/util/GlProgram;Landroid/content/Context;)V

    new-instance v0, Landroidx/media3/effect/DefaultShaderProgram;

    invoke-static {}, Lcom/google/common/collect/ImmutableList;->of()Lcom/google/common/collect/ImmutableList;

    move-result-object v2

    invoke-static {}, Lcom/google/common/collect/ImmutableList;->of()Lcom/google/common/collect/ImmutableList;

    move-result-object v3

    const/4 v4, 0x1

    # useHdr true makes BaseGlShaderProgram allocate the first RGBA16F target.
    const/4 v5, 0x1

    invoke-direct/range {v0 .. v5}, Landroidx/media3/effect/DefaultShaderProgram;-><init>(Landroidx/media3/common/util/GlProgram;Lcom/google/common/collect/ImmutableList;Lcom/google/common/collect/ImmutableList;IZ)V

    return-object v0

    :rea_original_external
    invoke-static {p1}, Landroidx/media3/common/ColorInfo;->isTransferHdr(Landroidx/media3/common/ColorInfo;)Z'''))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apk-root', type=Path, default=HERE.parent / 'apk')
    ap.add_argument('--backup-root', type=Path, default=HERE / 'original_hdr_smali')
    ap.add_argument('--check', action='store_true', help='verify prospective/applied patch without writing')
    args = ap.parse_args()
    functions = [patch_provider, patch_processor, patch_shader]
    changes, receipts = [], []
    for (rel, expected), fn in zip(EXPECTED.items(), functions):
        target, backup = args.apk_root / rel, args.backup_root / rel
        current = target.read_bytes()
        original = backup.read_bytes() if backup.exists() else current
        if sha(original) != expected:
            raise RuntimeError('Unexpected original bytes for %s; refusing to patch' % rel)
        patched = fn(original.decode('utf-8')).encode('utf-8')
        if current not in (original, patched):
            raise RuntimeError('Unexpected target edits for %s; refusing to overwrite' % rel)
        changes.append((target, backup, original, patched))
        receipts.append({'file': rel, 'original_sha256': sha(original), 'patched_sha256': sha(patched),
                         'state': 'already_applied' if current == patched else 'ready'})
    shader = HERE / 'shaders/rea_sdr_to_hdr_external.glsl'
    asset = args.apk_root / 'assets/shaders/rea_sdr_to_hdr_external.glsl'
    if not args.check:
        for target, backup, original, patched in changes:
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists(): backup.write_bytes(original)
            if target.read_bytes() != patched:
                temp = target.with_suffix('.rea-hdr.tmp')
                temp.write_bytes(patched)
                temp.replace(target)
        asset.parent.mkdir(parents=True, exist_ok=True)
        asset.write_bytes(shader.read_bytes())
        evidence = HERE / 'evidence'
        evidence.mkdir(exist_ok=True)
        (evidence / 'hdr_patch_receipt.json').write_text(json.dumps({
            'patch': 'REA_HDR_v1_media3_1.3.1', 'files': receipts, 'shader_sha256': sha(shader.read_bytes()),
            'limitations': ['Physical HDR and Android decoder interoperability require device validation.']}, indent=2)+'\n')
        diff = ''.join(''.join(difflib.unified_diff(o.decode().splitlines(True), p.decode().splitlines(True),
                      fromfile=str(b), tofile=str(t))) for t,b,o,p in changes)
        (evidence / 'hdr_patch.diff').write_text(diff)
    print(json.dumps({'check_only': args.check, 'files': receipts, 'shader_sha256': sha(shader.read_bytes())}, indent=2))

if __name__ == '__main__': main()
