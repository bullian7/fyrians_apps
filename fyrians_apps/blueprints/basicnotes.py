from flask import Blueprint, g, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db

basicnotes_bp = Blueprint('basicnotes_bp', __name__)


def _require_user():
    user = g.get('current_user')
    if not user:
        return None, (jsonify({'error': 'Sign in required'}), 401)
    return user, None


def _get_unlocked_note_ids():
    raw = session.get('basic_notes_unlocked_ids') or []
    return {int(x) for x in raw if str(x).isdigit()}


def _set_unlocked_note_ids(note_ids):
    session['basic_notes_unlocked_ids'] = sorted(list(note_ids))


def _note_payload(row, unlocked_ids):
    is_locked = bool(row['password_hash'])
    return {
        'id': row['id'],
        'title': row['title'],
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
        'is_locked': is_locked,
        'unlocked': (not is_locked) or (row['id'] in unlocked_ids),
    }


def _fetch_note_for_user(db, note_id, user_id):
    return db.execute(
        """
        SELECT id, user_id, title, body, password_hash, created_at, updated_at
        FROM basic_notes
        WHERE id = ? AND user_id = ?
        """,
        (note_id, user_id),
    ).fetchone()


def _can_access_note(note_row, unlocked_ids):
    if not note_row:
        return False
    if not note_row['password_hash']:
        return True
    return note_row['id'] in unlocked_ids


@basicnotes_bp.route('/basic-notes')
def basic_notes():
    return render_template('basicnotes.html')


@basicnotes_bp.route('/api/basic-notes')
def api_basic_notes_list():
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    rows = db.execute(
        """
        SELECT id, title, password_hash, created_at, updated_at
        FROM basic_notes
        WHERE user_id = ?
        ORDER BY id DESC
        """,
        (user['id'],),
    ).fetchall()
    unlocked_ids = _get_unlocked_note_ids()
    return jsonify({'notes': [_note_payload(row, unlocked_ids) for row in rows]})


@basicnotes_bp.route('/api/basic-notes', methods=['POST'])
def api_basic_notes_create():
    user, err = _require_user()
    if err:
        return err

    payload = request.get_json(silent=True) or {}
    title = str(payload.get('title') or '').strip()[:160]
    body = str(payload.get('body') or '').strip()[:10000]
    password = str(payload.get('password') or '')

    if not title:
        title = 'Untitled Note'

    password_hash = None
    if password:
        if len(password) < 3:
            return jsonify({'error': 'Password must be at least 3 characters.'}), 400
        password_hash = generate_password_hash(password)

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO basic_notes (user_id, title, body, password_hash)
        VALUES (?, ?, ?, ?)
        """,
        (user['id'], title, body, password_hash),
    )
    db.commit()
    note_id = cur.lastrowid

    unlocked_ids = _get_unlocked_note_ids()
    if not password_hash:
        unlocked_ids.add(note_id)
        _set_unlocked_note_ids(unlocked_ids)

    row = _fetch_note_for_user(db, note_id, user['id'])
    return jsonify({'ok': True, 'note': _note_payload(row, _get_unlocked_note_ids())})


@basicnotes_bp.route('/api/basic-notes/<int:note_id>')
def api_basic_notes_get(note_id):
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    row = _fetch_note_for_user(db, note_id, user['id'])
    if not row:
        return jsonify({'error': 'Note not found.'}), 404

    if not _can_access_note(row, _get_unlocked_note_ids()):
        return jsonify({'error': 'Note locked.'}), 423

    return jsonify({
        'id': row['id'],
        'title': row['title'],
        'body': row['body'],
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
        'is_locked': bool(row['password_hash']),
    })


@basicnotes_bp.route('/api/basic-notes/<int:note_id>', methods=['PUT'])
def api_basic_notes_update(note_id):
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    row = _fetch_note_for_user(db, note_id, user['id'])
    if not row:
        return jsonify({'error': 'Note not found.'}), 404
    if not _can_access_note(row, _get_unlocked_note_ids()):
        return jsonify({'error': 'Note locked.'}), 423

    payload = request.get_json(silent=True) or {}
    title = str(payload.get('title') or '').strip()[:160]
    body = str(payload.get('body') or '').strip()[:10000]
    if not title:
        title = 'Untitled Note'

    db.execute(
        """
        UPDATE basic_notes
        SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
        """,
        (title, body, note_id, user['id']),
    )
    db.commit()
    return jsonify({'ok': True})


@basicnotes_bp.route('/api/basic-notes/<int:note_id>', methods=['DELETE'])
def api_basic_notes_delete(note_id):
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    row = _fetch_note_for_user(db, note_id, user['id'])
    if not row:
        return jsonify({'error': 'Note not found.'}), 404

    db.execute("DELETE FROM basic_notes WHERE id = ? AND user_id = ?", (note_id, user['id']))
    db.commit()

    unlocked_ids = _get_unlocked_note_ids()
    if note_id in unlocked_ids:
        unlocked_ids.remove(note_id)
        _set_unlocked_note_ids(unlocked_ids)
    return jsonify({'ok': True})


@basicnotes_bp.route('/api/basic-notes/<int:note_id>/unlock', methods=['POST'])
def api_basic_notes_unlock(note_id):
    user, err = _require_user()
    if err:
        return err

    payload = request.get_json(silent=True) or {}
    password = str(payload.get('password') or '')

    db = get_db()
    row = _fetch_note_for_user(db, note_id, user['id'])
    if not row:
        return jsonify({'error': 'Note not found.'}), 404
    if not row['password_hash']:
        return jsonify({'ok': True, 'unlocked': True})
    if not check_password_hash(row['password_hash'], password):
        return jsonify({'error': 'Incorrect password.'}), 403

    unlocked_ids = _get_unlocked_note_ids()
    unlocked_ids.add(note_id)
    _set_unlocked_note_ids(unlocked_ids)
    return jsonify({'ok': True, 'unlocked': True})


@basicnotes_bp.route('/api/basic-notes/<int:note_id>/lock', methods=['POST'])
def api_basic_notes_lock(note_id):
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    row = _fetch_note_for_user(db, note_id, user['id'])
    if not row:
        return jsonify({'error': 'Note not found.'}), 404

    unlocked_ids = _get_unlocked_note_ids()
    if note_id in unlocked_ids:
        unlocked_ids.remove(note_id)
        _set_unlocked_note_ids(unlocked_ids)
    return jsonify({'ok': True})
