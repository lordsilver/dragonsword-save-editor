"""Checks each exported PNG against the texture's own mip 0 bytes in the package (.uexp).

B8G8R8A8: the PNG's pixels must equal the stored bytes (B,G,R,A -> R,G,B,A), row 0 first.
BC7: the stored blocks are decoded again with texture2ddecoder (an independent decoder) and must
equal the PNG. Writes tiles.csv: name, png size, format, mips, bytes, png sha256, check result."""
import csv, hashlib, re, sys
from pathlib import Path
import numpy as np
from PIL import Image
import texture2ddecoder

root = Path(sys.argv[1])
inspect = (root / 'inspect.txt').read_text(encoding='utf-8')
tex = {}
for block in re.split(r'\n(?=\S)', inspect.strip()):
    head = re.match(r'(\S+): (\S+), (\d+)x(\d+), first mip index (\d+)', block)
    mips = re.findall(r'mip (\d+): (\d+)x(\d+) .*?offset (\d+) data (\d+)', block)
    tex[head[1]] = dict(fmt=head[2], w=int(head[3]), h=int(head[4]), first=int(head[5]), mips=mips,
                        neverstream='NeverStream = True' in block)
rows, bad = [], 0
for name, t in sorted(tex.items()):
    png = root / 'out/Design/CaptureMinimap/Export' / f'{name}.png'
    img = Image.open(png)
    mode, (pw, ph) = img.mode, img.size
    px = np.asarray(img.convert('RGBA'))
    _, mw, mh, off, size = map(int, t['mips'][0])
    raw = (root / 'raw' / f'{name}.uexp').read_bytes()[off:off + size]
    if t['fmt'] == 'PF_B8G8R8A8':
        ref = np.frombuffer(raw, np.uint8).reshape(mh, mw, 4)[..., [2, 1, 0, 3]]
    elif t['fmt'] == 'PF_BC7':
        ref = np.frombuffer(texture2ddecoder.decode_bc7(raw, mw, mh), np.uint8).reshape(mh, mw, 4)[..., [2, 1, 0, 3]]
    else:
        ref = None
    same = ref is not None and ref.shape == px.shape and np.array_equal(ref, px)
    bad += not same
    alpha = (int(px[..., 3].min()), int(px[..., 3].max()))
    rows.append(dict(file=f'Design/CaptureMinimap/Export/{name}.png', width=pw, height=ph, png_mode=mode,
                     pixel_format=t['fmt'], mips=len(t['mips']), mip0_bytes=size, never_stream=t['neverstream'],
                     alpha_min=alpha[0], alpha_max=alpha[1], matches_package=same,
                     png_bytes=png.stat().st_size, sha256=hashlib.sha256(png.read_bytes()).hexdigest()))
with open(root / 'tiles.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader(); w.writerows(rows)
print(len(rows), 'textures,', bad, 'mismatches')
