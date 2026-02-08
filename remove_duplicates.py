#!/usr/bin/env python3
"""Remove duplicate words by romaji from words.ts, keeping only the first occurrence."""

import re

# Read the file
with open('/Users/userm/Documents/Vibe Coding/kanapop/words.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all word entries
word_pattern = re.compile(r"(\s*\{ id: '[^']+', kana: '[^']+', romaji: '([^']+)', kanji: '[^']+', en: '[^']+', morae: \d+ \},?)")

seen_romaji = set()
duplicates = []

def replace_duplicate(match):
    full_match = match.group(0)
    romaji = match.group(2)
    
    if romaji in seen_romaji:
        duplicates.append(romaji)
        # Return empty string with proper newline handling
        return ''
    else:
        seen_romaji.add(romaji)
        return full_match

# Replace duplicates
new_content = word_pattern.sub(replace_duplicate, content)

# Clean up empty lines
new_content = re.sub(r'\n\s*\n\s*\n', '\n\n', new_content)

# Write back
with open('/Users/userm/Documents/Vibe Coding/kanapop/words.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Removed {len(duplicates)} duplicate entries:")
for r in sorted(set(duplicates)):
    count = duplicates.count(r)
    print(f"  {r}: {count} duplicate(s)")
print(f"\nTotal unique romaji values kept: {len(seen_romaji)}")
