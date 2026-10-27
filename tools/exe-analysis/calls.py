# Call sites of a target (E8 rel32), with which interesting disp32 values appear just before each.
import sys, struct, re
sys.path.insert(0, sys.argv[2])
from pe import PE
p = PE(sys.argv[1])
target = int(sys.argv[3], 16)
n, va, vs, raw, rs = p.sec('.text')
t = p.b[raw:raw+rs]
tbase = p.base + va
disps = {0x3c8:'CB3c8', 0x388:'CB388', 0x7d8:'MesmColor', 0x828:'UIColor', 0x878:'Switching', 0x8c8:'SkillType'}
for m in re.finditer(b'\xe8', t):
    i = m.start()
    if i + 5 > len(t): break
    rel = struct.unpack_from('<i', t, i + 1)[0]
    if tbase + i + 5 + rel != target: continue
    window = t[max(0, i - 0x300):i]
    found = [name for d, name in disps.items() if struct.pack('<I', d) in window]
    print(hex(tbase + i), found)
