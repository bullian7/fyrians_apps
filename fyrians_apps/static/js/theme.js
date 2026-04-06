// Instantly runs in the <head> to prevent theme flashing
(function() {
    function applyTheme(theme) {
        if (theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    const savedTheme = localStorage.getItem('fyrian_theme') || 'system';
    applyTheme(savedTheme);

    // Wait for DOM to attach events
    window.addEventListener('DOMContentLoaded', () => {
        const selector = document.getElementById('theme-selector');
        if (selector) {
            selector.value = savedTheme;
            selector.addEventListener('change', (e) => {
                const newTheme = e.target.value;
                localStorage.setItem('fyrian_theme', newTheme);
                applyTheme(newTheme);
            });
        }
        
        // Listen for OS theme changes if 'system' is selected
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (localStorage.getItem('fyrian_theme') === 'system') {
                applyTheme('system');
            }
        });
    });
})();