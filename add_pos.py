#!/usr/bin/env python3
"""
Script to add part of speech (pos) field to words.ts entries.
Categories:
- Verb: words describing actions (to eat, to run, to speak, etc.)
- Noun: objects, people, places, things
- Adjective: descriptive words (big, small, beautiful, etc.)
- Adverb: modifies verbs (quickly, slowly, already, etc.)
- Other: greetings, expressions, particles, etc.
"""
import re

# Define word patterns for categorization
VERBS = {
    'to eat', 'to drink', 'to sleep', 'to wake', 'to run', 'to walk', 'to go',
    'to come', 'to see', 'to look', 'to watch', 'to hear', 'to listen', 'to speak',
    'to talk', 'to say', 'to read', 'to write', 'to buy', 'to sell', 'to make',
    'to do', 'to work', 'to play', 'to study', 'to learn', 'to teach', 'to meet',
    'to wait', 'to think', 'to know', 'to understand', 'to remember', 'to forget',
    'to open', 'to close', 'to start', 'to stop', 'to begin', 'to end', 'to live',
    'to die', 'to sit', 'to stand', 'to swim', 'to fly', 'to sing', 'to dance',
    'to laugh', 'to cry', 'to smile', 'to love', 'to hate', 'to want', 'to need',
    'to use', 'to put', 'to take', 'to give', 'to receive', 'to send', 'to call',
    'to ask', 'to answer', 'to help', 'to enter', 'to exit', 'to return', 'to leave',
    'to arrive', 'to wait', 'to become', 'to get up', 'to wake up', 'to fall asleep',
    'to brush', 'to wash', 'to cook', 'to clean', 'to cut', 'to break', 'to fix',
    'to borrow', 'to lend', 'to throw', 'to catch', 'to push', 'to pull', 'to climb',
    'to rest', 'to travel', 'to drive', 'to ride', 'to wear', 'to change', 'to turn',
    'to decide', 'to choose', 'to try', 'to fail', 'to succeed', 'to win', 'to lose',
    'to pay', 'to save', 'to spend', 'to bake', 'to fry', 'to boil', 'to grill',
    'to search', 'to find', 'to lose', 'to miss', 'to pick', 'to drop', 'to hold',
    'to carry', 'to move', 'to shake', 'to touch', 'to hit', 'to kick', 'to fight',
    'to run away', 'to chase', 'to follow', 'to lead', 'to guide', 'to show',
    'to hide', 'to appear', 'to disappear', 'to exist', 'to believe', 'to doubt',
    'to hope', 'to wish', 'to dream', 'to plan', 'to prepare', 'to finish', 'to continue',
    'to check', 'to confirm', 'to correct', 'to mistake', 'to compare', 'to measure',
    'to count', 'to add', 'to subtract', 'to multiply', 'to divide', 'to calculate',
    'to draw', 'to paint', 'to create', 'to destroy', 'to build', 'to assemble',
    'to repair', 'to install', 'to remove', 'to replace', 'to connect', 'to disconnect',
    'to mix', 'to separate', 'to combine', 'to split', 'to join', 'to attach',
    'to like', 'to enjoy', 'to dislike', 'to prefer', 'to suffer', 'to endure',
    'to complain', 'to praise', 'to criticize', 'to encourage', 'to discourage',
    'to surprise', 'to shock', 'to impress', 'to disappoint', 'to satisfy',
    'to graduate', 'to enroll', 'to register', 'to apply', 'to hire', 'to fire',
    'to promote', 'to demote', 'to retire', 'to quit', 'to resign', 'to volunteer',
    'to reserve', 'to book', 'to cancel', 'to postpone', 'to delay', 'to hurry',
    'to rush', 'to slow down', 'to speed up', 'to stop', 'to pause', 'to resume',
    'to flow', 'to freeze', 'to melt', 'to burn', 'to smoke', 'to explode', 'to collapse'
}

ADJECTIVES = {
    'big', 'small', 'large', 'little', 'tall', 'short', 'long', 'wide', 'narrow',
    'thick', 'thin', 'heavy', 'light', 'fast', 'slow', 'quick', 'high', 'low',
    'hot', 'cold', 'warm', 'cool', 'new', 'old', 'young', 'ancient', 'modern',
    'good', 'bad', 'great', 'terrible', 'beautiful', 'ugly', 'pretty', 'handsome',
    'cute', 'lovely', 'nice', 'wonderful', 'amazing', 'excellent', 'perfect',
    'strong', 'weak', 'hard', 'soft', 'easy', 'difficult', 'simple', 'complex',
    'rich', 'poor', 'expensive', 'cheap', 'free', 'busy', 'lazy', 'tired',
    'happy', 'sad', 'angry', 'scared', 'surprised', 'excited', 'bored', 'nervous',
    'calm', 'peaceful', 'noisy', 'quiet', 'loud', 'silent', 'bright', 'dark',
    'light', 'clean', 'dirty', 'clear', 'cloudy', 'sunny', 'rainy', 'windy',
    'healthy', 'sick', 'ill', 'well', 'safe', 'dangerous', 'careful', 'careless',
    'polite', 'rude', 'kind', 'mean', 'friendly', 'unfriendly', 'gentle', 'rough',
    'smart', 'stupid', 'clever', 'wise', 'foolish', 'crazy', 'normal', 'strange',
    'special', 'ordinary', 'unique', 'common', 'rare', 'famous', 'unknown',
    'important', 'unimportant', 'necessary', 'unnecessary', 'useful', 'useless',
    'possible', 'impossible', 'certain', 'uncertain', 'sure', 'unsure', 'true', 'false',
    'correct', 'wrong', 'right', 'fair', 'unfair', 'just', 'unjust', 'legal', 'illegal',
    'public', 'private', 'open', 'closed', 'full', 'empty', 'complete', 'incomplete',
    'same', 'different', 'similar', 'opposite', 'equal', 'unequal', 'various',
    'many', 'few', 'much', 'less', 'more', 'most', 'least', 'several', 'all', 'some',
    'sweet', 'sour', 'bitter', 'salty', 'spicy', 'tasty', 'delicious', 'awful',
    'round', 'square', 'straight', 'curved', 'flat', 'deep', 'shallow',
    'close', 'far', 'near', 'distant', 'local', 'foreign', 'domestic', 'international',
    'fun', 'funny', 'serious', 'boring', 'interesting', 'exciting', 'relaxing',
    'convenient', 'inconvenient', 'comfortable', 'uncomfortable', 'pleasant', 'unpleasant',
    'narrow-minded', 'open-minded', 'positive', 'negative', 'optimistic', 'pessimistic',
    'lonely', 'alone', 'together', 'separate', 'attached', 'detached', 'connected',
    'hungry', 'thirsty', 'sleepy', 'awake', 'alive', 'dead', 'living', 'non-living',
    'favorite', 'preferred', 'chosen', 'selected', 'rejected', 'accepted', 'refused'
}

ADVERBS = {
    'quickly', 'slowly', 'fast', 'already', 'still', 'yet', 'again', 'always',
    'never', 'sometimes', 'often', 'usually', 'rarely', 'seldom', 'ever',
    'now', 'then', 'soon', 'later', 'today', 'tomorrow', 'yesterday', 'early',
    'late', 'recently', 'finally', 'suddenly', 'gradually', 'immediately',
    'here', 'there', 'everywhere', 'somewhere', 'nowhere', 'anywhere',
    'very', 'really', 'quite', 'rather', 'too', 'enough', 'almost', 'nearly',
    'completely', 'totally', 'entirely', 'partly', 'mostly', 'mainly', 'largely',
    'well', 'badly', 'easily', 'hardly', 'simply', 'just', 'only', 'even',
    'also', 'together', 'alone', 'apart', 'forward', 'backward', 'upward', 'downward',
    'inside', 'outside', 'above', 'below', 'before', 'after', 'during', 'while',
    'especially', 'particularly', 'specifically', 'generally', 'usually'
}

OTHER = {
    'hello', 'goodbye', 'thank you', 'thanks', 'sorry', 'excuse me', 'please',
    'yes', 'no', 'maybe', 'perhaps', 'probably', 'certainly', 'definitely',
    'okay', 'alright', 'sure', 'of course', 'welcome', 'cheers', 'congratulations',
    'good morning', 'good afternoon', 'good evening', 'good night', 'see you',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'these', 'those',
    'what', 'who', 'where', 'when', 'why', 'how', 'which', 'whose', 'whom',
    'and', 'or', 'but', 'because', 'if', 'although', 'though', 'however', 'therefore'
}

def categorize_word(english_meaning: str) -> str:
    """Determine the part of speech based on English meaning."""
    en_lower = english_meaning.lower().strip()
    
    # Check for verb patterns (starts with "to ")
    if en_lower.startswith('to '):
        return 'Verb'
    
    # Check for exact matches in categories
    for verb in VERBS:
        if verb in en_lower:
            return 'Verb'
    
    for adj in ADJECTIVES:
        if en_lower == adj or en_lower.startswith(adj + ' ') or en_lower.endswith(' ' + adj):
            return 'Adjective'
    
    for adv in ADVERBS:
        if en_lower == adv or en_lower.startswith(adv + ' ') or en_lower.endswith(' ' + adv):
            return 'Adverb'
    
    for other in OTHER:
        if en_lower == other or en_lower.startswith(other + ' ') or en_lower.endswith(' ' + other):
            return 'Other'
    
    # Default to Noun for most words (objects, people, places, etc.)
    return 'Noun'

def process_words_file(filepath: str):
    """Add pos field to all word entries in words.ts."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Pattern to match word objects: { id: '...', ..., morae: N }
    # We need to insert pos: 'Category' before the closing }
    pattern = r"(\{ id: '[^']+', kana: '[^']+', romaji: '[^']+', kanji: '[^']+', en: '([^']+)', morae: \d+ \})"
    
    def add_pos(match):
        full_obj = match.group(1)
        en_value = match.group(2)
        pos = categorize_word(en_value)
        # Replace the closing } with , pos: 'Category' }
        new_obj = full_obj[:-2] + f", pos: '{pos}' }}"
        return new_obj
    
    new_content = re.sub(pattern, add_pos, content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f"Successfully added pos field to words in {filepath}")

if __name__ == '__main__':
    process_words_file('./words.ts')
