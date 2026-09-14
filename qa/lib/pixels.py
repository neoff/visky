#!/usr/bin/env python3
"""Measure the mini player's progress bar in a screenshot.

Case C2 claims the divider under the collapsed mini player fills as the track
plays. "Looks longer" is not a result, so this counts the pixels: how many of
them, on the brightest row of the app's accent colour, actually belong to the
bar.

No Pillow on this machine, so the PNG is decoded here — 8-bit RGB/RGBA,
non-interlaced, which is what both `simctl io screenshot` and `adb screencap`
produce. Anything else is rejected loudly rather than guessed at.

    python3 qa/lib/pixels.py shot.png            # JSON for one screenshot
    python3 qa/lib/pixels.py before.png after.png  # ...and whether it grew
"""
import json
import sys
import zlib

# colors.primary in app/src/constants/index.ts — the fill; the track behind it
# is white at 22%, which is nowhere near this hue.
PRIMARY = (0xFC, 0x3C, 0x44)
TOLERANCE = 28


def read_png(path):
    data = open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise SystemExit(f'{path}: not a PNG')

    pos, idat, meta = 8, bytearray(), None
    while pos < len(data):
        length = int.from_bytes(data[pos:pos + 4], 'big')
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if kind == b'IHDR':
            width = int.from_bytes(body[0:4], 'big')
            height = int.from_bytes(body[4:8], 'big')
            depth, colour, _, _, interlace = body[8:13]
            meta = (width, height, depth, colour, interlace)
        elif kind == b'IDAT':
            idat += body
        elif kind == b'IEND':
            break
        pos += 12 + length

    width, height, depth, colour, interlace = meta
    if depth != 8 or colour not in (2, 6) or interlace != 0:
        raise SystemExit(f'{path}: unsupported PNG (depth {depth}, colour {colour}, interlace {interlace})')

    channels = 3 if colour == 2 else 4
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    out = bytearray(height * stride)
    previous = bytearray(stride)
    at = 0
    for y in range(height):
        filter_type = raw[at]
        at += 1
        line = bytearray(raw[at:at + stride])
        at += stride
        # PNG's five per-scanline filters, undone in place.
        for x in range(stride):
            left = line[x - channels] if x >= channels else 0
            up = previous[x]
            up_left = previous[x - channels] if x >= channels else 0
            value = line[x]
            if filter_type == 1:
                value += left
            elif filter_type == 2:
                value += up
            elif filter_type == 3:
                value += (left + up) // 2
            elif filter_type == 4:
                p = left + up - up_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
                value += left if (pa <= pb and pa <= pc) else (up if pb <= pc else up_left)
            line[x] = value & 0xFF
        out[y * stride:(y + 1) * stride] = line
        previous = line
    return width, height, channels, out


def measure(path):
    width, height, channels, pixels = read_png(path)
    best = {'row': None, 'count': 0, 'left': None, 'right': None}

    # Only the bottom third: the mini player is docked above the tab bar, and
    # the accent colour also paints hearts and the active row's title further up.
    for y in range(height * 2 // 3, height):
        row = y * width * channels
        count, left, right = 0, None, None
        for x in range(width):
            at = row + x * channels
            r, g, b = pixels[at], pixels[at + 1], pixels[at + 2]
            if abs(r - PRIMARY[0]) <= TOLERANCE and abs(g - PRIMARY[1]) <= TOLERANCE and abs(b - PRIMARY[2]) <= TOLERANCE:
                count += 1
                left = x if left is None else left
                right = x
        if count > best['count']:
            best = {'row': y, 'count': count, 'left': left, 'right': right}

    return {'file': path, 'width': width, 'height': height, **best}


def main():
    if len(sys.argv) == 2:
        print(json.dumps(measure(sys.argv[1]), indent=2))
        return

    if len(sys.argv) == 3:
        before, after = measure(sys.argv[1]), measure(sys.argv[2])
        grew = after['count'] > before['count']
        print(json.dumps({'before': before, 'after': after, 'grew': grew}, indent=2))
        raise SystemExit(0 if grew else 1)

    raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
