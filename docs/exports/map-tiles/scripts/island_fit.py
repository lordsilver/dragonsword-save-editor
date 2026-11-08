"""Places each single-island capture (RTM_W2_1xx) on the stitched Belos capture (dsa-world-map/belos/
belos-stitched.png, WorldMapData_200 square: corner (-593730, -524310), size 1,100,000, X across, Y down)
using the capture's own JSONString bounds shifted by (dx, dy), and scores the match (correlation of grey
levels). Also searches the best shift near the guess to measure the residual."""
import csv, sys
from pathlib import Path
import numpy as np
from PIL import Image
root = Path(sys.argv[1]); stitched = Path(sys.argv[2])
X0, Y0, S, N = -593730, -524310, 1100000, 3072
big = np.asarray(Image.open(stitched).convert('L')).astype(float)
caps = {r['prefix']: r for r in csv.DictReader(open(root / 'captures.csv', encoding='utf-8'))}
def score(r, dx, dy):
    sx, sy, size = float(r['sx']) - dx, float(r['sy']) - dy, float(r['size'])
    px0, py0, ps = (sx - X0) / S * N, (sy - Y0) / S * N, size / S * N
    n = int(round(ps))
    x, y = int(round(px0)), int(round(py0))
    if n < 8 or x < 0 or y < 0 or x + n > N or y + n > N: return None
    crop = big[y:y + n, x:x + n]
    small = np.asarray(Image.open(root / 'out/Design/CaptureMinimap/Export' / f"{r['prefix']}_0_0.png").convert('L').resize((n, n), Image.BOX)).astype(float)
    a, b = crop - crop.mean(), small - small.mean()
    den = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / den) if den else None
for p, r in caps.items():
    if not p.startswith('RTM_W2_1'): continue
    base = {k: score(r, *d) for k, d in {'no shift': (0, 0), 'shift (450000, 650000)': (450000, 650000)}.items()}
    best = max(((score(r, 450000 + ex, 650000 + ey) or -1, ex, ey) for ex in range(-6000, 6001, 1000) for ey in range(-6000, 6001, 1000)))
    print(p, {k: None if v is None else round(v, 3) for k, v in base.items()}, 'best near shift: corr %.3f at extra (%d, %d) units' % best)
