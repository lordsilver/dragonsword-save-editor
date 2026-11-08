"""Writes a spec-exact decode of BC7 textures (texture2ddecoder; identical to Pillow's BCn decoder on all
42 BC7 textures here) as <out>/Design/CaptureMinimap/Export/<name>.png, from mip 0 in the package's .uexp.
Usage: spec_decode.py <work dir> <out dir> <name prefix>"""
import re, sys
from pathlib import Path
import numpy as np
from PIL import Image
import texture2ddecoder
root, out, prefix = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
ins = (root / 'inspect.txt').read_text(encoding='utf-8')
dst = out / 'Design/CaptureMinimap/Export'; dst.mkdir(parents=True, exist_ok=True)
for name, w, h, off, size in re.findall(r'^(\S+): PF_BC7, (\d+)x(\d+).*?\n  mip 0: .*?offset (\d+) data (\d+)', ins, re.M | re.S):
    if not name.startswith(prefix): continue
    w, h, off, size = map(int, (w, h, off, size))
    raw = (root / 'raw' / f'{name}.uexp').read_bytes()[off:off + size]
    px = np.frombuffer(texture2ddecoder.decode_bc7(raw, w, h), np.uint8).reshape(h, w, 4)[..., [2, 1, 0, 3]]
    Image.fromarray(np.ascontiguousarray(px), 'RGBA').save(dst / f'{name}.png', optimize=False)
    back = np.asarray(Image.open(dst / f'{name}.png'))
    assert np.array_equal(back, px), name
    print(name, w, h)
