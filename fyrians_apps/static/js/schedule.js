let numStudents = 3;
let timeSlots = [];
let slotDates = [];
let slotTimes = [];
let savedStudents = [];

const countDisplay = document.getElementById('count-display');

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
        renderResults(data);
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
    timeSlots = []; slotDates = []; slotTimes = []; savedStudents = []; numStudents = 3;
    countDisplay.textContent = numStudents;
    showStep('step-count');
});

function showStep(id) {
    document.querySelectorAll('.step').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}