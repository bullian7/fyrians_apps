from flask import Blueprint, g, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db

quotebook_bp = Blueprint('quotebook_bp', __name__)


def _require_user():
    user = g.get('current_user')
    if not user:
        return None, (jsonify({'error': 'Sign in required'}), 401)
    return user, None


def _get_unlocked_ids():
    raw = session.get('quote_unlocked_folders') or []
    return {int(x) for x in raw if str(x).isdigit()}


def _set_unlocked_ids(folder_ids):
    session['quote_unlocked_folders'] = sorted(list(folder_ids))


def _folder_payload(row, unlocked_ids):
    is_locked = bool(row['password_hash'])
    return {
        'id': row['id'],
        'name': row['name'],
        'created_at': row['created_at'],
        'is_locked': is_locked,
        'unlocked': (not is_locked) or (row['id'] in unlocked_ids),
    }


def _fetch_folder_for_user(db, folder_id, user_id):
    return db.execute(
        """
        SELECT id, user_id, name, password_hash, created_at
        FROM quote_folders
        WHERE id = ? AND user_id = ?
        """,
        (folder_id, user_id),
    ).fetchone()


def _can_access_folder(folder_row, unlocked_ids):
    if not folder_row:
        return False
    if not folder_row['password_hash']:
        return True
    return folder_row['id'] in unlocked_ids


@quotebook_bp.route('/quotebook')
def quotebook():
    return render_template('quotebook.html')


@quotebook_bp.route('/api/quotebook/folders')
def api_quotebook_folders():
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    rows = db.execute(
        """
        SELECT id, user_id, name, password_hash, created_at
        FROM quote_folders
        WHERE user_id = ?
        ORDER BY id DESC
        """,
        (user['id'],),
    ).fetchall()
    unlocked_ids = _get_unlocked_ids()
    return jsonify({'folders': [_folder_payload(row, unlocked_ids) for row in rows]})


@quotebook_bp.route('/api/quotebook/folders', methods=['POST'])
def api_quotebook_create_folder():
    user, err = _require_user()
    if err:
        return err

    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name') or '').strip()[:120]
    password = str(payload.get('password') or '')

    if len(name) < 1:
        return jsonify({'error': 'Folder name is required.'}), 400

    password_hash = None
    if password:
        if len(password) < 3:
            return jsonify({'error': 'Folder password must be at least 3 characters.'}), 400
        password_hash = generate_password_hash(password)

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO quote_folders (user_id, name, password_hash)
        VALUES (?, ?, ?)
        """,
        (user['id'], name, password_hash),
    )
    db.commit()

    folder_id = cur.lastrowid
    unlocked_ids = _get_unlocked_ids()
    if not password_hash:
        unlocked_ids.add(folder_id)
        _set_unlocked_ids(unlocked_ids)

    row = _fetch_folder_for_user(db, folder_id, user['id'])
    return jsonify({'ok': True, 'folder': _folder_payload(row, _get_unlocked_ids())})


@quotebook_bp.route('/api/quotebook/folders/<int:folder_id>', methods=['DELETE'])
def api_quotebook_delete_folder(folder_id):
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    folder = _fetch_folder_for_user(db, folder_id, user['id'])
    if not folder:
        return jsonify({'error': 'Folder not found.'}), 404

    db.execute("DELETE FROM quotes WHERE folder_id = ? AND user_id = ?", (folder_id, user['id']))
    db.execute("DELETE FROM quote_folders WHERE id = ? AND user_id = ?", (folder_id, user['id']))
    db.commit()

    unlocked_ids = _get_unlocked_ids()
    if folder_id in unlocked_ids:
        unlocked_ids.remove(folder_id)
        _set_unlocked_ids(unlocked_ids)

    return jsonify({'ok': True})


@quotebook_bp.route('/api/quotebook/folders/<int:folder_id>/unlock', methods=['POST'])
def api_quotebook_unlock_folder(folder_id):
    user, err = _require_user()
    if err:
        return err

    payload = request.get_json(silent=True) or {}
    password = str(payload.get('password') or '')

    db = get_db()
    folder = _fetch_folder_for_user(db, folder_id, user['id'])
    if not folder:
        return jsonify({'error': 'Folder not found.'}), 404
    if not folder['password_hash']:
        return jsonify({'ok': True, 'unlocked': True})

    if not check_password_hash(folder['password_hash'], password):
        return jsonify({'error': 'Incorrect folder password.'}), 403

    unlocked_ids = _get_unlocked_ids()
    unlocked_ids.add(folder_id)
    _set_unlocked_ids(unlocked_ids)
    return jsonify({'ok': True, 'unlocked': True})


@quotebook_bp.route('/api/quotebook/folders/<int:folder_id>/lock', methods=['POST'])
def api_quotebook_lock_folder(folder_id):
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    folder = _fetch_folder_for_user(db, folder_id, user['id'])
    if not folder:
        return jsonify({'error': 'Folder not found.'}), 404

    unlocked_ids = _get_unlocked_ids()
    if folder_id in unlocked_ids:
        unlocked_ids.remove(folder_id)
        _set_unlocked_ids(unlocked_ids)
    return jsonify({'ok': True})


@quotebook_bp.route('/api/quotebook/folders/<int:folder_id>/quotes')
def api_quotebook_quotes(folder_id):
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    folder = _fetch_folder_for_user(db, folder_id, user['id'])
    if not folder:
        return jsonify({'error': 'Folder not found.'}), 404

    if not _can_access_folder(folder, _get_unlocked_ids()):
        return jsonify({'error': 'Folder locked.'}), 423

    rows = db.execute(
        """
        SELECT id, folder_id, said_by, quote_text, created_at
        FROM quotes
        WHERE user_id = ? AND folder_id = ?
        ORDER BY id DESC
        """,
        (user['id'], folder_id),
    ).fetchall()

    return jsonify({'quotes': [dict(row) for row in rows]})


@quotebook_bp.route('/api/quotebook/folders/<int:folder_id>/quotes', methods=['POST'])
def api_quotebook_create_quote(folder_id):
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    folder = _fetch_folder_for_user(db, folder_id, user['id'])
    if not folder:
        return jsonify({'error': 'Folder not found.'}), 404
    if not _can_access_folder(folder, _get_unlocked_ids()):
        return jsonify({'error': 'Folder locked.'}), 423

    payload = request.get_json(silent=True) or {}
    said_by = str(payload.get('said_by') or '').strip()[:140]
    quote_text = str(payload.get('quote_text') or '').strip()[:2000]

    if not said_by:
        return jsonify({'error': 'Who said it is required.'}), 400
    if not quote_text:
        return jsonify({'error': 'Quote text is required.'}), 400

    cur = db.execute(
        """
        INSERT INTO quotes (user_id, folder_id, said_by, quote_text)
        VALUES (?, ?, ?, ?)
        """,
        (user['id'], folder_id, said_by, quote_text),
    )
    db.commit()
    quote_id = cur.lastrowid

    row = db.execute(
        """
        SELECT id, folder_id, said_by, quote_text, created_at
        FROM quotes
        WHERE id = ? AND user_id = ?
        """,
        (quote_id, user['id']),
    ).fetchone()

    return jsonify({'ok': True, 'quote': dict(row)})


@quotebook_bp.route('/api/quotebook/quotes/<int:quote_id>', methods=['DELETE'])
def api_quotebook_delete_quote(quote_id):
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    row = db.execute(
        """
        SELECT q.id, q.folder_id, f.password_hash
        FROM quotes q
        JOIN quote_folders f ON f.id = q.folder_id
        WHERE q.id = ? AND q.user_id = ? AND f.user_id = ?
        """,
        (quote_id, user['id'], user['id']),
    ).fetchone()
    if not row:
        return jsonify({'error': 'Quote not found.'}), 404

    if row['password_hash'] and row['folder_id'] not in _get_unlocked_ids():
        return jsonify({'error': 'Folder locked.'}), 423

    db.execute("DELETE FROM quotes WHERE id = ? AND user_id = ?", (quote_id, user['id']))
    db.commit()
    return jsonify({'ok': True})
