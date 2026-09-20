#!/usr/bin/env python3
"""Fix double-encoded UTF-8 (mojibake) in Next.js source files.

Pattern: 'é' (UTF-8: C3 A9) was stored as Latin-1 ('Ã©') then encoded as UTF-8
resulting in 'C3 83 C2 A9'. We need to detect this 4-byte sequence and
replace with the correct 2-byte UTF-8.
"""
import os
import sys
import glob

# Mojibake 4-byte sequence -> correct 2-byte UTF-8
FIXES = {
    # Lowercase
    b'\xc3\x83\xc2\xa9': b'\xc3\xa9',  # é
    b'\xc3\x83\xc2\xa8': b'\xc3\xa8',  # è
    b'\xc3\x83\xc2\xa0': b'\xc3\xa0',  # à
    b'\xc3\x83\xc2\xa2': b'\xc3\xa2',  # â
    b'\xc3\x83\xc2\xae': b'\xc3\xae',  # î
    b'\xc3\x83\xc2\xb9': b'\xc3\xb9',  # ù
    b'\xc3\x83\xc2\xab': b'\xc3\xab',  # ë
    b'\xc3\x83\xc2\xaf': b'\xc3\xaf',  # ï
    b'\xc3\x83\xc2\xb1': b'\xc3\xb1',  # ñ
    b'\xc3\x83\xc2\xa7': b'\xc3\xa7',  # ç
    b'\xc3\x83\xc2\xb4': b'\xc3\xb4',  # ô
    b'\xc3\x83\xc2\xbb': b'\xc3\xbb',  # û
    b'\xc3\x83\xc2\x97': b'\xc3\x97',  # ×
    # Uppercase
    b'\xc3\x83\xc2\x89': b'\xc3\x89',  # É
    b'\xc3\x83\xc2\x88': b'\xc3\x88',  # È
    b'\xc3\x83\xc2\x80': b'\xc3\x80',  # À
    b'\xc3\x83\xc2\x82': b'\xc3\x82',  # Â
    b'\xc3\x83\xc2\x8e': b'\xc3\x8e',  # Î
    b'\xc3\x83\xc2\x99': b'\xc3\x99',  # Ù
    b'\xc3\x83\xc2\x8b': b'\xc3\x8b',  # Ë
    b'\xc3\x83\xc2\x87': b'\xc3\x87',  # Ç
    b'\xc3\x83\xc2\x94': b'\xc3\x94',  # Ô
    b'\xc3\x83\xc2\x9b': b'\xc3\x9b',  # Û
}

ROOT = r"C:\Users\jaoua\.minimax-agent\projects\erp-saas-audit\erp-saas-main"

total_fixed = 0
files_fixed = 0

for pattern in ['app/**/*.tsx', 'lib/**/*.ts']:
    for filepath in glob.glob(os.path.join(ROOT, pattern), recursive=True):
        with open(filepath, 'rb') as f:
            data = f.read()

        original = data
        file_changes = 0

        for mojibake, correct in FIXES.items():
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
