import os
import secrets
import urllib.parse

import requests
from flask import Blueprint, jsonify, redirect, render_template, request, session

spotify_bp = Blueprint('spotify_bp', __name__)

SPOTIFY_CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID', '')
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET', '')
SPOTIFY_REDIRECT_URI = os.environ.get('SPOTIFY_REDIRECT_URI', 'http://localhost:5000/spotify/callback')

SPOTIFY_SCOPES = ' '.join([
    'user-top-read',
    'user-read-recently-played',
    'user-read-private',
    'user-read-email',
])

SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize'
SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
SPOTIFY_API_BASE = 'https://api.spotify.com/v1'


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
    if not is_logged_in():
        return render_template('spotify.html', logged_in=False, user=None)

    token = get_token()
    user, err = spotify_get('/me', token)
    if err:
        session.clear()
        return render_template('spotify.html', logged_in=False, user=None)

    return render_template('spotify.html', logged_in=True, user=user)


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
