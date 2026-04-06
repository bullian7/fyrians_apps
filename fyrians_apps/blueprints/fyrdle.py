from pathlib import Path

from flask import Blueprint, g, jsonify, render_template, request

from db import get_db

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


@fyrdle_bp.route('/api/fyrdle/record', methods=['POST'])
def api_fyrdle_record():
    user = g.get('current_user')
    if not user:
        return jsonify({'error': 'Sign in required'}), 401

    payload = request.get_json(silent=True) or {}
    won = 1 if payload.get('won') else 0
    guesses_used = int(payload.get('guesses_used') or 0)
    max_guesses = int(payload.get('max_guesses') or 6)
    mode = str(payload.get('mode') or 'random')[:20]
    hard_mode = 1 if payload.get('hard_mode') else 0
    elapsed_seconds = int(payload.get('elapsed_seconds') or 0)
    solution = str(payload.get('solution') or '').lower()[:12]

    db = get_db()
    db.execute(
        """
        INSERT INTO fyrdle_games (user_id, won, guesses_used, max_guesses, mode, hard_mode, elapsed_seconds, solution)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (user['id'], won, guesses_used, max_guesses, mode, hard_mode, elapsed_seconds, solution),
    )
    db.commit()
    return jsonify({'ok': True})


@fyrdle_bp.route('/api/fyrdle/stats')
def api_fyrdle_stats():
    user = g.get('current_user')
    if not user:
        return jsonify({'error': 'Sign in required'}), 401

    db = get_db()
    user_id = user['id']

    overall = db.execute(
        """
        SELECT
            COUNT(*) AS played,
            SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) AS wins,
            AVG(CASE WHEN won = 1 THEN guesses_used ELSE NULL END) AS avg_win_guesses
        FROM fyrdle_games
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()

    by_mode = db.execute(
        """
        SELECT mode, COUNT(*) AS played,
               SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) AS wins
        FROM fyrdle_games
        WHERE user_id = ?
        GROUP BY mode
        ORDER BY mode
        """,
        (user_id,),
    ).fetchall()

    by_hard = db.execute(
        """
        SELECT hard_mode, COUNT(*) AS played,
               SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) AS wins
        FROM fyrdle_games
        WHERE user_id = ?
        GROUP BY hard_mode
        ORDER BY hard_mode
        """,
        (user_id,),
    ).fetchall()

    recent = db.execute(
        """
        SELECT played_at, won, guesses_used, max_guesses, mode, hard_mode, elapsed_seconds, solution
        FROM fyrdle_games
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 12
        """,
        (user_id,),
    ).fetchall()

    return jsonify({
        'overall': {
            'played': int(overall['played'] or 0),
            'wins': int(overall['wins'] or 0),
            'avg_win_guesses': round(float(overall['avg_win_guesses'] or 0), 2),
        },
        'by_mode': [dict(row) for row in by_mode],
        'by_hard_mode': [dict(row) for row in by_hard],
        'recent': [dict(row) for row in recent],
    })
