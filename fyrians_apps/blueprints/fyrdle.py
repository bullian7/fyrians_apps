from pathlib import Path

from flask import Blueprint, jsonify, render_template

fyrdle_bp = Blueprint('fyrdle_bp', __name__)

DEFAULT_WORDS = [
    'apple', 'grape', 'stone', 'crane', 'flint', 'smile', 'blaze', 'frost', 'crown', 'tiger',
    'piano', 'cloud', 'ocean', 'spark', 'whale', 'bloom', 'honey', 'trail', 'storm', 'light'
]

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = Path(__file__).resolve().parents[1]
WORD_FILES = [APP_ROOT / 'wordle.txt', REPO_ROOT / 'wordle.txt']
VALID_WORD_FILES = [APP_ROOT / 'validwordle.txt', REPO_ROOT / 'validwordle.txt']


def load_words_from(path):
    if not path.exists():
        return []

    try:
        words = []
        with path.open('r', encoding='utf-8') as f:
            for line in f:
                cleaned = line.strip().lower()
                if len(cleaned) == 5 and cleaned.isalpha():
                    words.append(cleaned)

        return sorted(set(words))
    except Exception:
        return []


def load_words_from_candidates(paths):
    merged = set()
    for path in paths:
        merged.update(load_words_from(path))
    return sorted(merged)


def get_word_lists():
    answer_words = load_words_from_candidates(WORD_FILES) or DEFAULT_WORDS
    valid_words_only = load_words_from_candidates(VALID_WORD_FILES)
    valid_guess_words = sorted(set(answer_words) | set(valid_words_only))
    return answer_words, valid_guess_words


@fyrdle_bp.route('/fyrdle')
def fyrdle():
    return render_template('fyrdle.html')


@fyrdle_bp.route('/api/fyrdle/words')
def api_fyrdle_words():
    answer_words, valid_guess_words = get_word_lists()
    return jsonify({
        'words': answer_words,
        'valid_words': valid_guess_words,
        'count': len(answer_words)
    })
