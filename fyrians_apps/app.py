import os
import random
import heapq
import time
import urllib.parse
import secrets
import requests
from flask import Flask, render_template, request, jsonify, redirect, session, url_for

app = Flask(__name__)

# ── Secret key for sessions (set a real one via env var in production) ──
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-change-in-prod')

# ── Spotify OAuth config (set these as env vars) ──────────────────────
SPOTIFY_CLIENT_ID     = os.environ.get('SPOTIFY_CLIENT_ID', '')
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET', '')
SPOTIFY_REDIRECT_URI  = os.environ.get('SPOTIFY_REDIRECT_URI', 'http://localhost:5000/spotify/callback')

SPOTIFY_SCOPES = ' '.join([
    'user-top-read',
    'user-read-recently-played',
    'user-read-private',
    'user-read-email',
])

SPOTIFY_AUTH_URL  = 'https://accounts.spotify.com/authorize'
SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
SPOTIFY_API_BASE  = 'https://api.spotify.com/v1'


# ── Load Words for Typing App ─────────────────────────────────────────
ALL_WORDS = ["the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
             "it", "for", "not", "on", "with"]
try:
    if os.path.exists('words.txt'):
        with open('words.txt', 'r', encoding='utf-8') as f:
            words_from_file = [line.strip().lower() for line in f if line.strip()]
            if words_from_file:
                ALL_WORDS = words_from_file
        print(f"Loaded {len(ALL_WORDS)} words successfully!")
    else:
        print("words.txt not found. Using default fallback words.")
except Exception as e:
    print(f"Error loading words.txt: {e}")


# ═══════════════════════════════════════════════════════════════════════
#  SPOTIFY HELPERS
# ═══════════════════════════════════════════════════════════════════════

def spotify_get(endpoint, token, params=None):
    """GET from Spotify API, handling 401 token refresh automatically."""
    headers = {'Authorization': f'Bearer {token}'}
    url = f"{SPOTIFY_API_BASE}{endpoint}"
    resp = requests.get(url, headers=headers, params=params, timeout=10)

    if resp.status_code == 401:
        # Try to refresh
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
    """Refresh the Spotify access token using the stored refresh token."""
    refresh_token = session.get('spotify_refresh_token')
    if not refresh_token:
        return None

    resp = requests.post(SPOTIFY_TOKEN_URL, data={
        'grant_type':    'refresh_token',
        'refresh_token': refresh_token,
        'client_id':     SPOTIFY_CLIENT_ID,
        'client_secret': SPOTIFY_CLIENT_SECRET,
    }, timeout=10)

    if resp.status_code == 200:
        data = resp.json()
        session['spotify_access_token'] = data['access_token']
        # Spotify sometimes returns a new refresh token
        if 'refresh_token' in data:
            session['spotify_refresh_token'] = data['refresh_token']
        return data['access_token']
    return None


def get_token():
    return session.get('spotify_access_token')


def is_logged_in():
    return bool(session.get('spotify_access_token'))


# ═══════════════════════════════════════════════════════════════════════
#  EXISTING ROUTES
# ═══════════════════════════════════════════════════════════════════════

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/schedule')
def schedule():
    return render_template('schedule.html')

@app.route('/typing')
def typing():
    return render_template('typing.html')


# ═══════════════════════════════════════════════════════════════════════
#  SPOTIFY ROUTES
# ═══════════════════════════════════════════════════════════════════════

@app.route('/spotify')
def spotify():
    if not is_logged_in():
        return render_template('spotify.html', logged_in=False, user=None)

    # Fetch the user profile to show in the header
    token = get_token()
    user, err = spotify_get('/me', token)
    if err:
        # If we can't get profile, force re-login
        session.clear()
        return render_template('spotify.html', logged_in=False, user=None)

    return render_template('spotify.html', logged_in=True, user=user)


@app.route('/spotify/login')
def spotify_login():
    if not SPOTIFY_CLIENT_ID:
        return "Spotify client ID not configured. Set SPOTIFY_CLIENT_ID environment variable.", 500

    state = secrets.token_urlsafe(16)
    session['spotify_oauth_state'] = state

    params = {
        'response_type': 'code',
        'client_id':     SPOTIFY_CLIENT_ID,
        'scope':         SPOTIFY_SCOPES,
        'redirect_uri':  SPOTIFY_REDIRECT_URI,
        'state':         state,
        'show_dialog':   'false',
    }
    auth_url = SPOTIFY_AUTH_URL + '?' + urllib.parse.urlencode(params)
    return redirect(auth_url)


@app.route('/spotify/callback')
def spotify_callback():
    error = request.args.get('error')
    if error:
        return redirect('/spotify?error=' + urllib.parse.quote(error))

    code  = request.args.get('code')
    state = request.args.get('state')

    # Validate state to prevent CSRF
    if state != session.get('spotify_oauth_state'):
        return redirect('/spotify?error=state_mismatch')

    session.pop('spotify_oauth_state', None)

    # Exchange code for tokens
    resp = requests.post(SPOTIFY_TOKEN_URL, data={
        'grant_type':   'authorization_code',
        'code':         code,
        'redirect_uri': SPOTIFY_REDIRECT_URI,
        'client_id':     SPOTIFY_CLIENT_ID,
        'client_secret': SPOTIFY_CLIENT_SECRET,
    }, timeout=10)

    if resp.status_code != 200:
        return redirect('/spotify?error=token_exchange_failed')

    data = resp.json()
    session['spotify_access_token']  = data['access_token']
    session['spotify_refresh_token'] = data.get('refresh_token', '')
    session.permanent = True  # persist across browser restarts

    return redirect('/spotify')


@app.route('/spotify/logout')
def spotify_logout():
    session.pop('spotify_access_token', None)
    session.pop('spotify_refresh_token', None)
    return redirect('/spotify')


# ── Spotify Data API Endpoints ────────────────────────────────────────

@app.route('/api/spotify/top-tracks')
def api_spotify_top_tracks():
    if not is_logged_in():
        return jsonify({'error': 'Not authenticated'}), 401

    time_range = request.args.get('range', 'medium_term')
    if time_range not in ('short_term', 'medium_term', 'long_term'):
        return jsonify({'error': 'Invalid range'}), 400

    token = get_token()
    data, err = spotify_get('/me/top/tracks', token, params={
        'time_range': time_range,
        'limit':      50,
        'offset':     0,
    })
    if err:
        return jsonify({'error': err}), 400

    return jsonify(data)


@app.route('/api/spotify/top-artists')
def api_spotify_top_artists():
    if not is_logged_in():
        return jsonify({'error': 'Not authenticated'}), 401

    time_range = request.args.get('range', 'medium_term')
    if time_range not in ('short_term', 'medium_term', 'long_term'):
        return jsonify({'error': 'Invalid range'}), 400

    token = get_token()
    data, err = spotify_get('/me/top/artists', token, params={
        'time_range': time_range,
        'limit':      50,
        'offset':     0,
    })
    if err:
        return jsonify({'error': err}), 400

    return jsonify(data)


@app.route('/api/spotify/recently-played')
def api_spotify_recently_played():
    if not is_logged_in():
        return jsonify({'error': 'Not authenticated'}), 401

    token = get_token()
    data, err = spotify_get('/me/player/recently-played', token, params={'limit': 50})
    if err:
        return jsonify({'error': err}), 400

    return jsonify(data)


# ═══════════════════════════════════════════════════════════════════════
#  SCHEDULE OPTIMIZER LOGIC  (unchanged)
# ═══════════════════════════════════════════════════════════════════════

def solve_schedule(students, time_slots):
    n = len(students)
    score_matrix = [[0] * n for _ in range(n)]
    for i, student in enumerate(students):
        for pref_rank, slot in enumerate(student["preferences"]):
            if slot > 0:
                score_matrix[i][slot - 1] = 3 - pref_rank

    best = {"score": -999999, "assignment": None}
    nodes_explored = [0]

    def calculate_upper_bound(slots, used, depth, score):
        bound = score
        for i in range(depth, n):
            max_possible = 0
            has_preferences = any(p != 0 for p in students[i]["preferences"])
            for j, pref in enumerate(students[i]["preferences"]):
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

        if bound <= best["score"]:
            continue

        if depth == n:
            if score > best["score"]:
                best["score"] = score
                best["assignment"] = list(slots)
            continue

        used = list(used_tuple)
        student_idx = depth
        candidates = []
        has_preferences = any(p != 0 for p in students[student_idx]["preferences"])

        for j, pref in enumerate(students[student_idx]["preferences"]):
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
            if new_bound > best["score"]:
                heapq.heappush(heap, (-new_bound, depth + 1, new_slots, tuple(new_used), new_score))

    assignment = best["assignment"]
    if assignment is None:
        return None

    results = []
    first_choice = second_choice = third_choice = no_pref_missed = no_pref_given = 0

    for i in range(n):
        slot_idx = assignment[i]
        points = score_matrix[i][slot_idx]
        had_prefs = any(p != 0 for p in students[i]["preferences"])

        if points == 3:
            rank = 1; first_choice += 1
        elif points == 2:
            rank = 2; second_choice += 1
        elif points == 1:
            rank = 3; third_choice += 1
        elif had_prefs:
            rank = 0; no_pref_missed += 1
        else:
            rank = -1; no_pref_given += 1

        results.append({
            "student": students[i]["name"],
            "slot": time_slots[slot_idx],
            "rank": rank,
            "hadPreferences": had_prefs
        })

    display_score = sum(score_matrix[i][assignment[i]] for i in range(n) if score_matrix[i][assignment[i]] > 0)
    max_score = n * 3

    return {
        "assignments": results,
        "score": display_score,
        "maxScore": max_score,
        "satisfaction": round(display_score * 100.0 / max_score, 1) if max_score > 0 else 0,
        "firstChoice": first_choice,
        "secondChoice": second_choice,
        "thirdChoice": third_choice,
        "noPrefMissed": no_pref_missed,
        "noPrefGiven": no_pref_given,
        "nodesExplored": nodes_explored[0]
    }


@app.route('/api/optimize', methods=['POST'])
def api_optimize():
    data = request.json
    students   = data.get('students', [])
    time_slots = data.get('timeSlots', [])

    if not students or not time_slots:
        return jsonify({"error": "Missing students or time slots"}), 400
    if len(students) != len(time_slots):
        return jsonify({"error": "Number of students must equal number of time slots"}), 400

    start  = time.time()
    result = solve_schedule(students, time_slots)
    elapsed = round((time.time() - start) * 1000, 2)

    if result is None:
        return jsonify({"error": "Could not find a valid assignment"}), 500

    result["timeMs"] = elapsed
    return jsonify(result)


@app.route('/api/words')
def api_words():
    sample_size    = min(100, len(ALL_WORDS))
    selected_words = random.sample(ALL_WORDS, sample_size)
    return jsonify(selected_words)


if __name__ == '__main__':
    app.run(debug=True)