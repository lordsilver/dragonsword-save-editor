"""Third BC7 decode with Pillow's own BCn decoder; reports which of the two other decodes it agrees with."""
import re, sys
from pathlib import Path
import numpy as np
from PIL import Image
import texture2ddecoder
root = Path(sys.argv[1])
ins = (root / 'inspect.txt').read_text(encoding='utf-8')
names = sys.argv[2:] or re.findall(r'^(\S+): PF_BC7', ins, re.M)
for name in names:
    m = re.search(re.escape(name) + r': PF_BC7, (\d+)x(\d+).*?\n  mip 0: .*?offset (\d+) data (\d+)', ins, re.S)
    w, h, off, size = map(int, m.groups())
    raw = (root / 'raw' / f'{name}.uexp').read_bytes()[off:off + size]
    pil = np.asarray(Image.frombytes('RGBA', (w, h), raw, 'bcn', 7)).astype(int)
    t2d = np.frombuffer(texture2ddecoder.decode_bc7(raw, w, h), np.uint8).reshape(h, w, 4)[..., [2, 1, 0, 3]].astype(int)
    png = np.asarray(Image.open(root / 'out/Design/CaptureMinimap/Export' / f'{name}.png').convert('RGBA')).astype(int)
    print(f'{name}: pillow==png {np.array_equal(pil, png)} (diff px {(pil != png).any(-1).sum()}), pillow==texture2ddecoder {np.array_equal(pil, t2d)} (diff px {(pil != t2d).any(-1).sum()})')
