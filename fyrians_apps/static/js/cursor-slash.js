(function () {
    const preferenceKey = 'cursorFollowerEnabled';
    const toggle = document.getElementById('cursor-follower-toggle');
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let isEnabled = localStorage.getItem(preferenceKey) !== 'false';

    if (toggle) {
        toggle.checked = isEnabled;
        toggle.addEventListener('change', () => {
            isEnabled = toggle.checked;
            localStorage.setItem(preferenceKey, String(isEnabled));
        });
    }

    if (isTouch || reduceMotion) return;

    const slash = document.createElement('div');
    slash.className = 'cursor-slash';
    document.body.appendChild(slash);

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let x = targetX;
    let y = targetY;
    let lastX = x;
    let lastY = y;
    let visible = false;
    let lastMoveAt = 0;

    const idleHideMs = 400;
    const baseWidth = 30;
    const maxStretch = 2.2;
    const minStretch = 0.01;
    const slashHalfHeight = 3;

    function show() {
        if (visible) return;
        visible = true;
        slash.style.opacity = '0.95';
    }

    function hide() {
        if (!visible) return;
        visible = false;
        slash.style.opacity = '0';
    }

    window.addEventListener('mousemove', (event) => {
        if (!isEnabled) return;
        targetX = event.clientX;
        targetY = event.clientY;
        lastMoveAt = performance.now();
        show();
    });

    window.addEventListener('mouseenter', () => {
        if (!isEnabled) return;
        show();
    });
    window.addEventListener('mouseleave', hide);
    window.addEventListener('blur', hide);

    function tick() {
        if (!isEnabled) {
            hide();
            requestAnimationFrame(tick);
            return;
        }

        const now = performance.now();
        x += (targetX - x) * 0.22;
        y += (targetY - y) * 0.22;

        const vx = x - lastX;
        const vy = y - lastY;
        const speed = Math.hypot(vx, vy);
        const angle = Math.atan2(vy, vx) * (180 / Math.PI);
        const stretch = Math.max(minStretch, Math.min(maxStretch, speed * 0.1));

        if (now - lastMoveAt > idleHideMs) {
            hide();
        } else {
            show();
        }

        const anchorX = x - baseWidth;
        slash.style.transform = `translate3d(${anchorX}px, ${y - slashHalfHeight}px, 0) rotate(${angle}deg) scaleX(${stretch})`;

        lastX = x;
        lastY = y;
        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
})();
