"""Encode runtime artwork from retained PNG masters; verify dimensions/visible RGBA.

Run: python scripts/optimize-art.py [--check]
Requires Pillow. Source illustrations are never edited or removed.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs/design/visuals/warm-scroll-v2/runtime-art-manifest.json'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(source, runtime, lossless):
    with Image.open(source) as original, Image.open(runtime) as compressed:
        assert original.size == compressed.size, f'Dimensions changed: {runtime}'
        if lossless:
            a, b = original.convert('RGBA'), compressed.convert('RGBA')
            assert ImageChops.difference(a.getchannel('A'), b.getchannel('A')).getbbox() is None
            # Transparent RGB is not visible; compare actual composites on black and white.
            for color in ('black', 'white'):
                ac, bc = Image.new('RGB', a.size, color), Image.new('RGB', b.size, color)
                ac.paste(a, mask=a.getchannel('A')); bc.paste(b, mask=b.getchannel('A'))
                assert ImageChops.difference(ac, bc).getbbox() is None, f'Pixel mismatch: {runtime}'
        return original.size


if '--check' in sys.argv:
    records = json.loads(REPORT.read_text(encoding='utf-8'))
    for row in records:
        source, runtime = ROOT / row['source'], ROOT / row['runtime']
        assert digest(source) == row['source_sha256'], f'Source changed: {source}'
        assert digest(runtime) == row['runtime_sha256'], f'Runtime changed: {runtime}'
        verify(source, runtime, row['lossless'])
    print(f'Verified {len(records)} artwork files and their source hashes.')
else:
    sources = {}
    for path in re.findall(r"'/art/([^']+\.webp)'", (ROOT / 'src/render/assets.ts').read_text(encoding='utf-8')):
        output = ROOT / 'public/art' / path
        source = output.with_suffix('.png')
        if not source.exists():
            source = ROOT / 'docs/design/visuals/warm-scroll-v2' / (output.stem + '.png')
        sources[output] = (source, output.stem != 'forest-valley' and '/ui/' not in output.as_posix())
    for name in ('scroll-surface', 'faction-paintings', 'talent-paintings', 'handbook-paintings',
                 'reward-martial-paintings', 'reward-spirit-paintings', 'reward-mystic-paintings', 'reward-elements-paintings', 'destiny-progress-paintings', 'array-support-paintings'):
        sources[ROOT / f'public/art/ui/{name}.webp'] = (ROOT / f'docs/design/visuals/warm-scroll-v2/{name}.png', False)
    records = []
    for runtime, (source, lossless) in sources.items():
        with Image.open(source) as artwork:
            artwork.save(runtime, format='WEBP', quality=92, method=6, lossless=lossless)
        width, height = verify(source, runtime, lossless)
        records.append(dict(source=source.relative_to(ROOT).as_posix(), runtime=runtime.relative_to(ROOT).as_posix(),
                            source_sha256=digest(source), runtime_sha256=digest(runtime), lossless=lossless,
                            width=width, height=height, source_bytes=source.stat().st_size, runtime_bytes=runtime.stat().st_size))
    REPORT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Encoded and verified {len(records)} files: {sum(r["source_bytes"] for r in records):,} -> {sum(r["runtime_bytes"] for r in records):,} bytes.')
