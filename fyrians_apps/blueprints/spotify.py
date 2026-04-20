import os
import secrets
import urllib.parse
import json
from datetime import datetime, timezone

import requests
from flask import Blueprint, g, jsonify, redirect, render_template, request, session

from db import get_db

spotify_bp = Blueprint('spotify_bp', __name__)

SPOTIFY_CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID', '')
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET', '')
SPOTIFY_REDIRECT_URI = os.environ.get('SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:5001/spotify/callback')

SPOTIFY_SCOPES = ' '.join([
    'user-top-read',
    'user-read-recently-played',
    'user-read-private',
    'user-read-email',
])

SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize'
SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
SPOTIFY_API_BASE = 'https://api.spotify.com/v1'


def _require_user():
    user = g.get('current_user')
    if not user:
        return None, (jsonify({'error': 'Sign in required'}), 401)
    return user, None


def _parse_history_timestamp(raw):
    if raw is None:
        return None

    if isinstance(raw, (int, float)):
        numeric = int(raw)
        return numeric if numeric > 10**12 else numeric * 1000

    text = str(raw).strip()
    if not text:
        return None

    if text.isdigit():
        numeric = int(text)
        return numeric if numeric > 10**12 else numeric * 1000

    normalized = text
    if ' ' in normalized and 'T' not in normalized:
        normalized = normalized.replace(' ', 'T')
    if len(normalized) == 16 and normalized.count(':') == 1:
        normalized += ':00'
    if normalized.endswith('Z'):
        normalized = normalized[:-1] + '+00:00'

    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _normalize_history_entries(payload):
    rows = payload if isinstance(payload, list) else (payload.get('items') if isinstance(payload, dict) else [])
    if not isinstance(rows, list):
        return []

    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue

        ts = _parse_history_timestamp(
            row.get('ts') or row.get('played_at') or row.get('endTime') or row.get('end_time') or row.get('timestamp')
        )
        if ts is None:
            continue

        track_name = str(
            row.get('master_metadata_track_name')
            or row.get('trackName')
            or row.get('track_name')
            or row.get('spotify_track_name')
            or ''
        ).strip()
        artist_name = str(
            row.get('master_metadata_album_artist_name')
            or row.get('artistName')
            or row.get('artist_name')
            or row.get('spotify_artist_name')
            or ''
        ).strip()
        if not track_name and not artist_name:
            continue

        ms_raw = row.get('ms_played', row.get('msPlayed', 0))
        try:
            ms_played = max(0, int(float(ms_raw)))
        except (TypeError, ValueError):
            ms_played = 0

        out.append({
            'ts': ts,
            'track_name': track_name or 'Unknown Track',
            'artist_name': artist_name or 'Unknown Artist',
            'ms_played': ms_played,
        })

    return out


def _compute_account_data_stats(rows):
    now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    cutoff_ms = now_ms - (365 * 24 * 60 * 60 * 1000)
    year_rows = [r for r in rows if cutoff_ms <= r['ts'] <= (now_ms + 60000)]

    track_map = {}
    artist_map = {}
    day_set = set()
    total_ms = 0

    for row in year_rows:
        total_ms += row['ms_played']
        day_key = datetime.fromtimestamp(row['ts'] / 1000, tz=timezone.utc).strftime('%Y-%m-%d')
        day_set.add(day_key)

        track_key = f"{row['track_name']}|||{row['artist_name']}"
        track = track_map.get(track_key) or {
            'trackName': row['track_name'],
            'artistName': row['artist_name'],
            'plays': 0,
            'msPlayed': 0,
        }
        track['plays'] += 1
        track['msPlayed'] += row['ms_played']
        track_map[track_key] = track

        artist = artist_map.get(row['artist_name']) or {
            'artistName': row['artist_name'],
            'plays': 0,
            'msPlayed': 0,
        }
        artist['plays'] += 1
        artist['msPlayed'] += row['ms_played']
        artist_map[row['artist_name']] = artist

    top_tracks = sorted(
        track_map.values(),
        key=lambda x: (-x['plays'], -x['msPlayed'], x['trackName'].lower()),
    )
    top_artists = sorted(
        artist_map.values(),
        key=lambda x: (-x['plays'], -x['msPlayed'], x['artistName'].lower()),
    )

    return {
        'totalStreams': len(year_rows),
        'totalMs': total_ms,
        'totalMinutes': round(total_ms / 60000),
        'uniqueTracks': len(track_map),
        'uniqueArtists': len(artist_map),
        'activeDays': len(day_set),
        'topTrack': top_tracks[0] if top_tracks else None,
        'topArtist': top_artists[0] if top_artists else None,
        'topTracks': top_tracks[:12],
    }


def _account_data_payload(user_id):
    db = get_db()
    uploads = db.execute(
        """
        SELECT id, filename, row_count, created_at
        FROM spotify_history_uploads
        WHERE user_id = ?
        ORDER BY id DESC
        """,
        (user_id,),
    ).fetchall()

    rows = db.execute(
        """
        SELECT played_at_ms AS ts, track_name, artist_name, ms_played
        FROM spotify_history_entries
        WHERE user_id = ?
        ORDER BY played_at_ms DESC
        """,
        (user_id,),
    ).fetchall()

    stats = _compute_account_data_stats([dict(r) for r in rows])
    return {
        'uploads': [dict(r) for r in uploads],
        'stats': stats,
    }


def spotify_get(endpoint, token, params=None):
    headers = {'Authorization': f'Bearer {token}'}
    url = f'{SPOTIFY_API_BASE}{endpoint}'
    resp = requests.get(url, headers=headers, params=params, timeout=10)

    if resp.status_code == 401:
        new_token = refresh_access_token()
        if new_token:
            headers['Authorization'] = f'Bearer {new_token}'
            resp = requests.get(url, headers=headers, params=params, timeout=10)
        else:
            return None, 'Session expired. Please reconnect.'

    if resp.status_code != 200:
        try:
            msg = resp.json().get('error', {}).get('message', f'HTTP {resp.status_code}')
        except Exception:
            msg = f'HTTP {resp.status_code}'
        return None, msg

    return resp.json(), None


def refresh_access_token():
    refresh_token = session.get('spotify_refresh_token')
    if not refresh_token:
        return None

    resp = requests.post(
        SPOTIFY_TOKEN_URL,
        data={
            'grant_type': 'refresh_token',
            'refresh_token': refresh_token,
            'client_id': SPOTIFY_CLIENT_ID,
            'client_secret': SPOTIFY_CLIENT_SECRET,
        },
        timeout=10,
    )

    if resp.status_code == 200:
        data = resp.json()
        session['spotify_access_token'] = data['access_token']
        if 'refresh_token' in data:
            session['spotify_refresh_token'] = data['refresh_token']
        return data['access_token']

    return None


def get_token():
    return session.get('spotify_access_token')


def is_logged_in():
    return bool(session.get('spotify_access_token'))


@spotify_bp.route('/spotify')
def spotify():
    auth_error = request.args.get('error')
    if not is_logged_in():
        return render_template('spotify.html', logged_in=False, user=None, auth_error=auth_error)

    token = get_token()
    user, err = spotify_get('/me', token)
    if err:
        session.pop('spotify_access_token', None)
        session.pop('spotify_refresh_token', None)
        return render_template('spotify.html', logged_in=False, user=None, auth_error=auth_error)

    return render_template('spotify.html', logged_in=True, user=user, auth_error=auth_error)


@spotify_bp.route('/spotify/login')
def spotify_login():
    if not SPOTIFY_CLIENT_ID:
        return 'Spotify client ID not configured. Set SPOTIFY_CLIENT_ID environment variable.', 500

    state = secrets.token_urlsafe(16)
    session['spotify_oauth_state'] = state

    params = {
        'response_type': 'code',
        'client_id': SPOTIFY_CLIENT_ID,
        'scope': SPOTIFY_SCOPES,
        'redirect_uri': SPOTIFY_REDIRECT_URI,
        'state': state,
        'show_dialog': 'false',
    }
    auth_url = SPOTIFY_AUTH_URL + '?' + urllib.parse.urlencode(params)
    return redirect(auth_url)


@spotify_bp.route('/spotify/callback')
def spotify_callback():
    error = request.args.get('error')
    if error:
        return redirect('/spotify?error=' + urllib.parse.quote(error))

    code = request.args.get('code')
    state = request.args.get('state')

    if state != session.get('spotify_oauth_state'):
        return redirect('/spotify?error=state_mismatch')

    session.pop('spotify_oauth_state', None)

    resp = requests.post(
        SPOTIFY_TOKEN_URL,
        data={
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': SPOTIFY_REDIRECT_URI,
            'client_id': SPOTIFY_CLIENT_ID,
            'client_secret': SPOTIFY_CLIENT_SECRET,
        },
        timeout=10,
    )

    if resp.status_code != 200:
        return redirect('/spotify?error=token_exchange_failed')

    data = resp.json()
    session['spotify_access_token'] = data['access_token']
    session['spotify_refresh_token'] = data.get('refresh_token', '')
    session.permanent = True

    return redirect('/spotify')


@spotify_bp.route('/spotify/logout')
def spotify_logout():
    session.pop('spotify_access_token', None)
    session.pop('spotify_refresh_token', None)
    return redirect('/spotify')


@spotify_bp.route('/api/spotify/top-tracks')
def api_spotify_top_tracks():
    if not is_logged_in():
        return jsonify({'error': 'Not authenticated'}), 401

    time_range = request.args.get('range', 'medium_term')
    if time_range not in ('short_term', 'medium_term', 'long_term'):
        return jsonify({'error': 'Invalid range'}), 400

    token = get_token()
    data, err = spotify_get('/me/top/tracks', token, params={
        'time_range': time_range,
        'limit': 50,
        'offset': 0,
    })
    if err:
        return jsonify({'error': err}), 400

    return jsonify(data)


@spotify_bp.route('/api/spotify/top-artists')
def api_spotify_top_artists():
    if not is_logged_in():
        return jsonify({'error': 'Not authenticated'}), 401

    time_range = request.args.get('range', 'medium_term')
    if time_range not in ('short_term', 'medium_term', 'long_term'):
        return jsonify({'error': 'Invalid range'}), 400

    token = get_token()
    data, err = spotify_get('/me/top/artists', token, params={
        'time_range': time_range,
        'limit': 50,
        'offset': 0,
    })
    if err:
        return jsonify({'error': err}), 400

    return jsonify(data)


@spotify_bp.route('/api/spotify/recently-played')
def api_spotify_recently_played():
    if not is_logged_in():
        return jsonify({'error': 'Not authenticated'}), 401

    token = get_token()
    data, err = spotify_get('/me/player/recently-played', token, params={'limit': 50})
    if err:
        return jsonify({'error': err}), 400

    return jsonify(data)


@spotify_bp.route('/api/spotify/account-data')
def api_spotify_account_data():
    user, err = _require_user()
    if err:
        return err
    return jsonify(_account_data_payload(user['id']))


@spotify_bp.route('/api/spotify/account-data/uploads', methods=['POST'])
def api_spotify_account_data_uploads():
    user, err = _require_user()
    if err:
        return err

    files = request.files.getlist('files')
    if not files:
        return jsonify({'error': 'No files provided.'}), 400

    db = get_db()
    added_files = 0
    added_rows = 0

    for storage in files:
        filename = (storage.filename or 'upload.json').strip()[:255]
        raw_bytes = storage.read()
        try:
            text = raw_bytes.decode('utf-8')
            payload = json.loads(text)
        except Exception:
            return jsonify({'error': f'"{filename}" is not valid JSON.'}), 400

        entries = _normalize_history_entries(payload)
        if not entries:
            continue

        cur = db.execute(
            """
            INSERT INTO spotify_history_uploads (user_id, filename, row_count)
            VALUES (?, ?, ?)
            """,
            (user['id'], filename, len(entries)),
        )
        upload_id = cur.lastrowid
        db.executemany(
            """
            INSERT INTO spotify_history_entries
            (user_id, upload_id, played_at_ms, track_name, artist_name, ms_played)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    user['id'],
                    upload_id,
                    entry['ts'],
                    entry['track_name'],
                    entry['artist_name'],
                    entry['ms_played'],
                )
                for entry in entries
            ],
        )
        added_files += 1
        added_rows += len(entries)

    if added_files == 0:
        return jsonify({'error': 'No streaming history rows found in the uploaded files.'}), 400

    db.commit()
    payload = _account_data_payload(user['id'])
    payload['message'] = f'Saved {added_files} file{"s" if added_files != 1 else ""} ({added_rows} rows).'
    return jsonify(payload)


@spotify_bp.route('/api/spotify/account-data/uploads', methods=['DELETE'])
def api_spotify_account_data_delete_all():
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    db.execute("DELETE FROM spotify_history_entries WHERE user_id = ?", (user['id'],))
    db.execute("DELETE FROM spotify_history_uploads WHERE user_id = ?", (user['id'],))
    db.commit()
    payload = _account_data_payload(user['id'])
    payload['message'] = 'Deleted all uploaded history files.'
    return jsonify(payload)


@spotify_bp.route('/api/spotify/account-data/uploads/<int:upload_id>', methods=['DELETE'])
def api_spotify_account_data_delete_upload(upload_id):
    user, err = _require_user()
    if err:
        return err

    db = get_db()
    row = db.execute(
        "SELECT id FROM spotify_history_uploads WHERE id = ? AND user_id = ?",
        (upload_id, user['id']),
    ).fetchone()
    if not row:
        return jsonify({'error': 'Upload not found.'}), 404

    db.execute("DELETE FROM spotify_history_entries WHERE upload_id = ? AND user_id = ?", (upload_id, user['id']))
    db.execute("DELETE FROM spotify_history_uploads WHERE id = ? AND user_id = ?", (upload_id, user['id']))
    db.commit()
    payload = _account_data_payload(user['id'])
    payload['message'] = 'Deleted upload.'
    return jsonify(payload)
