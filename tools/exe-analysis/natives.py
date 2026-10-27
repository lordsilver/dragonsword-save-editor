import sys, struct
sys.path.insert(0, sys.argv[2])
from pe import PE
p = PE(sys.argv[1])
for name in sys.argv[3:]:
    s = (name + '\0').encode()
    i = -1
    while True:
        i = p.b.find(s, i + 1)
        if i < 0: break
        if p.b[i-1] != 0: continue
        sva = p.base + p.off2rva(i)
        pat = struct.pack('<Q', sva)
        j = -1
        while True:
            j = p.b.find(pat, j + 1)
            if j < 0: break
            if j % 8: continue
            nxt = struct.unpack_from('<Q', p.b, j + 8)[0]
            print(f'{name}: string {hex(sva)} ref at {hex(p.base+p.off2rva(j))} next {hex(nxt)}')
