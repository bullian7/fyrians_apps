document.addEventListener('DOMContentLoaded', () => {
    const cursorPreferenceKey = 'cursorFollowerEnabled';
    const homeShell = document.querySelector('.home-shell');
    const frameStack = document.getElementById('applet-frame-stack');
    const loadingBar = document.getElementById('applet-loading');
    const welcomePanel = document.getElementById('welcome-panel');
    const themeSelector = document.getElementById('theme-selector');
    const cursorToggle = document.getElementById('cursor-follower-toggle');
    const navHomeLink = document.querySelector('.nav-logo');
    const title = document.getElementById('applet-title');
    const description = document.getElementById('applet-description');
    const standalone = document.getElementById('open-standalone');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const appletSearch = document.getElementById('applet-search');
    const buttons = Array.from(document.querySelectorAll('.sidebar-app'));
    const categories = Array.from(document.querySelectorAll('.sidebar-category'));

    const appletsDataEl = document.getElementById('applets-data');
    const applets = JSON.parse((appletsDataEl && appletsDataEl.textContent) || '[]');
    const APP_INFO = Object.fromEntries(applets.map((app) => [app.key, app]));

    const sidebarStorageKey = 'fyrian_sidebar_collapsed';
    const sidebarWidthStorageKey = 'fyrian_sidebar_width';
    const activeAppletSessionKey = 'fyrian_active_applet';
    const minSidebarWidth = 220;
    const maxSidebarWidth = 900;
    const defaultTitle = title ? title.textContent : "Welcome to Fyrian's Apps";
    const defaultDescription = description
        ? description.textContent
        : 'A one-stop hub for the tools I built for my family members and friends. Pick any applet from the left to get started.';

    let activeKey = null;
    let isDragging = false;

    function clampWidth(width) {
        const maxAllowed = Math.min(maxSidebarWidth, Math.floor(window.innerWidth * 0.72));
        return Math.max(minSidebarWidth, Math.min(width, maxAllowed));
    }

    function setSidebarWidth(width) {
        const safeWidth = clampWidth(width);
        homeShell.style.setProperty('--sidebar-width', `${safeWidth}px`);
        sidebarResizer.setAttribute('aria-valuenow', String(safeWidth));
        localStorage.setItem(sidebarWidthStorageKey, String(safeWidth));
    }

    function setSidebarCollapsed(collapsed) {
        homeShell.classList.toggle('sidebar-collapsed', collapsed);
        sidebarToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        sidebarToggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
        localStorage.setItem(sidebarStorageKey, collapsed ? '1' : '0');
    }

    function setLoading(on) {
        loadingBar.classList.toggle('active', on);
    }

    function resolveTheme(theme) {
        if (theme === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return theme;
    }

    function applyThemeToIframe(iframe, theme) {
        const doc = iframe.contentDocument;
        if (!doc) return;
        doc.documentElement.setAttribute('data-theme', resolveTheme(theme));
    }

    function applyThemeToAllFrames(theme) {
        frameStack.querySelectorAll('iframe').forEach((iframe) => applyThemeToIframe(iframe, theme));
    }

    function applyCursorFollowerToIframe(iframe, enabled) {
        if (!iframe.contentWindow) return;
        iframe.contentWindow.postMessage(
            { type: 'fyrian:cursor-follower', enabled: !!enabled },
            window.location.origin
        );
    }

    function applyCursorFollowerToAllFrames(enabled) {
        frameStack.querySelectorAll('iframe').forEach((iframe) => applyCursorFollowerToIframe(iframe, enabled));
    }

    function getFrameForKey(key) {
        return frameStack.querySelector(`iframe[data-app-key="${key}"]`);
    }

    function focusAppletFrame(iframe) {
        if (!iframe) return;
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        iframe.focus({ preventScroll: true });
        if (iframe.contentWindow && typeof iframe.contentWindow.focus === 'function') {
            iframe.contentWindow.focus();
        }
    }

    function createFrameForApplet(appMeta) {
        const iframe = document.createElement('iframe');
        iframe.className = 'applet-frame';
        iframe.dataset.appKey = appMeta.key;
        iframe.dataset.loaded = '0';
        iframe.title = appMeta.title;
        iframe.tabIndex = -1;
        iframe.src = appMeta.embed;

        iframe.addEventListener('load', () => {
            iframe.dataset.loaded = '1';
            const currentTheme = localStorage.getItem('fyrian_theme') || 'system';
            applyThemeToIframe(iframe, currentTheme);
            const cursorEnabled = localStorage.getItem(cursorPreferenceKey) !== 'false';
            applyCursorFollowerToIframe(iframe, cursorEnabled);
            if (activeKey === appMeta.key) {
                setLoading(false);
                requestAnimationFrame(() => focusAppletFrame(iframe));
            }
        });

        frameStack.appendChild(iframe);
        return iframe;
    }

    function activateButtonUI(key) {
        buttons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.appKey === key);
        });
    }

    function showFrame(key) {
        frameStack.querySelectorAll('iframe').forEach((iframe) => {
            iframe.classList.toggle('active', iframe.dataset.appKey === key);
        });
    }

    function activateApplet(key) {
        const appMeta = APP_INFO[key];
        if (!appMeta) return;

        activeKey = key;
        sessionStorage.setItem(activeAppletSessionKey, key);
        if (welcomePanel) {
            welcomePanel.classList.add('hidden');
        }
        activateButtonUI(key);
        title.textContent = appMeta.title;
        description.textContent = appMeta.description;
        standalone.href = appMeta.standalone;
        standalone.classList.remove('hidden-link');

        let frame = getFrameForKey(key);
        if (!frame) {
            setLoading(true);
            frame = createFrameForApplet(appMeta);
        } else if (frame.dataset.loaded !== '1') {
            setLoading(true);
        } else {
            setLoading(false);
        }

        showFrame(key);
        requestAnimationFrame(() => focusAppletFrame(frame));
    }

    function activateHome() {
        activeKey = null;
        sessionStorage.removeItem(activeAppletSessionKey);
        activateButtonUI(null);
        showFrame(null);
        setLoading(false);

        if (welcomePanel) {
            welcomePanel.classList.remove('hidden');
        }
        if (title) {
            title.textContent = defaultTitle;
        }
        if (description) {
            description.textContent = defaultDescription;
        }
        if (standalone) {
            standalone.href = '#';
            standalone.classList.add('hidden-link');
        }
    }

    function applySearchFilter() {
        const query = (appletSearch?.value || '').trim().toLowerCase();

        buttons.forEach((btn) => {
            const appKey = btn.dataset.appKey;
            const appMeta = APP_INFO[appKey];
            if (!appMeta) return;
            const haystack = `${appMeta.name} ${appMeta.title} ${appMeta.description} ${appMeta.sigil}`.toLowerCase();
            const matches = !query || haystack.includes(query);
            btn.classList.toggle('hidden', !matches);
        });

        categories.forEach((section) => {
            const visibleCount = section.querySelectorAll('.sidebar-app:not(.hidden)').length;
            section.classList.toggle('hidden', visibleCount === 0);
        });
    }

    buttons.forEach((btn) => {
        btn.addEventListener('click', () => activateApplet(btn.dataset.appKey));
    });
    if (navHomeLink) {
        navHomeLink.addEventListener('click', (event) => {
            if (event.defaultPrevented) return;
            if (event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            activateHome();
        });
    }

    if (appletSearch) {
        appletSearch.addEventListener('input', applySearchFilter);
    }

    if (themeSelector) {
        themeSelector.addEventListener('change', (event) => {
            applyThemeToAllFrames(event.target.value);
        });
    }

    if (cursorToggle) {
        cursorToggle.addEventListener('change', () => {
            applyCursorFollowerToAllFrames(cursorToggle.checked);
        });
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const selected = localStorage.getItem('fyrian_theme') || 'system';
        if (selected === 'system') {
            applyThemeToAllFrames('system');
        }
    });

    if (sidebarToggle) {
        const savedState = localStorage.getItem(sidebarStorageKey);
        setSidebarCollapsed(savedState === '1');

        sidebarToggle.addEventListener('click', () => {
            const currentlyCollapsed = homeShell.classList.contains('sidebar-collapsed');
            setSidebarCollapsed(!currentlyCollapsed);
        });
    }

    if (sidebarResizer) {
        const savedWidth = Number(localStorage.getItem(sidebarWidthStorageKey));
        if (Number.isFinite(savedWidth) && savedWidth > 0) {
            setSidebarWidth(savedWidth);
        }

        const stopResize = () => {
            if (!isDragging) return;
            isDragging = false;
            homeShell.classList.remove('is-resizing');
            sidebarResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        const onMouseMove = (moveEvent) => {
            if (!isDragging) return;
            const shellLeft = homeShell.getBoundingClientRect().left;
            setSidebarWidth(moveEvent.clientX - shellLeft);
        };

        sidebarResizer.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            if (window.innerWidth <= 1100 || homeShell.classList.contains('sidebar-collapsed')) return;
            event.preventDefault();

            isDragging = true;
            homeShell.classList.add('is-resizing');
            sidebarResizer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', stopResize);
        window.addEventListener('blur', stopResize);

        window.addEventListener('resize', () => {
            const liveWidth = parseInt(getComputedStyle(homeShell).getPropertyValue('--sidebar-width'), 10);
            if (Number.isFinite(liveWidth) && liveWidth > 0) {
                setSidebarWidth(liveWidth);
            }
        });
    }

    setLoading(false);
    applySearchFilter();

    const savedAppletKey = sessionStorage.getItem(activeAppletSessionKey);
    if (savedAppletKey && APP_INFO[savedAppletKey]) {
        activateApplet(savedAppletKey);
    }
});
