import unittest
from unittest.mock import patch

from feeds import parse_feed
from main import article_key, has_context, render, sample_payload, validate
from publisher import GitHubHistory, InstagramPublisher


class PipelineTests(unittest.TestCase):
    def test_rss_normalizes_text_and_attribution(self):
        rows = parse_feed(b"""<rss xmlns:media="http://search.yahoo.com/mrss/"><channel>
          <title>Example News</title><item><title>A &amp; B</title>
          <description><![CDATA[<p>News &amp; context</p>]]></description>
          <link>https://example.com/story</link><source>Original</source>
          <media:thumbnail url="https://example.com/frame.jpg"/>
          </item><item><title>Unsafe</title><link>javascript:alert(1)</link></item>
        </channel></rss>""")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['title'], 'A & B')
        self.assertEqual(rows[0]['description'], 'News & context')
        self.assertEqual(rows[0]['source'], 'Original')
        self.assertEqual(rows[0]['extractedImage'], 'https://example.com/frame.jpg')

    def test_feed_rejects_doctype(self):
        with self.assertRaises(ValueError):
            parse_feed(b'<!DOCTYPE rss [<!ENTITY item "no">]><rss>&item;</rss>')

    def test_sample_renders_at_export_size(self):
        payload = validate(sample_payload(5), 5)
        image = render(payload['slides'][0], 1, 5, 'AvI Studio', 'ink')
        self.assertEqual(image.size, (1080, 1350))
        self.assertNotEqual(image.getpixel((400, 200)), image.getpixel((0, 0)))
        with self.assertRaises(ValueError):
            validate(payload, 6)

    def test_article_key_normalizes_title(self):
        self.assertEqual(article_key({'title': ' The   Story! '}), article_key({'title': 'the story'}))

    def test_news_publish_requires_source_context(self):
        self.assertFalse(has_context({'title': 'One headline', 'description': 'One headline'}))
        source = 'A useful source paragraph gives readers the event timeline and identifies the people involved. It also states what was announced and how the information was confirmed.'
        self.assertTrue(has_context({'title': 'One headline', 'description': source}))
        self.assertNotEqual(article_key({'title':'ಕಲೆ'}), article_key({'title':'ಕಾಲ'}))

    def test_publish_reservation_blocks_duplicate_and_survives_reload(self):
        fake_repository = {}
        def call(method, path, **kwargs):
            if method == 'GET':
                return {} if path.startswith('/git/ref/') else fake_repository.get('file')
            data = kwargs['json']
            self.assertEqual(data['branch'], 'autopilot-history')
            fake_repository['file'] = {'content': data['content'], 'sha': 'abc'}
            return {'content': {'sha': 'abc'}}

        with patch.object(GitHubHistory, 'call', side_effect=call):
            original = GitHubHistory('owner/repo', 'commit', '42', 'test')
            original.reserve('fingerprint', '100')
            retried = GitHubHistory('owner/repo', 'commit', '42', 'test')
            self.assertTrue(retried.has_run)
            self.assertEqual(retried.entries['42']['status'], 'pending')
            different_run = GitHubHistory('owner/repo', 'commit', '43', 'test')
            self.assertTrue(different_run.contains('fingerprint'))
            with self.assertRaises(RuntimeError):
                different_run.reserve('fingerprint', '101')
            original.complete('200')
            result = GitHubHistory('owner/repo', 'commit', '42', 'test')
            self.assertEqual(result.entries['42']['post'], '200')

    def test_publish_request_is_not_retried_on_transport_failure(self):
        publisher = InstagramPublisher('v24.0', '10', 'token', 'cloud', 'key', 'secret')
        with patch.object(publisher, 'graph_call', side_effect=RuntimeError('Request failed.')) as graph:
            with self.assertRaisesRegex(RuntimeError, 'Reservation retained for container 100'):
                publisher.publish('100')
        graph.assert_called_once()


if __name__ == '__main__':
    unittest.main()
