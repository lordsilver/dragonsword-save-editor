"""Tiny reader for the game's XML tables: rows(table) -> list of dicts (namespace prefix dropped)."""
import re, html, os, functools
GD = os.environ.get('GD', r'C:\Users\Gary\dsa-work\dsa-xml\GameData')
ATTR = re.compile(r'(?:\w+:)?(\w+)="([^"]*)"')
def rows(name, sub=None):
    p = os.path.join(GD, name if name.endswith('.xml') else name + '.xml')
    out = []
    with open(p, encoding='utf-8-sig') as f:
        for line in f:
            s = line.strip()
            if not s.startswith('<') or s.startswith('<?') or s.endswith('Map>') or 'xmlns' in s: continue
            out.append({k: html.unescape(v) for k, v in ATTR.findall(s)})
    return out
@functools.lru_cache(None)
def strings():
    d = {}
    for t in ('StringData', 'StringMinimalData', 'StringQuestData', 'StringSceneData', 'StringReminiscenceData'):
        try:
            for r in rows(t):
                d.setdefault(r.get('ID'), r)
        except FileNotFoundError: pass
    return d
def en(i): r = strings().get(str(i)); return r.get('En', '') if r else ''
def fr(i): r = strings().get(str(i)); return r.get('Fr', '') if r else ''
def _pref(i, tables):
    for t in tables:
        try:
            r = _table(t).get(str(i))
        except FileNotFoundError: r = None
        if r and r.get('En'): return r
    return strings().get(str(i))
@functools.lru_cache(None)
def _table(t): return {r.get('ID'): r for r in rows(t)}
def qen(i): r = _pref(i, ('StringQuestData', 'StringData')); return (r or {}).get('En', '')
def qfr(i): r = _pref(i, ('StringQuestData', 'StringData')); return (r or {}).get('Fr', '')
