import os
import random

from flask import Blueprint, jsonify, render_template

typing_bp = Blueprint('typing_bp', __name__)

ALL_WORDS = [
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with'
]

try:
    if os.path.exists('words.txt'):
        with open('words.txt', 'r', encoding='utf-8') as f:
            words_from_file = [line.strip().lower() for line in f if line.strip()]
            if words_from_file:
                ALL_WORDS = words_from_file
        print(f'Loaded {len(ALL_WORDS)} words successfully!')
    else:
        print('words.txt not found. Using default fallback words.')
except Exception as e:
    print(f'Error loading words.txt: {e}')


@typing_bp.route('/typing')
def typing():
    return render_template('typing.html')


@typing_bp.route('/api/words')
def api_words():
    sample_size = min(100, len(ALL_WORDS))
    selected_words = random.sample(ALL_WORDS, sample_size)
    return jsonify(selected_words)
