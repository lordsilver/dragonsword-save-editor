import sys, struct, re
sys.path.insert(0, sys.argv[2])
from pe import PE
p = PE(sys.argv[1])
n, va, vs, raw, rs = p.sec('.text')
t = p.b[raw:raw+rs]
lo, hi = int(sys.argv[3], 16), int(sys.argv[4], 16)
d = struct.pack('<I', int(sys.argv[5], 16))
for m in re.finditer(re.escape(d), t):
    a = p.base + va + m.start()
    if lo <= a < hi: print(hex(a), t[m.start()-3:m.start()].hex())
