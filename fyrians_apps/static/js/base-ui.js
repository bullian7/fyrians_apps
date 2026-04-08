(function () {
    const GLOBAL_AUDIO_VOLUME_KEY = 'fyrians_global_audio_volume_v1';
    const toggle = document.getElementById('settings-toggle');
    const menu = document.getElementById('settings-menu');
    const wrap = document.querySelector('.settings-wrap');
    const globalAudioVolume = document.getElementById('global-audio-volume');
    const globalAudioVolumeLabel = document.getElementById('global-audio-volume-label');

    if (!toggle || !menu || !wrap) return;

    function loadVolume() {
        try {
            const raw = localStorage.getItem(GLOBAL_AUDIO_VOLUME_KEY);
            const value = Math.max(0, Math.min(100, Number(raw)));
            return Number.isFinite(value) ? value : 70;
        } catch {
            return 70;
        }
    }

    function setVolumeLabel(value) {
        if (!globalAudioVolumeLabel) return;
        globalAudioVolumeLabel.textContent = `${value}%`;
    }

    if (globalAudioVolume) {
        const initial = loadVolume();
        globalAudioVolume.value = String(initial);
        setVolumeLabel(initial);
        globalAudioVolume.addEventListener('input', () => {
            const value = Math.max(0, Math.min(100, Number(globalAudioVolume.value) || 0));
            setVolumeLabel(value);
            localStorage.setItem(GLOBAL_AUDIO_VOLUME_KEY, String(value));
        });
    }

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
