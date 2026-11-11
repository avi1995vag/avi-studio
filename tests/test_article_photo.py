import json
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from PIL import Image

from article_photo import PUBLISHERS, SharePhoto, enrich_feed_metadata, save_article_photo, validate_url


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

    def test_feed_enrichment_keeps_existing_photo_and_ignores_unknown_publishers(self):
        good = {'link':'https://indiatoday.in/story/1','description':'Short','extractedImage':''}
        existing = {'link':'https://indiatoday.in/story/2','description':'Short','extractedImage':'https://example.com/existing.jpg'}
        unknown = {'link':'https://example.com/story','description':'Short','extractedImage':''}
        snapshot = {'feeds': {'fixture':[good,existing,unknown]}}
        excerpt = 'An exact publisher excerpt contains enough words for an editor to write a useful short poster.'
        photo = 'https://images.indiatoday.in/photo.jpg'
        with patch('article_photo.public_article_metadata', return_value=(excerpt,[photo])) as read:
            enrich_feed_metadata(snapshot)
        self.assertEqual(read.call_count, 2)
        self.assertEqual((good['description'],good['extractedImage']), (excerpt,photo))
        self.assertEqual(existing['extractedImage'], 'https://example.com/existing.jpg')
        self.assertEqual(unknown['extractedImage'], '')

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

    def test_article_draft_keeps_source_copy_when_photo_is_blocked(self):
        article = 'https://www.indiatoday.in/world/story'
        page = (b'<script type="application/ld+json">{"@type":"NewsArticle",'
                b'"headline":"Publisher headline","articleBody":"The publisher supplied these details."}'
                b'</script>')
        with TemporaryDirectory(dir=Path.cwd()) as directory:
            output = Path(directory)
            with patch('article_photo.get_public', return_value=(page, article, 'utf-8')):
                save_article_photo(article, output, draft=True)
            draft = json.loads((output / 'draft.json').read_text(encoding='utf-8'))
        self.assertEqual(draft['source']['link'], article)
        self.assertEqual(draft['slides'][0]['title'], 'Publisher headline')
        self.assertEqual(draft['slides'][0]['body'], 'The publisher supplied these details.')
        self.assertEqual(draft['slides'][0]['image'], '')
