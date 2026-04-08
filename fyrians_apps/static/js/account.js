const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const accountStatus = document.getElementById('account-status');
const nameInput = document.getElementById('account-name');
const passcodeInput = document.getElementById('account-passcode');
const dashTitle = document.getElementById('dash-title');

const dashFyrdle = document.getElementById('dash-fyrdle');
const dashTyping = document.getElementById('dash-typing');
const dashSudoku = document.getElementById('dash-sudoku');
const dashSchedule = document.getElementById('dash-schedule');
const dashReaction = document.getElementById('dash-reaction');
const profileExportBtn = document.getElementById('profile-export-btn');
const profileImportBtn = document.getElementById('profile-import-btn');
const profileImportFile = document.getElementById('profile-import-file');
const profileBackupStatus = document.getElementById('profile-backup-status');

function setStatus(text, isError = false) {
    accountStatus.textContent = text;
    accountStatus.classList.toggle('error', isError);
}

function setBackupStatus(text, isError = false) {
    if (!profileBackupStatus) return;
    profileBackupStatus.textContent = text;
    profileBackupStatus.classList.toggle('error', isError);
}

async function postJSON(url, payload) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
}

function fmtSeconds(seconds) {
    const total = Number(seconds) || 0;
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function esc(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderDashboard(data) {
    dashTitle.textContent = `${data.user.username}'s Dashboard`;

    const fyrPlayed = Number(data.fyrdle.played || 0);
    const fyrWins = Number(data.fyrdle.wins || 0);
    const fyrRate = fyrPlayed > 0 ? Math.round((fyrWins / fyrPlayed) * 100) : 0;
    dashFyrdle.innerHTML = `
        <div>Games: <strong>${fyrPlayed}</strong></div>
        <div>Wins: <strong>${fyrWins}</strong> (${fyrRate}%)</div>
        <div>Avg guesses (wins): <strong>${data.fyrdle.avg_win_guesses || 0}</strong></div>
        <div>Recent:</div>
        ${(data.fyrdle.recent || []).slice(0, 3).map((r) => `<div>• ${r.won ? 'Win' : 'Loss'} in ${r.guesses_used}/${r.max_guesses} (${esc(r.mode)})</div>`).join('') || '<div>• No games yet</div>'}
    `;

    dashTyping.innerHTML = `
        <div>Tests: <strong>${data.typing.tests}</strong></div>
        <div>Avg net WPM: <strong>${data.typing.avg_net_wpm}</strong></div>
        <div>Best net WPM: <strong>${data.typing.best_net_wpm}</strong></div>
        <div>Avg accuracy: <strong>${data.typing.avg_accuracy}%</strong></div>
        <div>Recent:</div>
        ${(data.typing.recent || []).slice(0, 3).map((r) => `<div>• ${Math.round(r.net_wpm)} net / ${Math.round(r.raw_wpm)} raw (${r.time_limit}s)</div>`).join('') || '<div>• No tests yet</div>'}
    `;

    dashSudoku.innerHTML = `
        <div>Games: <strong>${data.sudoku.games}</strong></div>
        <div>Solved: <strong>${data.sudoku.solved}</strong></div>
        <div>Avg solve: <strong>${data.sudoku.avg_solve_seconds ? fmtSeconds(data.sudoku.avg_solve_seconds) : '--:--'}</strong></div>
        <div>Best solve: <strong>${data.sudoku.best_solve_seconds ? fmtSeconds(data.sudoku.best_solve_seconds) : '--:--'}</strong></div>
        <div>Recent:</div>
        ${(data.sudoku.recent || []).slice(0, 3).map((r) => `<div>• ${esc(r.difficulty)} · ${r.solved ? 'solved' : 'abandoned'} · ${fmtSeconds(r.solve_seconds || 0)}</div>`).join('') || '<div>• No games yet</div>'}
    `;

    dashSchedule.innerHTML = `
        <div>Saved runs: <strong>${data.schedule.runs}</strong></div>
        <div>Recent:</div>
        ${(data.schedule.recent || []).slice(0, 3).map((r) => `<div>• ${esc(r.label || `${r.num_students} students`)} (#${r.id})</div>`).join('') || '<div>• No saved runs yet</div>'}
    `;

    dashReaction.innerHTML = `
        <div>Attempts: <strong>${data.reaction.attempts}</strong></div>
        <div>Valid tests: <strong>${data.reaction.valid_tests}</strong></div>
        <div>False starts: <strong>${data.reaction.false_starts}</strong></div>
        <div>Avg reaction: <strong>${data.reaction.avg_ms ? `${data.reaction.avg_ms}ms` : '--'}</strong></div>
        <div>Best reaction: <strong>${data.reaction.best_ms ? `${data.reaction.best_ms}ms` : '--'}</strong></div>
        <div>Recent:</div>
        ${(data.reaction.recent || []).slice(0, 3).map((r) => `<div>• ${r.false_start ? 'False start' : `${r.reaction_ms}ms`} (${esc(r.input_method)})</div>`).join('') || '<div>• No attempts yet</div>'}
    `;
}

async function loadDashboard() {
    const response = await fetch('/api/user/dashboard');
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not load dashboard');
    }
    const payload = await response.json();
    renderDashboard(payload);
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
}

async function refreshAuthState() {
    const meRes = await fetch('/api/auth/me');
    const me = await meRes.json();
    if (!me.logged_in) {
        authSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
        return;
    }
    await loadDashboard();
}

function buildLocalBackup() {
    const local = {};
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        local[key] = localStorage.getItem(key);
    }
    return {
        version: 1,
        exported_at: new Date().toISOString(),
        source: 'fyrians_apps',
        local_storage: local
    };
}

function downloadBackupFile() {
    const payload = buildLocalBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
    a.href = href;
    a.download = `fyrians-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
    setBackupStatus('Backup exported.');
}

async function confirmImportBackup() {
    if (window.FyrianPopup && typeof window.FyrianPopup.confirm === 'function') {
        return window.FyrianPopup.confirm('Importing will replace local app data for this browser. Continue?', {
            title: 'Import Backup',
            okText: 'Import',
            cancelText: 'Cancel',
            danger: true
        });
    }
    return window.confirm('Importing will replace local app data for this browser. Continue?');
}

async function importBackupFile(file) {
    if (!file) return;
    const raw = await file.text();
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (_err) {
        setBackupStatus('Invalid JSON backup file.', true);
        return;
    }

    if (!parsed || parsed.version !== 1 || typeof parsed.local_storage !== 'object' || parsed.local_storage === null) {
        setBackupStatus('Backup format is not supported.', true);
        return;
    }

    const proceed = await confirmImportBackup();
    if (!proceed) return;

    try {
        localStorage.clear();
        Object.entries(parsed.local_storage).forEach(([key, value]) => {
            localStorage.setItem(String(key), String(value ?? ''));
        });
        setBackupStatus('Backup imported. Reloading...');
        window.setTimeout(() => window.location.reload(), 500);
    } catch (_err) {
        setBackupStatus('Import failed. Storage may be full or blocked.', true);
    }
}

document.getElementById('account-login-btn').addEventListener('click', async () => {
    const username = nameInput.value.trim();
    const passcode = passcodeInput.value;
    if (!username || !passcode) {
        setStatus('Enter name and passcode.', true);
        return;
    }

    const { ok, data } = await postJSON('/api/auth/login', { username, passcode });
    if (!ok) {
        setStatus(data.error || 'Sign in failed.', true);
        return;
    }
    setStatus('Signed in.');
    await refreshAuthState();
});

document.getElementById('account-register-btn').addEventListener('click', async () => {
    const username = nameInput.value.trim();
    const passcode = passcodeInput.value;
    if (!username || !passcode) {
        setStatus('Enter name and passcode.', true);
        return;
    }

    const { ok, data } = await postJSON('/api/auth/register', { username, passcode });
    if (!ok) {
        setStatus(data.error || 'Account creation failed.', true);
        return;
    }
    setStatus('Account created.');
    await refreshAuthState();
});

document.getElementById('account-logout-btn').addEventListener('click', async () => {
    await postJSON('/api/auth/logout', {});
    setStatus('Signed out.');
    authSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
});

if (profileExportBtn) {
    profileExportBtn.addEventListener('click', downloadBackupFile);
}

if (profileImportBtn && profileImportFile) {
    profileImportBtn.addEventListener('click', () => {
        profileImportFile.click();
    });
    profileImportFile.addEventListener('change', async () => {
        const file = profileImportFile.files && profileImportFile.files[0];
        await importBackupFile(file);
        profileImportFile.value = '';
    });
}

refreshAuthState().catch((err) => setStatus(err.message, true));
