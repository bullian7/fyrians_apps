// ── Spotify Stats JS ─────────────────────────────────────────────

let currentRange = 'medium_term';
let cachedData = {};  // keyed by range

const RANGES = {
    short_term:  '~4 weeks',
    medium_term: '~6 months',
    long_term:   'all time'
};

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.range-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.range-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentRange = btn.dataset.range;
            loadRange(currentRange);
        });
    });
    setupAccountDataUpload();
    loadRange(currentRange);
});

// ── Data Fetching ─────────────────────────────────────────────────
async function loadRange(range) {
    if (cachedData[range]) {
        renderAll(cachedData[range], range);
        return;
    }
    showLoading(true);
    try {
        const [tracksRes, artistsRes, recentRes] = await Promise.all([
            fetch(`/api/spotify/top-tracks?range=${range}`),
            fetch(`/api/spotify/top-artists?range=${range}`),
            range === 'short_term' ? fetch('/api/spotify/recently-played') : Promise.resolve(null)
        ]);

        if (!tracksRes.ok || !artistsRes.ok) {
            const err = await tracksRes.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to load Spotify data');
        }

        const tracks = await tracksRes.json();
        const artists = await artistsRes.json();
        const recent = recentRes ? await recentRes.json() : null;

        const data = { tracks, artists, recent };
        cachedData[range] = data;
        renderAll(data, range);
    } catch (err) {
        showLoading(false);
        showError(err.message);
    }
}

// ── Render ────────────────────────────────────────────────────────
function renderAll(data, range) {
    showLoading(false);
    clearError();

    renderOverview(data, range);
    renderTracks(data.tracks.items || []);
    renderArtists(data.artists.items || []);
    renderGenres(data.artists.items || []);
    if (data.recent) renderRecent(data.recent.items || []);

    // Show/hide recently played panel based on range
    const recentPanel = document.getElementById('recent-panel');
    if (recentPanel) recentPanel.style.display = (range === 'short_term') ? '' : 'none';
}

function renderOverview(data, range) {
    const tracks = data.tracks.items || [];
    const artists = data.artists.items || [];

    document.getElementById('ov-tracks').textContent = tracks.length;
    document.getElementById('ov-artists').textContent = artists.length;

    // Avg popularity across top tracks
    const avgPop = tracks.length
        ? Math.round(tracks.reduce((s, t) => s + (t.popularity || 0), 0) / tracks.length)
        : 0;
    document.getElementById('ov-popularity').textContent = avgPop;


}

function renderTracks(tracks) {
    const list = document.getElementById('top-tracks-list');
    if (!tracks.length) { list.innerHTML = '<li class="track-item" style="color:var(--text-dim);font-size:0.85rem;">No data available.</li>'; return; }

    list.innerHTML = tracks.slice(0, 50).map((t, i) => {
        const art = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || '';
        const artist = t.artists?.map(a => a.name).join(', ') || '';
        const dur = msToMinSec(t.duration_ms);
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        const pop = t.popularity || 0;
        return `
        <li class="track-item">
            <span class="track-rank ${rankClass}">${i + 1}</span>
            ${art
                ? `<img class="track-art" src="${escHtml(art)}" alt="" loading="lazy">`
                : `<div class="track-art-placeholder">♪</div>`}
            <div class="track-info">
                <div class="track-name" title="${escHtml(t.name)}">${escHtml(t.name)}</div>
                <div class="track-artist" title="${escHtml(artist)}">${escHtml(artist)}</div>
            </div>
            <div class="pop-bar" title="Popularity: ${pop}"><div class="pop-bar-fill" style="width:${pop}%"></div></div>
            <span class="track-duration">${dur}</span>
        </li>`;
    }).join('');
}

function renderArtists(artists) {
    const list = document.getElementById('top-artists-list');
    if (!artists.length) { list.innerHTML = '<li class="artist-item" style="color:var(--text-dim);font-size:0.85rem;">No data available.</li>'; return; }

    list.innerHTML = artists.slice(0, 50).map((a, i) => {
        const art = a.images?.[2]?.url || a.images?.[0]?.url || '';
        const genres = a.genres?.slice(0, 2).join(', ') || 'unknown genre';
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        return `
        <li class="artist-item">
            <span class="track-rank ${rankClass}">${i + 1}</span>
            ${art
                ? `<img class="artist-art" src="${escHtml(art)}" alt="" loading="lazy">`
                : `<div class="artist-art-placeholder">♪</div>`}
            <div class="artist-info">
                <div class="artist-name">${escHtml(a.name)}</div>
                <div class="artist-genres">${escHtml(genres)}</div>
            </div>
        </li>`;
    }).join('');
}

function renderGenres(artists) {
    const counts = {};
    artists.forEach(a => {
        (a.genres || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; });
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const max = sorted[0]?.[1] || 1;

    const list = document.getElementById('genre-list');
    if (!sorted.length) { list.innerHTML = '<li style="color:var(--text-dim);font-size:0.85rem;">No genre data.</li>'; return; }

    list.innerHTML = sorted.map(([genre, count]) => `
        <li class="genre-item">
            <div class="genre-header">
                <span class="genre-name">${escHtml(genre)}</span>
                <span class="genre-count">${count} artist${count !== 1 ? 's' : ''}</span>
            </div>
            <div class="genre-bar-bg">
                <div class="genre-bar-fill" style="width:${Math.round(count / max * 100)}%"></div>
            </div>
        </li>`).join('');
}

function renderRecent(items) {
    const list = document.getElementById('recent-list');
    if (!items.length) { list.innerHTML = '<li class="recent-item" style="color:var(--text-dim);font-size:0.85rem;">No recent plays found.</li>'; return; }

    list.innerHTML = items.slice(0, 50).map(item => {
        const t = item.track;
        const art = t?.album?.images?.[2]?.url || t?.album?.images?.[0]?.url || '';
        const artist = t?.artists?.map(a => a.name).join(', ') || '';
        const playedAt = item.played_at ? timeAgo(item.played_at) : '';
        return `
        <li class="recent-item">
            ${art
                ? `<img class="track-art" src="${escHtml(art)}" alt="" loading="lazy">`
                : `<div class="track-art-placeholder">♪</div>`}
            <div class="track-info">
                <div class="track-name">${escHtml(t?.name || '?')}</div>
                <div class="track-artist">${escHtml(artist)}</div>
            </div>
            <span class="recent-time">${playedAt}</span>
        </li>`;
    }).join('');
}

// ── Account Data Upload (Past 12 Months) ────────────────────────
function setupAccountDataUpload() {
    const input = document.getElementById('account-data-input');
    const clearBtn = document.getElementById('account-data-clear');
    const uploadList = document.getElementById('account-upload-list');
    if (!input || !clearBtn || !uploadList) return;

    loadSavedAccountData();

    input.addEventListener('change', async () => {
        const files = Array.from(input.files || []);
        if (!files.length) return;

        setAccountStatus('Uploading account data...');
        try {
            const formData = new FormData();
            files.forEach((file) => formData.append('files', file));
            const res = await fetch('/api/spotify/account-data/uploads', {
                method: 'POST',
                body: formData
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload.error || 'Failed to upload account data.');
            }

            applyAccountDataPayload(payload);
            setAccountStatus(payload.message || 'Upload complete.');
        } catch (err) {
            setAccountStatus(err.message || 'Failed to read account data.');
            if (window.FyrianPopup) {
                await window.FyrianPopup.alert(err.message || 'Failed to read account data.', { title: 'Spotify Account Data' });
            }
        } finally {
            input.value = '';
        }
    });

    clearBtn.addEventListener('click', async () => {
        const confirmed = window.FyrianPopup
            ? await window.FyrianPopup.confirm('Delete all uploaded history files from your account?', {
                title: 'Delete Uploads',
                danger: true,
                okText: 'Delete'
            })
            : window.confirm('Delete all uploaded history files from your account?');
        if (!confirmed) return;

        try {
            const res = await fetch('/api/spotify/account-data/uploads', { method: 'DELETE' });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload.error || 'Failed to delete uploads.');
            }
            applyAccountDataPayload(payload);
            setAccountStatus(payload.message || 'Deleted all uploads.');
        } catch (err) {
            setAccountStatus(err.message || 'Failed to delete uploads.');
        }
    });
}

async function loadSavedAccountData() {
    try {
        const res = await fetch('/api/spotify/account-data');
        const payload = await res.json().catch(() => ({}));
        if (res.status === 401) {
            resetAccountDataUI('Sign in to save uploaded history to your account.');
            return;
        }
        if (!res.ok) {
            throw new Error(payload.error || 'Failed to load saved account data.');
        }
        applyAccountDataPayload(payload);
        if ((payload.uploads || []).length) {
            setAccountStatus(`Loaded ${(payload.uploads || []).length} saved upload(s) from your account.`);
        }
    } catch (err) {
        setAccountStatus(err.message || 'Failed to load saved account data.');
    }
}

function applyAccountDataPayload(payload) {
    const uploads = Array.isArray(payload?.uploads) ? payload.uploads : [];
    const stats = payload?.stats || {};

    renderAccountUploads(uploads);
    renderAccountDataStats(stats);

    const clearBtn = document.getElementById('account-data-clear');
    if (clearBtn) clearBtn.classList.toggle('hidden', uploads.length === 0);
    if (uploads.length === 0) {
        setAccountStatus('No account data uploaded yet.');
    }
}

function renderAccountUploads(uploads) {
    const list = document.getElementById('account-upload-list');
    if (!list) return;

    if (!uploads.length) {
        list.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    list.classList.remove('hidden');
    list.innerHTML = uploads.map((upload) => `
        <li class="account-upload-item">
            <div class="account-upload-meta">
                <span class="account-upload-name">${escHtml(upload.filename || 'upload.json')}</span>
                <span class="account-upload-count">${formatNum(upload.row_count || 0)} rows</span>
            </div>
            <button class="account-upload-delete" type="button" data-upload-id="${upload.id}">Delete</button>
        </li>
    `).join('');

    list.querySelectorAll('.account-upload-delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const uploadId = btn.dataset.uploadId;
            if (!uploadId) return;
            const confirmed = window.FyrianPopup
                ? await window.FyrianPopup.confirm('Delete this uploaded history file?', {
                    title: 'Delete Upload',
                    danger: true,
                    okText: 'Delete'
                })
                : window.confirm('Delete this uploaded history file?');
            if (!confirmed) return;

            try {
                const res = await fetch(`/api/spotify/account-data/uploads/${uploadId}`, { method: 'DELETE' });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(payload.error || 'Failed to delete upload.');
                }
                applyAccountDataPayload(payload);
                setAccountStatus(payload.message || 'Deleted upload.');
            } catch (err) {
                setAccountStatus(err.message || 'Failed to delete upload.');
            }
        });
    });
}

function renderAccountDataStats(stats) {
    const hasData = Number(stats?.totalStreams || 0) > 0;
    document.getElementById('account-data-results').classList.toggle('hidden', !hasData);
    document.getElementById('account-top-tracks-wrap').classList.toggle('hidden', !hasData);

    document.getElementById('ad-minutes').textContent = hasData ? formatNum(stats?.totalMinutes) : '—';
    document.getElementById('ad-streams').textContent = hasData ? formatNum(stats?.totalStreams) : '—';
    document.getElementById('ad-unique-tracks').textContent = hasData ? formatNum(stats?.uniqueTracks) : '—';
    document.getElementById('ad-unique-artists').textContent = hasData ? formatNum(stats?.uniqueArtists) : '—';
    document.getElementById('ad-top-track').textContent = hasData && stats?.topTrack
        ? `${stats.topTrack.trackName} (${formatNum(stats.topTrack.plays)}x)`
        : '—';
    document.getElementById('ad-top-artist').textContent = hasData && stats?.topArtist
        ? `${stats.topArtist.artistName} (${formatNum(stats.topArtist.plays)}x)`
        : '—';

    const topList = document.getElementById('account-top-tracks');
    if (!hasData) {
        topList.innerHTML = '';
        return;
    }

    topList.innerHTML = (stats?.topTracks || []).map((item, i) => `
        <li class="track-item">
            <span class="track-rank">${i + 1}</span>
            <div class="track-art-placeholder">♪</div>
            <div class="track-info">
                <div class="track-name" title="${escHtml(item.trackName)}">${escHtml(item.trackName)}</div>
                <div class="track-artist" title="${escHtml(item.artistName)}">${escHtml(item.artistName)}</div>
            </div>
            <span class="track-duration">${formatNum(item.plays)}x</span>
        </li>
    `).join('');
}

function resetAccountDataUI(statusText = 'No account data uploaded yet.') {
    document.getElementById('account-data-results').classList.add('hidden');
    document.getElementById('account-top-tracks-wrap').classList.add('hidden');
    document.getElementById('account-upload-list').classList.add('hidden');
    document.getElementById('account-upload-list').innerHTML = '';
    document.getElementById('account-top-tracks').innerHTML = '';
    document.getElementById('ad-minutes').textContent = '—';
    document.getElementById('ad-streams').textContent = '—';
    document.getElementById('ad-top-track').textContent = '—';
    document.getElementById('ad-top-artist').textContent = '—';
    document.getElementById('ad-unique-tracks').textContent = '—';
    document.getElementById('ad-unique-artists').textContent = '—';
    document.getElementById('account-data-clear').classList.add('hidden');
    setAccountStatus(statusText);
}

function setAccountStatus(text) {
    const statusEl = document.getElementById('account-data-status');
    if (statusEl) {
        statusEl.textContent = text;
    }
}

// ── UI Helpers ────────────────────────────────────────────────────
function showLoading(on) {
    document.getElementById('loading-state').style.display = on ? 'flex' : 'none';
    document.getElementById('dashboard').style.display = on ? 'none' : '';
}

function showError(msg) {
    const el = document.getElementById('error-banner');
    el.textContent = '⚠ ' + msg;
    el.classList.remove('hidden');
}

function clearError() {
    document.getElementById('error-banner').classList.add('hidden');
}

// ── Formatters ────────────────────────────────────────────────────
function msToMinSec(ms) {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function msToHours(ms) {
    const h = ms / 3600000;
    return h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(ms / 60000)}m`;
}

function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function formatNum(value) {
    return Number(value || 0).toLocaleString();
}

function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
