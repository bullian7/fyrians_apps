const folderNameInput = document.getElementById('folder-name-input');
const folderPassInput = document.getElementById('folder-pass-input');
const folderPassToggle = document.getElementById('folder-pass-toggle');
const folderCreateBtn = document.getElementById('folder-create-btn');
const foldersList = document.getElementById('folders-list');

const activeFolderTitle = document.getElementById('active-folder-title');
const folderLockBadge = document.getElementById('folder-lock-badge');
const folderLockBtn = document.getElementById('folder-lock-btn');
const folderDeleteBtn = document.getElementById('folder-delete-btn');

const quoteSaidByInput = document.getElementById('quote-said-by');
const quoteTextInput = document.getElementById('quote-text');
const quoteAddBtn = document.getElementById('quote-add-btn');
const quoteSearchInput = document.getElementById('quote-search');
const quoteSortSelect = document.getElementById('quote-sort');
const quoteStatus = document.getElementById('quote-status');
const quotesList = document.getElementById('quotes-list');
const lockedOverlay = document.getElementById('locked-overlay');
const unlockPasswordInput = document.getElementById('unlock-password-input');
const unlockPassToggle = document.getElementById('unlock-pass-toggle');
const unlockFolderBtn = document.getElementById('unlock-folder-btn');

let folders = [];
let activeFolderId = null;
let quotes = [];
let lockedTargetFolderId = null;

function setStatus(text) {
    quoteStatus.textContent = text;
}

async function getJSON(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

function activeFolder() {
    return folders.find((f) => f.id === activeFolderId) || null;
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

function hideLockedOverlay() {
    lockedOverlay.classList.add('hidden');
    lockedTargetFolderId = null;
    unlockPasswordInput.value = '';
    unlockPasswordInput.type = 'password';
    unlockPassToggle.classList.remove('is-on');
    unlockPassToggle.setAttribute('aria-label', 'Show password');
    unlockPassToggle.setAttribute('title', 'Show password');
}

function showLockedOverlay(folderId) {
    lockedTargetFolderId = folderId;
    lockedOverlay.classList.remove('hidden');
    unlockPasswordInput.value = '';
    unlockPasswordInput.type = 'password';
    unlockPassToggle.classList.remove('is-on');
    unlockPasswordInput.focus();
}

function renderFolders() {
    foldersList.innerHTML = '';

    if (!folders.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-note';
        empty.textContent = 'No folders yet. Create your first Quote Book folder.';
        foldersList.appendChild(empty);
        return;
    }

    folders.forEach((folder) => {
        const row = document.createElement('div');
        row.className = `folder-item${activeFolderId === folder.id ? ' active' : ''}`;
        row.addEventListener('click', () => selectFolder(folder.id));

        const main = document.createElement('div');
        main.className = 'folder-main';

        const name = document.createElement('div');
        name.className = 'folder-name';
        name.textContent = folder.name;

        const meta = document.createElement('div');
        meta.className = 'folder-meta';
        meta.textContent = folder.is_locked ? (folder.unlocked ? 'Unlocked now' : 'Locked') : 'Open folder';

        const pill = document.createElement('span');
        pill.className = 'folder-pill';
        pill.textContent = folder.is_locked ? 'LOCK' : 'OPEN';

        main.appendChild(name);
        main.appendChild(meta);
        row.appendChild(main);
        row.appendChild(pill);
        foldersList.appendChild(row);
    });
}

function filteredSortedQuotes() {
    const query = quoteSearchInput.value.trim().toLowerCase();
    const sort = quoteSortSelect.value;

    const filtered = quotes.filter((q) => {
        if (!query) return true;
        return q.said_by.toLowerCase().includes(query) || q.quote_text.toLowerCase().includes(query);
    });

    const sorted = [...filtered];
    if (sort === 'name_asc') {
        sorted.sort((a, b) => a.said_by.localeCompare(b.said_by));
    } else if (sort === 'name_desc') {
        sorted.sort((a, b) => b.said_by.localeCompare(a.said_by));
    } else {
        sorted.sort((a, b) => b.id - a.id);
    }
    return sorted;
}

function renderQuotes() {
    quotesList.innerHTML = '';
    const folder = activeFolder();
    const hasActive = !!folder;
    const canEdit = hasActive && (!folder.is_locked || folder.unlocked);

    folderDeleteBtn.classList.toggle('hidden', !hasActive);
    folderLockBtn.classList.toggle('hidden', !(hasActive && folder.is_locked && folder.unlocked));
    folderLockBadge.classList.toggle('hidden', !(hasActive && folder.is_locked));
    if (folderLockBadge && hasActive && folder.is_locked) {
        folderLockBadge.textContent = folder.unlocked ? 'Unlocked' : 'Locked';
    }

    quoteSaidByInput.disabled = !canEdit;
    quoteTextInput.disabled = !canEdit;
    quoteAddBtn.disabled = !canEdit;
    quoteSearchInput.disabled = !hasActive;
    quoteSortSelect.disabled = !hasActive;

    if (!hasActive) {
        hideLockedOverlay();
        activeFolderTitle.textContent = 'Choose a folder';
        const empty = document.createElement('div');
        empty.className = 'empty-note';
        empty.textContent = 'Select a folder to view or add quotes.';
        quotesList.appendChild(empty);
        return;
    }

    activeFolderTitle.textContent = folder.name;
    if (folder.is_locked && !folder.unlocked) {
        const note = document.createElement('div');
        note.className = 'empty-note';
        note.textContent = 'This folder is locked. Click it and enter the password to view quotes.';
        quotesList.appendChild(note);
        return;
    }

    const view = filteredSortedQuotes();
    if (!view.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-note';
        empty.textContent = quotes.length ? 'No quotes match your search.' : 'No quotes yet. Add your first quote above.';
        quotesList.appendChild(empty);
        return;
    }

    view.forEach((q) => {
        const card = document.createElement('div');
        card.className = 'quote-item';

        const head = document.createElement('div');
        head.className = 'quote-head';

        const by = document.createElement('div');
        by.className = 'quote-by';
        by.textContent = q.said_by;

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'quote-del-btn';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            const ok = await window.FyrianPopup.confirm('Delete this quote?', {
                title: 'Quote Book',
                okText: 'Delete',
                cancelText: 'Cancel',
                danger: true
            });
            if (!ok) return;
            const result = await getJSON(`/api/quotebook/quotes/${q.id}`, { method: 'DELETE' });
            if (!result.ok) {
                setStatus(result.data.error || 'Could not delete quote.');
                return;
            }
            quotes = quotes.filter((entry) => entry.id !== q.id);
            setStatus('Quote deleted.');
            renderQuotes();
        });

        const text = document.createElement('div');
        text.className = 'quote-text';
        text.textContent = q.quote_text;

        head.appendChild(by);
        head.appendChild(del);
        card.appendChild(head);
        card.appendChild(text);
        quotesList.appendChild(card);
    });
}

async function refreshFolders() {
    const { ok, data } = await getJSON('/api/quotebook/folders');
    if (!ok) {
        folders = [];
        activeFolderId = null;
        quotes = [];
        renderFolders();
        renderQuotes();
        setStatus(data.error || 'Sign in via Account to use Quote Book.');
        return;
    }

    folders = Array.isArray(data.folders) ? data.folders : [];
    if (activeFolderId && !folders.some((f) => f.id === activeFolderId)) {
        activeFolderId = null;
    }
    renderFolders();
    renderQuotes();
    if (!folders.length) {
        setStatus('Create a folder to begin.');
    }
}

async function loadQuotesForFolder(folderId) {
    const { ok, status, data } = await getJSON(`/api/quotebook/folders/${folderId}/quotes`);
    if (ok) {
        quotes = Array.isArray(data.quotes) ? data.quotes : [];
        setStatus(`${quotes.length} quote${quotes.length === 1 ? '' : 's'} in this folder.`);
        hideLockedOverlay();
        renderQuotes();
        return true;
    }
    if (status === 423) return false;

    setStatus(data.error || 'Could not load quotes.');
    return false;
}

async function selectFolder(folderId) {
    activeFolderId = folderId;
    quotes = [];
    renderFolders();
    renderQuotes();
    const folder = folders.find((f) => f.id === folderId);
    if (folder?.is_locked) {
        // Force re-entry every time a locked folder is clicked.
        await getJSON(`/api/quotebook/folders/${folderId}/lock`, { method: 'POST' });
        folder.unlocked = false;
        renderFolders();
        renderQuotes();
        showLockedOverlay(folderId);
        setStatus('This folder is locked. Enter password to continue.');
        return;
    }
    hideLockedOverlay();
    await loadQuotesForFolder(folderId);
}

async function createFolder() {
    const name = folderNameInput.value.trim();
    const password = folderPassInput.value;
    if (!name) {
        setStatus('Enter a folder name first.');
        return;
    }

    const { ok, data } = await getJSON('/api/quotebook/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password })
    });
    if (!ok) {
        setStatus(data.error || 'Could not create folder.');
        return;
    }

    folderNameInput.value = '';
    folderPassInput.value = '';
    await refreshFolders();
    activeFolderId = data.folder?.id || activeFolderId;
    renderFolders();
    renderQuotes();
    if (data.folder?.unlocked && activeFolderId) {
        await loadQuotesForFolder(activeFolderId);
    } else if (activeFolderId) {
        showLockedOverlay(activeFolderId);
        setStatus('Locked folder created. Click it to unlock and view quotes.');
    }
}

async function deleteActiveFolder() {
    const folder = activeFolder();
    if (!folder) return;
    const yes = await window.FyrianPopup.confirm(`Delete folder "${folder.name}" and all quotes?`, {
        title: 'Quote Book',
        okText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!yes) return;

    const { ok, data } = await getJSON(`/api/quotebook/folders/${folder.id}`, { method: 'DELETE' });
    if (!ok) {
        setStatus(data.error || 'Could not delete folder.');
        return;
    }
    if (activeFolderId === folder.id) {
        activeFolderId = null;
        quotes = [];
    }
    await refreshFolders();
    setStatus('Folder deleted.');
}

async function lockActiveFolder() {
    const folder = activeFolder();
    if (!folder || !folder.is_locked) return;

    const { ok, data } = await getJSON(`/api/quotebook/folders/${folder.id}/lock`, { method: 'POST' });
    if (!ok) {
        setStatus(data.error || 'Could not lock folder.');
        return;
    }
    quotes = [];
    await refreshFolders();
    showLockedOverlay(folder.id);
    setStatus('Folder locked.');
}

async function addQuote() {
    const folder = activeFolder();
    if (!folder) {
        setStatus('Choose a folder first.');
        return;
    }
    const saidBy = quoteSaidByInput.value.trim();
    const quoteText = quoteTextInput.value.trim();

    if (!saidBy || !quoteText) {
        setStatus('Enter both "Who said it" and the quote text.');
        return;
    }

    const { ok, status, data } = await getJSON(`/api/quotebook/folders/${folder.id}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ said_by: saidBy, quote_text: quoteText })
    });
    if (!ok) {
        if (status === 423) {
            setStatus('Folder is locked. Unlock it first.');
        } else {
            setStatus(data.error || 'Could not add quote.');
        }
        return;
    }

    quoteSaidByInput.value = '';
    quoteTextInput.value = '';
    quotes.unshift(data.quote);
    setStatus('Quote added.');
    renderQuotes();
}

folderCreateBtn.addEventListener('click', createFolder);
folderNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        createFolder();
    }
});
folderPassInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        createFolder();
    }
});

folderDeleteBtn.addEventListener('click', deleteActiveFolder);
folderLockBtn.addEventListener('click', lockActiveFolder);

quoteAddBtn.addEventListener('click', addQuote);
quoteTextInput.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        addQuote();
    }
});

quoteSearchInput.addEventListener('input', renderQuotes);
quoteSortSelect.addEventListener('change', renderQuotes);
unlockFolderBtn.addEventListener('click', async () => {
    if (!lockedTargetFolderId) return;
    const password = unlockPasswordInput.value;
    const unlock = await getJSON(`/api/quotebook/folders/${lockedTargetFolderId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    if (!unlock.ok) {
        setStatus(unlock.data.error || 'Incorrect password.');
        return;
    }
    const folder = folders.find((f) => f.id === lockedTargetFolderId);
    if (folder) folder.unlocked = true;
    renderFolders();
    await loadQuotesForFolder(lockedTargetFolderId);
});

unlockPasswordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        unlockFolderBtn.click();
    }
});

bindPassToggle(folderPassInput, folderPassToggle);
bindPassToggle(unlockPasswordInput, unlockPassToggle);

refreshFolders();
