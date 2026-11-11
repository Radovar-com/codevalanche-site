"""Subset checked-in WOFF2 files to source text and the CSS weight ranges.

Regenerate from original fonts with Python fonttools[woff]==4.61.1 and
brotli==1.2.0. Font licenses remain alongside the binaries. Does not access
external services; unsupported scripts continue to use the CSS fallback stack.
"""
from pathlib import Path
import re
from io import BytesIO
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[1]
directory = root / 'src/assets/fonts'
text = ''.join(p.read_text() for source in ['src', 'content', 'scripts']
               for p in (root / source).rglob('*')
               if p.is_file() and p.suffix in {'.html', '.json', '.js', '.mjs', '.css'}
               and directory not in p.parents
               and not p.name.endswith(('.test.mjs', '-test.mjs')))
codepoints = set(map(ord, text)) | set(range(32, 127)) | set(range(0x2000, 0x2070))
codepoints.update(int(value, 16) for value in re.findall(r'\\([0-9a-fA-F]{4,6})', text))
css = (directory / 'fonts.css').read_text()
for file in sorted(directory.glob('*.woff2')):
    font = TTFont(file, recalcTimestamp=False)
    wanted = set(font.getBestCmap()) & codepoints
    if not wanted:
        css = re.sub(r'@font-face\s*\{[^}]*url\(/assets/fonts/' + re.escape(file.name) + r'\)[^}]*\}', '', css)
        file.unlink()
        continue
    before = file.stat().st_size
    limits = (300, 400) if file.name.startswith('newsreader') else (400, 500) if int(file.stem.split('-')[1]) >= 5 else (400, 700)
    font = instantiateVariableFont(font, {'wght': limits}, inplace=True)
    buffer = BytesIO()
    font.save(buffer)
    buffer.seek(0)
    font = TTFont(buffer, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = ['*']
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=wanted)
    subsetter.subset(font)
    assert wanted <= set(font.getBestCmap()), file.name
    font.save(file)
    print(f'{file.name}: {before} -> {file.stat().st_size} bytes; {len(wanted)} codepoints retained')
# All shipped fonts are variable; share one face per Unicode shard.
faces = {}
for match in re.finditer(r'@font-face\s*\{([^}]+)\}', css):
    body = match[1]
    source = re.search(r'src:\s*url\(([^)]+)\)', body).group(1)
    if source in faces:
        continue
    weights = '300 400' if 'newsreader' in source else '400 500' if "'Geist Mono'" in body else '400 700'
    faces[source] = re.sub(r'font-weight:\s*[^;]+;', f'font-weight: {weights};', body).strip()
(directory / 'fonts.css').write_text('\n'.join('@font-face {\n  ' + body + '\n}' for body in faces.values()) + '\n')
