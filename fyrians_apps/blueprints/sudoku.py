from flask import Blueprint, g, jsonify, render_template, request

from db import get_db

sudoku_bp = Blueprint('sudoku_bp', __name__)


@sudoku_bp.route('/sudoku')
def sudoku():
    return render_template('sudoku.html')


@sudoku_bp.route('/api/sudoku/record', methods=['POST'])
def api_sudoku_record():
    user = g.get('current_user')
    if not user:
        return jsonify({'error': 'Sign in required'}), 401

    payload = request.get_json(silent=True) or {}
    difficulty = str(payload.get('difficulty') or 'easy')[:20]
    solved = 1 if payload.get('solved') else 0
    solve_seconds = int(payload.get('solve_seconds') or 0)
    conflicts = int(payload.get('conflicts') or 0)

    db = get_db()
    db.execute(
        """
        INSERT INTO sudoku_games (user_id, difficulty, solved, solve_seconds, conflicts)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user['id'], difficulty, solved, solve_seconds, conflicts),
    )
    db.commit()
    return jsonify({'ok': True})


@sudoku_bp.route('/api/sudoku/stats')
def api_sudoku_stats():
    user = g.get('current_user')
    if not user:
        return jsonify({'error': 'Sign in required'}), 401

    db = get_db()
    user_id = user['id']

    overall = db.execute(
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

    by_difficulty = db.execute(
        """
        SELECT
            difficulty,
            COUNT(*) AS games,
            SUM(CASE WHEN solved = 1 THEN 1 ELSE 0 END) AS solved,
            AVG(CASE WHEN solved = 1 THEN solve_seconds ELSE NULL END) AS avg_solve_seconds
        FROM sudoku_games
        WHERE user_id = ?
        GROUP BY difficulty
        ORDER BY difficulty
        """,
        (user_id,),
    ).fetchall()

    recent = db.execute(
        """
        SELECT played_at, difficulty, solved, solve_seconds, conflicts
        FROM sudoku_games
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 12
        """,
        (user_id,),
    ).fetchall()

    return jsonify({
        'overall': {
            'games': int(overall['games'] or 0),
            'solved': int(overall['solved'] or 0),
            'avg_solve_seconds': int(float(overall['avg_solve_seconds'] or 0)),
            'best_solve_seconds': int(float(overall['best_solve_seconds'] or 0)),
        },
        'by_difficulty': [dict(row) for row in by_difficulty],
        'recent': [dict(row) for row in recent],
    })
