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

function setStatus(text, isError = false) {
    accountStatus.textContent = text;
    accountStatus.classList.toggle('error', isError);
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

refreshAuthState().catch((err) => setStatus(err.message, true));
