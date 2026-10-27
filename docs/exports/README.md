# Export records

The game's art and UI data were exported on the gaming PC by an agent working read-only on the install; the outputs themselves stay outside the repository. These are the records each export wrote, kept so the process can be repeated and checked. [Game assets](../game-assets.md) explains how the editor uses them.

| Folder          | Export                             | What it holds                                                                                                                                                                                              |
| --------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets/`       | `dsa-assets.zip`, 2026-10-27       | README of the 2D-art export: tools and versions, every step, known issues.                                                                                                                                 |
| `assets-extra/` | `dsa-assets-extra.zip`, 2026-10-27 | Report on the 18 icon textures the game never shipped, and the game's own fallbacks.                                                                                                                       |
| `skill-ui/`     | `dsa-skill-ui.zip`, 2026-10-27     | README and SUMMARY of the skill-screen export, and its decoded colour, icon and material data. `decoded/DRootIngame.Default__DRootIngame_C.maps.json` is the input `scripts/gen-catalog-extras.mjs` reads. |

The exporter and the scripts each export used are in `tools/asset-export/`.
