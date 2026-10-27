# Find byte patterns in .text and print their VAs.
import sys, re
sys.path.insert(0, sys.argv[2])
from pe import PE
p = PE(sys.argv[1])
n, va, vs, raw, rs = p.sec('.text')
t = p.b[raw:raw+rs]
for hexpat in sys.argv[3:]:
    rx = re.compile(b''.join(b'.' if h == '??' else re.escape(bytes([int(h, 16)])) for h in hexpat.split()), re.S)
    hits = [p.base + va + m.start() for m in rx.finditer(t)]
    print(hexpat, len(hits), ' '.join(hex(h) for h in hits[:30]))
