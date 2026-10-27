# Prints parent, scalar/vector/texture parameters of every MaterialInstanceConstant dump, and base-material settings.
import json, os, sys
def short(o): return (o or {}).get('ObjectPath', 'None').rsplit('.', 1)[0].replace('DS/Content/', '/Game/')
for dp, _, fs in sorted(os.walk(sys.argv[1])):
    for f in sorted(fs):
        for e in json.load(open(os.path.join(dp, f), encoding='utf-8')):
            p = e.get('Properties') or {}
            if e['Type'] == 'MaterialInstanceConstant':
                print(f"MI  {short({'ObjectPath': e['Package']+'.0'})}\n    parent  {short(p.get('Parent'))}")
                for s in p.get('ScalarParameterValues', []): print(f"    scalar  {s['ParameterInfo']['Name']} = {s['ParameterValue']}")
                for s in p.get('VectorParameterValues', []):
                    v = s['ParameterValue']; print(f"    vector  {s['ParameterInfo']['Name']} = R {v['R']:.4f} G {v['G']:.4f} B {v['B']:.4f} A {v['A']:.4f}  (#{v.get('Hex')})")
                for s in p.get('TextureParameterValues', []): print(f"    texture {s['ParameterInfo']['Name']} = {short(s['ParameterValue'])}")
                bp = p.get('BasePropertyOverrides')
                if bp: print('    overrides', json.dumps(bp))
            elif e['Type'] == 'Material':
                print(f"MAT {short({'ObjectPath': e['Package']+'.0'})}  " + ', '.join(f'{k}={v}' for k, v in p.items() if k not in ('StateId', 'CachedExpressionData')))
