"""Map labels: MapPointIconData AREANAME/CHAPTERNAME rows, joined to MapSectionData, strings,
WorldCompleteGroupData and the WORLDMAP_FOG / WORLDMAP_SECTION polygons of PlaceRangePolygonData."""
import csv, json, os, collections, sys
import xmlt
OUT = sys.argv[1]
WORLD = {'1': 'Orbis village', '100': 'Orbis', '200': 'Belos'}

def polys(tabletype):
    d = collections.OrderedDict()
    for r in xmlt.rows('PlaceRangePolygonData'):
        if r['TableType'] == tabletype:
            d.setdefault((r['MapGroupID'], r['TableID']), {'name': r['GroupName'], 'height': r['Height'], 'pts': []})['pts'].append((float(r['PosX']), float(r['PosY'])))
    return d
def inside(p, pts):
    x, y = p; c = False
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c

fog = polys('WORLDMAP_FOG'); sec = polys('WORLDMAP_SECTION')
groups = {r['ID']: r for r in xmlt.rows('WorldCompleteGroupData')}
chap2group = {r['FogSectionName']: r['ID'] for r in groups.values()}
sections = {r['ID']: r for r in xmlt.rows('MapSectionData')}
def region_of(mapid, p):
    hits = [tid for (m, tid), v in fog.items() if m == mapid and inside(p, v['pts'])]
    return hits
rows = []
for r in xmlt.rows('MapPointIconData'):
    t = r['MapInfoType']
    if t not in ('AREANAME', 'CHAPTERNAME'): continue
    x, y = float(r['PosX']), float(r['PosY'])
    if t == 'CHAPTERNAME':
        sid, s = r['ID'], None
    else:
        s = sections.get(r['ID']); sid = s['SectionName'] if s else ''
    fr = region_of(r['MapID'], (x, y))
    in_sec = [tid for (m, tid), v in sec.items() if m == r['MapID'] and inside((x, y), v['pts'])]
    rows.append({
        'id': r['ID'], 'kind': t, 'level': 'region (large)' if t == 'CHAPTERNAME' else 'area (small)',
        'map_id': r['MapID'], 'world': WORLD.get(r['MapID'], r['MapID']),
        'name_string_id': sid, 'en': xmlt.en(sid) if sid else '', 'fr': xmlt.fr(sid) if sid else '',
        'x': r['PosX'], 'y': r['PosY'], 'z': r['PosZ'],
        'section_type': s['SectionType'] if s else '', 'section_memo': (s['Memo'] + ' / ' + s['Memo1']).strip(' /') if s else '',
        'fog_region_id': chap2group.get(r['ID'], '') if t == 'CHAPTERNAME' else ';'.join(fr),
        'fog_region_by_polygon': ';'.join(fr),
        'fog_region_en': xmlt.en(groups[(chap2group.get(r['ID']) if t == 'CHAPTERNAME' else (fr[0] if fr else ''))]['FogSectionName']) if (chap2group.get(r['ID']) if t == 'CHAPTERNAME' else (fr[0] if fr else '')) in groups else '',
        'inside_own_section_polygon': ('yes' if r['ID'] in in_sec else 'no') if t == 'AREANAME' else '',
        'has_section_row': 'yes' if (t == 'CHAPTERNAME' or s) else 'no',
        'obtain_link': r['ObtainLinkType'], 'condition_check_id': r['ConditionCheckDataID'],
    })
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'map-labels.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
# polygons
pj = {'WORLDMAP_FOG': [], 'WORLDMAP_SECTION': []}
for tt, d in (('WORLDMAP_FOG', fog), ('WORLDMAP_SECTION', sec)):
    for (m, tid), v in d.items():
        name = ''
        if tt == 'WORLDMAP_FOG' and tid in groups: name = xmlt.en(groups[tid]['FogSectionName'])
        if tt == 'WORLDMAP_SECTION' and tid in sections: name = xmlt.en(sections[tid]['SectionName'])
        pj[tt].append({'map_id': m, 'table_id': tid, 'en': name, 'memo': v['name'], 'height': v['height'], 'points': v['pts']})
json.dump(pj, open(os.path.join(OUT, 'map-polygons.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
c = collections.Counter((r['kind'], r['world'], r['has_section_row'], r['inside_own_section_polygon']) for r in rows)
print(c); print('fog polys', len(fog), 'section polys', len(sec), 'sections w/o polygon:', [k for k in sections if ('100', k) not in sec and sections[k]['SectionType']=='AREA'][:60])
for r in rows: print(r['id'], r['kind'], r['en'], r['x'], r['y'], r['fog_region_id'], r['fog_region_en'], r['inside_own_section_polygon'])
