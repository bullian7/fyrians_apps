const STORAGE_KEY = 'fyrians_flashcards_v1';

const appEl = document.getElementById('flashcards-app');
if (!appEl) {
    throw new Error('Missing flashcards root element.');
}

const page = appEl.dataset.page || 'decks';
const routeDeckId = appEl.dataset.deckId || '';
const homeUrl = appEl.dataset.homeUrl || '/flashcards';
const deckUrlTemplate = appEl.dataset.deckUrlTemplate || '/flashcards/decks/__DECK_ID__';

const newDeckNameInput = document.getElementById('new-deck-name');
const createDeckBtn = document.getElementById('create-deck-btn');
const decksListEl = document.getElementById('decks-list');

const deckSelect = document.getElementById('deck-select');
const deleteDeckBtn = document.getElementById('delete-deck-btn');
const deckTitleEl = document.getElementById('deck-title');

const statusEl = document.getElementById('flashcards-status');
const studyCardEl = document.getElementById('study-card');
const studyCardSideEl = document.getElementById('study-card-side');
const studyCardMetaEl = document.getElementById('study-card-meta');
const prevCardBtn = document.getElementById('prev-card-btn');
const nextCardBtn = document.getElementById('next-card-btn');
const cardCounterEl = document.getElementById('card-counter');
const shuffleBtn = document.getElementById('shuffle-btn');

const addNewCardBtn = document.getElementById('add-new-card-btn');
const newCardEditor = document.getElementById('new-card-editor');
const newCardFront = document.getElementById('new-card-front');
const newCardBack = document.getElementById('new-card-back');
const saveNewCardBtn = document.getElementById('save-new-card-btn');
const cancelNewCardBtn = document.getElementById('cancel-new-card-btn');

let state = loadState();

function defaultState() {
    return { decks: [], currentDeckId: null, currentCardIndex: 0, showingBack: false };
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState();

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.decks)) return defaultState();

        return {
            decks: parsed.decks.map((deck) => ({
                id: String(deck.id),
                name: String(deck.name || 'Untitled Deck'),
                cards: Array.isArray(deck.cards)
                    ? deck.cards
                        .map((card) => ({
                            id: String(card.id),
                            front: String(card.front || '').trim(),
                            back: String(card.back || '').trim()
                        }))
                        .filter((card) => card.front && card.back)
                    : []
            })),
            currentDeckId: parsed.currentDeckId ? String(parsed.currentDeckId) : null,
            currentCardIndex: Number.isInteger(parsed.currentCardIndex) ? parsed.currentCardIndex : 0,
            showingBack: !!parsed.showingBack
        };
    } catch {
        return defaultState();
    }
}

function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function withEmbed(path) {
    const params = new URLSearchParams(window.location.search);
    return params.get('embed') === '1' ? `${path}?embed=1` : path;
}

function deckUrlFor(deckId) {
    return withEmbed(deckUrlTemplate.replace('__DECK_ID__', encodeURIComponent(deckId)));
}

function homeUrlWithEmbed() {
    return withEmbed(homeUrl);
}

function findDeck(deckId) {
    return state.decks.find((deck) => deck.id === deckId) || null;
}

function currentDeck() {
    return findDeck(state.currentDeckId);
}

function currentCard() {
    const deck = currentDeck();
    if (!deck || !deck.cards.length) return null;
    return deck.cards[state.currentCardIndex] || null;
}

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
}

function ensureCurrentDeck(preferredDeckId) {
    if (!state.decks.length) {
        state.currentDeckId = null;
        state.currentCardIndex = 0;
        state.showingBack = false;
        return;
    }

    if (preferredDeckId && findDeck(preferredDeckId)) {
        state.currentDeckId = preferredDeckId;
    }

    if (!state.currentDeckId || !findDeck(state.currentDeckId)) {
        state.currentDeckId = state.decks[0].id;
    }

    const deck = currentDeck();
    if (!deck || !deck.cards.length) {
        state.currentCardIndex = 0;
        state.showingBack = false;
        return;
    }

    if (state.currentCardIndex < 0 || state.currentCardIndex >= deck.cards.length) {
        state.currentCardIndex = 0;
    }
}

function showNewCardEditor(show) {
    if (!newCardEditor) return;
    newCardEditor.classList.toggle('hidden', !show);
    if (show && newCardFront) {
        newCardFront.focus();
    }
    if (!show && newCardFront && newCardBack) {
        newCardFront.value = '';
        newCardBack.value = '';
    }
}

async function deleteDeckById(deckId) {
    const deck = findDeck(deckId);
    if (!deck) return;

    const confirmed = await window.FyrianPopup.confirm(
        `Delete deck "${deck.name}" and all its cards?`,
        { title: 'Delete Deck', danger: true, okText: 'Delete' }
    );
    if (!confirmed) return;

    state.decks = state.decks.filter((entry) => entry.id !== deckId);
    state.currentCardIndex = 0;
    state.showingBack = false;
    ensureCurrentDeck(null);
    persistState();

    if (page !== 'decks') {
        if (state.currentDeckId) {
            window.location.href = deckUrlFor(state.currentDeckId);
            return;
        }
        window.location.href = homeUrlWithEmbed();
        return;
    }

    refreshUI();
}

function renderDeckSelect() {
    if (!deckSelect) return;
    deckSelect.innerHTML = '';

    if (!state.decks.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No decks yet';
        deckSelect.appendChild(option);
        deckSelect.disabled = true;
        if (deleteDeckBtn) deleteDeckBtn.disabled = true;
        return;
    }

    state.decks.forEach((deck) => {
        const option = document.createElement('option');
        option.value = deck.id;
        option.textContent = deck.name;
        option.selected = deck.id === state.currentDeckId;
        deckSelect.appendChild(option);
    });

    deckSelect.disabled = false;
    if (deleteDeckBtn) deleteDeckBtn.disabled = false;
}

function renderDecksPage() {
    if (!decksListEl) return;
    decksListEl.innerHTML = '';

    if (!state.decks.length) {
        const empty = document.createElement('li');
        empty.className = 'deck-row empty';
        empty.textContent = 'No decks yet. Create one above.';
        decksListEl.appendChild(empty);
        setStatus('Create a deck to get started.');
        return;
    }

    setStatus('Choose a deck to open.');
    state.decks.forEach((deck) => {
        const li = document.createElement('li');
        li.className = 'deck-row';

        const info = document.createElement('div');
        info.className = 'deck-info';
        info.innerHTML = `<div class="deck-name">${deck.name}</div><div class="deck-meta">${deck.cards.length} card${deck.cards.length === 1 ? '' : 's'}</div>`;

        const actions = document.createElement('div');
        actions.className = 'deck-actions';
        actions.innerHTML = `
            <a class="primary-btn nav-btn" href="${deckUrlFor(deck.id)}">Open Deck</a>
            <button class="tool-btn danger" type="button" data-action="delete-deck" data-deck-id="${deck.id}">Delete</button>
        `;

        li.appendChild(info);
        li.appendChild(actions);
        decksListEl.appendChild(li);
    });
}

function renderDeckPage() {
    if (!studyCardEl || !studyCardSideEl || !studyCardMetaEl || !cardCounterEl || !prevCardBtn || !nextCardBtn) {
        return;
    }

    const deck = currentDeck();

    if (!deck) {
        if (deckTitleEl) deckTitleEl.textContent = 'Deck Not Found';
        studyCardEl.classList.add('empty');
        studyCardEl.classList.remove('is-back');
        studyCardSideEl.textContent = 'Deck not found. Return to all decks and choose one.';
        studyCardMetaEl.textContent = 'Front';
        cardCounterEl.textContent = '0 / 0';
        prevCardBtn.disabled = true;
        nextCardBtn.disabled = true;
        if (shuffleBtn) shuffleBtn.disabled = true;
        if (addNewCardBtn) addNewCardBtn.disabled = true;
        setStatus('That deck does not exist on this browser.');
        showNewCardEditor(false);
        return;
    }

    if (deckTitleEl) deckTitleEl.textContent = deck.name;

    const card = currentCard();
    const count = deck.cards.length;

    if (!card) {
        studyCardEl.classList.add('empty');
        studyCardEl.classList.remove('is-back');
        studyCardSideEl.textContent = 'No cards in this deck yet. Add one below.';
        studyCardMetaEl.textContent = 'Front';
        cardCounterEl.textContent = `0 / ${count}`;
        prevCardBtn.disabled = true;
        nextCardBtn.disabled = true;
        if (shuffleBtn) shuffleBtn.disabled = true;
        if (addNewCardBtn) addNewCardBtn.disabled = false;
        setStatus(`${deck.name}: add your first card.`);
        return;
    }

    studyCardEl.classList.remove('empty');
    studyCardEl.classList.toggle('is-back', state.showingBack);
    studyCardSideEl.textContent = state.showingBack ? card.back : card.front;
    studyCardMetaEl.textContent = state.showingBack ? 'Back' : 'Front';
    cardCounterEl.textContent = `${state.currentCardIndex + 1} / ${count}`;
    prevCardBtn.disabled = count <= 1;
    nextCardBtn.disabled = count <= 1;
    if (shuffleBtn) shuffleBtn.disabled = count <= 1;
    if (addNewCardBtn) addNewCardBtn.disabled = false;
    setStatus(`${deck.name}: tap card to flip, arrows to move.`);
}

function refreshUI() {
    renderDeckSelect();
    if (page === 'decks') renderDecksPage();
    if (page === 'deck') renderDeckPage();
}

function createDeck() {
    if (!newDeckNameInput) return;
    const name = newDeckNameInput.value.trim();
    if (!name) {
        setStatus('Enter a deck name first.');
        return;
    }

    const deck = { id: uid('deck'), name, cards: [] };
    state.decks.unshift(deck);
    state.currentDeckId = deck.id;
    state.currentCardIndex = 0;
    state.showingBack = false;
    persistState();
    window.location.href = deckUrlFor(deck.id);
}

function addNewCard() {
    const deck = currentDeck();
    if (!deck || !newCardFront || !newCardBack) {
        setStatus('Choose a valid deck first.');
        return;
    }

    const front = newCardFront.value.trim();
    const back = newCardBack.value.trim();
    if (!front || !back) {
        setStatus('Both front and back are required.');
        return;
    }

    deck.cards.push({ id: uid('card'), front, back });
    state.currentCardIndex = deck.cards.length - 1;
    state.showingBack = false;
    persistState();
    showNewCardEditor(false);
    refreshUI();
}

function flipCard() {
    if (!currentCard()) return;
    state.showingBack = !state.showingBack;
    persistState();
    renderDeckPage();
}

function pageCard(direction) {
    const deck = currentDeck();
    if (!deck || deck.cards.length <= 1) return;
    const count = deck.cards.length;
    state.currentCardIndex = (state.currentCardIndex + direction + count) % count;
    state.showingBack = false;
    persistState();
    renderDeckPage();
}

function shuffleDeck() {
    const deck = currentDeck();
    if (!deck || deck.cards.length <= 1) return;

    for (let i = deck.cards.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck.cards[i], deck.cards[j]] = [deck.cards[j], deck.cards[i]];
    }

    state.currentCardIndex = 0;
    state.showingBack = false;
    persistState();
    renderDeckPage();
    setStatus(`${deck.name}: shuffled.`);
}

function bindEvents() {
    if (createDeckBtn) createDeckBtn.addEventListener('click', createDeck);
    if (newDeckNameInput) {
        newDeckNameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                createDeck();
            }
        });
    }

    if (decksListEl) {
        decksListEl.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.dataset.action === 'delete-deck') {
                deleteDeckById(target.dataset.deckId || '');
            }
        });
    }

    if (deckSelect) {
        deckSelect.addEventListener('change', () => {
            const nextId = deckSelect.value;
            if (!nextId) return;
            state.currentDeckId = nextId;
            state.currentCardIndex = 0;
            state.showingBack = false;
            persistState();

            if (page === 'decks') {
                refreshUI();
                return;
            }

            window.location.href = deckUrlFor(nextId);
        });
    }

    if (deleteDeckBtn) {
        deleteDeckBtn.addEventListener('click', () => {
            if (!state.currentDeckId) return;
            deleteDeckById(state.currentDeckId);
        });
    }

    if (studyCardEl) {
        studyCardEl.addEventListener('click', flipCard);
        studyCardEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                flipCard();
            }
        });
    }

    if (prevCardBtn) prevCardBtn.addEventListener('click', () => pageCard(-1));
    if (nextCardBtn) nextCardBtn.addEventListener('click', () => pageCard(1));
    if (shuffleBtn) shuffleBtn.addEventListener('click', shuffleDeck);

    if (addNewCardBtn) addNewCardBtn.addEventListener('click', () => showNewCardEditor(true));
    if (cancelNewCardBtn) cancelNewCardBtn.addEventListener('click', () => showNewCardEditor(false));
    if (saveNewCardBtn) saveNewCardBtn.addEventListener('click', addNewCard);

    if (newCardFront) {
        newCardFront.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (newCardBack) newCardBack.focus();
            }
        });
    }

    if (newCardBack) {
        newCardBack.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                addNewCard();
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (page !== 'deck') return;
        const target = event.target;
        if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
            return;
        }
        if (event.key === 'ArrowLeft') pageCard(-1);
        if (event.key === 'ArrowRight') pageCard(1);
        if (event.key.toLowerCase() === 'f') flipCard();
    });
}

ensureCurrentDeck(routeDeckId || null);
persistState();
bindEvents();
refreshUI();
