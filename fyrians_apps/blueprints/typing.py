from pathlib import Path
import random

from flask import Blueprint, jsonify, render_template, request

typing_bp = Blueprint('typing_bp', __name__)

DEFAULT_NORMAL_WORDS = [
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with'
]

DEFAULT_DIFFICULT_WORDS = [
    'zephyr', 'rhythm', 'mnemonic', 'quartz', 'awkward', 'jovial', 'buzzing', 'glyph', 'zodiac', 'mystic'
]

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = Path(__file__).resolve().parents[1]

NORMAL_WORD_FILES = [APP_ROOT / 'words.txt', REPO_ROOT / 'words.txt']
DIFFICULT_WORD_FILES = [APP_ROOT / '1000words.txt', REPO_ROOT / '1000words.txt']


def load_words_from(path):
    if not path.exists():
        return []

    try:
        with path.open('r', encoding='utf-8') as f:
            words = [line.strip().lower() for line in f if line.strip()]
        return words
    except Exception:
        return []


def load_words_from_candidates(paths, fallback):
    for path in paths:
        words = load_words_from(path)
        if words:
            return words
    return fallback


def get_word_pool(mode):
    if mode == 'normal':
        return load_words_from_candidates(DIFFICULT_WORD_FILES, DEFAULT_DIFFICULT_WORDS)

    return load_words_from_candidates(NORMAL_WORD_FILES, DEFAULT_NORMAL_WORDS)


@typing_bp.route('/typing')
def typing():
    return render_template('typing.html')


@typing_bp.route('/api/words')
def api_words():
    mode = request.args.get('mode', 'normal').lower()
    if mode not in {'normal', 'difficult'}:
        mode = 'normal'

    word_pool = get_word_pool(mode)
    sample_size = min(100, len(word_pool))
    selected_words = random.sample(word_pool, sample_size) if sample_size > 0 else []
    return jsonify(selected_words)
