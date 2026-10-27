# Lists every Material/MaterialInstance/Texture/sprite path referenced from the JSON dumps under a folder.
import json, os, re, sys
root, kinds = sys.argv[1], ('MaterialInstanceConstant', 'Material', 'Texture2D', 'MaterialFunction')
refs = set()
for dp, _, fs in os.walk(root):
    for f in fs:
        if f.endswith('.json'):
            for m in re.finditer(r'"ObjectName": "(\w+)\'[^\']*\'",\s*"ObjectPath": "([^"]+)"', open(os.path.join(dp, f), encoding='utf-8').read()):
                if m.group(1) in kinds:
                    p = m.group(2).rsplit('.', 1)[0]
                    p = '/Game/' + p[len('DS/Content/'):] if p.startswith('DS/Content/') else '/' + p
                    refs.add((m.group(1), p))
for k, p in sorted(refs): print(f'{k}\t{p}')
