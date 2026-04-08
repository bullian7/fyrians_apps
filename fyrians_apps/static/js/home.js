document.addEventListener('DOMContentLoaded', () => {
    const FAVORITES_KEY = 'fyrians_home_favorites_v1';

    const appletSearch = document.getElementById('applet-search');
    const favoritesSection = document.getElementById('favorites-section');
    const favoritesGrid = document.getElementById('favorites-grid');
    const categorySections = Array.from(document.querySelectorAll('.category-section[data-category]'));

    const appletsDataEl = document.getElementById('applets-data');
    const applets = JSON.parse((appletsDataEl && appletsDataEl.textContent) || '[]');
    const APP_INFO = Object.fromEntries(applets.map((app) => [app.key, app]));
    let favoriteKeys = loadFavorites();

    function loadFavorites() {
        try {
            const raw = localStorage.getItem(FAVORITES_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((key) => !!APP_INFO[key]);
        } catch (_err) {
            return [];
        }
    }

    function saveFavorites() {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteKeys));
    }

    function isFavorite(appKey) {
        return favoriteKeys.includes(appKey);
    }

    function setFavoriteVisual(bubble, appKey) {
        const fav = isFavorite(appKey);
        bubble.classList.toggle('is-favorite', fav);
        const pinBtn = bubble.querySelector('[data-pin-btn]');
        if (!pinBtn) return;
        pinBtn.textContent = fav ? '★' : '☆';
        pinBtn.setAttribute('aria-label', `${fav ? 'Unpin' : 'Pin'} ${APP_INFO[appKey]?.name || 'applet'}`);
        pinBtn.title = fav ? 'Unpin favorite' : 'Pin favorite';
    }

    function openApplet(appKey) {
        const appMeta = APP_INFO[appKey];
        if (!appMeta?.standalone) return;
        window.location.assign(appMeta.standalone);
    }

    function createBubble(appKey) {
        const appMeta = APP_INFO[appKey];
        if (!appMeta) return null;
        const bubble = document.createElement('div');
        bubble.className = 'applet-bubble';
        bubble.dataset.appKey = appKey;
        bubble.setAttribute('role', 'button');
        bubble.setAttribute('tabindex', '0');
        bubble.setAttribute('aria-label', `Open ${appMeta.name}`);
        bubble.innerHTML = `
            <button class="bubble-pin" type="button" data-pin-btn="1" aria-label="Pin ${appMeta.name}">☆</button>
            <span class="bubble-circle">${appMeta.sigil}</span>
            <span class="bubble-name">${appMeta.name}</span>
        `;
        bindBubble(bubble);
        return bubble;
    }

    function bindBubble(bubble) {
        const appKey = bubble.dataset.appKey;
        if (!appKey || !APP_INFO[appKey]) return;

        const pinBtn = bubble.querySelector('[data-pin-btn]');
        if (pinBtn) {
            pinBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleFavorite(appKey);
            });
        }

        bubble.addEventListener('click', (event) => {
            if (event.target.closest('[data-pin-btn]')) return;
            openApplet(appKey);
        });

        bubble.addEventListener('keydown', (event) => {
            if (event.target.closest('[data-pin-btn]')) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openApplet(appKey);
            }
        });

        setFavoriteVisual(bubble, appKey);
    }

    function renderFavorites() {
        if (!favoritesSection || !favoritesGrid) return;
        favoritesGrid.innerHTML = '';
        favoriteKeys.forEach((appKey) => {
            const bubble = createBubble(appKey);
            if (bubble) favoritesGrid.appendChild(bubble);
        });
    }

    function toggleFavorite(appKey) {
        if (isFavorite(appKey)) {
            favoriteKeys = favoriteKeys.filter((key) => key !== appKey);
        } else {
            favoriteKeys = [appKey, ...favoriteKeys];
        }
        saveFavorites();

        document.querySelectorAll(`.applet-bubble[data-app-key="${appKey}"]`).forEach((bubble) => {
            setFavoriteVisual(bubble, appKey);
        });
        renderFavorites();
        applySearchFilter();
    }

    function applySearchFilter() {
        const query = (appletSearch?.value || '').trim().toLowerCase();

        document.querySelectorAll('.applet-bubble').forEach((bubble) => {
            const appKey = bubble.dataset.appKey;
            const appMeta = APP_INFO[appKey];
            if (!appMeta) return;
            const haystack = `${appMeta.name} ${appMeta.title} ${appMeta.description} ${appMeta.sigil}`.toLowerCase();
            const matches = !query || haystack.includes(query);
            bubble.classList.toggle('hidden', !matches);
        });

        categorySections.forEach((section) => {
            const visibleCount = section.querySelectorAll('.applet-bubble:not(.hidden)').length;
            section.classList.toggle('hidden', visibleCount === 0);
        });

        if (favoritesSection) {
            const hasFavorites = favoriteKeys.length > 0;
            const visibleFavorites = favoritesSection.querySelectorAll('.applet-bubble:not(.hidden)').length;
            favoritesSection.classList.toggle('hidden', !hasFavorites || visibleFavorites === 0);
        }
    }

    document.querySelectorAll('.applet-bubble').forEach(bindBubble);
    renderFavorites();

    if (appletSearch) {
        appletSearch.addEventListener('input', applySearchFilter);
    }

    applySearchFilter();
});
