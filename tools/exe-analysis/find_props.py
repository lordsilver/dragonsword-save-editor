import sys, struct
sys.path.insert(0, sys.argv[2])
from pe import PE
p = PE(sys.argv[1])
print('base', hex(p.base)); [print(s[0], hex(s[1]), hex(s[2])) for s in p.secs]
names = [b'MesmerizedUIColor\0', b'MesmerizedSwitchingColor\0', b'MesmerizedSkillTypeColor\0', b'MesmerizedColor\0', b'MesmerizedUIVer2IconMap\0', b'ColorBorder\0', b'AttackCombatSprite\0']
for n in names:
    i = -1; hits = []
    while True:
        i = p.b.find(n, i + 1)
        if i < 0: break
        if i == 0 or p.b[i-1] == 0: hits.append(i)
    print(n[:-1].decode(), [(hex(h), hex(p.base + p.off2rva(h))) for h in hits[:6]])
