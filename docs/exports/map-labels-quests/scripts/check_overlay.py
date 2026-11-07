"""Draw predicted label centres (red +) and the save's quest marks (magenta o) over the two screenshots."""
import csv, sys
from PIL import Image, ImageDraw
CH, DATA, OUT, held = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(',')
labels = list(csv.DictReader(open(DATA + '/map-labels.csv', encoding='utf-8-sig')))
steps = {(r['quest_id'], r['step_id']): r for r in csv.DictReader(open(DATA + '/quest-steps.csv', encoding='utf-8-sig'))}
for shot, s, ox, oy, kind in (('game-zoomed-out.webp', 0.00495, 635, -301, 'CHAPTERNAME'), ('game-zoomed-in.webp', 0.01111, 470, -848, 'AREANAME')):
    im = Image.open(CH + '/' + shot).convert('RGB'); d = ImageDraw.Draw(im)
    for r in labels:
        if r['map_id'] != '100' or not r['en']: continue
        u, v = s * float(r['x']) + ox, s * float(r['y']) + oy
        col = (255, 40, 40) if r['kind'] == kind else (255, 170, 0)
        d.line((u - 9, v, u + 9, v), fill=col, width=3); d.line((u, v - 9, u, v + 9), fill=col, width=3)
        d.text((u + 8, v + 8), r['en'] + ('' if r['kind'] == kind else ' (hidden at this zoom)'), fill=col)
    for h in held:
        q, st = h.split(':'); r = steps[(q, st)]
        u, v = s * float(r['map_x']) + ox, s * float(r['map_y']) + oy
        d.ellipse((u - 16, v - 16, u + 16, v + 16), outline=(255, 0, 255), width=4)
        d.text((u + 18, v - 20), '%s step %s %s' % (q, st, r['map_mark']), fill=(255, 0, 255))
    im.save(OUT + '/overlay-' + shot.replace('.webp', '.png'))
