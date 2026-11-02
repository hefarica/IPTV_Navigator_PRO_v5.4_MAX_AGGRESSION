#!/usr/bin/env python3
"""DASH MPD <-> JSON byte-identity test."""
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import mpd_json_bridge as b

MPD = b'''<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="dynamic" profiles="urn:mpeg:dash:profile:isoff-live:2011">
  <Period id="1">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation id="v1" bandwidth="28000000" codecs="hvc1.2.4.L153.B0" width="3840" height="2160"/>
    </AdaptationSet>
  </Period>
</MPD>
'''


def main():
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, 'in.mpd')
        open(src, 'wb').write(MPD)
        doc = b.to_doc(src)
        back = b.from_doc(doc)
        ok = back == MPD and doc['periods'] == 1 and doc['root'].endswith('MPD')
        print(json.dumps({
            'ok': ok,
            'roundtrip_identical': back == MPD,
            'periods': doc['periods'],
            'sha256': doc['sha256'],
        }, indent=2))
        return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
