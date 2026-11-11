"""Retrieve a publisher's public share photo as a workflow artifact."""

import argparse
import base64
import json
import re
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests
from PIL import Image, ImageOps

# A fixed host list keeps the manual workflow from acting as a general network proxy.
PUBLISHERS = {
    'vijaykarnataka.com', 'vijaykarnataka.indiatimes.com', 'timesofindia.indiatimes.com',
    'economictimes.indiatimes.com', 'thehindu.com', 'bbc.com', 'bbc.co.uk', 'tv9kannada.com',
    'prajavani.net', 'kannadaprabha.com', 'indiatoday.in', 'abplive.com', 'timesnowworld.com',
}
PHOTO_HOSTS = PUBLISHERS | {
    'static.toiimg.com', 'timesofindia.indiatimes.com', 'img.etimg.com', 'img1.etimg.com',
    'th-i.thgim.com', 'ichef.bbci.co.uk', 'cf-images.assettype.com',
    'gumlet.assettype.com', 'images.tv9kannada.com', 'static.tv9kannada.com',
    'images.indiatoday.in', 'akm-img-a-in.tosshub.com', 'feeds.abplive.com',
    'images.news18.com', 'images.timesnownews.com', 'static.india.com',
}


class SharePhoto(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = {}
        self.text = {}
        self.structured = {}
        self.script = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'script' and attributes.get('type') == 'application/ld+json':
            self.script = []
        if tag == 'meta':
            key = (attributes.get('property') or attributes.get('name') or '').lower()
            url = attributes.get('content')
        elif tag == 'link' and (attributes.get('rel') or '').lower() == 'image_src':
            key, url = 'image_src', attributes.get('href')
        else:
            return
        if url and key in ('og:title', 'og:description', 'description', 'og:type'):
            self.text.setdefault(key, ' '.join(url.split()))
        if url and key in ('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image_src'):
            self.images.setdefault(key, url.strip())

    def handle_data(self, data):
        if self.script is not None:
            self.script.append(data)

    def handle_endtag(self, tag):
        if tag != 'script' or self.script is None:
            return
        script, self.script = ''.join(self.script), None
        if self.structured:
            return
        try:
            pending = [json.loads(script)]
        except ValueError:
            return
        while pending:
            node = pending.pop()
            if isinstance(node, list):
                pending.extend(reversed(node))
            elif isinstance(node, dict):
                types = node.get('@type', [])
                types = types if isinstance(types, list) else [types]
                if any(isinstance(item, str) and re.search(r'(?:^|/)(?:\w*NewsArticle|Article|BlogPosting)$', item, re.I) for item in types):
                    self.structured = node
                    return
                if '@graph' in node:
                    pending.append(node['@graph'])

    def urls(self, base):
        order = ('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image_src')
        urls = [self.images[key] for key in order if key in self.images]
        structured = self.structured.get('image')
        for candidate in (structured if isinstance(structured, list) else [structured]):
            if isinstance(candidate, dict):
                candidate = candidate.get('url') or candidate.get('contentUrl')
            if isinstance(candidate, str) and candidate:
                urls.append(candidate)
        return list(dict.fromkeys(urljoin(base, url) for url in urls))


def validate_url(url, hosts):
    parts = urlsplit(url)
    host = (parts.hostname or '').lower().removeprefix('www.')
    if (parts.scheme != 'https' or host not in hosts or parts.username is not None
            or parts.port not in (None, 443) or len(url) > 2048):
        raise ValueError('This link is outside the supported publisher or image hosts.')
    return url


def get_public(url, hosts, *, photo=False):
    for _ in range(5):
        validate_url(url, hosts)
        with requests.get(url, timeout=(5, 8), allow_redirects=False, stream=True,
                          headers={'User-Agent': 'AvIStudio/1.0 (article photo importer)'}) as response:
            if response.is_redirect:
                url = urljoin(url, response.headers['Location'])
                continue
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '').split(';')[0].lower()
            if photo and not content_type.startswith('image/'):
                raise ValueError('The publisher photo URL did not return an image.')
            if not photo and content_type not in {'text/html', 'application/xhtml+xml'}:
                raise ValueError('The publisher URL did not return an article page.')
            buffer = bytearray()
            limit = 15_000_000 if photo else 800_000
            for chunk in response.iter_content(16_384):
                buffer.extend(chunk)
                if len(buffer) > limit:
                    if photo:
                        raise ValueError('The publisher photo exceeds 15 MB.')
                    return bytes(buffer[:limit]), url, response.encoding
                if not photo and b'</head' in bytes(buffer[-len(chunk)-8:]).lower():
                    break
            return bytes(buffer), url, response.encoding
    raise ValueError('The publisher redirected too many times.')


def enrich_feed_metadata(snapshot):
    """Add public metadata for recent exact publisher links in the feed snapshot."""
    grouped = {}
    for items in snapshot['feeds'].values():
        for entry in items[:4]:
            link = entry.get('link', '')
            try:
                validate_url(link, PUBLISHERS)
            except ValueError:
                continue
            if len(entry.get('description', '').split()) >= 14 and entry.get('extractedImage'):
                continue
            grouped.setdefault(link, []).append(entry)
    with ThreadPoolExecutor(max_workers=8) as pool:
        selected = list(grouped)[:32]
        for link, metadata in zip(selected, pool.map(public_article_metadata, selected)):
            if not metadata:
                continue
            description, images = metadata
            for entry in grouped[link]:
                if len(description.split()) >= 12 and len(description) > len(entry.get('description', '')):
                    entry['description'] = description[:1000]
                if images and not entry.get('extractedImage'):
                    entry['extractedImage'] = images[0]
    return snapshot


def public_article_metadata(link):
    try:
        page, canonical, encoding = get_public(link, PUBLISHERS)
        original, final = urlsplit(link), urlsplit(canonical)
        if original.hostname.removeprefix('www.') != final.hostname.removeprefix('www.') or original.path.rstrip('/') != final.path.rstrip('/'):
            return None
        parser = SharePhoto()
        parser.feed(page.decode(encoding or 'utf-8', errors='replace'))
        if not parser.text.get('og:title'):
            return None
        description = parser.text.get('og:description') or parser.text.get('description', '')
        images = []
        for url in parser.urls(canonical):
            try:
                images.append(validate_url(url, PHOTO_HOSTS))
            except ValueError:
                continue
        return description, images
    except (requests.RequestException, ValueError, LookupError, KeyError):
        return None


def download_article_photo(parser, canonical):
    for candidate in parser.urls(canonical):
        try:
            data, photo_url, _ = get_public(candidate, PHOTO_HOSTS, photo=True)
            with Image.open(BytesIO(data), formats=('JPEG', 'PNG', 'WEBP', 'GIF', 'AVIF')) as image:
                if image.width * image.height > 24_000_000 or min(image.size) < 120:
                    continue
                art = ImageOps.exif_transpose(image).convert('RGB')
                art.thumbnail((2400, 2400))
        except (requests.RequestException, OSError, ValueError, Image.DecompressionBombError):
            continue
        return art, photo_url
    raise ValueError('No downloadable share photo was found on the supported publisher hosts.')


def save_article_photo(article, output, *, draft=False):
    page, canonical, encoding = get_public(article, PUBLISHERS)
    parser = SharePhoto()
    parser.feed(page.decode(encoding or 'utf-8', errors='replace'))
    output.mkdir(parents=True, exist_ok=True)
    title = clean_article_text(parser.structured.get('headline')) or parser.text.get('og:title', '')
    details = next((text for text in (
        clean_article_text(parser.structured.get('articleBody')),
        parser.text.get('og:description'),
        clean_article_text(parser.structured.get('description')),
        parser.text.get('description'),
    ) if text), '')
    make_draft = draft and title and details and title.casefold() != details.casefold()
    encoded_image = ''
    try:
        art, photo_url = download_article_photo(parser, canonical)
    except ValueError:
        if not make_draft:
            raise
        photo_url = ''
    else:
        art.save(output / 'article-photo.jpg', quality=93, optimize=True)
        if make_draft:
            art.thumbnail((1400, 1400))
            buffer = BytesIO()
            art.save(buffer, 'JPEG', quality=88, optimize=True)
            encoded_image = 'data:image/jpeg;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')
    (output / 'source.txt').write_text(f'Article: {canonical}\nPhoto: {photo_url}\n', encoding='utf-8')
    if make_draft:
        language = 'Kannada' if re.search(r'[\u0c80-\u0cff]', title + details) else 'English'
        item = {'version': 1, 'mode': 'poster', 'lang': language,
                'caption': f'{article_excerpt(title, 180)}\n\n{article_excerpt(details, 680)}\n\nSource: {canonical}',
                'source': {'link': canonical, 'kind': 'publisher-excerpt', 'name': urlsplit(canonical).hostname},
                'slides': [{'layout': 'news-card', 'title': article_excerpt(title, 180),
                            'body': article_excerpt(details, 235), 'image': encoded_image,
                            'photoSource': canonical if encoded_image else '',
                            'photoLabel': 'Publisher photo imported from the article.' if encoded_image else ''}]}
        (output / 'draft.json').write_text(json.dumps(item, ensure_ascii=False), encoding='utf-8')


def clean_article_text(value):
    return ' '.join(value.split()) if isinstance(value, str) else ''


def article_excerpt(text, limit):
    if len(text) <= limit:
        return text
    word_break = text.rfind(' ', 0, limit)
    return text[:word_break if word_break > limit // 2 else limit - 1].rstrip() + '…'


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--url', required=True)
    args.add_argument('--draft', action='store_true')
    args.add_argument('--output', type=Path, default=Path('output/article-photo'))
    options = args.parse_args()
    try:
        save_article_photo(options.url.strip(), options.output, draft=options.draft)
    except requests.RequestException as error:
        code = error.response.status_code if error.response is not None else 'unavailable'
        args.exit(1, f'The publisher could not be reached (HTTP {code}). Save the photo from the publisher page if it is available there.\n')
    except (OSError, ValueError) as error:
        args.exit(1, str(error) + '\n')
    files = ', '.join(path.name for path in sorted(options.output.iterdir()))
    print(f'Article artifact ready ({files}). Import draft.json when present or upload article-photo.jpg.')


if __name__ == '__main__':
    main()
