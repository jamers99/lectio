import importlib.machinery
import importlib.util
import os
import re
import tempfile
import unittest
from pathlib import Path

# Keep test downloads and config away from the real ones.
TEMP = tempfile.mkdtemp()
os.environ["XDG_DATA_HOME"] = TEMP
os.environ["XDG_CONFIG_HOME"] = TEMP

path = str(Path(__file__).resolve().parent.parent / "lectio")
loader = importlib.machinery.SourceFileLoader("lectio", path)
lectio = importlib.util.module_from_spec(importlib.util.spec_from_loader("lectio", loader))
loader.exec_module(lectio)


class PublicDomain(unittest.TestCase):
    def test_book_table_matches_the_kjv(self):
        chapters = [len(book) for book in lectio.local("KJV")]
        self.assertEqual(chapters, [int(c) for _, c, _ in lectio.BOOKS])

    def test_every_public_domain_translation_renders(self):
        for t, info in lectio.TRANSLATIONS.items():
            if "fetch" not in info:
                result = lectio.call("chapter", {"t": t, "b": "43", "c": "3"})
                self.assertTrue(result["ok"], result)
                self.assertIn('data-v="16"', result["html"])

    def test_search_puts_the_exact_phrase_first(self):
        result = lectio.call("search", {"q": "God so loved", "t": "KJV"})
        first = result["hits"][0]
        self.assertEqual((first["b"], first["c"], first["v"]), (43, 3, 16))

    def test_search_on_an_online_translation_uses_the_kjv(self):
        self.assertEqual(lectio.call("search", {"q": "shepherd", "t": "NLT"})["t"], "KJV")


class Cleaner(unittest.TestCase):
    def verses(self, markup):
        return re.findall(r'<span class="vn" data-v="(\d+)">\1</span>', markup)

    def test_esv_shape(self):
        markup = lectio.Cleaner.clean(
            '<h3 id="p1">A Heading</h3><p class="starts-chapter"><b class="chapter-num" id="v43003001-1">3:1&nbsp;</b>'
            'First.<b class="verse-num" id="v43003002-1">2&nbsp;</b>Second.'
            '<sup class="footnote"><a class="fn" href="#f1-1" title="note">1</a></sup></p>'
            '<p>(<a href="http://www.esv.org" class="copyright">ESV</a>)</p>'
        )
        self.assertEqual(self.verses(markup), ["1", "2"])
        self.assertIn('<a class="fn" href="#f1-1">1</a>', markup)
        self.assertNotIn("http://", markup)
        self.assertNotIn("title=", markup)

    def test_nlt_shape(self):
        markup = lectio.Cleaner.clean(
            '<html><head><title>NLT API</title></head><body><div id="bibletext"><section>'
            '<h2 class="bk_ch_vs_header">Psalm 23:1-6, NLT</h2>'
            '<verse_export vn="1"><h3 class="chapter-number"><span class="cw">Psalm</span> 23</h3>'
            '<p class="poet1-vn"><span class="vn">1</span>The <span class="sc">Lord</span> is my shepherd;</p>'
            '<p class="poet2">I have all<a class="a-tn">*</a><span class="tn">note</span></p></verse_export>'
            "</section></div></body></html>"
        )
        self.assertEqual(self.verses(markup), ["1"])
        self.assertNotIn("NLT API", markup)
        self.assertNotIn("Psalm 23", markup)
        self.assertNotIn("verse_export", markup)
        self.assertIn('<span class="sc">Lord</span>', markup)
        self.assertIn('<span class="tn">note</span>', markup)

    def test_scripts_and_handlers_are_removed(self):
        markup = lectio.Cleaner.clean('<p onclick="x()">Hi<script>alert(1)</script><img src=x onerror=y()></p>')
        self.assertEqual(markup, "<p>Hi</p>")


class Online(unittest.TestCase):
    def test_missing_key_asks_for_one(self):
        for t, info in lectio.TRANSLATIONS.items():
            if "fetch" in info:
                result = lectio.call("chapter", {"t": t, "b": "43", "c": "3"})
                self.assertTrue(result.get("needsKey"), result)


if __name__ == "__main__":
    unittest.main()
