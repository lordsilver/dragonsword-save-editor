import sys, struct
sys.path.insert(0, sys.argv[2])
from pe import PE
p = PE(sys.argv[1])
targets = {'MesmerizedColor':0x1485ab198,'MesmerizedUIColor':0x1485ab1c0,'MesmerizedSwitchingColor':0x1485ab1f0,'MesmerizedSkillTypeColor':0x1485ab230,'MesmerizedUIVer2IconMap':0x1485ab160,'AttackCombatSprite':0x1485ab270,'ColorBorder':0x148439790}
for name, va in targets.items():
    pat = struct.pack('<Q', va)
    i = -1
    while True:
        i = p.b.find(pat, i + 1)
        if i < 0: break
        if i % 8: continue
        rva = p.off2rva(i)
        blob = p.b[i:i+0x40]
        q = struct.unpack_from('<8Q', blob)
        print(f'{name:26} param at {hex(p.base+rva)}:', ' '.join(f'{x:016x}' for x in q))
