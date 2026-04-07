from flask import Blueprint, g, jsonify, render_template, request

from db import get_db

reaction_bp = Blueprint('reaction_bp', __name__)
MAX_STAT_MS = 1000


@reaction_bp.route('/reaction')
def reaction():
    return render_template('reaction.html')


@reaction_bp.route('/api/reaction/record', methods=['POST'])
def api_reaction_record():
    user = g.get('current_user')
    if not user:
        return jsonify({'error': 'Sign in required'}), 401

    payload = request.get_json(silent=True) or {}
    reaction_ms_raw = payload.get('reaction_ms')
    reaction_ms = None
    if reaction_ms_raw is not None:
        try:
            reaction_ms = int(reaction_ms_raw)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid reaction time'}), 400
    false_start = 1 if payload.get('false_start') else 0
    input_method = str(payload.get('input_method') or 'click')[:20]

    if input_method not in {'click', 'space'}:
        input_method = 'click'

    if false_start:
        reaction_ms = None
    elif reaction_ms is None or reaction_ms < 1:
        return jsonify({'error': 'Invalid reaction time'}), 400
    elif reaction_ms > MAX_STAT_MS:
        return jsonify({'ok': True, 'ignored': True})

    db = get_db()
    db.execute(
        """
        INSERT INTO reaction_tests (user_id, reaction_ms, false_start, input_method)
        VALUES (?, ?, ?, ?)
        """,
        (user['id'], reaction_ms, false_start, input_method),
    )
    db.commit()
    return jsonify({'ok': True})


@reaction_bp.route('/api/reaction/stats')
def api_reaction_stats():
    user = g.get('current_user')
    if not user:
        return jsonify({'error': 'Sign in required'}), 401

    db = get_db()
    user_id = user['id']

    overall = db.execute(
        """
        SELECT
            COUNT(*) AS attempts,
            SUM(CASE WHEN false_start = 1 THEN 1 ELSE 0 END) AS false_starts,
            COUNT(CASE WHEN false_start = 0 AND reaction_ms BETWEEN 1 AND ? THEN 1 END) AS valid_tests,
            AVG(CASE WHEN false_start = 0 AND reaction_ms BETWEEN 1 AND ? THEN reaction_ms ELSE NULL END) AS avg_ms,
            MIN(CASE WHEN false_start = 0 AND reaction_ms BETWEEN 1 AND ? THEN reaction_ms ELSE NULL END) AS best_ms
        FROM reaction_tests
        WHERE user_id = ?
        """,
        (MAX_STAT_MS, MAX_STAT_MS, MAX_STAT_MS, user_id),
    ).fetchone()

    by_input = db.execute(
        """
        SELECT
            input_method,
            COUNT(*) AS attempts,
            SUM(CASE WHEN false_start = 1 THEN 1 ELSE 0 END) AS false_starts,
            AVG(CASE WHEN false_start = 0 AND reaction_ms BETWEEN 1 AND ? THEN reaction_ms ELSE NULL END) AS avg_ms,
            MIN(CASE WHEN false_start = 0 AND reaction_ms BETWEEN 1 AND ? THEN reaction_ms ELSE NULL END) AS best_ms
        FROM reaction_tests
        WHERE user_id = ?
        GROUP BY input_method
        ORDER BY input_method
        """,
        (MAX_STAT_MS, MAX_STAT_MS, user_id),
    ).fetchall()

    recent = db.execute(
        """
        SELECT played_at, reaction_ms, false_start, input_method
        FROM reaction_tests
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 12
        """,
        (user_id,),
    ).fetchall()

    return jsonify({
        'overall': {
            'attempts': int(overall['attempts'] or 0),
            'false_starts': int(overall['false_starts'] or 0),
            'valid_tests': int(overall['valid_tests'] or 0),
            'avg_ms': round(float(overall['avg_ms'] or 0), 2),
            'best_ms': int(float(overall['best_ms'] or 0)),
        },
        'by_input': [dict(row) for row in by_input],
        'recent': [dict(row) for row in recent],
    })
