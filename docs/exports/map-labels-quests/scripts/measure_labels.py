"""Fit label centres measured by eye in the two screenshots, and measure glyph heights."""
import numpy as np, sys
from PIL import Image
CH = sys.argv[1]
def fit(pairs):
    A = []; b = []
    for (x, y), (u, v) in pairs:
        A.append([x, 1, 0]); b.append(u); A.append([y, 0, 1]); b.append(v)
    s, ox, oy = np.linalg.lstsq(np.array(A, float), np.array(b, float), rcond=None)[0]
    res = [((u - (s * x + ox)), (v - (s * y + oy))) for (x, y), (u, v) in pairs]
    return s, ox, oy, res
out = {'Meadow of Beginnings': ((48663, 145756), (876, 420)), 'Shadowed Woods': ((109617, 137357), (1177, 378)),
       'Field of Plenty': ((77204, 202745), (1016, 702))}
inn = {'Orbis Castle': ((37345, 102437), (884, 290)), 'Morninglight Farm': ((49910, 134144), (1025, 642)),
       'Cemetery of Rest': ((85191, 106268), (1416, 332)), 'Shadowed Forest': ((120675, 135381), (1810, 656)),
       'Shaded Tree Hill': ((6448, 144245), (542, 755)), 'Hill of Journey': ((59207, 172626), (1128, 1070))}
for name, d in (('zoomed-out (region names)', out), ('zoomed-in (area names)', inn)):
    s, ox, oy, res = fit(list(d.values()))
    print(name, 'px/unit %.5f offset (%.0f, %.0f)' % (s, ox, oy))
    for k, r in zip(d, res): print('   %-22s residual %+.0f, %+.0f px' % (k, *r))
def glyph_h(path, box):
    im = np.asarray(Image.open(path).convert('RGB')).astype(int)[box[1]:box[3], box[0]:box[2]]
    m = (im.min(axis=2) > 225)
    rows = np.where(m.sum(axis=1) > 2)[0]
    return rows.min() + box[1], rows.max() + box[1]
print('Meadow "M" rows', glyph_h(CH + '/game-zoomed-out.webp', (740, 400, 762, 440)))
print('Shadowed "S..d" rows', glyph_h(CH + '/game-zoomed-out.webp', (1186, 360, 1215, 395)))
print('Morninglight "M" rows', glyph_h(CH + '/game-zoomed-in.webp', (848, 615, 880, 670)))
print('Hill "H" rows', glyph_h(CH + '/game-zoomed-in.webp', (990, 1045, 1015, 1095)))
