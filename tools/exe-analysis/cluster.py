# Find places in .text where all given disp32 values occur within a window.
import sys, struct, re
sys.path.insert(0, sys.argv[2])
from pe import PE
p = PE(sys.argv[1])
n, va, vs, raw, rs = p.sec('.text')
t = p.b[raw:raw+rs]
win = int(sys.argv[3], 16)
ds = [int(x, 16) for x in sys.argv[4:]]
pos = {d: [m.start() for m in re.finditer(re.escape(struct.pack('<I', d)), t)] for d in ds}
import bisect
first = pos[ds[0]]
seen = set()
for a in first:
    ok = True
    for d in ds[1:]:
        L = pos[d]; k = bisect.bisect_left(L, a - win)
        if not (k < len(L) and L[k] <= a + win): ok = False; break
    if ok:
        key = a // 0x1000
        if key in seen: continue
        seen.add(key); print(hex(p.base + va + a))
