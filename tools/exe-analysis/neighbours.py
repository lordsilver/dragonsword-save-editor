# Walk property param records around an address: name pointer, flags byte, offset word.
import sys, struct
sys.path.insert(0, sys.argv[2])
from pe import PE
p = PE(sys.argv[1])
start = int(sys.argv[3], 16); span = int(sys.argv[4], 16)
def cstr(va):
    off = p.rva2off(va - p.base)
    if off is None: return None
    e = p.b.find(b'\0', off, off + 80)
    s = p.b[off:e]
    return s.decode() if s and all(32 <= c < 127 for c in s) else None
a = start - span
while a < start + span:
    off = p.rva2off(a - p.base)
    q = struct.unpack_from('<Q', p.b, off)[0]
    name = cstr(q) if p.base <= q < p.base + 0xb000000 else None
    if name and name[0].isupper():
        w = struct.unpack_from('<Q', p.b, off + 0x30)[0]
        flags = struct.unpack_from('<I', p.b, off + 0x18)[0]
        print(hex(a), f'{name:32}', 'gen', hex(flags & 0xff), 'offset', hex((w >> 16) & 0xffff))
    a += 8
