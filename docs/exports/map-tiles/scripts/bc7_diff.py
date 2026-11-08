"""For BC7 tiles: compare the PNG (CUE4Parse/Detex decode) with texture2ddecoder's decode, per channel."""
import re, sys
from pathlib import Path
import numpy as np
from PIL import Image
import texture2ddecoder
root = Path(sys.argv[1])
ins = (root / 'inspect.txt').read_text(encoding='utf-8')
for name in sys.argv[2:]:
    m = re.search(re.escape(name) + r': PF_BC7, (\d+)x(\d+).*?\n  mip 0: .*?offset (\d+) data (\d+)', ins, re.S)
    w, h, off, size = map(int, m.groups())
    raw = (root / 'raw' / f'{name}.uexp').read_bytes()[off:off + size]
    ref = np.frombuffer(texture2ddecoder.decode_bc7(raw, w, h), np.uint8).reshape(h, w, 4)[..., [2, 1, 0, 3]].astype(int)
    px = np.asarray(Image.open(root / 'out/Design/CaptureMinimap/Export' / f'{name}.png').convert('RGBA')).astype(int)
    d = np.abs(ref - px)
    print(name, 'max diff RGBA', d.reshape(-1, 4).max(0).tolist(), 'pixels differing per channel', (d > 0).reshape(-1, 4).sum(0).tolist(),
          'ref alpha range', int(ref[..., 3].min()), int(ref[..., 3].max()))
    # where alpha differs: which values?
    sel = d[..., 3] > 0
    if sel.any():
        print('   png alpha', np.unique(px[..., 3][sel])[:5].tolist(), 'ref alpha', np.unique(ref[..., 3][sel])[:5].tolist(),
              'rgb equal on those', bool((d[..., :3][sel] == 0).all()))
