# Minimal read-only PE helpers: sections, RVA/offset mapping, string and pointer search.
import struct, sys, re

class PE:
    def __init__(self, path):
        self.b = open(path, 'rb').read()
        b = self.b
        e = struct.unpack_from('<I', b, 0x3c)[0]
        assert b[e:e+4] == b'PE\0\0'
        nsec = struct.unpack_from('<H', b, e+6)[0]
        optsz = struct.unpack_from('<H', b, e+20)[0]
        opt = e + 24
        self.base = struct.unpack_from('<Q', b, opt+24)[0]
        self.secs = []
        s = opt + optsz
        for i in range(nsec):
            name = b[s:s+8].rstrip(b'\0').decode()
            vsize, va, rsize, raw = struct.unpack_from('<IIII', b, s+8)
            self.secs.append((name, va, vsize, raw, rsize))
            s += 40
    def off2rva(self, off):
        for n, va, vs, raw, rs in self.secs:
            if raw <= off < raw + rs: return va + off - raw
    def rva2off(self, rva):
        for n, va, vs, raw, rs in self.secs:
            if va <= rva < va + max(vs, rs): return raw + rva - va
    def sec(self, name):
        return next(s for s in self.secs if s[0] == name)
