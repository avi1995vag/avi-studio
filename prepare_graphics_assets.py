"""Stage the pinned map data and browser-only vision runtime for GitHub Pages."""
from hashlib import sha256
from pathlib import Path
from urllib.request import Request, urlopen
import sys


ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/'
ORT_REPO = 'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.0/'
ASSETS = {
    'world.geojson': (
        'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson',
        '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f',
    ),
    'u2netp.onnx': (
        'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
        '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
    ),
    'ort.wasm.min.js': (
        ORT + 'ort.wasm.min.js',
        '65e09376df69107e881b5c34d2d37aed333a366b6d941073ec518168e269b87d',
    ),
    'ort-wasm-simd-threaded.mjs': (
        ORT + 'ort-wasm-simd-threaded.mjs',
        '30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8',
    ),
    'ort-wasm-simd-threaded.wasm': (
        ORT + 'ort-wasm-simd-threaded.wasm',
        '71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4',
    ),
    'onnxruntime-license.txt': (
        ORT_REPO + 'LICENSE',
        '2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c',
    ),
    'onnxruntime-notices.txt': (
        ORT_REPO + 'ThirdPartyNotices.txt',
        'e9e90971a8e75a9a8ac0c6412e29c1202d079998389915aa485f46c816c3b4cc',
    ),
    'u2net-license.txt': (
        'https://raw.githubusercontent.com/xuebinqin/U-2-Net/master/LICENSE',
        'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4',
    ),
}


def prepare(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for name, (url, expected) in ASSETS.items():
        path = output / name
        if path.is_file() and sha256(path.read_bytes()).hexdigest() == expected:
            continue
        request = Request(url, headers={'User-Agent': 'AvI-Studio-Pages-build'})
        with urlopen(request, timeout=45) as response:
            data = response.read(20_000_000)
        if sha256(data).hexdigest() != expected:
            raise ValueError(f'Checksum mismatch for {name}')
        path.write_bytes(data)
        print(f'Staged {name} ({len(data):,} bytes)')


if __name__ == '__main__':
    prepare(Path(sys.argv[1]))
