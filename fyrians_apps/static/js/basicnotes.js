const newNoteTitleInput = document.getElementById('new-note-title');
const newNoteBodyInput = document.getElementById('new-note-body');
const newNotePasswordInput = document.getElementById('new-note-password');
const newNotePasswordToggle = document.getElementById('new-note-password-toggle');
const createNoteBtn = document.getElementById('create-note-btn');
const notesList = document.getElementById('notes-list');

const editorTitle = document.getElementById('editor-title');
const editorLockPill = document.getElementById('editor-lock-pill');
const editNoteTitleInput = document.getElementById('edit-note-title');
const editNoteBodyInput = document.getElementById('edit-note-body');
const saveNoteBtn = document.getElementById('save-note-btn');
const deleteNoteBtn = document.getElementById('delete-note-btn');
const lockNoteBtn = document.getElementById('lock-note-btn');
const noteStatus = document.getElementById('note-status');

const noteLockOverlay = document.getElementById('note-lock-overlay');
const unlockNotePasswordInput = document.getElementById('unlock-note-password');
const unlockNotePasswordToggle = document.getElementById('unlock-note-password-toggle');
const unlockNoteBtn = document.getElementById('unlock-note-btn');

let notes = [];
let activeNoteId = null;
let activeNoteData = null;
let lockedTargetNoteId = null;

function setStatus(text) {
    noteStatus.textContent = text;
}

async function getJSON(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

function activeNoteMeta() {
    return notes.find((n) => n.id === activeNoteId) || null;
}

function bindPassToggle(inputEl, toggleEl) {
    toggleEl.addEventListener('click', () => {
        const showing = inputEl.type === 'text';
        inputEl.type = showing ? 'password' : 'text';
        toggleEl.classList.toggle('is-on', !showing);
        toggleEl.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        toggleEl.setAttribute('title', showing ? 'Show password' : 'Hide password');
    });
}

function hideLockOverlay() {
    noteLockOverlay.classList.add('hidden');
    lockedTargetNoteId = null;
    unlockNotePasswordInput.value = '';
    unlockNotePasswordInput.type = 'password';
    unlockNotePasswordToggle.classList.remove('is-on');
    unlockNotePasswordToggle.setAttribute('aria-label', 'Show password');
    unlockNotePasswordToggle.setAttribute('title', 'Show password');
}

function showLockOverlay(noteId) {
    lockedTargetNoteId = noteId;
    noteLockOverlay.classList.remove('hidden');
    unlockNotePasswordInput.value = '';
    unlockNotePasswordInput.type = 'password';
    unlockNotePasswordToggle.classList.remove('is-on');
    unlockNotePasswordInput.focus();
}

function renderNotes() {
    notesList.innerHTML = '';
    if (!notes.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-note';
        empty.textContent = 'No notes yet. Create your first one on the left.';
        notesList.appendChild(empty);
        return;
    }

    notes.forEach((note) => {
        const row = document.createElement('div');
        row.className = `note-item${note.id === activeNoteId ? ' active' : ''}`;
        row.addEventListener('click', () => selectNote(note.id));

        const main = document.createElement('div');
        main.className = 'note-main';
        const title = document.createElement('div');
        title.className = 'note-name';
        title.textContent = note.title;
        const meta = document.createElement('div');
        meta.className = 'note-meta';
        meta.textContent = note.is_locked ? (note.unlocked ? 'Unlocked now' : 'Locked') : 'Open note';

        const pill = document.createElement('span');
        pill.className = 'note-pill';
        pill.textContent = note.is_locked ? 'LOCK' : 'OPEN';

        main.appendChild(title);
        main.appendChild(meta);
        row.appendChild(main);
        row.appendChild(pill);
        notesList.appendChild(row);
    });
}

function resetEditorInputs() {
    editNoteTitleInput.value = '';
    editNoteBodyInput.value = '';
}

function renderEditor() {
    const noteMeta = activeNoteMeta();
    const hasActive = !!noteMeta;
    const canEdit = hasActive && (!noteMeta.is_locked || noteMeta.unlocked) && !!activeNoteData;

    deleteNoteBtn.classList.toggle('hidden', !hasActive);
    lockNoteBtn.classList.toggle('hidden', !(hasActive && noteMeta.is_locked && noteMeta.unlocked));
    editorLockPill.classList.toggle('hidden', !(hasActive && noteMeta.is_locked));
    if (hasActive && noteMeta.is_locked) {
        editorLockPill.textContent = noteMeta.unlocked ? 'Unlocked' : 'Locked';
    }

    editNoteTitleInput.disabled = !canEdit;
    editNoteBodyInput.disabled = !canEdit;
    saveNoteBtn.disabled = !canEdit;

    if (!hasActive) {
        editorTitle.textContent = 'Choose a note';
        resetEditorInputs();
        hideLockOverlay();
        return;
    }

    editorTitle.textContent = noteMeta.title;
    if (noteMeta.is_locked && !noteMeta.unlocked) {
        resetEditorInputs();
        showLockOverlay(noteMeta.id);
        return;
    }

    hideLockOverlay();
    if (activeNoteData) {
        editNoteTitleInput.value = activeNoteData.title;
        editNoteBodyInput.value = activeNoteData.body;
    } else {
        resetEditorInputs();
    }
}

async function refreshNotes() {
    const { ok, data } = await getJSON('/api/basic-notes');
    if (!ok) {
        notes = [];
        activeNoteId = null;
        activeNoteData = null;
        renderNotes();
        renderEditor();
        setStatus(data.error || 'Sign in via Account to use Basic Notes.');
        return;
    }

    notes = Array.isArray(data.notes) ? data.notes : [];
    if (activeNoteId && !notes.some((n) => n.id === activeNoteId)) {
        activeNoteId = null;
        activeNoteData = null;
    }
    renderNotes();
    renderEditor();
    if (!notes.length) {
        setStatus('Create a note to begin.');
    }
}

async function loadNote(noteId) {
    const { ok, status, data } = await getJSON(`/api/basic-notes/${noteId}`);
    if (ok) {
        activeNoteData = data;
        const noteMeta = notes.find((n) => n.id === noteId);
        if (noteMeta) noteMeta.unlocked = true;
        setStatus('Note loaded.');
        renderNotes();
        renderEditor();
        return true;
    }
    if (status === 423) {
        showLockOverlay(noteId);
        setStatus('This note is locked. Enter password to continue.');
        return false;
    }
    setStatus(data.error || 'Could not load note.');
    return false;
}

async function selectNote(noteId) {
    activeNoteId = noteId;
    activeNoteData = null;
    renderNotes();
    renderEditor();

    const noteMeta = notes.find((n) => n.id === noteId);
    if (noteMeta?.is_locked) {
        // Require password every time locked note is clicked.
        await getJSON(`/api/basic-notes/${noteId}/lock`, { method: 'POST' });
        noteMeta.unlocked = false;
        renderNotes();
        renderEditor();
        setStatus('This note is locked. Enter password to continue.');
        return;
    }
    await loadNote(noteId);
}

async function createNote() {
    const rawTitle = newNoteTitleInput.value.trim();
    const title = rawTitle || 'Untitled Note';
    const body = (newNoteBodyInput?.value || '').trim();
    const password = newNotePasswordInput.value;

    const { ok, data } = await getJSON('/api/basic-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, password })
    });
    if (!ok) {
        setStatus(data.error || 'Could not create note.');
        return;
    }

    newNoteTitleInput.value = '';
    if (newNoteBodyInput) newNoteBodyInput.value = '';
    newNotePasswordInput.value = '';
    newNotePasswordInput.type = 'password';
    newNotePasswordToggle.classList.remove('is-on');
    await refreshNotes();
    activeNoteId = data.note?.id || activeNoteId;
    renderNotes();
    if (activeNoteId) {
        await selectNote(activeNoteId);
    }
    setStatus('Note created.');
}

async function saveActiveNote() {
    const noteMeta = activeNoteMeta();
    if (!noteMeta) return;

    const title = editNoteTitleInput.value.trim() || 'Untitled Note';
    const body = editNoteBodyInput.value.trim();

    const { ok, status, data } = await getJSON(`/api/basic-notes/${noteMeta.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body })
    });
    if (!ok) {
        if (status === 423) {
            setStatus('Note is locked. Unlock it first.');
        } else {
            setStatus(data.error || 'Could not save note.');
        }
        return;
    }

    noteMeta.title = title;
    activeNoteData = { ...(activeNoteData || {}), title, body };
    renderNotes();
    renderEditor();
    setStatus('Note saved.');
}

async function deleteActiveNote() {
    const noteMeta = activeNoteMeta();
    if (!noteMeta) return;

    const okConfirm = await window.FyrianPopup.confirm(`Delete note "${noteMeta.title}"?`, {
        title: 'Basic Notes',
        okText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!okConfirm) return;

    const { ok, data } = await getJSON(`/api/basic-notes/${noteMeta.id}`, { method: 'DELETE' });
    if (!ok) {
        setStatus(data.error || 'Could not delete note.');
        return;
    }
    if (activeNoteId === noteMeta.id) {
        activeNoteId = null;
        activeNoteData = null;
    }
    await refreshNotes();
    setStatus('Note deleted.');
}

async function lockActiveNote() {
    const noteMeta = activeNoteMeta();
    if (!noteMeta || !noteMeta.is_locked) return;
    const { ok, data } = await getJSON(`/api/basic-notes/${noteMeta.id}/lock`, { method: 'POST' });
    if (!ok) {
        setStatus(data.error || 'Could not lock note.');
        return;
    }
    noteMeta.unlocked = false;
    activeNoteData = null;
    renderNotes();
    renderEditor();
    setStatus('Note locked.');
}

createNoteBtn.addEventListener('click', createNote);
saveNoteBtn.addEventListener('click', saveActiveNote);
deleteNoteBtn.addEventListener('click', deleteActiveNote);
lockNoteBtn.addEventListener('click', lockActiveNote);

unlockNoteBtn.addEventListener('click', async () => {
    if (!lockedTargetNoteId) return;
    const password = unlockNotePasswordInput.value;
    const { ok, data } = await getJSON(`/api/basic-notes/${lockedTargetNoteId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    if (!ok) {
        setStatus(data.error || 'Incorrect password.');
        return;
    }
    const noteMeta = notes.find((n) => n.id === lockedTargetNoteId);
    if (noteMeta) noteMeta.unlocked = true;
    await loadNote(lockedTargetNoteId);
});

unlockNotePasswordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        unlockNoteBtn.click();
    }
});

newNoteTitleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        createNote();
    }
});

bindPassToggle(newNotePasswordInput, newNotePasswordToggle);
bindPassToggle(unlockNotePasswordInput, unlockNotePasswordToggle);

refreshNotes();
