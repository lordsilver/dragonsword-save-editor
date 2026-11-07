"""Quest steps -> world position.  Sources: QuestMainData, QuestStepData + QuestStepData_Export,
QuestStepPositionGroupData, ActorPositionData, SectionNpcData, MapFieldData."""
import csv, os, re, sys, collections as C
import xmlt
OUT = sys.argv[1]
qm = {r['ID']: r for r in xmlt.rows('QuestMainData')}
steps = {}
for t in ('QuestStepData', 'QuestStepData_Export'):          # QuestStepData wins on overlap (it is the runtime table)
    for r in xmlt.rows(t):
        steps.setdefault((r['ID'], r['StepID']), dict(r, _table=t))
actors = C.defaultdict(list)
for r in xmlt.rows('ActorPositionData'):
    actors[r['Name']].append(r)
npc_by_cid = C.defaultdict(list)
for root, _, files in os.walk(os.path.join(xmlt.GD, 'ExportSectionNpcData')):
    for f in files:
        for r in xmlt.rows(os.path.relpath(os.path.join(root, f), xmlt.GD)):
            if 'CID' in r: npc_by_cid[r['CID']].append(dict(r, _map=os.path.basename(root)))
posgroup = C.defaultdict(dict)
for r in xmlt.rows('QuestStepPositionGroupData'):
    posgroup[r['ID']][r['StepPositionMapID']] = r['StepPosition']
SQUARE = {'100': (-140990, -198850, 570000), '200': (-593730, -524310, 1100000)}  # WorldMapData corner x0, y0, side
WORLD = {'1': 'Orbis (castle town)', '100': 'Orbis', '200': 'Belos'}
def pick(name, want):
    rs = actors.get(name, [])
    for m in want:
        for r in rs:
            if r['MapGroupID'] == m: return r
    return rs[0] if rs else None
mark = lambda s: (re.search(r'Icon_Mark_(\w+?)_Sprite', s) or [None, ''])[1]
rows = []; why = C.Counter()
for (qid, sid), s in sorted(steps.items(), key=lambda kv: (int(kv[0][0]), int(kv[0][1] or 0))):
    q = qm.get(qid, {})
    want = [m for m in (s.get('IconMapGroupID', ''), s.get('MapID2', ''), s.get('StepPositionMapID', ''), '100', '200', '1') if m and m != '0']
    target = s.get('StepPosition', ''); via = 'StepPosition'
    a = pick(target, want) if target else None
    if not a and s['StepType'].startswith('TALK_TO_NPC') and s.get('StepValue1'):
        a = pick('NPC' + s['StepValue1'], want); via = 'NPC<StepValue1>'
        if not a and npc_by_cid.get(s['StepValue1']):
            n = npc_by_cid[s['StepValue1']][0]; a = {'PosX': n['PosX'], 'PosY': n['PosY'], 'PosZ': n['PosZ'], 'MapGroupID': {'world_01_main_WP': '100', 'world_02_main_wp': '200'}.get(n['_map'], n['_map']), 'Name': n['UIDName']}; via = 'SectionNpcData CID'
    # what the world map shows while the player is in world 100: the group's row for map 100, if any
    g = posgroup.get(s.get('StepPositionGroupID', ''), {})
    home = a['MapGroupID'] if a and a['MapGroupID'] in ('100', '200') else (s.get('IconMapGroupID') or '100')
    redirect = g.get(home, '')
    ra = pick(redirect, [home]) if redirect else None
    mx, my = (ra['PosX'], ra['PosY']) if ra else ((a['PosX'], a['PosY']) if a and a['MapGroupID'] == home else ('', ''))
    sq = SQUARE.get(home)
    on = bool(mx) and sq and sq[0] <= float(mx) <= sq[0] + sq[2] and sq[1] <= float(my) <= sq[1] + sq[2]
    if a: why['resolved via ' + via] += 1
    elif not target: why['no StepPosition (%s)' % s['StepType']] += 1
    else: why['StepPosition not in ActorPositionData'] += 1
    rows.append({
        'quest_id': qid, 'category': q.get('Category', '(no QuestMainData row)'), 'accept_type': q.get('AcceptType', ''),
        'quest_en': xmlt.qen(q.get('QuestName', '')) if q else '', 'quest_fr': xmlt.qfr(q.get('QuestName', '')) if q else '', 'step_id': sid, 'next_step_id': s.get('NextStepID', ''),
        'step_type': s['StepType'], 'step_value1': s.get('StepValue1', ''), 'step_en': xmlt.qen(s.get('StepDesc', '')), 'step_fr': xmlt.qfr(s.get('StepDesc', '')),
        'map_mark': mark(s.get('MapButtonDesign', '')), 'marker_area': s.get('Marker', ''), 'marker_range': s.get('MarkerRange', ''), 'quest_area_size': s.get('QuestAreaSize', ''),
        'icon_map_group_id': s.get('IconMapGroupID', ''), 'map_id2': s.get('MapID2', ''), 'step_position_map_id': s.get('StepPositionMapID', ''),
        'step_position': target, 'resolved_via': via if a else '', 'target_map_group': a['MapGroupID'] if a else '',
        'world': WORLD.get(a['MapGroupID'], a['MapGroupID']) if a else '',
        'x': a['PosX'] if a else '', 'y': a['PosY'] if a else '', 'z': a['PosZ'] if a else '',
        'position_group_id': s.get('StepPositionGroupID', ''), 'world_map_redirect': redirect,
        'redirect_x': ra['PosX'] if ra else '', 'redirect_y': ra['PosY'] if ra else '',
        'map_world': WORLD.get(home, home), 'map_x': mx, 'map_y': my, 'on_world_map': 'yes' if on else 'no',
        'source_table': s['_table'],
    })
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'quest-steps.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
print(len(rows), 'steps,', len({r['quest_id'] for r in rows}), 'quests'); print(why.most_common())
print(C.Counter((r['category'], bool(r['x'])) for r in rows))
print(C.Counter(r['world'] for r in rows))
print('quests in QuestMainData without steps:', C.Counter(q['Category'] for k, q in qm.items() if not any(r['quest_id'] == k for r in rows)))
print('on world map:', C.Counter((r['category'], r['on_world_map']) for r in rows))
print('redirected:', sum(1 for r in rows if r['world_map_redirect']))
qs = C.defaultdict(list)
for r in rows: qs[r['quest_id']].append(r['on_world_map'] == 'yes')
print('quests with no step on the map:', C.Counter(rows[[r['quest_id'] for r in rows].index(k)]['category'] for k, v in qs.items() if not any(v)))
