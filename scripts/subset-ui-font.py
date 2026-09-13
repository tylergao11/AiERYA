"""Subset the OFL-licensed brush font to characters used by the game."""
from pathlib import Path
import sys

if len(sys.argv) > 1:
    sys.path.insert(0, sys.argv[1])
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
source = root / 'docs/design/visuals/manuscript/MaShanZheng-Regular.ttf'
chars = set(chr(n) for n in range(32, 127))
for path in (root / 'src').rglob('*'):
    if path.suffix in ('.ts', '.css'):
        chars.update(path.read_text(encoding='utf-8'))
options = subset.Options()
options.flavor = 'woff2'
options.name_IDs = ['*']
font = TTFont(source)
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=''.join(sorted(chars)))
subsetter.subset(font)
font.flavor = 'woff2'
target = root / 'public/fonts/jianghu-brush.woff2'
font.save(target)
print(f'{target.name}: {target.stat().st_size} bytes, {len(font.getBestCmap())} glyphs')
