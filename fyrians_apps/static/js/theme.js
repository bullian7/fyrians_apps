// Instantly runs in the <head> to prevent theme flashing
(function() {
    const THEME_KEY = 'fyrian_theme';

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

    // Wait for DOM to attach events
    window.addEventListener('DOMContentLoaded', () => {
        const selector = document.getElementById('theme-selector');
        if (selector) {
            selector.value = savedTheme;
            selector.addEventListener('change', (e) => {
                const newTheme = e.target.value;
                localStorage.setItem(THEME_KEY, newTheme);
                applyTheme(newTheme);
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
            }
        });
    });
})();
