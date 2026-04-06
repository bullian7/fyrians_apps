const APP_INFO = {
    schedule: {
        title: 'Abbi\'s Class Scheduler',
        description: 'Branch-and-bound assignment engine for optimal student-to-slot scheduling.',
        standalone: '/schedule'
    },
    typing: {
        title: 'Typing Test',
        description: 'Minimal typing trainer with speed and accuracy tracking.',
        standalone: '/typing'
    },
    spotify: {
        title: 'Spotify Statistics',
        description: 'Top tracks, artists, and listening patterns across multiple ranges.',
        standalone: '/spotify'
    },
    sudoku: {
        title: 'Sudoku Lab',
        description: 'Generate fresh Sudoku boards with difficulty control and pencil marks.',
        standalone: '/sudoku'
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const homeShell = document.querySelector('.home-shell');
    const frame = document.getElementById('applet-frame');
    const themeSelector = document.getElementById('theme-selector');
    const title = document.getElementById('applet-title');
    const description = document.getElementById('applet-description');
    const standalone = document.getElementById('open-standalone');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const buttons = Array.from(document.querySelectorAll('.sidebar-app'));
    const sidebarStorageKey = 'fyrian_sidebar_collapsed';
    const sidebarWidthStorageKey = 'fyrian_sidebar_width';
    const minSidebarWidth = 220;
    const maxSidebarWidth = 900;
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

    function activateButton(btn) {
        buttons.forEach((item) => item.classList.remove('active'));
        btn.classList.add('active');

        const appKey = btn.dataset.appKey;
        const appUrl = btn.dataset.appUrl;
        const appMeta = APP_INFO[appKey];

        frame.src = appUrl;
        title.textContent = appMeta.title;
        description.textContent = appMeta.description;
        standalone.href = appMeta.standalone;
    }

    function applyThemeToIframe(theme) {
        const doc = frame?.contentDocument;
        if (!doc) return;

        const resolvedTheme = theme === 'system'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : theme;

        doc.documentElement.setAttribute('data-theme', resolvedTheme);
    }

    buttons.forEach((btn) => {
        btn.addEventListener('click', () => activateButton(btn));
    });

    frame.addEventListener('load', () => {
        const currentTheme = localStorage.getItem('fyrian_theme') || 'system';
        applyThemeToIframe(currentTheme);
    });

    if (themeSelector) {
        themeSelector.addEventListener('change', (event) => {
            applyThemeToIframe(event.target.value);
        });
    }

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
});
