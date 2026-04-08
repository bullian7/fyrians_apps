const STORAGE_KEY = 'fyrians_workout_planner_v1';
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const addWeekBtn = document.getElementById('add-week-btn');
const resetPlanBtn = document.getElementById('reset-plan-btn');
const plannerBody = document.getElementById('planner-body');
const plannerStatus = document.getElementById('planner-status');

let state = loadState();

function makeBlankWeek(id) {
    return {
        id,
        mon: '',
        tue: '',
        wed: '',
        thu: '',
        fri: '',
        sat: '',
        sun: ''
    };
}

function uid() {
    return `wk_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeBullets(text) {
    const lines = String(text || '').split('\n');
    return lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('•')) return trimmed;
        if (trimmed.startsWith('- ')) return `• ${trimmed.slice(2).trim()}`;
        return `• ${trimmed}`;
    }).join('\n');
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { weeks: [makeBlankWeek(uid())] };
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.weeks) || !parsed.weeks.length) return { weeks: [makeBlankWeek(uid())] };
        return {
            weeks: parsed.weeks.map((week) => {
                const safe = { id: String(week.id || uid()) };
                DAY_KEYS.forEach((day) => {
                    safe[day] = String(week[day] || '');
                });
                return safe;
            })
        };
    } catch {
        return { weeks: [makeBlankWeek(uid())] };
    }
}

function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setStatus(text) {
    plannerStatus.textContent = text;
}

function countFilledCells() {
    let count = 0;
    state.weeks.forEach((week) => {
        DAY_KEYS.forEach((day) => {
            if (String(week[day] || '').trim()) count += 1;
        });
    });
    return count;
}

function render() {
    plannerBody.innerHTML = '';

    state.weeks.forEach((week, index) => {
        const tr = document.createElement('tr');
        tr.dataset.weekId = week.id;

        const weekCell = document.createElement('td');
        weekCell.className = 'week-col';
        const label = document.createElement('div');
        label.className = 'week-label';
        label.textContent = `Week ${index + 1}`;
        weekCell.appendChild(label);
        tr.appendChild(weekCell);

        DAY_KEYS.forEach((day) => {
            const td = document.createElement('td');
            const area = document.createElement('textarea');
            area.className = 'day-input';
            area.placeholder = '• Add workout bullets';
            area.value = week[day] || '';
            area.addEventListener('blur', () => {
                week[day] = normalizeBullets(area.value);
                area.value = week[day];
                persistState();
                setStatus(`${state.weeks.length} week${state.weeks.length === 1 ? '' : 's'} planned · ${countFilledCells()} filled day${countFilledCells() === 1 ? '' : 's'}.`);
            });
            td.appendChild(area);
            tr.appendChild(td);
        });

        const actionCell = document.createElement('td');
        actionCell.className = 'action-col';
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'row-del-btn';
        delBtn.textContent = 'Delete';
        delBtn.disabled = state.weeks.length === 1;
        delBtn.addEventListener('click', async () => {
            if (state.weeks.length === 1) return;
            const ok = await window.FyrianPopup.confirm(`Delete Week ${index + 1}?`, {
                title: 'Workout Planner',
                okText: 'Delete',
                cancelText: 'Cancel',
                danger: true
            });
            if (!ok) return;
            state.weeks = state.weeks.filter((w) => w.id !== week.id);
            persistState();
            render();
        });
        actionCell.appendChild(delBtn);
        tr.appendChild(actionCell);

        plannerBody.appendChild(tr);
    });

    setStatus(`${state.weeks.length} week${state.weeks.length === 1 ? '' : 's'} planned · ${countFilledCells()} filled day${countFilledCells() === 1 ? '' : 's'}.`);
}

addWeekBtn.addEventListener('click', () => {
    state.weeks.push(makeBlankWeek(uid()));
    persistState();
    render();
});

resetPlanBtn.addEventListener('click', async () => {
    const ok = await window.FyrianPopup.confirm('Reset planner to one blank week?', {
        title: 'Workout Planner',
        okText: 'Reset',
        cancelText: 'Cancel',
        danger: true
    });
    if (!ok) return;
    state = { weeks: [makeBlankWeek(uid())] };
    persistState();
    render();
});

render();
