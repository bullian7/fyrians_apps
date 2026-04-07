(function () {
    let root = null;
    let overlay = null;
    let panel = null;
    let titleEl = null;
    let messageEl = null;
    let inputWrap = null;
    let inputEl = null;
    let cancelBtn = null;
    let okBtn = null;

    const queue = [];
    let active = null;
    let lastFocused = null;

    function ensureUI() {
        if (root) return;

        root = document.createElement('div');
        root.className = 'fyrian-popup-root';
        root.innerHTML = `
            <div class="fyrian-popup-overlay" aria-hidden="true"></div>
            <div class="fyrian-popup-panel" role="dialog" aria-modal="true" aria-live="assertive">
                <h2 class="fyrian-popup-title"></h2>
                <p class="fyrian-popup-message"></p>
                <div class="fyrian-popup-input-wrap fyrian-popup-hidden">
                    <input class="fyrian-popup-input" type="text" />
                </div>
                <div class="fyrian-popup-actions">
                    <button type="button" class="fyrian-popup-btn fyrian-popup-cancel fyrian-popup-hidden">Cancel</button>
                    <button type="button" class="fyrian-popup-btn fyrian-popup-ok">OK</button>
                </div>
            </div>
        `;

        document.body.appendChild(root);

        overlay = root.querySelector('.fyrian-popup-overlay');
        panel = root.querySelector('.fyrian-popup-panel');
        titleEl = root.querySelector('.fyrian-popup-title');
        messageEl = root.querySelector('.fyrian-popup-message');
        inputWrap = root.querySelector('.fyrian-popup-input-wrap');
        inputEl = root.querySelector('.fyrian-popup-input');
        cancelBtn = root.querySelector('.fyrian-popup-cancel');
        okBtn = root.querySelector('.fyrian-popup-ok');

        overlay.addEventListener('click', () => {
            if (!active) return;
            if (active.type === 'alert') {
                resolveActive(undefined);
                return;
            }
            if (active.type === 'confirm') {
                resolveActive(false);
                return;
            }
            resolveActive(null);
        });

        cancelBtn.addEventListener('click', () => {
            if (!active) return;
            if (active.type === 'confirm') {
                resolveActive(false);
                return;
            }
            resolveActive(null);
        });

        okBtn.addEventListener('click', () => {
            if (!active) return;
            if (active.type === 'prompt') {
                resolveActive(inputEl.value);
                return;
            }
            if (active.type === 'confirm') {
                resolveActive(true);
                return;
            }
            resolveActive(undefined);
        });

        inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                okBtn.click();
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                cancelBtn.click();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (!active) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                if (active.type === 'alert') {
                    okBtn.click();
                } else {
                    cancelBtn.click();
                }
                return;
            }
            if (event.key === 'Enter' && active.type !== 'prompt') {
                event.preventDefault();
                okBtn.click();
            }
        });
    }

    function openNext() {
        if (active || !queue.length) return;

        ensureUI();
        active = queue.shift();

        const popupTitle = active.options.title || "Fyrian's Apps";
        const okText = active.options.okText || 'OK';
        const cancelText = active.options.cancelText || 'Cancel';

        titleEl.textContent = popupTitle;
        messageEl.textContent = active.message || '';
        okBtn.textContent = okText;
        cancelBtn.textContent = cancelText;

        panel.classList.toggle('danger', !!active.options.danger);

        const hasCancel = active.type === 'confirm' || active.type === 'prompt';
        cancelBtn.classList.toggle('fyrian-popup-hidden', !hasCancel);

        const isPrompt = active.type === 'prompt';
        inputWrap.classList.toggle('fyrian-popup-hidden', !isPrompt);
        if (isPrompt) {
            inputEl.value = active.options.defaultValue || '';
            inputEl.placeholder = active.options.placeholder || '';
        } else {
            inputEl.value = '';
            inputEl.placeholder = '';
        }

        lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        root.classList.add('active');

        if (isPrompt) {
            inputEl.focus();
            inputEl.select();
        } else {
            okBtn.focus();
        }
    }

    function resolveActive(value) {
        if (!active) return;
        const done = active.resolve;
        active = null;
        root.classList.remove('active');
        if (lastFocused && typeof lastFocused.focus === 'function') {
            lastFocused.focus();
        }
        done(value);
        setTimeout(openNext, 0);
    }

    function enqueue(type, message, options) {
        return new Promise((resolve) => {
            queue.push({
                type,
                message: String(message ?? ''),
                options: options || {},
                resolve
            });
            openNext();
        });
    }

    window.FyrianPopup = {
        alert(message, options) {
            return enqueue('alert', message, options);
        },
        confirm(message, options) {
            return enqueue('confirm', message, options);
        },
        prompt(message, options) {
            return enqueue('prompt', message, options);
        }
    };
})();
