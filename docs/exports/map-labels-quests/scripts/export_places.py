"""Place cards: name, area line, description(s) and picture for warp points, statues, Eona's Legacy,
the Tower of Trials (WayPointData) and dungeons (MapDungeonGroupData)."""
import csv, os, sys, re, json, collections as C
import xmlt
OUT = sys.argv[1]
sections = {r['ID']: r for r in xmlt.rows('MapSectionData')}
poly = json.load(open(os.path.join(OUT, 'map-polygons.json'), encoding='utf-8'))['WORLDMAP_SECTION']
def inside(p, pts):
    x, y = p; c = False
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def section_at(x, y, typ):
    hits = [p['table_id'] for p in poly if p['map_id'] == '100' and inside((x, y), p['points']) and sections.get(p['table_id'], {}).get('SectionType') == typ]
    return hits
icons = C.defaultdict(list)
for r in xmlt.rows('MapPointIconData'): icons[(r['MapInfoType'], r['ID'])].append(r)
img = lambda s: (re.search(r"/Game/([^'.]+)", s) or [None, ''])[1]
rows = []; agree = C.Counter()
for r in xmlt.rows('WayPointData'):
    s = sections.get(r['WorldMapSectionID'])
    t = r['WayPointType']
    ic = (icons.get((t, r['ID'])) or [None])[0]
    x, y = (ic['PosX'], ic['PosY']) if ic else ('', '')
    if ic and s and ic['MapID'] == '100':
        hz = section_at(float(x), float(y), s['SectionType'])
        agree[(t, s['SectionType'], r['WorldMapSectionID'] in hz)] += 1
    rows.append({'kind': t, 'id': r['ID'], 'name_id': r['Name'], 'name_en': xmlt.en(r['Name']), 'name_fr': xmlt.fr(r['Name']),
                 'area_source': 'WayPointData.WorldMapSectionID -> MapSectionData.SectionName' if s else '',
                 'area_section_id': r['WorldMapSectionID'], 'area_section_type': s['SectionType'] if s else '',
                 'area_en': xmlt.en(s['SectionName']) if s else '', 'area_fr': xmlt.fr(s['SectionName']) if s else '',
                 'desc_id': r['Description'], 'desc_en': xmlt.en(r['Description']), 'desc_fr': xmlt.fr(r['Description']),
                 'desc_done_id': r['Use_Description'], 'desc_done_en': xmlt.en(r['Use_Description']), 'desc_done_fr': xmlt.fr(r['Use_Description']),
                 'picture': img(r['MapInfoImgName']), 'fog_region_id': r['FogSectionID'], 'map_id': ic['MapID'] if ic else '', 'x': x, 'y': y})
for r in xmlt.rows('MapDungeonGroupData'):
    ic = (icons.get(('DUNGEON', r['ID'])) or icons.get(('CRACKDUNGEON', r['ID'])) or [None])[0]
    x, y = (ic['PosX'], ic['PosY']) if ic else ('', '')
    a = section_at(float(x), float(y), 'AREA') if ic and ic['MapID'] == '100' else []
    s = sections.get(a[0]) if a else None
    rows.append({'kind': 'DUNGEON/' + r['DungeonGroupType'], 'id': r['ID'], 'name_id': r['Name'], 'name_en': xmlt.en(r['Name']), 'name_fr': xmlt.fr(r['Name']),
                 'area_source': 'GUESS: icon point inside a WORLDMAP_SECTION polygon (not in any table; unverified)' if s else '',
                 'area_section_id': a[0] if a else '', 'area_section_type': 'AREA' if s else '',
                 'area_en': xmlt.en(s['SectionName']) if s else '', 'area_fr': xmlt.fr(s['SectionName']) if s else '',
                 'desc_id': r['Desc'], 'desc_en': xmlt.en(r['Desc']), 'desc_fr': xmlt.fr(r['Desc']),
                 'desc_done_id': '', 'desc_done_en': '', 'desc_done_fr': '',
                 'picture': img(r['MapInfoImgName']), 'fog_region_id': r['FogSectionID'], 'map_id': ic['MapID'] if ic else '', 'x': x, 'y': y})
with open(os.path.join(OUT, 'place-cards.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
print(C.Counter((r['kind'], bool(r['x']), bool(r['area_en'])) for r in rows))
print('WayPointData section vs polygon test:', agree)
