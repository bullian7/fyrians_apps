(function () {
    const toggle = document.getElementById('settings-toggle');
    const menu = document.getElementById('settings-menu');
    const wrap = document.querySelector('.settings-wrap');

    if (!toggle || !menu || !wrap) return;

    function setOpen(open) {
        menu.classList.toggle('hidden', !open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = !menu.classList.contains('hidden');
        setOpen(!isOpen);
    });

    document.addEventListener('click', (event) => {
        if (wrap.contains(event.target)) return;
        setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setOpen(false);
        }
    });
})();
