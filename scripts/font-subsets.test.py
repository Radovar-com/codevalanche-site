"""Run with the fonttools[woff] environment used by subset-fonts.py."""
import unittest
from pathlib import Path
from fontTools.ttLib import TTFont

FONT_DIRECTORY = Path(__file__).resolve().parents[1] / 'src/assets/fonts'


def characters(files):
    return set().union(*(set(TTFont(file).getBestCmap()) for file in files))


class PublishedGlyphCoverage(unittest.TestCase):
    def test_sans_preserves_published_release_translation_characters(self):
        covered = characters(FONT_DIRECTORY / f'geist-{i}.woff2' for i in range(5))
        self.assertLessEqual(set(map(ord, 'ỹœЖ')), covered)

    def test_monospace_preserves_published_release_translation_characters(self):
        covered = characters(FONT_DIRECTORY / f'geist-{i}.woff2' for i in range(5, 11))
        self.assertLessEqual(set(map(ord, 'ỹœЖ')), covered)

    def test_display_preserves_its_published_latin_translation_characters(self):
        for style in ['', 'italic-']:
            files = FONT_DIRECTORY.glob(f'newsreader-{style}*.woff2')
            covered = characters(file for file in files if style or 'italic' not in file.name)
            self.assertLessEqual(set(map(ord, 'ỹœ')), covered)


if __name__ == '__main__':
    unittest.main()
