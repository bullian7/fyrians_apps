(function () {
    const root = document.getElementById('command-palette');
    const input = document.getElementById('command-palette-input');
    const list = document.getElementById('command-palette-list');
    if (!root || !input || !list) return;

    const appletsDataEl = document.getElementById('global-applets-data');
    const applets = JSON.parse((appletsDataEl && appletsDataEl.textContent) || '[]');
    const appActions = applets.map((app) => ({
        id: `app:${app.key}`,
        title: app.name,
        meta: `${app.category} applet`,
        run: () => window.location.assign(app.standalone),
    }));

    const staticActions = [
        {
            id: 'nav:home',
            title: 'Go to Home',
            meta: 'navigation',
            run: () => window.location.assign('/'),
        },
        {
            id: 'nav:account',
            title: 'Open Profile',
            meta: 'navigation',
            run: () => window.location.assign('/account'),
        },
        {
            id: 'ui:settings',
            title: 'Toggle Settings Menu',
            meta: 'interface',
            run: () => {
                const btn = document.getElementById('settings-toggle');
                if (btn) btn.click();
            },
        },
    ];

    const actions = [...appActions, ...staticActions];
    let open = false;
    let filtered = [];
    let activeIndex = 0;

    function setOpen(next) {
        open = !!next;
        root.classList.toggle('hidden', !open);
        if (!open) return;
        input.value = '';
        activeIndex = 0;
        applyFilter();
        setTimeout(() => input.focus(), 0);
    }

    function applyFilter() {
        const q = input.value.trim().toLowerCase();
        filtered = actions.filter((action) => {
            if (!q) return true;
            return `${action.title} ${action.meta}`.toLowerCase().includes(q);
        }).slice(0, 16);
        if (activeIndex >= filtered.length) activeIndex = Math.max(0, filtered.length - 1);
        renderList();
    }

    function renderList() {
        list.innerHTML = '';
        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.className = 'command-empty';
            empty.textContent = 'No matches.';
            list.appendChild(empty);
            return;
        }

        filtered.forEach((item, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `command-item${index === activeIndex ? ' active' : ''}`;
            button.innerHTML = `<span class="title">${item.title}</span><span class="meta">${item.meta}</span>`;
            button.addEventListener('click', () => {
                setOpen(false);
                item.run();
            });
            list.appendChild(button);
        });
    }

    function runActive() {
        const selected = filtered[activeIndex];
        if (!selected) return;
        setOpen(false);
        selected.run();
    }

    root.addEventListener('click', (event) => {
        const closeTrigger = event.target.closest('[data-cmd-close="1"]');
        if (closeTrigger) setOpen(false);
    });

    input.addEventListener('input', applyFilter);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!filtered.length) return;
            activeIndex = Math.min(filtered.length - 1, activeIndex + 1);
            renderList();
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!filtered.length) return;
            activeIndex = Math.max(0, activeIndex - 1);
            renderList();
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            runActive();
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
        }
    });

    document.addEventListener('keydown', (event) => {
        const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
        if (isCmdK) {
            event.preventDefault();
            setOpen(!open);
            return;
        }

        if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
        }
    });
})();
