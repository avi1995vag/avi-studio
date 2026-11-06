from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from PIL import Image

from article_photo import PUBLISHERS, SharePhoto, save_article_photo, validate_url


class ArticlePhotoTests(unittest.TestCase):
    def test_metadata_prefers_secure_publisher_image(self):
        parser = SharePhoto()
        parser.feed('<meta name="twitter:image" content="https://example.net/fallback.jpg">'
                    '<meta property="og:image" content="/image.jpg">'
                    '<meta property="og:image:secure_url" content="/large.jpg">')
        self.assertEqual(parser.urls('https://www.indiatoday.in/world/story'), [
            'https://www.indiatoday.in/large.jpg',
            'https://www.indiatoday.in/image.jpg',
            'https://example.net/fallback.jpg',
        ])

    def test_public_publisher_hosts_only(self):
        validate_url('https://www.indiatoday.in/world/story', PUBLISHERS)
        for link in ('https://indiatoday.in.example.net/path', 'https://user@indiatoday.in/path',
                     'http://indiatoday.in/path', 'https://indiatoday.in:444/path', 'https://127.0.0.1/path'):
            with self.subTest(link=link), self.assertRaises(ValueError):
                validate_url(link, PUBLISHERS)

    def test_workflow_writes_decoded_jpeg_with_attribution(self):
        article = 'https://www.indiatoday.in/world/story'
        photo = 'https://images.indiatoday.in/portrait.png'
        buffer = BytesIO()
        Image.new('RGB', (200, 160), '#345678').save(buffer, 'PNG')
        with TemporaryDirectory(dir=Path.cwd()) as directory:
            output = Path(directory)
            with patch('article_photo.get_public', side_effect=[
                (f'<meta property="og:image" content="{photo}">'.encode(), article, 'utf-8'),
                (buffer.getvalue(), photo, None),
            ]):
                save_article_photo(article, output)
            with Image.open(output / 'article-photo.jpg') as decoded:
                self.assertEqual((decoded.format, decoded.size), ('JPEG', (200, 160)))
            self.assertIn(photo, (output / 'source.txt').read_text(encoding='utf-8'))
