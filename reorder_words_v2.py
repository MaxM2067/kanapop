import re
import traceback

# Small kana that combine with preceding character to form 1 mora
SMALL_KANA = set(['ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 
                  'ャ', 'ュ', 'ョ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ'])

def count_morae(kana):
    count = 0
    # Special handling: 'tsu' small (っ) is a full mora.
    # 'ya', 'yu', 'yo' small are not.
    # We iterate and if we see a small kana (that isn't tsu), we assume it merged with previous.
    # Actually, simpler:
    # 1. Count ALL chars.
    # 2. Subtract 1 for every small kana (except tsu).
    
    length = len(kana)
    subtract = 0
    for char in kana:
        if char in SMALL_KANA:
            subtract += 1
    return length - subtract

def parse_line(line):
    # Looking for { ... }
    match = re.search(r'({.*?})', line)
    if not match:
        return None, None
    
    obj_str = match.group(1)
    
    # Extract comment if any
    # content after the object, check for //
    rest = line[match.end():]
    comment = ""
    comment_match = re.search(r'//.*', rest)
    if comment_match:
        comment = comment_match.group(0).strip()
    
    # Parse object
    item = {}
    fields = re.finditer(r'(\w+):\s*([\'"])(.*?)\2|(\w+):\s*(\d+)', obj_str)
    for f in fields:
        if f.group(1):
            item[f.group(1)] = f.group(3)
        elif f.group(4):
            item[f.group(4)] = int(f.group(5))
            
    return item, comment

def process_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    
    # Header lines until export const WORDS
    in_array = False
    items = []
    
    header_buffer = []
    footer_buffer = []
    
    for line in lines:
        if "export const WORDS: Word[] = [" in line:
            in_array = True
            header_buffer.append(line)
            continue
        
        if in_array:
            if line.strip() == "];":
                in_array = False
                footer_buffer.append(line)
                continue
            
            if line.strip().startswith("//") and "Morae" in line:
                # Skip section headers, we will regenerate them
                continue
                
            if line.strip() == "":
                continue

            # Parse object line
            try:
                item, comment = parse_line(line)
                if item:
                    # Fix missing 'en'
                    if 'en' not in item and item.get('id') == 'ukeru3':
                         item['en'] = 'To receive'
                    
                    # Recalculate morae
                    if 'kana' in item:
                        item['morae'] = count_morae(item['kana'])
                    
                    items.append({'data': item, 'comment': comment})
            except Exception as e:
                print(f"Error processing line: {line.strip()}")
                raise e
        else:
            if len(items) == 0:
                header_buffer.append(line)
            else:
                footer_buffer.append(line)

    # Sort items by morae
    # We want to keep original relative order for stability
    # Python sort is stable
    items.sort(key=lambda x: x['data']['morae'])
    
    # Reconstruct
    output = []
    output.extend(header_buffer)
    
    current_morae = -1
    
    for entry in items:
        m = entry['data']['morae']
        if m != current_morae:
            current_morae = m
            output.append(f"    // {m} Morae\n")
        
        item = entry['data']
        # Reconstruct line
        # { id: 'neko', kana: 'ねこ', romaji: 'neko', kanji: '猫', en: 'Cat', morae: 2 },
        # We need to preserve quotes? Single quotes usually.
        
        line_str = f"    {{ id: '{item['id']}', kana: '{item['kana']}', romaji: '{item['romaji']}', kanji: '{item['kanji']}', en: '{item['en']}', morae: {item['morae']} }},"
        
        if entry['comment']:
            line_str += f" {entry['comment']}"
        
        output.append(line_str + "\n")

    output.extend(footer_buffer)
    
    return "".join(output)

if __name__ == "__main__":
    file_path = "/Users/userm/Documents/Vibe Coding/kanapop/words.ts"
    try:
        new_content = process_file(file_path)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print("Successfully reordered words.ts with comments preserved")
    except Exception as e:
        print(f"Error: {e}")
        traceback.print_exc()
