#!/usr/bin/env python3
"""Generic fix for double-encoded UTF-8 (mojibake) in Next.js source files.

The pattern: a Latin-1 byte 0x80-0xFF was encoded as UTF-8 by accident.
Recovery: replace C3 83 [encoded form of byte XX] with C3 XX.

Forms of encoded byte XX (XX >= 0x80):
  - C2 XX (for XX in 0x80-0xBF)
  - C3 80 (for XX = 0xC0, encoded as Latin-1 then UTF-8 — actually this never happens)
  - For XX >= 0xC0: as Windows-1252, mapped to UTF-8 multi-byte:
    - 0x80 = € (U+20AC) = E2 82 AC
    - 0x82 = ‚ = E2 80 9A
    - 0x83 = ƒ = C6 92
    - 0x84 = „ = E2 80 9E
    - 0x85 = … = E2 80 A6
    - 0x86 = † = E2 80 A0
    - 0x87 = ‡ = E2 80 A1
    - 0x88 = ˆ = CB 88
    - 0x89 = ‰ = E2 80 B0
    - 0x8A = Š = C5 A0
    - 0x8B = ‹ = E2 80 B9
    - 0x8C = Œ = C5 92
    - 0x8E = Ž = C5 BD
    - 0x91 = ‘ = E2 80 98
    - 0x92 = ’ = E2 80 99
    - 0x93 = “ = E2 80 9C
    - 0x94 = ” = E2 80 9D
    - 0x95 = • = E2 80 A2
    - 0x96 = – = E2 80 93
    - 0x97 = — = E2 80 94
    - 0x98 = ˜ = CB 9C
    - 0x99 = ™ = E2 84 A2
    - 0x9A = š = C5 A1
    - 0x9B = › = E2 80 BA
    - 0x9C = œ = C5 93
    - 0x9E = ž = C5 BE
    - 0x9F = Ÿ = C5 B8
"""
import os
import sys
import glob
import re

# Map of Windows-1252 byte (0x80-0xFF) -> UTF-8 bytes that represent it when interpreted as Latin-1 then re-encoded
WIN1252_TO_UTF8 = {
    0x80: b'\xe2\x82\xac',  # €
    0x81: b'',  # (undefined in Win-1252)
    0x82: b'\xe2\x80\x9a',  # ‚
    0x83: b'\xc6\x92',  # ƒ
    0x84: b'\xe2\x80\x9e',  # „
    0x85: b'\xe2\x80\xa6',  # …
    0x86: b'\xe2\x80\xa0',  # †
    0x87: b'\xe2\x80\xa1',  # ‡
    0x88: b'\xcb\x88',  # ˆ
    0x89: b'\xe2\x80\xb0',  # ‰
    0x8A: b'\xc5\xa0',  # Š
    0x8B: b'\xe2\x80\xb9',  # ‹
    0x8C: b'\xc5\x92',  # Œ
    0x8D: b'',  # (undefined)
    0x8E: b'\xc5\xbd',  # Ž
    0x8F: b'',  # (undefined)
    0x90: b'',  # (undefined)
    0x91: b'\xe2\x80\x98',  # ‘
    0x92: b'\xe2\x80\x99',  # ’
    0x93: b'\xe2\x80\x9c',  # “
    0x94: b'\xe2\x80\x9d',  # ”
    0x95: b'\xe2\x80\xa2',  # •
    0x96: b'\xe2\x80\x93',  # –
    0x97: b'\xe2\x80\x94',  # —
    0x98: b'\xcb\x9c',  # ˜
    0x99: b'\xe2\x84\xa2',  # ™
    0x9A: b'\xc5\xa1',  # š
    0x9B: b'\xe2\x80\xba',  # ›
    0x9C: b'\xc5\x93',  # œ
    0x9D: b'',  # (undefined)
    0x9E: b'\xc5\xbe',  # ž
    0x9F: b'\xc5\xb8',  # Ÿ
    # 0xA0-0xBF: in Latin-1 = U+00A0-U+00BF, UTF-8 = C2 A0-C2 BF
    0xA0: b'\xc2\xa0',
    0xA1: b'\xc2\xa1',
    0xA2: b'\xc2\xa2',
    0xA3: b'\xc2\xa3',
    0xA4: b'\xc2\xa4',
    0xA5: b'\xc2\xa5',
    0xA6: b'\xc2\xa6',
    0xA7: b'\xc2\xa7',
    0xA8: b'\xc2\xa8',
    0xA9: b'\xc2\xa9',
    0xAA: b'\xc2\xaa',
    0xAB: b'\xc2\xab',
    0xAC: b'\xc2\xac',
    0xAD: b'\xc2\xad',
    0xAE: b'\xc2\xae',
    0xAF: b'\xc2\xaf',
    0xB0: b'\xc2\xb0',
    0xB1: b'\xc2\xb1',
    0xB2: b'\xc2\xb2',
    0xB3: b'\xc2\xb3',
    0xB4: b'\xc2\xb4',
    0xB5: b'\xc2\xb5',
    0xB6: b'\xc2\xb6',
    0xB7: b'\xc2\xb7',
    0xB8: b'\xc2\xb8',
    0xB9: b'\xc2\xb9',
    0xBA: b'\xc2\xba',
    0xBB: b'\xc2\xbb',
    0xBC: b'\xc2\xbc',
    0xBD: b'\xc2\xbd',
    0xBE: b'\xc2\xbe',
    0xBF: b'\xc2\xbf',
    # 0xC0-0xFF: in Latin-1 = U+00C0-U+00FF, UTF-8 = C3 80-C3 BF
    # So byte 0xC0 = U+00C0 = UTF-8 C3 80, etc.
    # After mojibake: C3 83 [C3 80-C3 BF] -> should be C3 [80-BF]
}

ROOT = r"C:\Users\jaoua\.minimax-agent\projects\erp-saas-audit\erp-saas-main"

# Build the mapping: (C3 83 <encoded>) -> (C3 <byte>)
MOJIBAKE_TO_CORRECT = {}
for byte_val, encoded in WIN1252_TO_UTF8.items():
    if encoded:
        mojibake = b'\xc3\x83' + encoded
        correct = bytes([0xC3, byte_val])
        MOJIBAKE_TO_CORRECT[mojibake] = correct

total_fixed = 0
files_fixed = 0

for pattern in ['app/**/*.tsx', 'app/**/*.ts', 'lib/**/*.ts', 'lib/**/*.tsx']:
    for filepath in glob.glob(os.path.join(ROOT, pattern), recursive=True):
        with open(filepath, 'rb') as f:
            data = f.read()

        original = data
        file_changes = 0

        for mojibake, correct in MOJIBAKE_TO_CORRECT.items():
            count = data.count(mojibake)
            if count > 0:
                data = data.replace(mojibake, correct)
                file_changes += count

        if data != original:
            with open(filepath, 'wb') as f:
                f.write(data)
            rel = os.path.relpath(filepath, ROOT)
            print(f"Fixed {file_changes} bytes in: {rel}")
            total_fixed += file_changes
            files_fixed += 1

print(f"\n=== TOTAL: {total_fixed} mojibake bytes fixed across {files_fixed} files ===")
