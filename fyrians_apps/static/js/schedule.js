let numStudents = 3;
let timeSlots = [];
let slotDates = [];
let slotTimes = [];
let savedStudents = [];
let lastResult = null;
let currentStepId = 'step-count';
let preLoadSnapshot = null;

const countDisplay = document.getElementById('count-display');
const savedRunSelect = document.getElementById('saved-run-select');
const savedRunStatus = document.getElementById('saved-run-status');
const undoLoadBtn = document.getElementById('undo-load-run');
const loadSavedBtn = document.getElementById('load-saved-run');
const scheduleStatsToggle = document.getElementById('schedule-stats-toggle');
const scheduleStatsPanel = document.getElementById('schedule-stats-panel');
const scheduleStatsContent = document.getElementById('schedule-stats-content');

document.getElementById('increment').addEventListener('click', () => {
    if (numStudents < 30) { numStudents++; countDisplay.textContent = numStudents; }
});
document.getElementById('decrement').addEventListener('click', () => {
    if (numStudents > 1) { numStudents--; countDisplay.textContent = numStudents; }
});
document.getElementById('go-to-slots').addEventListener('click', () => { buildSlotsUI(); showStep('step-slots'); });
document.getElementById('back-to-count').addEventListener('click', () => { showStep('step-count'); });
document.getElementById('back-to-slots').addEventListener('click', () => { saveStudentState(); buildSlotsUI(); showStep('step-slots'); });
document.getElementById('back-to-students').addEventListener('click', () => { showStep('step-students'); });

function buildSlotsUI() {
    const list = document.getElementById('slots-list');
    list.innerHTML = '';
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);

    for (let i = 0; i < numStudents; i++) {
        const defaultDate = new Date(tomorrow);
        defaultDate.setDate(tomorrow.getDate() + i);
        const dateStr = slotDates[i] || defaultDate.toISOString().split('T')[0];
        const timeStr = slotTimes[i] || '09:00';

        const row = document.createElement('div');
        row.className = 'slot-entry';
        row.innerHTML = `
            <span class="slot-num">${String(i + 1).padStart(2, '0')}</span>
            <input type="date" class="slot-date" data-slot="${i}" value="${dateStr}">
            <input type="time" class="slot-time" data-slot="${i}" value="${timeStr}">
            <span class="slot-preview" data-preview="${i}">${formatSlot(dateStr, timeStr)}</span>
        `;
        list.appendChild(row);
    }
    list.querySelectorAll('.slot-date, .slot-time').forEach(el => {
        el.addEventListener('change', () => {
            const idx = el.dataset.slot;
            const dateEl = list.querySelector(`.slot-date[data-slot="${idx}"]`);
            const timeEl = list.querySelector(`.slot-time[data-slot="${idx}"]`);
            list.querySelector(`[data-preview="${idx}"]`).textContent = formatSlot(dateEl.value, timeEl.value);
        });
    });
}

function formatSlot(dateStr, timeStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T' + (timeStr || '00:00'));
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (!timeStr) return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
    let [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()} · ${h}:${m.toString().padStart(2,'0')} ${ampm}`;
}

document.getElementById('go-to-students').addEventListener('click', () => {
    timeSlots = []; slotDates = []; slotTimes = [];
    document.querySelectorAll('.slot-date').forEach(el => slotDates[el.dataset.slot] = el.value);
    document.querySelectorAll('.slot-time').forEach(el => slotTimes[el.dataset.slot] = el.value);
    for (let i = 0; i < numStudents; i++) timeSlots.push(formatSlot(slotDates[i], slotTimes[i]) || `Slot ${i + 1}`);
    buildStudentsUI();
    showStep('step-students');
});

function saveStudentState() {
    savedStudents = [];
    for (let i = 0; i < numStudents; i++) {
        const nameEl = document.querySelector(`input[data-student="${i}"]`);
        const prefs = [0, 0, 0];
        document.querySelectorAll(`select[data-student="${i}"]`).forEach((sel, pIdx) => { prefs[pIdx] = parseInt(sel.value) || 0; });
        savedStudents[i] = { name: nameEl?.value.trim() || '', preferences: prefs };
    }
}

function buildStudentsUI() {
    const list = document.getElementById('students-list');
    list.innerHTML = '';
    for (let i = 0; i < numStudents; i++) {
        const card = document.createElement('div');
        card.className = 'student-card';
        const slotOptions = timeSlots.map((s, idx) => `<option value="${idx + 1}">${idx + 1}. ${s}</option>`).join('');
        const saved = savedStudents[i] || { name: '', preferences: [0, 0, 0] };
        card.innerHTML = `
            <div class="student-card-header">
                <span class="student-num">${String(i + 1).padStart(2, '0')}</span>
                <input type="text" placeholder="Student name" data-student="${i}" value="${saved.name}">
            </div>
            <div class="prefs-row"><span class="pref-label">1st choice</span><select class="pref-select" data-student="${i}" data-pref="0"><option value="0">— none —</option>${slotOptions}</select></div>
            <div class="prefs-row" style="margin-top:0.5rem"><span class="pref-label">2nd choice</span><select class="pref-select" data-student="${i}" data-pref="1"><option value="0">— none —</option>${slotOptions}</select></div>
            <div class="prefs-row" style="margin-top:0.5rem"><span class="pref-label">3rd choice</span><select class="pref-select" data-student="${i}" data-pref="2"><option value="0">— none —</option>${slotOptions}</select></div>
        `;
        list.appendChild(card);
        card.querySelectorAll('.pref-select').forEach((sel, pIdx) => sel.value = saved.preferences[pIdx] || 0);
    }
}

document.getElementById('run-optimizer').addEventListener('click', async () => {
    const students = [];
    for (let i = 0; i < numStudents; i++) {
        const name = document.querySelector(`input[data-student="${i}"]`)?.value.trim() || `Student ${i + 1}`;
        const prefs = [0, 0, 0];
        document.querySelectorAll(`select[data-student="${i}"]`).forEach((sel, pIdx) => prefs[pIdx] = parseInt(sel.value) || 0);
        students.push({ name, preferences: prefs });
    }

    document.getElementById('loading').classList.remove('hidden');
    try {
        const res = await fetch('/api/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students, timeSlots })
        });
        const data = await res.json();
        document.getElementById('loading').classList.add('hidden');
        if (data.error) return alert('Error: ' + data.error);
        lastResult = data;
        renderResults(data);
        await saveCurrentRun(students, data);
        showStep('step-results');
    } catch (err) {
        document.getElementById('loading').classList.add('hidden');
        alert('Request failed: ' + err.message);
    }
});

function renderResults(data) {
    document.getElementById('result-satisfaction').textContent = data.satisfaction;
    document.getElementById('result-score').textContent = data.score;
    document.getElementById('result-max').textContent = data.maxScore;
    document.getElementById('stat-first').textContent = data.firstChoice;
    document.getElementById('stat-second').textContent = data.secondChoice;
    document.getElementById('stat-third').textContent = data.thirdChoice;
    document.getElementById('stat-missed').textContent = data.noPrefMissed;
    document.getElementById('stat-nopref').textContent = data.noPrefGiven;
    document.getElementById('stat-nodes').textContent = data.nodesExplored.toLocaleString();
    document.getElementById('stat-time').textContent = data.timeMs + 'ms';

    const rankLabels = { 1: ['rank-1', '1st choice'], 2: ['rank-2', '2nd choice'], 3: ['rank-3', '3rd choice'], 0: ['rank-0', '⚠ missed all'], '-1': ['rank-none', 'no pref'] };
    document.getElementById('assignments-table').innerHTML = `<table class="assignments-table">
        <thead><tr><th>Student</th><th>Assigned Slot</th><th>Result</th></tr></thead>
        <tbody>${data.assignments.map(a => {
            const [cls, label] = rankLabels[a.rank] || ['rank-none', 'unknown'];
            return `<tr><td>${a.student}</td><td>${a.slot}</td><td><span class="rank-badge ${cls}">${label}</span></td></tr>`;
        }).join('')}</tbody></table>`;
}

document.getElementById('restart-btn').addEventListener('click', () => {
    timeSlots = []; slotDates = []; slotTimes = []; savedStudents = []; lastResult = null; numStudents = 3;
    countDisplay.textContent = numStudents;
    showStep('step-count');
});

function showStep(id) {
    document.querySelectorAll('.step').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    currentStepId = id;
}

function renderScheduleStats(payload) {
    const overall = payload.overall || {};
    const lines = [
        `<div><strong>Saved runs:</strong> ${overall.runs || 0}</div>`,
        `<div><strong>Avg satisfaction:</strong> ${Number(overall.avg_satisfaction || 0).toFixed(1)}%</div>`,
        `<div><strong>Avg first-choice count:</strong> ${Number(overall.avg_first_choice || 0).toFixed(2)}</div>`,
        '<div class="stats-heading">Recent Runs</div>'
    ];

    (payload.recent || []).slice(0, 8).forEach((row) => {
        const label = row.label || `${row.num_students} students`;
        const sat = row.satisfaction === null || row.satisfaction === undefined ? '--' : `${Number(row.satisfaction).toFixed(1)}%`;
        lines.push(`<div>${label} · satisfaction ${sat}</div>`);
    });

    scheduleStatsContent.innerHTML = lines.join('');
}

async function loadScheduleStats() {
    scheduleStatsContent.innerHTML = '<div>Loading stats...</div>';
    try {
        const response = await fetch('/api/schedule/stats');
        const payload = await response.json();
        if (!response.ok) {
            scheduleStatsContent.innerHTML = `<div>${payload.error || 'Could not load stats.'}</div><div>Sign in via Account to track scheduler history.</div>`;
            return;
        }
        renderScheduleStats(payload);
    } catch (_err) {
        scheduleStatsContent.innerHTML = '<div>Could not load stats right now.</div>';
    }
}

function setSavedStatus(message) {
    savedRunStatus.textContent = message;
}

function formatRunOption(run) {
    const created = new Date(run.created_at.replace(' ', 'T'));
    const dateText = Number.isNaN(created.getTime()) ? run.created_at : created.toLocaleString();
    const label = run.label ? run.label : `${run.num_students} students`;
    return `${label} · ${dateText}`;
}

async function loadSavedRuns() {
    try {
        const res = await fetch('/api/schedule/history');
        const data = await res.json();
        const runs = Array.isArray(data.runs) ? data.runs : [];
        savedRunSelect.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = runs.length ? 'Choose saved schedule...' : 'No saved schedules yet';
        savedRunSelect.appendChild(placeholder);

        runs.forEach((run) => {
            const option = document.createElement('option');
            option.value = String(run.id);
            option.textContent = formatRunOption(run);
            savedRunSelect.appendChild(option);
        });

        loadSavedBtn.disabled = runs.length === 0;
        if (!runs.length) {
            savedRunSelect.value = '';
            preLoadSnapshot = null;
            undoLoadBtn.classList.add('hidden');
        }
        setSavedStatus(
            runs.length
                ? 'Load a previous schedule, make edits, and rerun.'
                : 'No saved schedules yet. Click Continue to start a new schedule.'
        );
    } catch (_err) {
        loadSavedBtn.disabled = true;
        setSavedStatus('Could not load saved schedules right now.');
    }
}

function applyLoadedRun(run) {
    const payload = run.payload || {};
    const students = Array.isArray(payload.students) ? payload.students : [];
    const loadedSlots = Array.isArray(payload.timeSlots) ? payload.timeSlots : [];

    if (!students.length || !loadedSlots.length) {
        setSavedStatus('Saved run is missing schedule data.');
        return;
    }

    numStudents = students.length;
    countDisplay.textContent = numStudents;
    savedStudents = students;
    timeSlots = loadedSlots;
    slotDates = Array.isArray(payload.slotDates) ? payload.slotDates : Array(numStudents).fill('');
    slotTimes = Array.isArray(payload.slotTimes) ? payload.slotTimes : Array(numStudents).fill('09:00');

    buildStudentsUI();
    showStep('step-students');
    setSavedStatus('Loaded saved run. Edit anything and optimize again.');
}

function captureCurrentState() {
    saveStudentState();
    return {
        numStudents,
        timeSlots: [...timeSlots],
        slotDates: [...slotDates],
        slotTimes: [...slotTimes],
        savedStudents: savedStudents.map((s) => ({ name: s.name, preferences: [...(s.preferences || [])] })),
        lastResult: lastResult ? JSON.parse(JSON.stringify(lastResult)) : null,
        currentStepId
    };
}

function restoreSnapshot(snapshot) {
    if (!snapshot) return;
    numStudents = snapshot.numStudents;
    countDisplay.textContent = numStudents;
    timeSlots = [...snapshot.timeSlots];
    slotDates = [...snapshot.slotDates];
    slotTimes = [...snapshot.slotTimes];
    savedStudents = snapshot.savedStudents.map((s) => ({ name: s.name, preferences: [...(s.preferences || [])] }));
    lastResult = snapshot.lastResult ? JSON.parse(JSON.stringify(snapshot.lastResult)) : null;

    if (snapshot.currentStepId === 'step-slots') {
        buildSlotsUI();
    } else if (snapshot.currentStepId === 'step-students') {
        buildStudentsUI();
    } else if (snapshot.currentStepId === 'step-results') {
        if (lastResult) renderResults(lastResult);
    }

    showStep(snapshot.currentStepId || 'step-count');
}

async function saveCurrentRun(students, result) {
    try {
        const label = `${students.length} students`;
        await fetch('/api/schedule/save-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                label,
                payload: {
                    students,
                    timeSlots,
                    slotDates,
                    slotTimes
                },
                result
            })
        });
        await loadSavedRuns();
    } catch (_err) {
        // ignore save failures in flow
    }
}

document.getElementById('load-saved-run').addEventListener('click', async () => {
    const selectedId = Number(savedRunSelect.value);
    if (!selectedId) {
        setSavedStatus('Choose a saved schedule first.');
        return;
    }

    try {
        const res = await fetch(`/api/user/schedule-run/${selectedId}`);
        const data = await res.json();
        if (!res.ok) {
            setSavedStatus(data.error || 'Could not load that saved schedule.');
            return;
        }
        preLoadSnapshot = captureCurrentState();
        undoLoadBtn.classList.remove('hidden');
        applyLoadedRun(data);
    } catch (_err) {
        setSavedStatus('Could not load that saved schedule.');
    }
});

savedRunSelect.addEventListener('change', () => {
    const hasSelection = Number(savedRunSelect.value) > 0;
    loadSavedBtn.disabled = !hasSelection;
    if (!hasSelection) {
        setSavedStatus('Click Continue to start a new schedule, or choose a saved run.');
    }
});

undoLoadBtn.addEventListener('click', () => {
    if (!preLoadSnapshot) {
        setSavedStatus('Nothing to undo.');
        return;
    }
    restoreSnapshot(preLoadSnapshot);
    preLoadSnapshot = null;
    undoLoadBtn.classList.add('hidden');
    setSavedStatus('Restored your previous schedule state.');
});

scheduleStatsToggle.addEventListener('click', async () => {
    const opening = scheduleStatsPanel.classList.contains('hidden');
    scheduleStatsPanel.classList.toggle('hidden');
    if (opening) {
        await loadScheduleStats();
    }
});

loadSavedRuns();
