const STORAGE_KEY = 'fyrians_listmaker_v1';

const newListNameInput = document.getElementById('new-list-name');
const createListBtn = document.getElementById('create-list-btn');
const listSelect = document.getElementById('list-select');
const deleteListBtn = document.getElementById('delete-list-btn');

const newItemTextInput = document.getElementById('new-item-text');
const addItemBtn = document.getElementById('add-item-btn');
const itemsList = document.getElementById('items-list');
const listStatus = document.getElementById('list-status');

let state = loadState();

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { lists: [], currentListId: null };
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.lists)) return { lists: [], currentListId: null };
        return {
            lists: parsed.lists.map((list) => ({
                id: String(list.id),
                name: String(list.name || 'Untitled List'),
                items: Array.isArray(list.items)
                    ? list.items.map((item) => ({
                        id: String(item.id),
                        text: String(item.text || ''),
                        done: !!item.done
                    }))
                    : []
            })),
            currentListId: parsed.currentListId ? String(parsed.currentListId) : null
        };
    } catch {
        return { lists: [], currentListId: null };
    }
}

function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function currentList() {
    return state.lists.find((list) => list.id === state.currentListId) || null;
}

function setStatus(text) {
    listStatus.textContent = text;
}

function ensureCurrentList() {
    if (!state.lists.length) {
        state.currentListId = null;
        return;
    }
    if (!state.currentListId || !state.lists.some((list) => list.id === state.currentListId)) {
        state.currentListId = state.lists[0].id;
    }
}

function renderListOptions() {
    ensureCurrentList();
    listSelect.innerHTML = '';

    if (!state.lists.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No lists yet';
        listSelect.appendChild(option);
        listSelect.disabled = true;
        deleteListBtn.disabled = true;
        return;
    }

    state.lists.forEach((list) => {
        const option = document.createElement('option');
        option.value = list.id;
        option.textContent = list.name;
        if (list.id === state.currentListId) option.selected = true;
        listSelect.appendChild(option);
    });

    listSelect.disabled = false;
    deleteListBtn.disabled = false;
}

function renderItems() {
    itemsList.innerHTML = '';
    const list = currentList();
    if (!list) {
        setStatus('Create a list to get started.');
        return;
    }

    setStatus(`${list.items.length} item${list.items.length === 1 ? '' : 's'} in "${list.name}"`);

    if (!list.items.length) {
        const empty = document.createElement('li');
        empty.className = 'item-empty';
        empty.textContent = 'No items yet. Add your first one above.';
        itemsList.appendChild(empty);
        return;
    }

    list.items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'item-row';

        const radioLike = document.createElement('input');
        radioLike.type = 'checkbox';
        radioLike.className = 'item-toggle';
        radioLike.checked = item.done;
        radioLike.setAttribute('aria-label', `Mark ${item.text} as complete`);
        radioLike.addEventListener('change', () => {
            item.done = radioLike.checked;
            persistState();
            renderItems();
        });

        const text = document.createElement('span');
        text.className = 'item-text';
        text.textContent = item.text;
        if (item.done) {
            text.classList.add('done');
        }

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'item-delete';
        del.textContent = 'Delete';
        del.addEventListener('click', () => {
            list.items = list.items.filter((entry) => entry.id !== item.id);
            persistState();
            renderItems();
        });

        li.appendChild(radioLike);
        li.appendChild(text);
        li.appendChild(del);
        itemsList.appendChild(li);
    });
}

function refreshUI() {
    renderListOptions();
    renderItems();
}

function createList() {
    const name = newListNameInput.value.trim();
    if (!name) {
        setStatus('Enter a list name first.');
        return;
    }

    const list = { id: uid('list'), name, items: [] };
    state.lists.unshift(list);
    state.currentListId = list.id;
    newListNameInput.value = '';
    persistState();
    refreshUI();
    newItemTextInput.focus();
}

async function deleteCurrentList() {
    const list = currentList();
    if (!list) return;
    const confirmed = await window.FyrianPopup.confirm(
        `Delete list "${list.name}" and all its items?`,
        { title: 'Delete List', danger: true, okText: 'Delete' }
    );
    if (!confirmed) return;

    state.lists = state.lists.filter((entry) => entry.id !== list.id);
    ensureCurrentList();
    persistState();
    refreshUI();
}

function addItem() {
    const list = currentList();
    if (!list) {
        setStatus('Create a list first.');
        return;
    }

    const text = newItemTextInput.value.trim();
    if (!text) return;

    list.items.push({ id: uid('item'), text, done: false });
    newItemTextInput.value = '';
    persistState();
    renderItems();
    newItemTextInput.focus();
}

createListBtn.addEventListener('click', createList);
newListNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        createList();
    }
});

listSelect.addEventListener('change', () => {
    const nextId = listSelect.value;
    if (!nextId) return;
    state.currentListId = nextId;
    persistState();
    renderItems();
});

deleteListBtn.addEventListener('click', deleteCurrentList);

addItemBtn.addEventListener('click', addItem);
newItemTextInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        addItem();
    }
});

refreshUI();
