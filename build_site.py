"""Assemble the public GitHub Pages artifact."""

import argparse
import json
import os
import shutil
from pathlib import Path

from feeds import snapshot

ROOT = Path(__file__).resolve().parent


def build(output, offline):
    output.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'index.html', output / 'index.html')
    shutil.copytree(ROOT / 'assets', output / 'assets', dirs_exist_ok=True)
    data = {'updatedAt': None, 'feeds': {}} if offline else snapshot()
    (output / 'feeds.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    (output / 'site.json').write_text(json.dumps({
        'repository': os.environ.get('GITHUB_REPOSITORY', ''),
        'scheduleMode': os.environ.get('AUTOPILOT_SCHEDULE') or 'off',
        'publishEnabled': os.environ.get('PUBLISH_ENABLED') == 'true',
    }), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '_site')
    parser.add_argument('--offline', action='store_true', help='Build the studio without fetching feeds.')
    args = parser.parse_args()
    build(args.output, args.offline)
