#!/usr/bin/env python3
"""Install your own GCash Receive Money QR as a QuestionForge static asset.

Usage:
    python configure_gcash_qr.py "C:\\Users\\You\\Downloads\\GCash-Receive-QR.png"

This QR will be included when the folder is distributed. No uploading, image
recognition, or payment transaction occurs. Please inspect it before sharing.
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / 'assets' / 'gcash-receive-qr.png'
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
MAX_SIZE = 2_000_000


def validate_png(path: Path) -> tuple[int, int]:
    if not path.exists() or not path.is_file():
        raise ValueError('The QR image file does not exist.')
    if not path.name.lower().endswith('.png'):
        raise ValueError('Please export/save the GCash receiving QR image as PNG (.png).')
    if path.stat().st_size > MAX_SIZE:
        raise ValueError('The image is over 2 MB. Use a smaller PNG.')
    with path.open('rb') as f:
        header = f.read(24)
    if len(header) < 24 or not header.startswith(PNG_SIGNATURE) or header[12:16] != b'IHDR':
        raise ValueError('Not a valid PNG image.')
    width, height = struct.unpack('>II', header[16:24])
    if width < 150 or height < 150 or width > 8192 or height > 8192:
        raise ValueError('QR image should be at least 150x150 pixels and reasonably sized.')
    return width, height


def main() -> int:
    parser = argparse.ArgumentParser(description='Bundle a personal GCash receiving QR in QuestionForge.')
    parser.add_argument('qr_image', type=Path, help='Path to a genuine GCash Receive Money PNG')
    parser.add_argument('--yes', action='store_true', help='Confirm that this QR is intended for public distribution')
    args = parser.parse_args()
    src = args.qr_image.expanduser().resolve()
    try:
        dimensions = validate_png(src)
    except ValueError as exc:
        parser.error(str(exc))
    print(f'Image: {src.name} ({dimensions[0]}x{dimensions[1]})')
    print('IMPORTANT: This QR will be included in the public QuestionForge extension.')
    print('It may reveal your GCash recipient details when someone scans it.')
    print('Confirm that it is your intended RECEIVE MONEY QR, not a PAY QR.')
    if not args.yes:
        response = input('Do you want to include this QR in the extension? Type YES: ').strip()
        if response != 'YES':
            print('Canceled. No file changed.')
            return 1
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    if src != TARGET.resolve():
        shutil.copyfile(src, TARGET)
    checksum = hashlib.sha256(TARGET.read_bytes()).hexdigest()
    (TARGET.parent / 'gcash-receive-qr.sha256').write_text(checksum + '\n', encoding='ascii')
    print(f'Installed: {TARGET}')
    print(f'Installed checksum: {TARGET.parent / "gcash-receive-qr.sha256"}')
    print('Open chrome://extensions and click Reload for QuestionForge.')
    print('Before sharing publicly, scan and confirm the recipient name/details yourself.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
