# Read-only scan of the game exe for FColor constants (as 32-bit immediates, 0xAARRGGBB little-endian).
import sys, re
exe = sys.argv[1]
b = open(exe, 'rb').read()
cols = {'STUN F5D000':0xFFF5D000,'STUN2 FFDA59':0xFFFFDA59,'AIR 47D1F8':0xFF47D1F8,'DOWN 7D5BF1':0xFF7D5BF1,'BLEED C63555':0xFFC63555,'BLEED2 CC0048':0xFFCC0048,
        'SHOCK C465FF':0xFFC465FF,'FIRE F40000':0xFFF40000,'POISON 3DC32E':0xFF3DC32E,'ICE 55DDFF':0xFF55DDFF,'ATTACK B39C6F':0xFFB39C6F,'HEAL ED7F9B':0xFFED7F9B,'SLOW E7766E':0xFFE7766E}
for k, v in cols.items():
    pat = v.to_bytes(4, 'little')
    hits = [m.start() for m in re.finditer(re.escape(pat), b)]
    print(f'{k:16} {len(hits):3}', ' '.join(hex(h) for h in hits[:12]))
