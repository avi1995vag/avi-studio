"""Authenticated media delivery and a durable GitHub publication ledger."""

import base64
import json
import os
import re
import time
from datetime import datetime, timezone

import requests


def setting(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise RuntimeError(f'Missing required setting {name}.')
    return value


def api(method, url, stage, *, allowed_missing=False, **kwargs):
    try:
        response = requests.request(method, url, timeout=(8, 35), **kwargs)
        if allowed_missing and response.status_code == 404:
            return None
        if not response.ok:
            raise RuntimeError(f'{stage} returned HTTP {response.status_code}.')
        data = response.json()
        if not isinstance(data, dict) or data.get('error'):
            raise RuntimeError(f'{stage} returned an API error.')
        return data
    except (requests.RequestException, ValueError):
        raise RuntimeError(f'{stage} request did not return a usable response.') from None


def identifier(result, stage):
    value = result.get('id')
    if not isinstance(value, str) or not value.isdecimal():
        raise RuntimeError(f'{stage} did not return a media ID.')
    return value


class GitHubHistory:
    branch = 'autopilot-history'
    filename = 'automation-history.json'

    @classmethod
    def from_environment(cls):
        return cls(setting('GITHUB_REPOSITORY'), setting('GITHUB_SHA'), setting('GITHUB_RUN_ID'), setting('GH_TOKEN'))

    def __init__(self, repository, commit, run_id, token):
        self.root = f'https://api.github.com/repos/{repository}'
        self.headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json'}
        self.run_id = run_id
        ref = self.call('GET', f'/git/ref/heads/{self.branch}', allowed_missing=True)
        if ref is None:
            self.call('POST', '/git/refs', json={'ref': f'refs/heads/{self.branch}', 'sha': commit})
        file = self.call('GET', f'/contents/{self.filename}', params={'ref': self.branch}, allowed_missing=True)
        self.sha = None
        self.entries = {}
        if file is not None:
            try:
                self.sha = file['sha']
                self.entries = json.loads(base64.b64decode(file['content']))
                if not isinstance(self.entries, dict) or any(
                    not isinstance(entry, dict) or entry.get('status') not in {'pending', 'published'}
                    or not isinstance(entry.get('article'), str) for entry in self.entries.values()
                ):
                    raise ValueError('Invalid history entries.')
            except (KeyError, ValueError, TypeError):
                raise RuntimeError('Cannot decode publication history. Inspect the history branch.') from None

    def call(self, method, path, **kwargs):
        return api(method, self.root + path, 'GitHub publication history', headers=self.headers, **kwargs)

    @property
    def has_run(self):
        return self.run_id in self.entries

    def contains(self, article):
        return any(entry['article'] == article for entry in self.entries.values())

    def save(self, message):
        data = {
            'branch': self.branch, 'message': message,
            'content': base64.b64encode(json.dumps(self.entries, indent=2).encode()).decode(),
        }
        if self.sha:
            data['sha'] = self.sha
        result = self.call('PUT', f'/contents/{self.filename}', json=data)
        self.sha = result['content']['sha']

    def reserve(self, article, container):
        if self.has_run or self.contains(article):
            raise RuntimeError('This story or run already has a publication reservation.')
        self.entries[self.run_id] = {
            'article': article, 'container': container, 'status': 'pending',
            'reserved_at': datetime.now(timezone.utc).isoformat(),
        }
        self.save(f'Reserve AvI publication {self.run_id}')

    def complete(self, post):
        self.entries[self.run_id].update(status='published', post=post)
        self.save(f'Record AvI publication {self.run_id}')


class InstagramPublisher:
    @classmethod
    def from_environment(cls):
        version = os.environ.get('META_API_VERSION') or 'v24.0'
        if not re.fullmatch(r'v\d+\.\d+', version):
            raise ValueError('Invalid META_API_VERSION.')
        account = setting('INSTAGRAM_BUSINESS_ID')
        cloud = setting('CLOUDINARY_CLOUD_NAME')
        if not account.isdecimal() or not re.fullmatch(r'[A-Za-z0-9_-]+', cloud):
            raise ValueError('Invalid Instagram account ID or Cloudinary cloud name.')
        return cls(version, account, setting('META_ACCESS_TOKEN'), cloud,
                   setting('CLOUDINARY_API_KEY'), setting('CLOUDINARY_API_SECRET'))

    def __init__(self, version, account, token, cloud, cloud_key, cloud_secret):
        self.graph = f'https://graph.facebook.com/{version}'
        self.account = account
        self.headers = {'Authorization': f'Bearer {token}'}
        self.upload_url = f'https://api.cloudinary.com/v1_1/{cloud}/image/upload'
        self.cloud_auth = (cloud_key, cloud_secret)

    def upload(self, path, public_id):
        with path.open('rb') as image:
            result = api('POST', self.upload_url, 'Cloudinary upload',
                         auth=self.cloud_auth, data={'public_id': public_id, 'overwrite': 'true'},
                         files={'file': (path.name, image, 'image/jpeg')})
        url = result.get('secure_url')
        if not isinstance(url, str) or not url.startswith('https://'):
            raise RuntimeError('Cloudinary did not return a public HTTPS image URL.')
        return url

    def graph_call(self, method, path, stage, **kwargs):
        return api(method, f'{self.graph}/{path}', stage, headers=self.headers, **kwargs)

    def wait_ready(self, container):
        for _ in range(12):
            status = self.graph_call('GET', container, 'Instagram processing check',
                                     params={'fields': 'status_code'}).get('status_code')
            if status == 'FINISHED':
                return
            if status != 'IN_PROGRESS':
                raise RuntimeError(f'Instagram container {container} did not reach a publishable state.')
            time.sleep(5)
        raise RuntimeError(f'Instagram container {container} is still processing after one minute.')

    def prepare(self, images, caption, batch_id):
        media_path = f'{self.account}/media'
        children = []
        for image in images:
            url = self.upload(image, f'avi-studio/{batch_id}/{image.stem}')
            result = self.graph_call('POST', media_path, 'Instagram child creation',
                                     data={'image_url': url, 'is_carousel_item': 'true'})
            children.append(identifier(result, 'Instagram child creation'))
        parent = self.graph_call('POST', media_path, 'Instagram carousel creation',
                                 data={'media_type': 'CAROUSEL', 'children': ','.join(children), 'caption': caption})
        container = identifier(parent, 'Instagram carousel creation')
        self.wait_ready(container)
        return container

    def publish(self, container):
        try:
            result = self.graph_call('POST', f'{self.account}/media_publish', 'Instagram publish',
                                     data={'creation_id': container})
            return identifier(result, 'Instagram publish')
        except RuntimeError as error:
            raise RuntimeError(f'{error} Reservation retained for container {container}; verify its status before clearing it.') from None
