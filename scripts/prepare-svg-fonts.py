"""Generate SVG-only sfnt copies of WOFF2 fonts for static GitHub Pages."""
from pathlib import Path
import sys
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
artifact = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root
fonts = sorted((root/"fonts").rglob("*.woff2"))
if not fonts:
    raise RuntimeError("No WOFF2 fonts found")
for source in fonts:
    target = artifact/"fonts-svg"/source.relative_to(root/"fonts").with_suffix(".ttf")
    target.parent.mkdir(parents=True,exist_ok=True)
    font = TTFont(source, recalcTimestamp=False)
    font.flavor = None
    font.flavorData = None
    font.save(target)
    font.close()
    print("SVG font ready:",target.relative_to(artifact))
