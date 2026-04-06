import json

from flask import Blueprint, g, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db

account_bp = Blueprint('account_bp', __name__)


def _require_user():
    if not g.get('current_user'):
        return None, (jsonify({'error': 'Sign in required'}), 401)
    return g.current_user, None


@account_bp.route('/account')
def account_page():
    return render_template('account.html')


@account_bp.route('/api/auth/me')
def auth_me():
    user = g.get('current_user')
    if not user:
        return jsonify({'logged_in': False, 'user': None})
    return jsonify({'logged_in': True, 'user': {'id': user['id'], 'username': user['username']}})


@account_bp.route('/api/auth/register', methods=['POST'])
def auth_register():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get('username', '')).strip()
    passcode = str(payload.get('passcode', ''))

    if len(username) < 2 or len(username) > 32:
        return jsonify({'error': 'Name must be between 2 and 32 characters.'}), 400
    if len(passcode) < 4 or len(passcode) > 128:
        return jsonify({'error': 'Passcode must be between 4 and 128 characters.'}), 400

    db = get_db()
    try:
        db.execute(
            'INSERT INTO users (username, passcode_hash) VALUES (?, ?)',
            (username, generate_password_hash(passcode)),
        )
        db.commit()
    except Exception:
        return jsonify({'error': 'That name is already taken.'}), 409

    row = db.execute('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE', (username,)).fetchone()
    session['user_id'] = row['id']
    return jsonify({'ok': True, 'user': {'id': row['id'], 'username': row['username']}})


@account_bp.route('/api/auth/login', methods=['POST'])
def auth_login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get('username', '')).strip()
    passcode = str(payload.get('passcode', ''))

    row = get_db().execute(
        'SELECT id, username, passcode_hash FROM users WHERE username = ? COLLATE NOCASE',
        (username,),
    ).fetchone()
    if not row or not check_password_hash(row['passcode_hash'], passcode):
        return jsonify({'error': 'Invalid name or passcode.'}), 401

    session['user_id'] = row['id']
    return jsonify({'ok': True, 'user': {'id': row['id'], 'username': row['username']}})


@account_bp.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    session.pop('user_id', None)
    return jsonify({'ok': True})


@account_bp.route('/api/user/dashboard')
def user_dashboard():
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    user_id = user['id']

    fyrdle_totals = db.execute(
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
    fyrdle_recent = db.execute(
        """
        SELECT played_at, won, guesses_used, max_guesses, mode, hard_mode, elapsed_seconds, solution
        FROM fyrdle_games
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 8
        """,
        (user_id,),
    ).fetchall()

    typing_totals = db.execute(
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
    typing_recent = db.execute(
        """
        SELECT played_at, mode, time_limit, punctuation, net_wpm, raw_wpm, accuracy
        FROM typing_tests
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 8
        """,
        (user_id,),
    ).fetchall()

    sudoku_totals = db.execute(
        """
        SELECT
            COUNT(*) AS games,
            SUM(CASE WHEN solved = 1 THEN 1 ELSE 0 END) AS solved,
            AVG(CASE WHEN solved = 1 THEN solve_seconds ELSE NULL END) AS avg_solve_seconds,
            MIN(CASE WHEN solved = 1 THEN solve_seconds ELSE NULL END) AS best_solve_seconds
        FROM sudoku_games
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    sudoku_recent = db.execute(
        """
        SELECT played_at, difficulty, solved, solve_seconds, conflicts
        FROM sudoku_games
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 8
        """,
        (user_id,),
    ).fetchall()

    schedule_totals = db.execute(
        """
        SELECT COUNT(*) AS runs
        FROM schedule_runs
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    schedule_recent = db.execute(
        """
        SELECT id, created_at, label, num_students
        FROM schedule_runs
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 8
        """,
        (user_id,),
    ).fetchall()

    return jsonify({
        'user': {'id': user['id'], 'username': user['username']},
        'fyrdle': {
            'played': int(fyrdle_totals['played'] or 0),
            'wins': int(fyrdle_totals['wins'] or 0),
            'avg_win_guesses': round(float(fyrdle_totals['avg_win_guesses'] or 0), 2),
            'recent': [dict(row) for row in fyrdle_recent],
        },
        'typing': {
            'tests': int(typing_totals['tests'] or 0),
            'avg_net_wpm': round(float(typing_totals['avg_net_wpm'] or 0), 2),
            'avg_raw_wpm': round(float(typing_totals['avg_raw_wpm'] or 0), 2),
            'avg_accuracy': round(float(typing_totals['avg_accuracy'] or 0), 2),
            'best_net_wpm': round(float(typing_totals['best_net_wpm'] or 0), 2),
            'recent': [dict(row) for row in typing_recent],
        },
        'sudoku': {
            'games': int(sudoku_totals['games'] or 0),
            'solved': int(sudoku_totals['solved'] or 0),
            'avg_solve_seconds': int(float(sudoku_totals['avg_solve_seconds'] or 0)),
            'best_solve_seconds': int(float(sudoku_totals['best_solve_seconds'] or 0)),
            'recent': [dict(row) for row in sudoku_recent],
        },
        'schedule': {
            'runs': int(schedule_totals['runs'] or 0),
            'recent': [dict(row) for row in schedule_recent],
        },
    })


@account_bp.route('/api/user/schedule-run/<int:run_id>')
def user_schedule_run(run_id):
    user, err = _require_user()
    if err:
        return err

    row = get_db().execute(
        """
        SELECT id, created_at, label, num_students, payload_json, result_json
        FROM schedule_runs
        WHERE id = ? AND user_id = ?
        """,
        (run_id, user['id']),
    ).fetchone()
    if not row:
        return jsonify({'error': 'Not found'}), 404

    return jsonify({
        'id': row['id'],
        'created_at': row['created_at'],
        'label': row['label'],
        'num_students': row['num_students'],
        'payload': json.loads(row['payload_json']) if row['payload_json'] else None,
        'result': json.loads(row['result_json']) if row['result_json'] else None,
    })
