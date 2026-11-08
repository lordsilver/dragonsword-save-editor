"""Finds the BC7 modes of the blocks where the PNG and Pillow differ, and decodes mode-6 blocks by the
BC7 spec (D3D11 functional spec: interp = ((64 - w) * e0 + w * e1 + 32) >> 6) to see which decode is right."""
import re, sys
from collections import Counter
from pathlib import Path
import numpy as np
from PIL import Image
root = Path(sys.argv[1]); name = sys.argv[2]
ins = (root / 'inspect.txt').read_text(encoding='utf-8')
m = re.search(re.escape(name) + r': PF_BC7, (\d+)x(\d+).*?\n  mip 0: .*?offset (\d+) data (\d+)', ins, re.S)
w, h, off, size = map(int, m.groups())
raw = (root / 'raw' / f'{name}.uexp').read_bytes()[off:off + size]
pil = np.asarray(Image.frombytes('RGBA', (w, h), raw, 'bcn', 7)).astype(int)
png = np.asarray(Image.open(root / 'out/Design/CaptureMinimap/Export' / f'{name}.png').convert('RGBA')).astype(int)
W4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64]
def mode6(b):
    v = int.from_bytes(b, 'little'); pos = 7
    def take(n):
        nonlocal pos; r = (v >> pos) & ((1 << n) - 1); pos += n; return r
    e = [[take(7), take(7)] for _ in range(4)]  # R0 R1, G0 G1, B0 B1, A0 A1
    p0, p1 = take(1), take(1)
    ends = [[(c[0] << 1) | p0, (c[1] << 1) | p1] for c in e]
    idx = []
    for i in range(16): idx.append(take(3 if i == 0 else 4))
    out = np.zeros((16, 4), int)
    for i, ix in enumerate(idx):
        wgt = W4[ix]
        out[i] = [((64 - wgt) * a + wgt * b2 + 32) >> 6 for a, b2 in ends]
    return out.reshape(4, 4, 4)
modes = Counter(); stats = Counter()
bw = w // 4
for by in range(h // 4):
    for bx in range(bw):
        if (pil[by*4:by*4+4, bx*4:bx*4+4] == png[by*4:by*4+4, bx*4:bx*4+4]).all(): continue
        blk = raw[(by * bw + bx) * 16:(by * bw + bx) * 16 + 16]
        mode = (blk[0] & -blk[0]).bit_length() - 1
        modes[mode] += 1
        if mode == 6:
            ref = mode6(blk)
            stats['spec==pillow' if (ref == pil[by*4:by*4+4, bx*4:bx*4+4]).all() else 'spec!=pillow'] += 1
            stats['spec==png' if (ref == png[by*4:by*4+4, bx*4:bx*4+4]).all() else 'spec!=png'] += 1
print(name, 'modes of differing blocks', dict(modes), dict(stats))
