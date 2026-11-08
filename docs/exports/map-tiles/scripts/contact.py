"""Preview sheets (downscaled, for looking only; not part of the export) and per-tile colour statistics."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
root = Path(sys.argv[1]); d = root / 'out/Design/CaptureMinimap/Export'
def sheet(prefix, out, cell=256):
    names = sorted(p for p in d.glob(prefix + '*.png'))
    grid = {}
    for p in names:
        a, b = p.stem.rsplit('_', 2)[-2:]
        grid[(int(a), int(b))] = p
    na = max(a for a, _ in grid) + 1; nb = max(b for _, b in grid) + 1
    im = Image.new('RGB', (nb * cell, na * cell), (255, 0, 255))
    for (a, b), p in grid.items():
        t = Image.open(p).convert('RGB'); t.thumbnail((cell, cell))
        im.paste(t, (b * cell, a * cell))
    im.save(root / out)
for p in sorted(d.glob('RTM_W2_1_*.png')) + sorted(d.glob('RTM_W2_1??_*.png'))[:2]:
    a = np.asarray(Image.open(p).convert('RGB')).reshape(-1, 3)
    u = np.unique(a, axis=0)
    print(p.stem, 'unique colours', len(u), 'mean', a.mean(0).round(1).tolist())
sheet('RTM_W1_world_01_main_WP_', 'preview-orbis.png')
sheet('RTM_W2_1_world_02_main_wp_', 'preview-belos.png')
sheet('RTM_W2_World_02_Dummy1_WP_', 'preview-dummy1.png')
im = Image.new('RGB', (10 * 200, 200))
for i, p in enumerate(sorted(d.glob('RTM_W2_1??_*.png'))):
    t = Image.open(p).convert('RGB'); t.thumbnail((200, 200)); im.paste(t, (i * 200, 0))
im.save(root / 'preview-w2-10x.png')
