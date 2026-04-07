import heapq
import json
import time

from flask import Blueprint, g, jsonify, render_template, request

from db import get_db

schedule_bp = Blueprint('schedule_bp', __name__)
MAX_STUDENTS = 30


def solve_schedule(students, time_slots):
    n = len(students)
    score_matrix = [[0] * n for _ in range(n)]
    for i, student in enumerate(students):
        for pref_rank, slot in enumerate(student['preferences']):
            if slot > 0:
                score_matrix[i][slot - 1] = 3 - pref_rank

    best = {'score': -999999, 'assignment': None}
    nodes_explored = [0]

    def calculate_upper_bound(slots, used, depth, score):
        bound = score
        for i in range(depth, n):
            max_possible = 0
            has_preferences = any(p != 0 for p in students[i]['preferences'])
            for j, pref in enumerate(students[i]['preferences']):
                if pref > 0 and not used[pref - 1]:
                    max_possible = 3 - j
                    break
            if has_preferences and max_possible == 0:
                bound -= 10
            else:
                bound += max_possible
        return bound

    initial_used = [False] * n
    initial_bound = calculate_upper_bound([], initial_used, 0, 0)
    heap = [(-initial_bound, 0, [], tuple(initial_used), 0)]

    while heap:
        neg_bound, depth, slots, used_tuple, score = heapq.heappop(heap)
        nodes_explored[0] += 1
        bound = -neg_bound

        if bound <= best['score']:
            continue

        if depth == n:
            if score > best['score']:
                best['score'] = score
                best['assignment'] = list(slots)
            continue

        used = list(used_tuple)
        student_idx = depth
        candidates = []
        has_preferences = any(p != 0 for p in students[student_idx]['preferences'])

        for j, pref in enumerate(students[student_idx]['preferences']):
            if pref > 0 and not used[pref - 1]:
                candidates.append((3 - j, pref - 1))

        if not candidates:
            count = 0
            for slot in range(n):
                if count >= 3:
                    break
                if not used[slot] and score_matrix[student_idx][slot] == 0:
                    score_adj = -10 if has_preferences else 0
                    candidates.append((score_adj, slot))
                    count += 1

        for gain, slot in candidates:
            new_used = list(used)
            new_used[slot] = True
            new_slots = slots + [slot]
            new_score = score + gain
            new_bound = calculate_upper_bound(new_slots, new_used, depth + 1, new_score)
            if new_bound > best['score']:
                heapq.heappush(heap, (-new_bound, depth + 1, new_slots, tuple(new_used), new_score))

    assignment = best['assignment']
    if assignment is None:
        return None

    results = []
    first_choice = second_choice = third_choice = no_pref_missed = no_pref_given = 0

    for i in range(n):
        slot_idx = assignment[i]
        points = score_matrix[i][slot_idx]
        had_prefs = any(p != 0 for p in students[i]['preferences'])

        if points == 3:
            rank = 1
            first_choice += 1
        elif points == 2:
            rank = 2
            second_choice += 1
        elif points == 1:
            rank = 3
            third_choice += 1
        elif had_prefs:
            rank = 0
            no_pref_missed += 1
        else:
            rank = -1
            no_pref_given += 1

        results.append({
            'student': students[i]['name'],
            'slot': time_slots[slot_idx],
            'rank': rank,
            'hadPreferences': had_prefs
        })

    display_score = sum(score_matrix[i][assignment[i]] for i in range(n) if score_matrix[i][assignment[i]] > 0)
    max_score = n * 3

    return {
        'assignments': results,
        'score': display_score,
        'maxScore': max_score,
        'satisfaction': round(display_score * 100.0 / max_score, 1) if max_score > 0 else 0,
        'firstChoice': first_choice,
        'secondChoice': second_choice,
        'thirdChoice': third_choice,
        'noPrefMissed': no_pref_missed,
        'noPrefGiven': no_pref_given,
        'nodesExplored': nodes_explored[0]
    }


@schedule_bp.route('/schedule')
def schedule():
    return render_template('schedule.html')


@schedule_bp.route('/api/optimize', methods=['POST'])
def api_optimize():
    data = request.json or {}
    students = data.get('students', [])
    time_slots = data.get('timeSlots', [])

    if not students or not time_slots:
        return jsonify({'error': 'Missing students or time slots'}), 400
    if len(students) != len(time_slots):
        return jsonify({'error': 'Number of students must equal number of time slots'}), 400
    if len(students) > MAX_STUDENTS:
        return jsonify({'error': f'Maximum supported students is {MAX_STUDENTS}'}), 400

    start = time.time()
    result = solve_schedule(students, time_slots)
    elapsed = round((time.time() - start) * 1000, 2)

    if result is None:
        return jsonify({'error': 'Could not find a valid assignment'}), 500

    result['timeMs'] = elapsed
    return jsonify(result)


@schedule_bp.route('/api/schedule/save-run', methods=['POST'])
def api_save_run():
    user = g.get('current_user')
    if not user:
        return jsonify({'error': 'Sign in required'}), 401

    payload = request.get_json(silent=True) or {}
    run_payload = payload.get('payload') or {}
    students = run_payload.get('students') or payload.get('students') or []
    time_slots = run_payload.get('timeSlots') or payload.get('timeSlots') or []
    result = payload.get('result') or {}
    label = str(payload.get('label') or '').strip()[:120]

    if not students or not time_slots:
        return jsonify({'error': 'Missing schedule payload'}), 400

    num_students = len(students)
    if not run_payload:
        run_payload = {'students': students, 'timeSlots': time_slots}

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO schedule_runs (user_id, label, num_students, payload_json, result_json)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            user['id'],
            label or None,
            num_students,
            json.dumps(run_payload),
            json.dumps(result or {}),
        ),
    )
    db.commit()
    return jsonify({'ok': True, 'run_id': cur.lastrowid})


@schedule_bp.route('/api/schedule/history')
def api_schedule_history():
    user = g.get('current_user')
    if not user:
        return jsonify({'runs': []})

    rows = get_db().execute(
        """
        SELECT id, created_at, label, num_students
        FROM schedule_runs
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 30
        """,
        (user['id'],),
    ).fetchall()
    return jsonify({'runs': [dict(row) for row in rows]})


@schedule_bp.route('/api/schedule/stats')
def api_schedule_stats():
    user = g.get('current_user')
    if not user:
        return jsonify({'error': 'Sign in required'}), 401

    rows = get_db().execute(
        """
        SELECT id, created_at, label, num_students, result_json
        FROM schedule_runs
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 100
        """,
        (user['id'],),
    ).fetchall()

    recent = []
    satisfaction_values = []
    first_choice_values = []
    for row in rows[:12]:
        result = {}
        try:
            result = json.loads(row['result_json'] or '{}')
        except Exception:
            result = {}

        sat = result.get('satisfaction')
        if isinstance(sat, (int, float)):
            satisfaction_values.append(float(sat))

        first_choice = result.get('firstChoice')
        if isinstance(first_choice, (int, float)):
            first_choice_values.append(float(first_choice))

        recent.append({
            'id': row['id'],
            'created_at': row['created_at'],
            'label': row['label'],
            'num_students': row['num_students'],
            'satisfaction': sat if isinstance(sat, (int, float)) else None,
            'first_choice': first_choice if isinstance(first_choice, (int, float)) else None,
        })

    avg_satisfaction = sum(satisfaction_values) / len(satisfaction_values) if satisfaction_values else 0
    avg_first_choice = sum(first_choice_values) / len(first_choice_values) if first_choice_values else 0

    return jsonify({
        'overall': {
            'runs': len(rows),
            'avg_satisfaction': round(avg_satisfaction, 2),
            'avg_first_choice': round(avg_first_choice, 2),
        },
        'recent': recent,
    })


@schedule_bp.route('/api/schedule/run/<int:run_id>', methods=['DELETE'])
def api_delete_schedule_run(run_id):
    user = g.get('current_user')
    if not user:
        return jsonify({'error': 'Sign in required'}), 401

    db = get_db()
    found = db.execute(
        "SELECT id FROM schedule_runs WHERE id = ? AND user_id = ?",
        (run_id, user['id']),
    ).fetchone()
    if not found:
        return jsonify({'error': 'Saved schedule not found'}), 404

    db.execute(
        "DELETE FROM schedule_runs WHERE id = ? AND user_id = ?",
        (run_id, user['id']),
    )
    db.commit()
    return jsonify({'ok': True})
