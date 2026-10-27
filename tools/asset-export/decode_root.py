# Decodes the enum-keyed maps of Default__DRootIngame_C by hand, because CUE4Parse cannot
# (the Nexus .usmap lacks one property of DRootPanelIngame, so every index after it is off by one).
#
#   python -I decode_root.py <DRootIngame.uexp> <DRootIngame.names.tsv> <out.json>
#
# Layout (UE 5.3 unversioned properties, cooked): the export starts at .uexp offset 655 (export map:
# SerialOffset - TotalHeaderSize) with a 12-byte header (6 fragments). The serialized values are, in
# order: GuideWidgetHighlightWidget, GuideWidgetEmphasisStringWidget (4-byte package indices), then
# nine TMaps. Each TMap is int32 NumKeysToRemove (0), int32 Num, then Num pairs of
# FName key (int32 name index + int32 number) and a 4-byte value: an FPackageIndex for the icon maps,
# an FColor stored as B,G,R,A bytes for the colour maps. MesmerizedSkillTypeColor is not serialized.
import json, struct, sys

uexp, names_tsv, out = sys.argv[1:4]
srgb = lambda c: c / 255 / 12.92 if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4  # FLinearColor(FColor)
names, imports = {}, {}
for line in open(names_tsv, encoding='utf-8'):
    f = line.rstrip('\n').split('\t')
    if f[0] == 'N': names[int(f[1])] = f[2]
    if f[0] == 'I': imports[int(f[1])] = f[3]

MAPS = [  # property name, value kind - in DRootPanelIngame declaration order
    ('MesmerizedIconMap', 'object'), ('BossMesmerizedIconMap', 'object'),
    ('BossMesmerizedTextOnMap', 'object'), ('BossMesmerizedTextOffMap', 'object'),
    ('MesmerizedUIIconMap', 'object'), ('MesmerizedUIVer2IconMap', 'object'),
    ('MesmerizedColor', 'color'), ('MesmerizedUIColor', 'color'), ('MesmerizedSwitchingColor', 'color'),
]
b = open(uexp, 'rb').read()
o = 655 + 12
result = {'GuideWidgetHighlightWidget': imports[struct.unpack_from('<i', b, o)[0]],
          'GuideWidgetEmphasisStringWidget': imports[struct.unpack_from('<i', b, o + 4)[0]]}
o += 8
for prop, kind in MAPS:
    rem, n = struct.unpack_from('<ii', b, o); o += 8
    assert rem == 0 and 0 < n < 64, (prop, o)
    entries = []
    for _ in range(n):
        ni, nn = struct.unpack_from('<ii', b, o)
        key = names[ni] + (f'_{nn - 1}' if nn else '')
        if kind == 'object':
            entries.append({'key': key, 'value': imports[struct.unpack_from('<i', b, o + 8)[0]]})
        else:
            B, G, R, A = b[o + 8:o + 12]
            entries.append({'key': key, 'r': R, 'g': G, 'b': B, 'a': A, 'hex': f'#{R:02X}{G:02X}{B:02X}',
                            'linear': [round(srgb(c), 6) for c in (R, G, B)]})
        o += 12
    result[prop] = entries
# The next value must be AttackCombatSprite (TArray of 10 package indices) - proves the map count.
n = struct.unpack_from('<i', b, o)[0]
assert n == 10 and all(struct.unpack_from('<i', b, o + 4 + 4 * i)[0] < 0 for i in range(n)), 'layout check failed'
result['_check'] = f'next value at .uexp offset {o}: TArray of {n} package indices (AttackCombatSprite)'
json.dump(result, open(out, 'w', encoding='utf-8'), indent=2)
for prop, kind in MAPS:
    print(prop)
    for e in result[prop]:
        print(f"  {e['key']:40} {e['value'] if kind == 'object' else e['hex'] + '  rgb(%d,%d,%d)' % (e['r'], e['g'], e['b'])}")
print(result['_check'])
