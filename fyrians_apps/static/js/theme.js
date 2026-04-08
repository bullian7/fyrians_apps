// Instantly runs in the <head> to prevent theme flashing
(function() {
    const THEME_KEY = 'fyrian_theme';
    const ACCENT_KEY = 'fyrian_accent_color';
    const DEFAULT_ACCENT = '#73b9eb';
    const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;

    function isValidAccent(value) {
        return ACCENT_RE.test(String(value || ''));
    }

    function hexToRgb(hex) {
        const clean = hex.replace('#', '');
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        return { r, g, b };
    }

    function applyAccent(accentHex) {
        const accent = isValidAccent(accentHex) ? accentHex.toLowerCase() : DEFAULT_ACCENT;
        const { r, g, b } = hexToRgb(accent);
        document.documentElement.style.setProperty('--primary', accent);
        document.documentElement.style.setProperty('--primary-dim', `rgba(${r}, ${g}, ${b}, 0.15)`);
        document.documentElement.style.setProperty('--primary-rgb', `${r}, ${g}, ${b}`);
    }

    function getSavedAccent() {
        const saved = localStorage.getItem(ACCENT_KEY);
        return isValidAccent(saved) ? saved.toLowerCase() : DEFAULT_ACCENT;
    }

    function applyTheme(theme) {
        if (theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    function getSavedTheme() {
        return localStorage.getItem(THEME_KEY) || 'system';
    }

    const savedTheme = getSavedTheme();
    applyTheme(savedTheme);
    applyAccent(getSavedAccent());

    // Wait for DOM to attach events
    window.addEventListener('DOMContentLoaded', () => {
        const selector = document.getElementById('theme-selector');
        const accentPicker = document.getElementById('accent-color-picker');
        const accentRevertBtn = document.getElementById('accent-revert-btn');
        let isLoggedIn = false;
        if (selector) {
            selector.value = savedTheme;
            selector.addEventListener('change', (e) => {
                const newTheme = e.target.value;
                localStorage.setItem(THEME_KEY, newTheme);
                applyTheme(newTheme);
            });
        }

        async function saveAccentForUser(accent) {
            if (!isLoggedIn) return;
            try {
                await fetch('/api/user/preferences', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accent_color: accent })
                });
            } catch (_err) {
                // ignore network errors here
            }
        }

        if (accentPicker) {
            accentPicker.value = getSavedAccent();
            accentPicker.addEventListener('input', (event) => {
                const accent = String(event.target.value || '').toLowerCase();
                if (!isValidAccent(accent)) return;
                localStorage.setItem(ACCENT_KEY, accent);
                applyAccent(accent);
            });
            accentPicker.addEventListener('change', (event) => {
                const accent = String(event.target.value || '').toLowerCase();
                if (!isValidAccent(accent)) return;
                void saveAccentForUser(accent);
            });
        }

        if (accentRevertBtn) {
            accentRevertBtn.addEventListener('click', () => {
                localStorage.setItem(ACCENT_KEY, DEFAULT_ACCENT);
                applyAccent(DEFAULT_ACCENT);
                if (accentPicker) accentPicker.value = DEFAULT_ACCENT;
                void saveAccentForUser(DEFAULT_ACCENT);
            });
        }

        // Listen for OS theme changes if 'system' is selected
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (localStorage.getItem(THEME_KEY) === 'system') {
                applyTheme('system');
            }
        });

        // Sync theme updates coming from other tabs/windows/iframes.
        window.addEventListener('storage', (event) => {
            if (event.key === THEME_KEY) {
                applyTheme(getSavedTheme());
            } else if (event.key === ACCENT_KEY) {
                const accent = getSavedAccent();
                applyAccent(accent);
                if (accentPicker) accentPicker.value = accent;
            }
        });

        fetch('/api/auth/me')
            .then((res) => res.json())
            .then((payload) => {
                isLoggedIn = !!payload?.logged_in;
                const serverAccent = payload?.user?.accent_color;
                if (isLoggedIn && isValidAccent(serverAccent)) {
                    const accent = String(serverAccent).toLowerCase();
                    localStorage.setItem(ACCENT_KEY, accent);
                    applyAccent(accent);
                    if (accentPicker) accentPicker.value = accent;
                }
            })
            .catch(() => {
                // keep local accent if auth state can't be fetched
            });
    });
})();
