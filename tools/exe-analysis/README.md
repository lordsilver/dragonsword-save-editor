# Exe analysis scripts

Read-only helpers used to answer which colour map the skill screen reads (see `docs/game-assets.md`, Skill colours). They parse the PE file themselves and never run it. Keep the exe in its own folder outside the repository and run each with `python3 -I <script> <exe> <this folder> …`.

| Script                   | Does                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `pe.py`                  | Minimal PE section and RVA mapping                                                                       |
| `find_props.py`          | Finds the reflection name strings of the root panel's maps                                               |
| `params.py`              | Finds the UHT property records that point at those names; `Offset` is bits 16–31 of the seventh quadword |
| `neighbours.py`          | Lists a class's property records and offsets around one record                                           |
| `natives.py`             | Finds native function name/pointer pairs (for example `SetBrushColor`)                                   |
| `scan.py`                | Byte-pattern search in `.text`                                                                           |
| `calls.py`               | Call sites of a function, with the offsets used just before each                                         |
| `cluster.py`, `sites.py` | Places where several offsets, or one offset, are used in a code range                                    |

Disassemble with `objdump -d -M intel --start-address=… --stop-address=…`.
