"""Fetch and normalize the feed catalog shared by the studio and publisher."""

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from urllib.parse import urlsplit

import requests
from xml.etree import ElementTree

SOURCES = json.loads((Path(__file__).parent / 'assets/sources.json').read_text(encoding='utf-8'))
LOG = logging.getLogger(__name__)


def web_url(value):
    try:
        url = urlsplit(value)
        return value if url.scheme in ('http', 'https') and url.hostname and url.username is None else ''
    except ValueError:
        return ''


def plain(value):
    return ' '.join(unescape(re.sub(r'<[^>]+>', ' ', value or '')).split())


class FeedTreeBuilder(ElementTree.TreeBuilder):
    def doctype(self, name, public_id, system_id):
        raise ValueError('DTD declarations are disabled for feeds.')


def parse_feed(data):
    parser = ElementTree.XMLParser(target=FeedTreeBuilder())
    root = ElementTree.fromstring(data, parser=parser)
    channel = root.find('channel')
    if channel is None:
        channel = root
    atom = {'a': 'http://www.w3.org/2005/Atom'}
    items = channel.findall('item') or channel.findall('a:entry', atom)
    title = channel.findtext('title') or channel.findtext('a:title', namespaces=atom) or 'News'
    result = []
    for item in items[:15]:
        headline = plain(item.findtext('title') or item.findtext('a:title', namespaces=atom))
        link = item.findtext('link') or ''
        if not link:
            for candidate in item.findall('a:link', atom):
                if candidate.get('rel', 'alternate') == 'alternate':
                    link = candidate.get('href', '')
                    break
        link = web_url(link.strip())
        if not headline or not link:
            continue
        description = item.findtext('description') or item.findtext('a:summary', namespaces=atom) or ''
        image = ''
        for media in list(item):
            if media.tag.endswith('}thumbnail') or (media.tag.endswith('}content') and media.get('medium') == 'image') or media.get('type', '').startswith('image/'):
                image = web_url(media.get('url', ''))
                if image:
                    break
        if not image:
            match = re.search(r'<img\b[^>]*\bsrc=["\']([^"\']+)', description, re.I)
            if match:
                image = web_url(unescape(match[1]))
        result.append({
            'title': headline[:500], 'link': link, 'description': plain(description)[:1800],
            'pubDate': item.findtext('pubDate') or item.findtext('a:updated', namespaces=atom) or '',
            'source': plain(item.findtext('source') or title)[:120], 'extractedImage': image,
        })
    return result


def fetch_feed(url):
    try:
        with requests.get(url, headers={'User-Agent': 'AvIStudio/1.0 (RSS reader)'}, timeout=(5, 10), stream=True) as response:
            response.raise_for_status()
            data = bytearray()
            for chunk in response.iter_content(65536):
                data.extend(chunk)
                if len(data) > 3_000_000:
                    raise ValueError('Feed exceeds 3 MB')
        return parse_feed(data)
    except (requests.RequestException, ValueError, ElementTree.ParseError) as error:
        LOG.warning('Feed unavailable for %s (%s)', urlsplit(url).hostname, type(error).__name__)
        return []


def snapshot():
    urls = list(dict.fromkeys(url for sources in SOURCES.values() for url in sources))
    with ThreadPoolExecutor(max_workers=8) as pool:
        feeds = dict(zip(urls, pool.map(fetch_feed, urls)))
    return {'updatedAt': datetime.now(timezone.utc).isoformat(), 'feeds': {url: rows for url, rows in feeds.items() if rows}}
