from pathlib import Path
import random

from flask import Blueprint, g, jsonify, render_template, request

from db import get_db

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


@typing_bp.route('/api/typing/record', methods=['POST'])
def api_typing_record():
    user = g.get('current_user')
    if not user:
        return jsonify({'error': 'Sign in required'}), 401

    payload = request.get_json(silent=True) or {}
    mode = str(payload.get('mode') or 'normal')[:20]
    time_limit = int(payload.get('time_limit') or 30)
    punctuation = 1 if payload.get('punctuation') else 0
    raw_wpm = float(payload.get('raw_wpm') or 0)
    net_wpm = float(payload.get('net_wpm') or 0)
    accuracy = float(payload.get('accuracy') or 0)
    correct_words = int(payload.get('correct_words') or 0)
    incorrect_words = int(payload.get('incorrect_words') or 0)

    db = get_db()
    db.execute(
        """
        INSERT INTO typing_tests (user_id, mode, time_limit, punctuation, raw_wpm, net_wpm, accuracy, correct_words, incorrect_words)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (user['id'], mode, time_limit, punctuation, raw_wpm, net_wpm, accuracy, correct_words, incorrect_words),
    )
    db.commit()
    return jsonify({'ok': True})


@typing_bp.route('/api/typing/stats')
def api_typing_stats():
    user = g.get('current_user')
    if not user:
        return jsonify({'error': 'Sign in required'}), 401

    db = get_db()
    user_id = user['id']

    overall = db.execute(
        """
        SELECT
            COUNT(*) AS tests,
            AVG(net_wpm) AS avg_net_wpm,
            AVG(raw_wpm) AS avg_raw_wpm,
            AVG(accuracy) AS avg_accuracy,
            MAX(net_wpm) AS best_net_wpm
        FROM typing_tests
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()

    by_time = db.execute(
        """
        SELECT
            time_limit,
            COUNT(*) AS tests,
            AVG(net_wpm) AS avg_net_wpm,
            AVG(raw_wpm) AS avg_raw_wpm,
            AVG(accuracy) AS avg_accuracy
        FROM typing_tests
        WHERE user_id = ?
        GROUP BY time_limit
        ORDER BY time_limit
        """,
        (user_id,),
    ).fetchall()

    by_mode = db.execute(
        """
        SELECT
            mode,
            COUNT(*) AS tests,
            AVG(net_wpm) AS avg_net_wpm,
            AVG(accuracy) AS avg_accuracy
        FROM typing_tests
        WHERE user_id = ?
        GROUP BY mode
        ORDER BY mode
        """,
        (user_id,),
    ).fetchall()

    by_punctuation = db.execute(
        """
        SELECT
            punctuation,
            COUNT(*) AS tests,
            AVG(net_wpm) AS avg_net_wpm,
            AVG(accuracy) AS avg_accuracy
        FROM typing_tests
        WHERE user_id = ?
        GROUP BY punctuation
        ORDER BY punctuation
        """,
        (user_id,),
    ).fetchall()

    by_combo = db.execute(
        """
        SELECT
            mode,
            punctuation,
            time_limit,
            COUNT(*) AS tests,
            AVG(net_wpm) AS avg_net_wpm,
            AVG(accuracy) AS avg_accuracy
        FROM typing_tests
        WHERE user_id = ?
        GROUP BY mode, punctuation, time_limit
        ORDER BY mode, punctuation, time_limit
        """,
        (user_id,),
    ).fetchall()

    recent = db.execute(
        """
        SELECT played_at, mode, punctuation, time_limit, net_wpm, raw_wpm, accuracy
        FROM typing_tests
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 12
        """,
        (user_id,),
    ).fetchall()

    return jsonify({
        'overall': {
            'tests': int(overall['tests'] or 0),
            'avg_net_wpm': round(float(overall['avg_net_wpm'] or 0), 2),
            'avg_raw_wpm': round(float(overall['avg_raw_wpm'] or 0), 2),
            'avg_accuracy': round(float(overall['avg_accuracy'] or 0), 2),
            'best_net_wpm': round(float(overall['best_net_wpm'] or 0), 2),
        },
        'by_time': [dict(row) for row in by_time],
        'by_mode': [dict(row) for row in by_mode],
        'by_punctuation': [dict(row) for row in by_punctuation],
        'by_combo': [dict(row) for row in by_combo],
        'recent': [dict(row) for row in recent],
    })
