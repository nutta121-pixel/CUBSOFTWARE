// CubReactive - Setup Page JavaScript

let isSpeaking = false;

// Preset themes
const THEMES = {
    default: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'bounce',
        avatar_shape: 'rounded',
        avatar_size: 180,
        border_enabled: false,
        glow_enabled: false,
        speaking_ring_enabled: true,
        speaking_ring_color: '#57f287',
        speaking_ring_width: 4,
        shadow_enabled: false,
        name_color: '#ffffff',
        name_size: 14,
        name_background_enabled: false,
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 100,
        transition_style: 'fade',
        transition_duration: 200
    },
    discord: {
        bounce_on_speak: false,
        dim_when_idle: true,
        animation_style: 'none',
        avatar_shape: 'circle',
        avatar_size: 150,
        border_enabled: false,
        glow_enabled: false,
        speaking_ring_enabled: true,
        speaking_ring_color: '#57f287',
        speaking_ring_width: 3,
        shadow_enabled: false,
        name_color: '#ffffff',
        name_size: 12,
        name_background_enabled: true,
        name_background_color: '#000000',
        grayscale_muted: false,
        grayscale_deafened: false,
        idle_opacity: 60,
        transition_style: 'fade',
        transition_duration: 150
    },
    neon: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'pulse',
        avatar_shape: 'rounded',
        avatar_size: 200,
        border_enabled: true,
        border_color: '#00ff00',
        border_width: 3,
        glow_enabled: true,
        glow_color: '#00ff00',
        speaking_ring_enabled: true,
        speaking_ring_color: '#00ff00',
        speaking_ring_width: 4,
        shadow_enabled: true,
        shadow_color: '#00ff00',
        shadow_blur: 20,
        name_color: '#00ff00',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#000000',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 70,
        transition_style: 'fade',
        transition_duration: 200
    },
    minimal: {
        bounce_on_speak: false,
        dim_when_idle: true,
        animation_style: 'none',
        avatar_shape: 'square',
        avatar_size: 120,
        border_enabled: true,
        border_color: '#ffffff',
        border_width: 2,
        glow_enabled: false,
        speaking_ring_enabled: false,
        shadow_enabled: false,
        name_color: '#ffffff',
        name_size: 11,
        name_background_enabled: false,
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 50,
        transition_style: 'none',
        transition_duration: 0
    },
    retro: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'shake',
        avatar_shape: 'square',
        avatar_size: 180,
        border_enabled: true,
        border_color: '#feca57',
        border_width: 5,
        glow_enabled: false,
        speaking_ring_enabled: true,
        speaking_ring_color: '#ff6b6b',
        speaking_ring_width: 6,
        shadow_enabled: true,
        shadow_color: '#000000',
        shadow_blur: 15,
        name_color: '#feca57',
        name_size: 16,
        name_background_enabled: true,
        name_background_color: '#000000',
        grayscale_muted: false,
        grayscale_deafened: true,
        idle_opacity: 100,
        transition_style: 'slide',
        transition_duration: 300
    },
    cyberpunk: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'pulse',
        avatar_shape: 'hexagon',
        avatar_size: 200,
        border_enabled: true,
        border_color: '#ff00ff',
        border_width: 3,
        glow_enabled: true,
        glow_color: '#ff00ff',
        speaking_ring_enabled: true,
        speaking_ring_color: '#00ffff',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#ff00ff',
        shadow_blur: 25,
        name_color: '#00ffff',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#0a0a0a',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 80,
        transition_style: 'fade',
        transition_duration: 150
    },
    fire: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'shake',
        avatar_shape: 'circle',
        avatar_size: 180,
        border_enabled: true,
        border_color: '#ff4500',
        border_width: 4,
        glow_enabled: true,
        glow_color: '#ff6600',
        speaking_ring_enabled: true,
        speaking_ring_color: '#ff4500',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#ff2200',
        shadow_blur: 20,
        name_color: '#ff8c00',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#1a0000',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 90,
        transition_style: 'fade',
        transition_duration: 200
    },
    ice: {
        bounce_on_speak: false,
        dim_when_idle: true,
        animation_style: 'pulse',
        avatar_shape: 'rounded',
        avatar_size: 170,
        border_enabled: true,
        border_color: '#88ccff',
        border_width: 3,
        glow_enabled: true,
        glow_color: '#44aaff',
        speaking_ring_enabled: true,
        speaking_ring_color: '#66ddff',
        speaking_ring_width: 4,
        shadow_enabled: true,
        shadow_color: '#0066cc',
        shadow_blur: 15,
        name_color: '#aaddff',
        name_size: 13,
        name_background_enabled: false,
        grayscale_muted: false,
        grayscale_deafened: true,
        idle_opacity: 60,
        transition_style: 'fade',
        transition_duration: 300
    },
    sunset: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'wave',
        avatar_shape: 'circle',
        avatar_size: 190,
        border_enabled: true,
        border_color: '#ff6b9d',
        border_width: 3,
        glow_enabled: true,
        glow_color: '#c44569',
        speaking_ring_enabled: true,
        speaking_ring_color: '#f8a5c2',
        speaking_ring_width: 4,
        shadow_enabled: true,
        shadow_color: '#c44569',
        shadow_blur: 18,
        name_color: '#f8a5c2',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#2d132c',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 85,
        transition_style: 'fade',
        transition_duration: 250
    },
    matrix: {
        bounce_on_speak: false,
        dim_when_idle: true,
        animation_style: 'none',
        avatar_shape: 'square',
        avatar_size: 160,
        border_enabled: true,
        border_color: '#00ff41',
        border_width: 2,
        glow_enabled: false,
        speaking_ring_enabled: true,
        speaking_ring_color: '#00ff41',
        speaking_ring_width: 3,
        shadow_enabled: false,
        name_color: '#00ff41',
        name_size: 12,
        name_background_enabled: true,
        name_background_color: '#000000',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 40,
        transition_style: 'none',
        transition_duration: 0
    },
    pastel: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'bounce',
        avatar_shape: 'circle',
        avatar_size: 170,
        border_enabled: true,
        border_color: '#b8a9c9',
        border_width: 4,
        glow_enabled: false,
        speaking_ring_enabled: true,
        speaking_ring_color: '#a8d8ea',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#b8a9c9',
        shadow_blur: 12,
        name_color: '#f6e6cb',
        name_size: 13,
        name_background_enabled: true,
        name_background_color: '#2a2a3a',
        grayscale_muted: false,
        grayscale_deafened: false,
        idle_opacity: 100,
        transition_style: 'fade',
        transition_duration: 300
    },
    gold: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'pulse',
        avatar_shape: 'rounded',
        avatar_size: 190,
        border_enabled: true,
        border_color: '#ffd700',
        border_width: 4,
        glow_enabled: true,
        glow_color: '#daa520',
        speaking_ring_enabled: true,
        speaking_ring_color: '#ffd700',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#b8860b',
        shadow_blur: 20,
        name_color: '#ffd700',
        name_size: 15,
        name_background_enabled: true,
        name_background_color: '#1a1200',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 90,
        transition_style: 'fade',
        transition_duration: 200
    },
    ocean: {
        bounce_on_speak: true,
        dim_when_idle: true,
        animation_style: 'wave',
        avatar_shape: 'circle',
        avatar_size: 180,
        border_enabled: true,
        border_color: '#0077b6',
        border_width: 3,
        glow_enabled: true,
        glow_color: '#00b4d8',
        speaking_ring_enabled: true,
        speaking_ring_color: '#90e0ef',
        speaking_ring_width: 4,
        shadow_enabled: true,
        shadow_color: '#023e8a',
        shadow_blur: 18,
        name_color: '#caf0f8',
        name_size: 13,
        name_background_enabled: true,
        name_background_color: '#03045e',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 55,
        transition_style: 'fade',
        transition_duration: 350
    },
    cherry: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'bounce',
        avatar_shape: 'rounded',
        avatar_size: 175,
        border_enabled: true,
        border_color: '#e91e63',
        border_width: 3,
        glow_enabled: true,
        glow_color: '#e91e63',
        speaking_ring_enabled: true,
        speaking_ring_color: '#f48fb1',
        speaking_ring_width: 4,
        shadow_enabled: true,
        shadow_color: '#880e4f',
        shadow_blur: 15,
        name_color: '#fce4ec',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#311b1b',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 85,
        transition_style: 'fade',
        transition_duration: 200
    },
    toxic: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'shake',
        avatar_shape: 'hexagon',
        avatar_size: 185,
        border_enabled: true,
        border_color: '#76ff03',
        border_width: 3,
        glow_enabled: true,
        glow_color: '#76ff03',
        speaking_ring_enabled: true,
        speaking_ring_color: '#b2ff59',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#33691e',
        shadow_blur: 22,
        name_color: '#ccff90',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#0a0f00',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 75,
        transition_style: 'fade',
        transition_duration: 150
    },
    galaxy: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'pulse',
        avatar_shape: 'circle',
        avatar_size: 200,
        border_enabled: true,
        border_color: '#7c4dff',
        border_width: 4,
        glow_enabled: true,
        glow_color: '#b388ff',
        speaking_ring_enabled: true,
        speaking_ring_color: '#ea80fc',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#4a148c',
        shadow_blur: 25,
        name_color: '#e1bee7',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#12005e',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 80,
        transition_style: 'fade',
        transition_duration: 200
    },
    stealth: {
        bounce_on_speak: false,
        dim_when_idle: true,
        animation_style: 'none',
        avatar_shape: 'rounded',
        avatar_size: 150,
        border_enabled: true,
        border_color: '#333333',
        border_width: 2,
        glow_enabled: false,
        speaking_ring_enabled: true,
        speaking_ring_color: '#555555',
        speaking_ring_width: 3,
        shadow_enabled: false,
        name_color: '#888888',
        name_size: 11,
        name_background_enabled: false,
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 30,
        transition_style: 'fade',
        transition_duration: 100
    },
    candy: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'bounce',
        avatar_shape: 'circle',
        avatar_size: 180,
        border_enabled: true,
        border_color: '#ff6fff',
        border_width: 5,
        glow_enabled: true,
        glow_color: '#ff6fff',
        speaking_ring_enabled: true,
        speaking_ring_color: '#ffde59',
        speaking_ring_width: 6,
        shadow_enabled: true,
        shadow_color: '#ff6fff',
        shadow_blur: 15,
        name_color: '#ffde59',
        name_size: 15,
        name_background_enabled: true,
        name_background_color: '#3d1f5c',
        grayscale_muted: false,
        grayscale_deafened: false,
        idle_opacity: 100,
        transition_style: 'fade',
        transition_duration: 200
    },
    blood: {
        bounce_on_speak: true,
        dim_when_idle: true,
        animation_style: 'shake',
        avatar_shape: 'square',
        avatar_size: 175,
        border_enabled: true,
        border_color: '#b71c1c',
        border_width: 4,
        glow_enabled: true,
        glow_color: '#d50000',
        speaking_ring_enabled: true,
        speaking_ring_color: '#ff1744',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#b71c1c',
        shadow_blur: 20,
        name_color: '#ff8a80',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#1a0000',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 50,
        transition_style: 'fade',
        transition_duration: 150
    },
    midnight: {
        bounce_on_speak: false,
        dim_when_idle: true,
        animation_style: 'float',
        avatar_shape: 'circle',
        avatar_size: 180,
        border_enabled: true,
        border_color: '#1a237e',
        border_width: 3,
        glow_enabled: true,
        glow_color: '#3949ab',
        speaking_ring_enabled: true,
        speaking_ring_color: '#5c6bc0',
        speaking_ring_width: 4,
        shadow_enabled: true,
        shadow_color: '#0d1137',
        shadow_blur: 18,
        name_color: '#9fa8da',
        name_size: 13,
        name_background_enabled: true,
        name_background_color: '#0a0d24',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 45,
        transition_style: 'fade',
        transition_duration: 300
    },
    forest: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'wave',
        avatar_shape: 'rounded',
        avatar_size: 175,
        border_enabled: true,
        border_color: '#2e7d32',
        border_width: 4,
        glow_enabled: true,
        glow_color: '#43a047',
        speaking_ring_enabled: true,
        speaking_ring_color: '#66bb6a',
        speaking_ring_width: 4,
        shadow_enabled: true,
        shadow_color: '#1b5e20',
        shadow_blur: 15,
        name_color: '#a5d6a7',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#0d260f',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 85,
        transition_style: 'fade',
        transition_duration: 250
    },
    lavender: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'bounce',
        avatar_shape: 'circle',
        avatar_size: 170,
        border_enabled: true,
        border_color: '#ce93d8',
        border_width: 4,
        glow_enabled: false,
        speaking_ring_enabled: true,
        speaking_ring_color: '#f48fb1',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#ab47bc',
        shadow_blur: 12,
        name_color: '#f3e5f5',
        name_size: 13,
        name_background_enabled: true,
        name_background_color: '#2a1a2e',
        grayscale_muted: false,
        grayscale_deafened: false,
        idle_opacity: 100,
        transition_style: 'fade',
        transition_duration: 200
    },
    ember: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'pulse',
        avatar_shape: 'rounded',
        avatar_size: 185,
        border_enabled: true,
        border_color: '#ff5722',
        border_width: 4,
        glow_enabled: true,
        glow_color: '#ff7043',
        speaking_ring_enabled: true,
        speaking_ring_color: '#ffab91',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#bf360c',
        shadow_blur: 20,
        name_color: '#ffccbc',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#1a0800',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 80,
        transition_style: 'fade',
        transition_duration: 150
    },
    arctic: {
        bounce_on_speak: false,
        dim_when_idle: true,
        animation_style: 'float',
        avatar_shape: 'hexagon',
        avatar_size: 175,
        border_enabled: true,
        border_color: '#e1f5fe',
        border_width: 3,
        glow_enabled: true,
        glow_color: '#b3e5fc',
        speaking_ring_enabled: true,
        speaking_ring_color: '#81d4fa',
        speaking_ring_width: 4,
        shadow_enabled: true,
        shadow_color: '#4fc3f7',
        shadow_blur: 18,
        name_color: '#e1f5fe',
        name_size: 13,
        name_background_enabled: true,
        name_background_color: '#01579b',
        grayscale_muted: false,
        grayscale_deafened: true,
        idle_opacity: 55,
        transition_style: 'blur',
        transition_duration: 300
    },
    shadow: {
        bounce_on_speak: false,
        dim_when_idle: true,
        animation_style: 'none',
        avatar_shape: 'rounded',
        avatar_size: 160,
        border_enabled: true,
        border_color: '#424242',
        border_width: 2,
        glow_enabled: false,
        speaking_ring_enabled: true,
        speaking_ring_color: '#616161',
        speaking_ring_width: 3,
        shadow_enabled: true,
        shadow_color: '#000000',
        shadow_blur: 25,
        name_color: '#9e9e9e',
        name_size: 12,
        name_background_enabled: false,
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 35,
        transition_style: 'fade',
        transition_duration: 200
    },
    rainbow: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'spin',
        avatar_shape: 'circle',
        avatar_size: 190,
        border_enabled: true,
        border_color: '#ff1744',
        border_width: 5,
        glow_enabled: true,
        glow_color: '#f50057',
        speaking_ring_enabled: true,
        speaking_ring_color: '#d500f9',
        speaking_ring_width: 6,
        shadow_enabled: true,
        shadow_color: '#651fff',
        shadow_blur: 25,
        name_color: '#00e5ff',
        name_size: 15,
        name_background_enabled: true,
        name_background_color: '#1a0a2e',
        grayscale_muted: false,
        grayscale_deafened: false,
        idle_opacity: 100,
        transition_style: 'rotate',
        transition_duration: 200
    },
    copper: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'pulse',
        avatar_shape: 'rounded',
        avatar_size: 180,
        border_enabled: true,
        border_color: '#bf8040',
        border_width: 4,
        glow_enabled: true,
        glow_color: '#cd9754',
        speaking_ring_enabled: true,
        speaking_ring_color: '#e6ac69',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#8b5a2b',
        shadow_blur: 18,
        name_color: '#f4d4a5',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#1a1005',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 85,
        transition_style: 'fade',
        transition_duration: 200
    },
    electric: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'jello',
        avatar_shape: 'hexagon',
        avatar_size: 185,
        border_enabled: true,
        border_color: '#2979ff',
        border_width: 3,
        glow_enabled: true,
        glow_color: '#448aff',
        speaking_ring_enabled: true,
        speaking_ring_color: '#82b1ff',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#2962ff',
        shadow_blur: 22,
        name_color: '#82b1ff',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#0a1929',
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 75,
        transition_style: 'flash',
        transition_duration: 100
    },
    phantom: {
        bounce_on_speak: false,
        dim_when_idle: true,
        animation_style: 'float',
        avatar_shape: 'blob',
        avatar_size: 175,
        border_enabled: false,
        glow_enabled: true,
        glow_color: '#b0bec5',
        speaking_ring_enabled: true,
        speaking_ring_color: '#cfd8dc',
        speaking_ring_width: 3,
        shadow_enabled: true,
        shadow_color: '#607d8b',
        shadow_blur: 30,
        name_color: '#eceff1',
        name_size: 13,
        name_background_enabled: false,
        grayscale_muted: true,
        grayscale_deafened: true,
        idle_opacity: 40,
        transition_style: 'blur',
        transition_duration: 350
    },
    vaporwave: {
        bounce_on_speak: true,
        dim_when_idle: false,
        animation_style: 'wave',
        avatar_shape: 'rounded',
        avatar_size: 185,
        border_enabled: true,
        border_color: '#ff71ce',
        border_width: 4,
        glow_enabled: true,
        glow_color: '#01cdfe',
        speaking_ring_enabled: true,
        speaking_ring_color: '#05ffa1',
        speaking_ring_width: 5,
        shadow_enabled: true,
        shadow_color: '#b967ff',
        shadow_blur: 20,
        name_color: '#fffb96',
        name_size: 14,
        name_background_enabled: true,
        name_background_color: '#1a0a2e',
        grayscale_muted: false,
        grayscale_deafened: true,
        idle_opacity: 85,
        transition_style: 'fade',
        transition_duration: 250
    }
};

// Toggle CubReactive on/off
async function toggleCubReactive(enabled) {
    try {
        const res = await fetch('/api/cubreactive/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.success) {
            const statusEl = document.getElementById('enabled-status');
            if (enabled) {
                statusEl.textContent = 'Enabled';
                statusEl.className = 'status-on';
                showToast('CubReactive enabled');
            } else {
                statusEl.textContent = 'Disabled';
                statusEl.className = 'status-off';
                showToast('CubReactive disabled - overlay will stop working', 'error');
            }
        }
    } catch (e) {
        showToast('Failed to update', 'error');
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Copy URL to clipboard
function copyUrl(inputId) {
    const input = document.getElementById(inputId);
    input.select();
    document.execCommand('copy');
    showToast('URL copied to clipboard!');
}

async function regenerateOverlayKey() {
    if (!confirm('This will generate a new key. Your old OBS browser source URLs will stop working — you\'ll need to copy and update them. Continue?')) return;
    try {
        const res = await fetch('/api/cubreactive/regenerate-key', { method: 'POST' });
        const data = await res.json();
        if (!data.success) { showToast('Failed to regenerate key.'); return; }

        const key = data.overlay_key;
        const base = window.location.origin + '/apps/cubreactive/overlay/';

        const indInput = document.getElementById('individual-url');
        const grpInput = document.getElementById('group-url');
        if (indInput) indInput.value = base + USER_ID + '?k=' + key;
        if (grpInput) grpInput.value = base + 'group/' + USER_ID + '?k=' + key;

        showToast('New key generated! Update your OBS browser source URLs.');
    } catch (e) {
        showToast('Error regenerating key.');
    }
}

// Get shape styles (border-radius and clip-path)
function getShapeStyles(shape) {
    const shapes = {
        'circle': { borderRadius: '50%', clipPath: '' },
        'square': { borderRadius: '0', clipPath: '' },
        'rounded': { borderRadius: '12px', clipPath: '' },
        'hexagon': { borderRadius: '0', clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' },
        'diamond': { borderRadius: '0', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
        'octagon': { borderRadius: '0', clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)' },
        'star': { borderRadius: '0', clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' },
        'heart': { borderRadius: '0', clipPath: 'polygon(50% 20%, 55% 12%, 65% 5%, 78% 3%, 90% 10%, 97% 25%, 95% 45%, 80% 65%, 50% 100%, 20% 65%, 5% 45%, 3% 25%, 10% 10%, 22% 3%, 35% 5%, 45% 12%)' },
        'shield': { borderRadius: '0', clipPath: 'polygon(50% 0%, 100% 10%, 100% 60%, 50% 100%, 0% 60%, 0% 10%)' },
        'blob': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%', clipPath: '' }
    };
    return shapes[shape] || shapes['rounded'];
}

// Get animation class name
function getAnimationClass(style) {
    const classes = {
        'bounce': 'anim-bounce',
        'pulse': 'anim-pulse',
        'glow': 'anim-glow',
        'shake': 'anim-shake',
        'wave': 'anim-wave',
        'float': 'anim-float',
        'spin': 'anim-spin',
        'jello': 'anim-jello',
        'heartbeat': 'anim-heartbeat',
        'flash': 'anim-flash',
        'rubberband': 'anim-rubberband',
        'breathe': 'anim-breathe',
        'none': ''
    };
    return classes[style] || '';
}

// Update preview to reflect current settings
function updatePreview() {
    const wrapper = document.getElementById('preview-wrapper');
    const avatar = document.getElementById('preview-avatar');
    const imgWrapper = document.getElementById('preview-img-wrapper');
    const image = document.getElementById('preview-image');
    const username = document.getElementById('preview-username');
    const stateLabel = document.getElementById('preview-state-label');

    if (!wrapper || !avatar || !image) return;

    // Read all settings from form — mirrors the overlay's settings reading
    const shape = getVal('setting-shape', 'rounded');
    const borderEnabled = getVal('setting-border', false);
    const borderColor = getVal('setting-border-color', '#5865f2');
    const borderWidth = getVal('setting-border-width', 3);
    const borderStyle = getVal('setting-border-style', 'solid');
    const glowEnabled = getVal('setting-glow', false);
    const glowColor = getVal('setting-glow-color', '#5865f2');
    const speakingRingEnabled = getVal('setting-speaking-ring', true);
    const speakingRingColor = getVal('setting-speaking-ring-color', '#57f287');
    const speakingRingWidth = getVal('setting-speaking-ring-width', 4);
    const shadowEnabled = getVal('setting-shadow', false);
    const shadowColor = getVal('setting-shadow-color', '#000000');
    const shadowBlur = getVal('setting-shadow-blur', 10);
    const showName = getVal('setting-name', true);
    const nameColor = getVal('setting-name-color', '#ffffff');
    const nameSize = getVal('setting-name-size', 14);
    const nameBgEnabled = getVal('setting-name-bg', false);
    const nameBgColor = getVal('setting-name-bg-color', '#000000');
    const nameShadowEnabled = getVal('setting-name-shadow', false);
    const nameShadowColor = getVal('setting-name-shadow-color', '#000000');
    const nameGlowEnabled = getVal('setting-name-glow', false);
    const nameGlowColor = getVal('setting-name-glow-color', '#5865f2');
    const nameFont = getVal('setting-name-font', 'default');
    const namePosition = getVal('setting-name-position', 'bottom');
    const nameAnimation = getVal('setting-name-animation', 'none');
    const idleOpacity = getVal('setting-idle-opacity', 100);
    const dimWhenIdle = getVal('setting-dim', false);
    const bounceOnSpeak = getVal('setting-bounce', true);
    const animStyle = getVal('setting-animation', 'bounce');
    const animSpeed = getVal('setting-animation-speed', 100);
    const idleAnimStyle = getVal('setting-idle-animation', 'none');
    const flipHorizontal = getVal('setting-flip', false);
    const filterBrightness = getVal('setting-filter-brightness', 100);
    const filterContrast = getVal('setting-filter-contrast', 100);
    const filterSaturate = getVal('setting-filter-saturate', 100);
    const filterHue = getVal('setting-filter-hue', 0);
    const particlesEnabled = getVal('setting-particles', false);
    const particleType = getVal('setting-particle-type', 'sparkles');
    const particleColor = getVal('setting-particle-color', '#ffdd00');
    const particleCount = getVal('setting-particle-count', 15);
    const animBorderEnabled = getVal('setting-animated-border', false);
    const animBorderType = getVal('setting-animated-border-type', 'rainbow');
    const bgEffectEnabled = getVal('setting-bg-effect', false);
    const bgEffectType = getVal('setting-bg-effect-type', 'glow-aura');
    const bgEffectColor = getVal('setting-bg-effect-color', '#5865f2');
    const bgEffectSize = parseInt(getVal('setting-bg-effect-size', 50)) || 30;
    const outlineEnabled = getVal('setting-outline', false);
    const outlineColor = getVal('setting-outline-color', '#ffffff');
    const outlineWidth = getVal('setting-outline-width', 2);
    const outlineOffset = getVal('setting-outline-offset', 3);
    const frame = getVal('setting-frame', 'none');
    const frameColor = getVal('setting-frame-color', '#ffd700');
    const accessory = getVal('setting-accessory', 'none');
    const mirrorEnabled = getVal('setting-mirror', false);
    const mirrorOpacity = getVal('setting-mirror-opacity', 30);
    const mirrorOffset = getVal('setting-mirror-offset', 5);
    const voiceIndicatorEnabled = getVal('setting-voice-indicator', false);
    const voiceIndicatorType = getVal('setting-voice-indicator-type', 'bar');
    const voiceIndicatorColor = getVal('setting-voice-indicator-color', '#57f287');
    const statusTextEnabled = getVal('setting-status-text-enabled', false);
    const statusText = getVal('setting-status-text', '');
    const statusTextColor = getVal('setting-status-text-color', '#888888');
    const speakingHighlight = getVal('setting-speaking-highlight', 'none');

    // Shape styles
    const shapeStyles = getShapeStyles(shape);

    // Avatar size + shape
    avatar.style.width = '180px';
    avatar.style.height = '180px';
    avatar.style.borderRadius = shapeStyles.borderRadius;
    avatar.style.clipPath = shapeStyles.clipPath || 'none';
    avatar.style.overflow = 'visible';

    // img-wrapper: clip image to shape
    if (imgWrapper) {
        imgWrapper.style.width = '100%';
        imgWrapper.style.height = '100%';
        imgWrapper.style.borderRadius = shapeStyles.borderRadius;
        imgWrapper.style.clipPath = shapeStyles.clipPath || 'none';
        imgWrapper.style.overflow = 'hidden';
        imgWrapper.style.zIndex = '5';
    }
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit = 'cover';

    // Border
    avatar.style.border = borderEnabled ? `${borderWidth}px ${borderStyle} ${borderColor}` : '';

    // Box-shadow: speaking ring + glow only (matches overlay)
    const boxShadows = [];
    if (speakingRingEnabled && isSpeaking) boxShadows.push(`0 0 0 ${speakingRingWidth}px ${speakingRingColor}`);
    if (glowEnabled && isSpeaking) boxShadows.push(`0 0 20px ${glowColor}`, `0 0 40px ${glowColor}`);
    avatar.style.boxShadow = boxShadows.join(', ');

    // Drop-shadow filter on avatar for shadow (matches overlay — drop-shadow not box-shadow)
    avatar.style.filter = shadowEnabled ? `drop-shadow(0 4px ${shadowBlur}px ${shadowColor})` : '';

    // Image filters + flip
    image.style.transform = flipHorizontal ? 'scaleX(-1)' : '';
    const filters = [];
    if (filterBrightness !== 100) filters.push(`brightness(${filterBrightness}%)`);
    if (filterContrast !== 100) filters.push(`contrast(${filterContrast}%)`);
    if (filterSaturate !== 100) filters.push(`saturate(${filterSaturate}%)`);
    if (filterHue !== 0) filters.push(`hue-rotate(${filterHue}deg)`);
    image.style.filter = filters.join(' ');

    // Opacity on wrapper (matches overlay — whole wrapper dims, not just avatar)
    wrapper.style.opacity = (!isSpeaking && dimWhenIdle) ? (idleOpacity / 100).toString() : '1';

    // Animation speed on wrapper
    const speedFactor = 100 / animSpeed;
    wrapper.style.animationDuration = (0.5 * speedFactor) + 's';

    // Animation classes on wrapper (matches overlay)
    const allAnimClasses = ['anim-bounce', 'anim-pulse', 'anim-glow', 'anim-shake', 'anim-wave',
                           'anim-float', 'anim-spin', 'anim-jello', 'anim-heartbeat', 'anim-flash',
                           'anim-rubberband', 'anim-breathe'];
    allAnimClasses.forEach(c => { wrapper.classList.remove(c); avatar.classList.remove(c); });
    if (isSpeaking && bounceOnSpeak) {
        const animClass = getAnimationClass(animStyle);
        if (animClass) wrapper.classList.add(animClass);
    } else if (!isSpeaking && idleAnimStyle !== 'none') {
        const idleAnimClass = getAnimationClass(idleAnimStyle);
        if (idleAnimClass) wrapper.classList.add(idleAnimClass);
    }

    // Speaking highlight on wrapper (matches overlay)
    wrapper.classList.remove('highlight-glow', 'highlight-pulse', 'highlight-ring', 'highlight-shadow');
    wrapper.style.setProperty('--speaking-ring-color', speakingRingColor);
    if (speakingHighlight !== 'none' && isSpeaking) {
        wrapper.classList.add(`highlight-${speakingHighlight}`);
    }

    // Image source
    if (isSpeaking) {
        image.src = USER_CONFIG.images?.speaking || USER_AVATAR || '';
    } else {
        image.src = USER_CONFIG.images?.idle || USER_AVATAR || '';
    }

    // State label
    if (stateLabel) {
        stateLabel.textContent = isSpeaking ? 'Speaking' : 'Idle';
        stateLabel.className = isSpeaking ? 'preview-state speaking' : 'preview-state';
    }

    // Username
    const fontMap = {
        'default': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'gaming': '"Orbitron", sans-serif',
        'handwritten': '"Comic Sans MS", cursive',
        'retro': '"Press Start 2P", monospace',
        'monospace': '"Courier New", monospace',
        'elegant': '"Playfair Display", serif',
        'bold': '"Impact", sans-serif',
        'pixel': '"VT323", monospace'
    };
    if (username) {
        if (showName) {
            username.style.display = 'block';
            username.style.color = nameColor;
            username.style.fontSize = nameSize + 'px';
            username.style.fontFamily = fontMap[nameFont] || fontMap['default'];
            username.style.background = nameBgEnabled ? nameBgColor + '80' : '';
            username.style.padding = nameBgEnabled ? '4px 8px' : '';
            username.style.borderRadius = nameBgEnabled ? '4px' : '';
            const textShadows = [];
            if (nameShadowEnabled) textShadows.push(`2px 2px 4px ${nameShadowColor}`);
            if (nameGlowEnabled) textShadows.push(`0 0 10px ${nameGlowColor}`, `0 0 20px ${nameGlowColor}`);
            username.style.textShadow = textShadows.length > 0 ? textShadows.join(', ') : '0 2px 4px rgba(0,0,0,0.5)';
            // Name animation (matches overlay)
            username.classList.remove('name-anim-typing', 'name-anim-bounce', 'name-anim-wave', 'name-anim-glow', 'name-anim-slide');
            if (nameAnimation !== 'none') username.classList.add(`name-anim-${nameAnimation}`);
        } else {
            username.style.display = 'none';
        }
    }

    // Name position on wrapper
    wrapper.classList.remove('name-top', 'name-left', 'name-right', 'name-bottom', 'name-inside-bottom', 'name-inside-top');
    switch (namePosition) {
        case 'top': wrapper.classList.add('name-top'); break;
        case 'left': wrapper.classList.add('name-left'); break;
        case 'right': wrapper.classList.add('name-right'); break;
        case 'inside-bottom': wrapper.classList.add('name-inside-bottom'); break;
        case 'inside-top': wrapper.classList.add('name-inside-top'); break;
        default: wrapper.classList.add('name-bottom');
    }

    // Particles
    const particlesContainer = document.getElementById('preview-particles');
    if (particlesContainer) {
        if (particlesEnabled && isSpeaking) {
            particlesContainer.style.display = 'block';
            particlesContainer.style.clipPath = shapeStyles.clipPath || 'none';
            particlesContainer.style.borderRadius = shapeStyles.borderRadius;
            particlesContainer.style.overflow = 'hidden';
            updatePreviewParticles(particlesContainer, particleType, particleColor, parseInt(particleCount));
        } else {
            particlesContainer.style.display = 'none';
        }
    }

    // Animated border
    const animBorderEl = document.getElementById('preview-anim-border');
    if (animBorderEl) {
        if (animBorderEnabled && isSpeaking) {
            animBorderEl.style.display = 'block';
            animBorderEl.className = `preview-anim-border anim-border-${animBorderType}`;
            animBorderEl.style.top = '-4px';
            animBorderEl.style.right = '-4px';
            animBorderEl.style.bottom = '-4px';
            animBorderEl.style.left = '-4px';
            animBorderEl.style.borderRadius = shapeStyles.borderRadius;
        } else {
            animBorderEl.style.display = 'none';
        }
    }

    // Background effect (position driven by bgEffectSize, matches overlay)
    const bgEffectEl = document.getElementById('preview-bg-effect');
    if (bgEffectEl) {
        if (bgEffectEnabled) {
            bgEffectEl.style.display = 'block';
            bgEffectEl.className = `preview-bg-effect bg-effect-${bgEffectType}`;
            bgEffectEl.style.setProperty('--bg-effect-color', bgEffectColor);
            bgEffectEl.style.top = `-${bgEffectSize}px`;
            bgEffectEl.style.right = `-${bgEffectSize}px`;
            bgEffectEl.style.bottom = `-${bgEffectSize}px`;
            bgEffectEl.style.left = `-${bgEffectSize}px`;
        } else {
            bgEffectEl.style.display = 'none';
        }
    }

    // Outline
    const outlineEl = document.getElementById('preview-outline');
    if (outlineEl) {
        if (outlineEnabled) {
            outlineEl.style.display = 'block';
            outlineEl.style.top = `-${outlineOffset}px`;
            outlineEl.style.right = `-${outlineOffset}px`;
            outlineEl.style.bottom = `-${outlineOffset}px`;
            outlineEl.style.left = `-${outlineOffset}px`;
            outlineEl.style.border = `${outlineWidth}px solid ${outlineColor}`;
            outlineEl.style.borderRadius = shapeStyles.borderRadius;
            outlineEl.style.clipPath = shapeStyles.clipPath || 'none';
        } else {
            outlineEl.style.display = 'none';
        }
    }

    // Frame
    const frameEl = document.getElementById('preview-frame');
    if (frameEl) {
        if (frame !== 'none') {
            frameEl.style.display = 'block';
            frameEl.className = `preview-frame avatar-frame-${frame}`;
            frameEl.style.setProperty('--frame-color', frameColor);
            frameEl.style.top = '-8px';
            frameEl.style.right = '-8px';
            frameEl.style.bottom = '-8px';
            frameEl.style.left = '-8px';
            frameEl.style.borderRadius = shapeStyles.borderRadius;
            frameEl.style.clipPath = shapeStyles.clipPath || 'none';
        } else {
            frameEl.style.display = 'none';
        }
    }

    // Accessory
    const accessoryEl = document.getElementById('preview-accessory');
    if (accessoryEl) {
        if (accessory !== 'none') {
            accessoryEl.style.display = 'block';
            accessoryEl.className = `preview-accessory avatar-accessory-${accessory}`;
            accessoryEl.innerHTML = getAccessoryHtml(accessory);
        } else {
            accessoryEl.style.display = 'none';
        }
    }

    // Mirror
    const mirrorEl = document.getElementById('preview-mirror');
    if (mirrorEl) {
        if (mirrorEnabled) {
            mirrorEl.style.display = 'block';
            mirrorEl.style.backgroundImage = `url(${image.src})`;
            mirrorEl.style.opacity = mirrorOpacity / 100;
            mirrorEl.style.borderRadius = shapeStyles.borderRadius;
            mirrorEl.style.clipPath = shapeStyles.clipPath || 'none';
            mirrorEl.style.marginTop = `${mirrorOffset}px`;
        } else {
            mirrorEl.style.display = 'none';
        }
    }

    // Voice indicator
    const voiceIndicatorEl = document.getElementById('preview-voice-indicator');
    if (voiceIndicatorEl) {
        if (voiceIndicatorEnabled && isSpeaking) {
            voiceIndicatorEl.style.display = 'flex';
            voiceIndicatorEl.style.setProperty('--voice-indicator-color', voiceIndicatorColor);
            updatePreviewVoiceIndicator(voiceIndicatorEl, voiceIndicatorType);
        } else {
            voiceIndicatorEl.style.display = 'none';
        }
    }

    // Status text
    const statusTextEl = document.getElementById('preview-status-text');
    if (statusTextEl) {
        if (statusTextEnabled && statusText) {
            statusTextEl.style.display = 'block';
            statusTextEl.textContent = statusText;
            statusTextEl.style.color = statusTextColor;
        } else {
            statusTextEl.style.display = 'none';
        }
    }
}

// Helper function to update preview particles
function updatePreviewParticles(container, type, color, count) {
    // Regenerate if count or type changed
    if (container.childElementCount !== count || container.dataset.lastType !== type) {
        container.innerHTML = '';
        container.dataset.lastType = type;

        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = `particle particle-${type}`;
            particle.style.setProperty('--particle-color', color);
            // Random horizontal position
            particle.style.left = `${Math.random() * 100}%`;
            // Start particles at the bottom (0-20% from bottom)
            particle.style.bottom = `${Math.random() * 20}%`;
            // Use negative delay to spread particles across their animation cycle
            const duration = 2 + Math.random() * 2;
            particle.style.animationDelay = `${-Math.random() * duration}s`;
            particle.style.animationDuration = `${duration}s`;
            // Random size variation
            const scale = 0.6 + Math.random() * 0.8;
            particle.style.setProperty('--scale', scale);
            container.appendChild(particle);
        }
    }
}

// Helper function to update preview voice indicator
function updatePreviewVoiceIndicator(container, style) {
    const currentType = container.dataset.lastType;
    if (currentType === style) return;

    container.dataset.lastType = style;
    container.innerHTML = '';

    if (style === 'bar') {
        for (let i = 0; i < 5; i++) {
            const bar = document.createElement('div');
            bar.className = 'voice-bar';
            bar.style.animationDelay = `${i * 0.1}s`;
            container.appendChild(bar);
        }
    } else if (style === 'dots') {
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'voice-dot';
            dot.style.animationDelay = `${i * 0.15}s`;
            container.appendChild(dot);
        }
    } else if (style === 'wave') {
        for (let i = 0; i < 3; i++) {
            const wave = document.createElement('div');
            wave.className = 'voice-wave';
            wave.style.animationDelay = `${i * 0.2}s`;
            container.appendChild(wave);
        }
    } else if (style === 'ring') {
        container.innerHTML = '<div class="voice-ring"></div>';
    }
}

// Helper function to get accessory HTML
function getAccessoryHtml(accessory) {
    const accessories = {
        'crown': '<svg viewBox="0 0 24 24" fill="#ffd700" width="40" height="30"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg>',
        'halo': '<div class="accessory-halo"></div>',
        'horns': '<svg viewBox="0 0 24 24" fill="#cc0000" width="50" height="25"><path d="M4 12L2 2L7 8L12 2L17 8L22 2L20 12H4Z"/></svg>',
        'cat-ears': '<div class="accessory-cat-ears"><span></span><span></span></div>',
        'headphones': '<svg viewBox="0 0 24 24" fill="#333" width="60" height="30"><path d="M12 1C7 1 3 5 3 10V17C3 18.66 4.34 20 6 20H9V12H5V10C5 6.13 8.13 3 12 3S19 6.13 19 10V12H15V20H18C19.66 20 21 18.66 21 17V10C21 5 17 1 12 1Z"/></svg>',
        'santa-hat': '<svg viewBox="0 0 24 24" fill="#e74c3c" width="45" height="35"><path d="M12 2C10 2 8.5 3.5 8.5 5.5C8.5 6.5 9 7.4 9.7 8H5L3 18H21L19 8H14.3C15 7.4 15.5 6.5 15.5 5.5C15.5 3.5 14 2 12 2Z"/><circle cx="12" cy="5" r="2" fill="white"/></svg>',
        'party-hat': '<svg viewBox="0 0 24 24" width="35" height="35"><path d="M12 2L4 22H20L12 2Z" fill="#9b59b6"/><circle cx="8" cy="16" r="1.5" fill="#ff6b6b"/><circle cx="12" cy="12" r="1.5" fill="#4ecdc4"/><circle cx="16" cy="16" r="1.5" fill="#ffe66d"/></svg>'
    };
    return accessories[accessory] || '';
}

// Toggle preview speaking state
function togglePreviewSpeaking() {
    isSpeaking = !isSpeaking;
    updatePreview();
}

// Upload image for a state
async function uploadImage(state, file) {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('state', state);

    showToast('Uploading and resizing...', 'info');

    try {
        const response = await fetch('/api/cubreactive/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showToast(`${state} image uploaded successfully!`);

            const preview = document.getElementById(`preview-${state}`);
            const cacheBust = '?t=' + Date.now();
            preview.innerHTML = `<img src="${data.image_url}${cacheBust}" alt="${state}">`;

            if (!USER_CONFIG.images) USER_CONFIG.images = {};
            USER_CONFIG.images[state] = data.image_url;

            const card = document.querySelector(`.image-upload-card[data-state="${state}"]`);
            const deleteBtn = card.querySelector('.btn-delete');
            deleteBtn.disabled = false;

            const badge = card.querySelector('.default-badge');
            if (badge) badge.remove();

            updateMainPreview();
        } else {
            showToast(data.error || 'Upload failed', 'error');
        }
    } catch (error) {
        showToast('Upload failed: ' + error.message, 'error');
    }
}

// Delete image for a state
async function deleteImage(state) {
    try {
        const response = await fetch('/api/cubreactive/delete-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`${state} image removed`);

            const preview = document.getElementById(`preview-${state}`);
            if (USER_AVATAR) {
                preview.innerHTML = `<img src="${USER_AVATAR}" alt="${state} (Default)" class="default-avatar">`;
            }

            if (USER_CONFIG.images) {
                USER_CONFIG.images[state] = null;
            }

            const card = document.querySelector(`.image-upload-card[data-state="${state}"]`);
            const deleteBtn = card.querySelector('.btn-delete');
            deleteBtn.disabled = true;

            const info = card.querySelector('.image-info');
            if (!info.querySelector('.default-badge')) {
                const badge = document.createElement('span');
                badge.className = 'default-badge';
                badge.textContent = 'Using Discord Avatar';
                info.appendChild(badge);
            }

            updateMainPreview();
        } else {
            showToast(data.error || 'Delete failed', 'error');
        }
    } catch (error) {
        showToast('Delete failed: ' + error.message, 'error');
    }
}

// Update main preview image
function updateMainPreview() {
    updatePreview();
}

// Get value from element with fallback
function getVal(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range' || el.type === 'number') return parseInt(el.value) || fallback;
    return el.value || fallback;
}

// Set value on element
function setVal(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') {
        el.checked = value;
        // Trigger change event for toggle options
        el.dispatchEvent(new Event('change'));
    } else {
        el.value = value;
        // Update slider display if present
        const valueDisplay = document.getElementById(id.replace('setting-', '') + '-value');
        if (valueDisplay) {
            const suffix = id.includes('opacity') ? '%' : (id.includes('duration') ? 'ms' : 'px');
            valueDisplay.textContent = value + (id.includes('max-participants') ? '' : suffix);
        }
    }
}

// Apply a preset theme
function applyTheme(themeName) {
    const theme = THEMES[themeName];
    if (!theme) return;

    // Apply all theme settings to form elements
    setVal('setting-bounce', theme.bounce_on_speak);
    setVal('setting-dim', theme.dim_when_idle);
    setVal('setting-grayscale-muted', theme.grayscale_muted);
    setVal('setting-grayscale-deafened', theme.grayscale_deafened);

    // Animation style
    document.querySelectorAll('.style-btn[data-style]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.style === theme.animation_style);
    });
    setVal('setting-animation', theme.animation_style);

    // Shape
    document.querySelectorAll('.shape-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.shape === theme.avatar_shape);
    });
    setVal('setting-shape', theme.avatar_shape);

    setVal('setting-border', theme.border_enabled);
    if (theme.border_color) setVal('setting-border-color', theme.border_color);
    if (theme.border_width) setVal('setting-border-width', theme.border_width);

    setVal('setting-glow', theme.glow_enabled);
    if (theme.glow_color) setVal('setting-glow-color', theme.glow_color);

    setVal('setting-speaking-ring', theme.speaking_ring_enabled);
    if (theme.speaking_ring_color) setVal('setting-speaking-ring-color', theme.speaking_ring_color);
    if (theme.speaking_ring_width) setVal('setting-speaking-ring-width', theme.speaking_ring_width);

    setVal('setting-shadow', theme.shadow_enabled);
    if (theme.shadow_color) setVal('setting-shadow-color', theme.shadow_color);
    if (theme.shadow_blur) setVal('setting-shadow-blur', theme.shadow_blur);

    setVal('setting-name-color', theme.name_color);
    setVal('setting-name-size', theme.name_size);
    setVal('setting-name-bg', theme.name_background_enabled);
    if (theme.name_background_color) setVal('setting-name-bg-color', theme.name_background_color);

    setVal('setting-idle-opacity', theme.idle_opacity);

    // Transition style
    document.querySelectorAll('.style-btn[data-transition]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.transition === theme.transition_style);
    });
    setVal('setting-transition', theme.transition_style);
    setVal('setting-transition-duration', theme.transition_duration);

    // Update preview with new theme settings
    updatePreview();

    showToast(`Applied ${themeName} theme! Click Save to keep changes.`, 'success');
}

// Save settings
async function saveSettings() {
    const overlayBgTransparent = getVal('setting-overlay-bg-transparent', true);

    const settings = {
        // Basic settings
        bounce_on_speak: getVal('setting-bounce', true),
        dim_when_idle: getVal('setting-dim', false),
        show_name: getVal('setting-name', true),
        grayscale_muted: getVal('setting-grayscale-muted', true),
        grayscale_deafened: getVal('setting-grayscale-deafened', true),
        animation_style: getVal('setting-animation', 'bounce'),
        animation_speed: getVal('setting-animation-speed', 100),
        idle_animation_style: getVal('setting-idle-animation', 'none'),
        avatar_shape: getVal('setting-shape', 'rounded'),
        border_enabled: getVal('setting-border', false),
        border_color: getVal('setting-border-color', '#5865f2'),
        border_width: getVal('setting-border-width', 3),
        border_style: getVal('setting-border-style', 'solid'),
        glow_enabled: getVal('setting-glow', false),
        glow_color: getVal('setting-glow-color', '#5865f2'),
        name_color: getVal('setting-name-color', '#ffffff'),
        name_size: getVal('setting-name-size', 14),
        name_shadow_enabled: getVal('setting-name-shadow', false),
        name_shadow_color: getVal('setting-name-shadow-color', '#000000'),
        name_glow_enabled: getVal('setting-name-glow', false),
        name_glow_color: getVal('setting-name-glow-color', '#5865f2'),
        overlay_position: getVal('setting-position', 'bottom'),
        spacing: getVal('setting-spacing', 20),
        speaking_ring_enabled: getVal('setting-speaking-ring', true),
        speaking_ring_color: getVal('setting-speaking-ring-color', '#57f287'),
        speaking_ring_width: getVal('setting-speaking-ring-width', 4),
        shadow_enabled: getVal('setting-shadow', false),
        shadow_color: getVal('setting-shadow-color', '#000000'),
        shadow_blur: getVal('setting-shadow-blur', 10),
        transition_style: getVal('setting-transition', 'fade'),
        transition_duration: getVal('setting-transition-duration', 200),
        entry_animation: getVal('setting-entry-animation', 'fade'),
        entry_duration: getVal('setting-entry-duration', 500),
        show_status_icons: getVal('setting-status-icons', true),
        name_background_enabled: getVal('setting-name-bg', false),
        name_background_color: getVal('setting-name-bg-color', '#000000') + '80',
        overlay_background: overlayBgTransparent ? 'transparent' : getVal('setting-overlay-bg', '#000000'),
        idle_opacity: getVal('setting-idle-opacity', 100),
        flip_horizontal: getVal('setting-flip', false),
        hide_self: getVal('setting-hide-self', false),
        max_participants: getVal('setting-max-participants', 0),
        member_filter_mode: getVal('setting-member-filter-mode', 'none'),
        member_filter_list: getMemberFilterList(),
        filter_brightness: getVal('setting-filter-brightness', 100),
        filter_contrast: getVal('setting-filter-contrast', 100),
        filter_saturate: getVal('setting-filter-saturate', 100),
        filter_hue: getVal('setting-filter-hue', 0),

        // Particle effects
        particles_enabled: getVal('setting-particles', false),
        particle_type: getVal('setting-particle-type', 'sparkles'),
        particle_color: getVal('setting-particle-color', '#ffdd00'),
        particle_count: getVal('setting-particle-count', 15),

        // Animated border
        animated_border_enabled: getVal('setting-animated-border', false),
        animated_border_type: getVal('setting-animated-border-type', 'rainbow'),
        animated_border_speed: getVal('setting-animated-border-speed', 5),

        // Background effects
        bg_effect_enabled: getVal('setting-bg-effect', false),
        bg_effect_type: getVal('setting-bg-effect-type', 'glow-aura'),
        bg_effect_color: getVal('setting-bg-effect-color', '#5865f2'),
        bg_effect_size: getVal('setting-bg-effect-size', 50),

        // Outline
        outline_enabled: getVal('setting-outline', false),
        outline_color: getVal('setting-outline-color', '#ffffff'),
        outline_width: getVal('setting-outline-width', 2),
        outline_offset: getVal('setting-outline-offset', 3),

        // Accessories
        accessory: getVal('setting-accessory', 'none'),
        frame: getVal('setting-frame', 'none'),
        frame_color: getVal('setting-frame-color', '#ffd700'),

        // Mirror/reflection
        mirror_enabled: getVal('setting-mirror', false),
        mirror_opacity: getVal('setting-mirror-opacity', 30),
        mirror_offset: getVal('setting-mirror-offset', 5),

        // Tilt
        tilt_enabled: getVal('setting-tilt', false),
        tilt_amount: getVal('setting-tilt-amount', 5),

        // Voice indicator
        voice_indicator_enabled: getVal('setting-voice-indicator', false),
        voice_indicator_type: getVal('setting-voice-indicator-type', 'bar'),
        voice_indicator_color: getVal('setting-voice-indicator-color', '#57f287'),

        // Username styling
        name_font: getVal('setting-name-font', 'default'),
        name_position: getVal('setting-name-position', 'bottom'),
        name_animation: getVal('setting-name-animation', 'none'),

        // Status text
        status_text_enabled: getVal('setting-status-text-enabled', false),
        status_text: getVal('setting-status-text', ''),
        status_text_color: getVal('setting-status-text-color', '#888888'),

        // Group mode
        group_layout: getVal('setting-group-layout', 'horizontal'),
        speaking_highlight: getVal('setting-speaking-highlight', 'none'),
        sort_order: getVal('setting-sort-order', 'join-order'),

        // Custom CSS
        custom_css: getVal('setting-custom-css', ''),

        theme: 'custom'
    };

    try {
        const response = await fetch('/api/cubreactive/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Settings saved!');
            USER_CONFIG.settings = settings;

            const avatar = document.getElementById('preview-avatar');
            if (avatar) {
                if (settings.dim_when_idle && !isSpeaking) {
                    avatar.classList.add('dimmed');
                } else {
                    avatar.classList.remove('dimmed');
                }
            }
        } else {
            showToast(data.error || 'Save failed', 'error');
        }
    } catch (error) {
        showToast('Save failed: ' + error.message, 'error');
    }
}

// Initialize button groups
function initButtonGroup(selector, hiddenInputId, dataAttr) {
    const buttons = document.querySelectorAll(selector);
    const hiddenInput = document.getElementById(hiddenInputId);

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (hiddenInput) {
                hiddenInput.value = btn.dataset[dataAttr];
            }
        });
    });
}

// Initialize slider with value display
function initSlider(sliderId, valueId, suffix = 'px') {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueId);

    if (slider && valueDisplay) {
        slider.addEventListener('input', () => {
            valueDisplay.textContent = slider.value + suffix;
        });
    }
}

// Initialize toggle that shows/hides options
function initToggleOptions(toggleId, optionsId) {
    const toggle = document.getElementById(toggleId);
    const options = document.getElementById(optionsId);

    if (toggle && options) {
        toggle.addEventListener('change', () => {
            options.style.display = toggle.checked ? 'block' : 'none';
        });
    }
}

// Initialize button group with preview update
function initButtonGroupWithPreview(selector, hiddenInputId, dataAttr) {
    const buttons = document.querySelectorAll(selector);
    const hiddenInput = document.getElementById(hiddenInputId);

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (hiddenInput) {
                hiddenInput.value = btn.dataset[dataAttr];
            }
            updatePreview();
        });
    });
}

// Initialize slider with preview update
function initSliderWithPreview(sliderId, valueId, suffix = 'px') {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueId);

    if (slider && valueDisplay) {
        slider.addEventListener('input', () => {
            valueDisplay.textContent = slider.value + suffix;
            updatePreview();
        });
    }
}

// Initialize toggle with preview update
function initToggleWithPreview(toggleId) {
    const toggle = document.getElementById(toggleId);
    if (toggle) {
        toggle.addEventListener('change', () => {
            updatePreview();
        });
    }
}

// Initialize color picker with preview update
function initColorWithPreview(colorId) {
    const color = document.getElementById(colorId);
    if (color) {
        color.addEventListener('input', () => {
            updatePreview();
        });
    }
}

// Initialize tab navigation
function initTabNavigation() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    if (tabBtns.length === 0) return;

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Remove active from all buttons and contents
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active to clicked button and corresponding content
            btn.classList.add('active');
            const tabContent = document.getElementById(`tab-${tabId}`);
            if (tabContent) {
                tabContent.classList.add('active');
            }

            // Update preview when switching tabs
            updatePreview();
        });
    });
}

// Initialize settings search
function initSettingsSearch() {
    const searchInput = document.getElementById('settings-search');
    const clearBtn = document.getElementById('search-clear');
    if (!searchInput) return;

    let previousActiveTab = 'images';

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        const allSettingsGroups = document.querySelectorAll('.settings-group');
        const allTabContents = document.querySelectorAll('.tab-content');
        const dashboardSection = document.querySelector('.dashboard-section');

        clearBtn.style.display = query ? 'block' : 'none';

        if (!query) {
            // Reset to normal view
            dashboardSection?.classList.remove('search-active');

            // Hide all tabs first
            allTabContents.forEach(tab => {
                tab.classList.remove('active');
                tab.style.display = '';
            });

            // Reset all settings groups
            allSettingsGroups.forEach(group => {
                group.classList.remove('search-match', 'search-hidden');
                group.style.display = '';
            });

            // Activate the previously active tab
            const activeBtn = document.querySelector('.tab-btn.active');
            if (activeBtn) {
                const tabId = activeBtn.dataset.tab;
                const tabContent = document.getElementById(`tab-${tabId}`);
                if (tabContent) tabContent.classList.add('active');
            } else {
                // Default to first tab
                document.getElementById('tab-images')?.classList.add('active');
            }
            return;
        }

        // Remember current active tab
        const currentActiveBtn = document.querySelector('.tab-btn.active');
        if (currentActiveBtn) {
            previousActiveTab = currentActiveBtn.dataset.tab;
        }

        // Search mode - show all tabs
        dashboardSection?.classList.add('search-active');
        allTabContents.forEach(tab => {
            tab.classList.add('active');
            tab.style.display = 'block';
        });

        // Filter settings groups
        let matchCount = 0;
        allSettingsGroups.forEach(group => {
            const groupText = group.textContent.toLowerCase();

            // Check if query matches any text in the group
            if (groupText.includes(query)) {
                group.classList.add('search-match');
                group.classList.remove('search-hidden');
                group.style.display = '';
                matchCount++;
            } else {
                group.classList.remove('search-match');
                group.classList.add('search-hidden');
                group.style.display = 'none';
            }
        });
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        searchInput.focus();
    });

    // Also handle Escape key to clear search
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
            searchInput.blur();
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Initialize tab navigation
    initTabNavigation();

    // Initialize settings search
    initSettingsSearch();

    // Set up file upload listeners
    ['speaking', 'idle', 'muted', 'deafened'].forEach(state => {
        const input = document.getElementById(`upload-${state}`);
        if (input) {
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    uploadImage(state, e.target.files[0]);
                }
            });
        }
    });

    // Initialize button groups with preview update
    initButtonGroupWithPreview('.position-btn', 'setting-position', 'position');
    initButtonGroupWithPreview('.style-btn[data-style]', 'setting-animation', 'style');
    initButtonGroupWithPreview('.style-btn[data-idle-style]', 'setting-idle-animation', 'idleStyle');
    initButtonGroupWithPreview('.style-btn[data-transition]', 'setting-transition', 'transition');
    initButtonGroupWithPreview('.style-btn[data-entry]', 'setting-entry-animation', 'entry');
    initButtonGroupWithPreview('.style-btn[data-border-style]', 'setting-border-style', 'borderStyle');
    initButtonGroupWithPreview('.shape-btn', 'setting-shape', 'shape');

    // Initialize sliders with preview update
    initSliderWithPreview('setting-border-width', 'border-width-value');
    initSliderWithPreview('setting-name-size', 'name-size-value');
    initSliderWithPreview('setting-spacing', 'spacing-value');
    initSliderWithPreview('setting-speaking-ring-width', 'speaking-ring-width-value');
    initSliderWithPreview('setting-shadow-blur', 'shadow-blur-value');
    initSliderWithPreview('setting-transition-duration', 'transition-duration-value', 'ms');
    initSliderWithPreview('setting-idle-opacity', 'idle-opacity-value', '%');
    initSliderWithPreview('setting-max-participants', 'max-participants-value', '');
    initSliderWithPreview('setting-animation-speed', 'animation-speed-value', '%');
    initSliderWithPreview('setting-entry-duration', 'entry-duration-value', 'ms');
    initSliderWithPreview('setting-filter-brightness', 'filter-brightness-value', '%');
    initSliderWithPreview('setting-filter-contrast', 'filter-contrast-value', '%');
    initSliderWithPreview('setting-filter-saturate', 'filter-saturate-value', '%');
    initSliderWithPreview('setting-filter-hue', 'filter-hue-value', '°');

    // Initialize toggle options (show/hide sub-options)
    initToggleOptions('setting-border', 'border-options');
    initToggleOptions('setting-glow', 'glow-options');
    initToggleOptions('setting-shadow', 'shadow-options');
    initToggleOptions('setting-speaking-ring', 'speaking-ring-options');
    initToggleOptions('setting-name-bg', 'name-bg-options');
    initToggleOptions('setting-name-shadow', 'name-shadow-options');
    initToggleOptions('setting-name-glow', 'name-glow-options');

    // Initialize toggles with preview update
    initToggleWithPreview('setting-bounce');
    initToggleWithPreview('setting-dim');
    initToggleWithPreview('setting-name');
    initToggleWithPreview('setting-grayscale-muted');
    initToggleWithPreview('setting-grayscale-deafened');
    initToggleWithPreview('setting-border');
    initToggleWithPreview('setting-glow');
    initToggleWithPreview('setting-shadow');
    initToggleWithPreview('setting-speaking-ring');
    initToggleWithPreview('setting-name-bg');
    initToggleWithPreview('setting-flip');
    initToggleWithPreview('setting-hide-self');
    initToggleWithPreview('setting-name-shadow');
    initToggleWithPreview('setting-name-glow');

    // Initialize color pickers with preview update
    initColorWithPreview('setting-border-color');
    initColorWithPreview('setting-glow-color');
    initColorWithPreview('setting-name-color');
    initColorWithPreview('setting-speaking-ring-color');
    initColorWithPreview('setting-shadow-color');
    initColorWithPreview('setting-name-bg-color');
    initColorWithPreview('setting-name-shadow-color');
    initColorWithPreview('setting-name-glow-color');

    // === NEW FEATURE INITIALIZATIONS ===

    // New button groups
    initButtonGroupWithPreview('.style-btn[data-particle]', 'setting-particle-type', 'particle');
    initButtonGroupWithPreview('.style-btn[data-anim-border]', 'setting-animated-border-type', 'animBorder');
    initButtonGroupWithPreview('.style-btn[data-bg-effect]', 'setting-bg-effect-type', 'bgEffect');
    initButtonGroupWithPreview('.style-btn[data-accessory]', 'setting-accessory', 'accessory');
    initButtonGroupWithPreview('.style-btn[data-frame]', 'setting-frame', 'frame');
    initButtonGroupWithPreview('.style-btn[data-voice-indicator]', 'setting-voice-indicator-type', 'voiceIndicator');
    initButtonGroupWithPreview('.style-btn[data-font]', 'setting-name-font', 'font');
    initButtonGroupWithPreview('.style-btn[data-name-pos]', 'setting-name-position', 'namePos');
    initButtonGroupWithPreview('.style-btn[data-name-anim]', 'setting-name-animation', 'nameAnim');
    initButtonGroupWithPreview('.style-btn[data-layout]', 'setting-group-layout', 'layout');
    initButtonGroupWithPreview('.style-btn[data-highlight]', 'setting-speaking-highlight', 'highlight');
    initButtonGroupWithPreview('.style-btn[data-sort]', 'setting-sort-order', 'sort');

    // New toggle options (show/hide sub-options)
    initToggleOptions('setting-particles', 'particles-options');
    initToggleOptions('setting-animated-border', 'animated-border-options');
    initToggleOptions('setting-bg-effect', 'bg-effect-options');
    initToggleOptions('setting-outline', 'outline-options');
    initToggleOptions('setting-mirror', 'mirror-options');
    initToggleOptions('setting-tilt', 'tilt-options');
    initToggleOptions('setting-voice-indicator', 'voice-indicator-options');
    initToggleOptions('setting-status-text-enabled', 'status-text-options');

    // New toggles with preview update
    initToggleWithPreview('setting-particles');
    initToggleWithPreview('setting-animated-border');
    initToggleWithPreview('setting-bg-effect');
    initToggleWithPreview('setting-outline');
    initToggleWithPreview('setting-mirror');
    initToggleWithPreview('setting-tilt');
    initToggleWithPreview('setting-voice-indicator');
    initToggleWithPreview('setting-status-text-enabled');

    // New sliders with preview update
    initSliderWithPreview('setting-particle-count', 'particle-count-value', '');
    initSliderWithPreview('setting-animated-border-speed', 'animated-border-speed-value', '');
    initSliderWithPreview('setting-bg-effect-size', 'bg-effect-size-value', 'px');
    initSliderWithPreview('setting-outline-width', 'outline-width-value', 'px');
    initSliderWithPreview('setting-outline-offset', 'outline-offset-value', 'px');
    initSliderWithPreview('setting-mirror-opacity', 'mirror-opacity-value', '%');
    initSliderWithPreview('setting-mirror-offset', 'mirror-offset-value', 'px');
    initSliderWithPreview('setting-tilt-amount', 'tilt-amount-value', '°');

    // New color pickers with preview update
    initColorWithPreview('setting-particle-color');
    // Note: animated border uses rainbow or gradient, no single color option
    initColorWithPreview('setting-bg-effect-color');
    initColorWithPreview('setting-outline-color');
    initColorWithPreview('setting-frame-color');
    initColorWithPreview('setting-voice-indicator-color');
    initColorWithPreview('setting-status-text-color');

    // Status text input
    const statusTextInput = document.getElementById('setting-status-text');
    if (statusTextInput) {
        statusTextInput.addEventListener('input', updatePreview);
    }

    // Custom CSS textarea
    const customCssInput = document.getElementById('setting-custom-css');
    if (customCssInput) {
        customCssInput.addEventListener('input', updatePreview);
    }

    // Member Filter (Whitelist/Blacklist) initialization
    initMemberFilter();

    // Initial preview update
    updatePreview();
});

// ============ VOICE CHANNEL MEMBERS (WebSocket) ============

let voiceWs = null;
let voiceMembers = new Map();

function initVoiceConnection() {
    // Get user ID from body data attribute or global constant
    const userId = document.body.dataset.userId || (typeof USER_ID !== 'undefined' ? USER_ID : null);
    if (!userId) {
        console.log('[CubReactive] No user ID available for voice connection');
        return;
    }

    // Use the WS_URL from template, or fallback to direct port
    const wsUrl = (typeof WS_URL !== 'undefined' && WS_URL)
        ? WS_URL
        : (window.location.protocol === 'https:'
            ? `wss://${window.location.hostname}:3848`
            : `ws://${window.location.hostname}:3848`);

    console.log('[CubReactive] Connecting to WebSocket:', wsUrl);

    try {
        voiceWs = new WebSocket(wsUrl);
    } catch (e) {
        console.log('[CubReactive] Voice WebSocket not available:', e);
        updateVoiceConnectionStatus('disconnected');
        return;
    }

    voiceWs.onopen = () => {
        console.log('Voice WebSocket connected');
        updateVoiceConnectionStatus('connected');
        voiceWs.send(JSON.stringify({
            type: 'SUBSCRIBE',
            userId: userId,
            mode: 'channel',
            key: USER_CONFIG?.overlay_key || null
        }));
    };

    voiceWs.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleVoiceMessage(data);
        } catch (e) {
            console.error('Voice message parse error:', e);
        }
    };

    voiceWs.onclose = () => {
        console.log('Voice WebSocket closed');
        updateVoiceConnectionStatus('disconnected');
        // Reconnect after 5 seconds
        setTimeout(initVoiceConnection, 5000);
    };

    voiceWs.onerror = () => {
        updateVoiceConnectionStatus('disconnected');
    };
}

function handleVoiceMessage(data) {
    switch (data.type) {
        case 'VOICE_STATE_UPDATE':
            if (data.data.left) {
                voiceMembers.delete(data.userId);
            } else {
                voiceMembers.set(data.userId, {
                    id: data.userId,
                    username: data.data.username || 'Unknown',
                    avatar: data.data.avatar || '',
                    speaking: data.data.speaking || false,
                    muted: data.data.muted || false,
                    deafened: data.data.deafened || false
                });
            }
            renderVoiceMembers();
            break;

        case 'CHANNEL_UPDATE':
            voiceMembers.clear();
            if (data.members) {
                data.members.forEach(member => {
                    voiceMembers.set(member.userId, {
                        id: member.userId,
                        username: member.username || 'Unknown',
                        avatar: member.avatar || '',
                        speaking: member.speaking || false,
                        muted: member.muted || false,
                        deafened: member.deafened || false
                    });
                });
            }
            renderVoiceMembers();
            break;

        case 'NOT_IN_VOICE':
            voiceMembers.clear();
            renderVoiceMembers();
            break;
    }
}

function updateVoiceConnectionStatus(status) {
    const statusEl = document.getElementById('voice-connection-status');
    const loadingEl = document.getElementById('individual-sources-loading');
    const emptyEl = document.getElementById('individual-sources-empty');
    const badgeEl = document.getElementById('individual-sources-badge');

    if (statusEl) {
        if (status === 'connected') {
            statusEl.innerHTML = '<span class="dot connected"></span> Connected';
            statusEl.className = 'voice-connection-status connected';
        } else if (status === 'connecting') {
            statusEl.innerHTML = '<span class="dot connecting"></span> Connecting...';
            statusEl.className = 'voice-connection-status connecting';
        } else {
            statusEl.innerHTML = '<span class="dot"></span> Disconnected';
            statusEl.className = 'voice-connection-status disconnected';
        }
    }

    // Update individual sources section
    if (status === 'connected') {
        if (loadingEl) loadingEl.style.display = 'none';
        // Will be updated by renderIndividualSources when members arrive
    } else if (status === 'disconnected') {
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        if (badgeEl) {
            badgeEl.textContent = 'Disconnected';
            badgeEl.className = 'source-badge disconnected';
        }
    }
}

function renderVoiceMembers() {
    const container = document.getElementById('voice-members-list');

    // Also render individual sources section
    renderIndividualSources();

    if (!container) return;

    const filterList = getMemberFilterList();
    const currentMode = document.getElementById('setting-member-filter-mode')?.value || 'none';

    if (voiceMembers.size === 0) {
        container.innerHTML = `
            <div class="voice-member-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span>Join a voice channel to see members here</span>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    voiceMembers.forEach(member => {
        const isInList = filterList.includes(member.id);
        const card = document.createElement('div');
        card.className = 'voice-member-card' + (isInList ? ' in-list' : '');

        // Determine which list they're in
        let listStatus = '';
        if (isInList && currentMode === 'whitelist') {
            listStatus = '<span class="member-list-badge whitelist">Whitelisted</span>';
        } else if (isInList && currentMode === 'blacklist') {
            listStatus = '<span class="member-list-badge blacklist">Blacklisted</span>';
        } else if (isInList) {
            listStatus = '<span class="member-list-badge">In List</span>';
        }

        card.innerHTML = `
            <img src="${member.avatar || '/static/images/default-avatar.png'}" alt="">
            <div class="voice-member-info">
                <span class="voice-member-name">${escapeHtml(member.username)}</span>
                <span class="voice-member-id">${member.id}</span>
                ${listStatus}
            </div>
            <div class="voice-member-status">
                ${member.speaking ? '<svg class="speaking" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>' : ''}
                ${member.muted ? '<svg class="muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/></svg>' : ''}
                ${member.deafened ? '<svg class="deafened" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' : ''}
            </div>
            <div class="voice-member-actions">
                <button type="button" class="btn-whitelist" title="Add to Whitelist" ${isInList && currentMode === 'whitelist' ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                </button>
                <button type="button" class="btn-blacklist" title="Add to Blacklist" ${isInList && currentMode === 'blacklist' ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                    </svg>
                </button>
                <button type="button" class="btn-remove" title="Remove from List" ${!isInList ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `;

        // Add event listeners for buttons
        const whitelistBtn = card.querySelector('.btn-whitelist');
        const blacklistBtn = card.querySelector('.btn-blacklist');
        const removeBtn = card.querySelector('.btn-remove');

        whitelistBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToWhitelist(member.id);
        });

        blacklistBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToBlacklist(member.id);
        });

        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeMemberId(member.id);
            renderVoiceMembers();
        });

        container.appendChild(card);
    });
}

// Add member to whitelist
function addToWhitelist(id) {
    // Set mode to whitelist
    const modeInput = document.getElementById('setting-member-filter-mode');
    if (modeInput) {
        modeInput.value = 'whitelist';
        // Update button states
        document.querySelectorAll('[data-filter-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filterMode === 'whitelist');
        });
        // Show member list container
        const container = document.getElementById('member-list-container');
        if (container) container.style.display = '';
        // Update labels
        updateMemberFilterLabels('whitelist');
    }

    // Add to list if not already there
    const list = getMemberFilterList();
    if (!list.includes(id)) {
        list.push(id);
        setMemberFilterList(list);
    }

    renderMemberIdTags();
    renderVoiceMembers();
    updatePreview();
    showToast('Added to whitelist');
}

// Add member to blacklist
function addToBlacklist(id) {
    // Set mode to blacklist
    const modeInput = document.getElementById('setting-member-filter-mode');
    if (modeInput) {
        modeInput.value = 'blacklist';
        // Update button states
        document.querySelectorAll('[data-filter-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filterMode === 'blacklist');
        });
        // Show member list container
        const container = document.getElementById('member-list-container');
        if (container) container.style.display = '';
        // Update labels
        updateMemberFilterLabels('blacklist');
    }

    // Add to list if not already there
    const list = getMemberFilterList();
    if (!list.includes(id)) {
        list.push(id);
        setMemberFilterList(list);
    }

    renderMemberIdTags();
    renderVoiceMembers();
    updatePreview();
    showToast('Added to blacklist');
}

// Update member filter labels based on mode
function updateMemberFilterLabels(mode) {
    const label = document.getElementById('member-list-label');
    const hint = document.getElementById('member-list-hint');
    if (label) {
        label.textContent = mode === 'blacklist' ? 'Hidden Members (Blacklist)' : 'Allowed Members (Whitelist)';
    }
    if (hint) {
        hint.textContent = mode === 'blacklist' ? 'These members will be hidden from your overlay' : 'Only these members will appear in your overlay';
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Render individual sources section (Overlay tab)
function renderIndividualSources() {
    const loadingEl = document.getElementById('individual-sources-loading');
    const emptyEl = document.getElementById('individual-sources-empty');
    const listEl = document.getElementById('individual-sources-list');
    const badgeEl = document.getElementById('individual-sources-badge');

    if (!listEl) return;

    // Hide loading
    if (loadingEl) loadingEl.style.display = 'none';

    if (voiceMembers.size === 0) {
        // Show empty state
        if (emptyEl) emptyEl.style.display = 'flex';
        if (listEl) listEl.style.display = 'none';
        if (badgeEl) {
            badgeEl.textContent = 'Not in voice';
            badgeEl.className = 'source-badge';
        }
        return;
    }

    // Show list
    if (emptyEl) emptyEl.style.display = 'none';
    if (listEl) listEl.style.display = 'flex';
    if (badgeEl) {
        badgeEl.textContent = `${voiceMembers.size} member${voiceMembers.size !== 1 ? 's' : ''}`;
        badgeEl.className = 'source-badge connected';
    }

    // Build the member list
    const baseUrl = window.location.origin;
    listEl.innerHTML = '';

    voiceMembers.forEach(member => {
        const memberEl = document.createElement('div');
        memberEl.className = 'voice-member';
        memberEl.innerHTML = `
            <img src="${member.avatar || '/static/images/default-avatar.png'}" alt="" class="member-avatar">
            <div class="member-info">
                <span class="member-name">${escapeHtml(member.username)}</span>
                <span class="member-id">${member.id}</span>
            </div>
            <button type="button" class="btn-copy-url" data-url="${baseUrl}/apps/cubreactive/overlay/${member.id}${member.id === USER_ID && USER_CONFIG && USER_CONFIG.overlay_key ? '?k=' + USER_CONFIG.overlay_key : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy URL
            </button>
        `;

        // Add click handler for copy button
        const copyBtn = memberEl.querySelector('.btn-copy-url');
        copyBtn.addEventListener('click', async () => {
            const url = copyBtn.dataset.url;
            try {
                await navigator.clipboard.writeText(url);
                copyBtn.classList.add('copied');
                copyBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Copied!
                `;
                showToast('URL copied to clipboard!');
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy URL
                    `;
                }, 2000);
            } catch (e) {
                // Fallback for older browsers
                const input = document.createElement('input');
                input.value = url;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                showToast('URL copied to clipboard!');
            }
        });

        listEl.appendChild(memberEl);
    });
}

// Initialize voice connection when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Only init if we're on the logged-in dashboard
    if (document.getElementById('voice-members-list') || document.getElementById('individual-sources-list')) {
        setTimeout(initVoiceConnection, 1000);
    }
});

// ============ MEMBER FILTER FUNCTIONS ============

// Get member filter list from hidden input
function getMemberFilterList() {
    const input = document.getElementById('setting-member-filter-list');
    if (!input || !input.value) return [];
    return input.value.split(',').filter(id => id.trim() !== '');
}

// Set member filter list to hidden input
function setMemberFilterList(list) {
    const input = document.getElementById('setting-member-filter-list');
    if (input) {
        input.value = list.join(',');
    }
}

// Render member ID tags
function renderMemberIdTags() {
    const container = document.getElementById('member-ids-list');
    if (!container) return;

    const list = getMemberFilterList();
    const mode = document.getElementById('setting-member-filter-mode')?.value || 'none';
    const isBlacklist = mode === 'blacklist';

    container.innerHTML = '';
    list.forEach(id => {
        const tag = document.createElement('span');
        tag.className = 'member-id-tag' + (isBlacklist ? ' blacklist' : '');
        tag.innerHTML = `${id}<button type="button" onclick="removeMemberId('${id}')" title="Remove">&times;</button>`;
        container.appendChild(tag);
    });
}

// Add member ID to list
function addMemberId(id) {
    if (!id || !/^\d+$/.test(id)) {
        alert('Please enter a valid Discord User ID (numbers only)');
        return;
    }

    const list = getMemberFilterList();
    if (list.includes(id)) {
        alert('This User ID is already in the list');
        return;
    }

    list.push(id);
    setMemberFilterList(list);
    renderMemberIdTags();
    updatePreview();
}

// Remove member ID from list
function removeMemberId(id) {
    let list = getMemberFilterList();
    list = list.filter(i => i !== id);
    setMemberFilterList(list);
    renderMemberIdTags();
    updatePreview();
}

// Initialize member filter UI
function initMemberFilter() {
    // Filter mode buttons
    document.querySelectorAll('.style-btn[data-filter-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.style-btn[data-filter-mode]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const mode = btn.dataset.filterMode;
            const hiddenInput = document.getElementById('setting-member-filter-mode');
            if (hiddenInput) hiddenInput.value = mode;

            const container = document.getElementById('member-list-container');
            const label = document.getElementById('member-list-label');
            const hint = document.getElementById('member-list-hint');

            if (container) {
                container.style.display = mode === 'none' ? 'none' : 'block';
            }

            if (label) {
                label.textContent = mode === 'blacklist' ? 'Hidden Members (User IDs)' : 'Allowed Members (User IDs)';
            }

            if (hint) {
                hint.textContent = mode === 'blacklist'
                    ? 'These members will be hidden from the overlay'
                    : 'Only these members will appear in the overlay';
            }

            // Update tag colors
            renderMemberIdTags();
            updatePreview();
        });
    });

    // Add member button
    const addBtn = document.getElementById('add-member-btn');
    const input = document.getElementById('member-id-input');

    if (addBtn && input) {
        addBtn.addEventListener('click', () => {
            addMemberId(input.value.trim());
            input.value = '';
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addMemberId(input.value.trim());
                input.value = '';
            }
        });
    }

    // Initial render of existing member IDs
    renderMemberIdTags();
}

// Download standalone overlay HTML file
async function downloadOverlay(mode = 'individual') {
    showToast('Generating overlay file...', 'info');

    try {
        // Fetch the overlay JavaScript
        const overlayJsResponse = await fetch('/static/js/cubreactive-overlay.js');
        const overlayJs = await overlayJsResponse.text();

        // Fetch the overlay CSS
        const overlayCssResponse = await fetch('/static/css/cubreactive-overlay.css');
        const overlayCss = await overlayCssResponse.text();

        // Get current config
        const config = USER_CONFIG || {};
        const settings = config.settings || {};
        const images = config.images || {};

        // Convert image URLs to absolute URLs
        const baseUrl = window.location.origin;
        const absoluteImages = {};
        for (const [key, value] of Object.entries(images)) {
            if (value) {
                absoluteImages[key] = value.startsWith('http') ? value : baseUrl + value;
            }
        }

        // Generate the standalone HTML
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CubReactive Overlay</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: transparent;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        ${overlayCss}
    </style>
</head>
<body>
    <div id="status-overlay" class="status-overlay"></div>
    <div id="overlay-container" class="overlay-container"></div>

    <script>
        // Configuration
        const MODE = '${mode}';
        const TARGET_USER_ID = '${USER_ID}';
        const API_BASE = '${baseUrl}';
        const DISCORD_CLIENT_ID = '794365445557846066';
        const USER_CONFIG = ${JSON.stringify({
            images: absoluteImages,
            settings: settings
        })};

        ${overlayJs}
    </script>
</body>
</html>`;

        // Create and download the file
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cubreactive-${mode}-${USER_ID}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Overlay downloaded! Add it as a local file in OBS.', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showToast('Failed to generate overlay: ' + error.message, 'error');
    }
}

// Export settings to JSON file
function exportSettings() {
    const config = USER_CONFIG || {};
    const exportData = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        settings: config.settings || {},
        // Don't export images (they're user-specific)
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cubreactive-settings-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Settings exported successfully!', 'success');
}

// Import settings from JSON file
function importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.settings) {
                showToast('Invalid settings file', 'error');
                return;
            }

            // Apply imported settings to the form
            applySettingsToForm(data.settings);
            showToast('Settings imported! Click Save to apply.', 'success');
            updatePreview();
        } catch (error) {
            console.error('Import error:', error);
            showToast('Failed to import settings: ' + error.message, 'error');
        }
    };

    input.click();
}

// Apply settings object to form elements
function applySettingsToForm(settings) {
    // Helper to set slider value
    const setSlider = (id, value, valueId, suffix = 'px') => {
        const slider = document.getElementById(id);
        const display = document.getElementById(valueId);
        if (slider && value !== undefined) {
            slider.value = value;
            if (display) display.textContent = value + suffix;
        }
    };

    // Helper to set checkbox
    const setCheckbox = (id, value) => {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.checked = !!value;
    };

    // Helper to set color
    const setColor = (id, value) => {
        const input = document.getElementById(id);
        if (input && value) input.value = value;
    };

    // Helper to set button group — also updates the hidden input so saveSettings() reads correctly
    const setButtonGroup = (selector, value, dataAttr, hiddenInputId) => {
        if (value === undefined || value === null) return;
        const buttons = document.querySelectorAll(selector);
        buttons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset[dataAttr] === String(value)) {
                btn.classList.add('active');
            }
        });
        if (hiddenInputId) {
            const input = document.getElementById(hiddenInputId);
            if (input) input.value = value;
        }
    };

    // Apply sliders (all keys match the snake_case server format)
    setSlider('setting-border-width', settings.border_width, 'border-width-value');
    setSlider('setting-name-size', settings.name_size, 'name-size-value');
    setSlider('setting-spacing', settings.spacing, 'spacing-value');
    setSlider('setting-speaking-ring-width', settings.speaking_ring_width, 'speaking-ring-width-value');
    setSlider('setting-shadow-blur', settings.shadow_blur, 'shadow-blur-value');
    setSlider('setting-transition-duration', settings.transition_duration, 'transition-duration-value', 'ms');
    setSlider('setting-idle-opacity', settings.idle_opacity, 'idle-opacity-value', '%');
    setSlider('setting-animation-speed', settings.animation_speed, 'animation-speed-value', '%');
    setSlider('setting-entry-duration', settings.entry_duration, 'entry-duration-value', 'ms');
    setSlider('setting-filter-brightness', settings.filter_brightness, 'filter-brightness-value', '%');
    setSlider('setting-filter-contrast', settings.filter_contrast, 'filter-contrast-value', '%');
    setSlider('setting-filter-saturate', settings.filter_saturate, 'filter-saturate-value', '%');
    setSlider('setting-filter-hue', settings.filter_hue, 'filter-hue-value', '°');
    setSlider('setting-particle-count', settings.particle_count, 'particle-count-value', '');
    setSlider('setting-animated-border-speed', settings.animated_border_speed, 'animated-border-speed-value', '');
    setSlider('setting-bg-effect-size', settings.bg_effect_size, 'bg-effect-size-value', 'px');
    setSlider('setting-max-participants', settings.max_participants, 'max-participants-value', '');
    setSlider('setting-outline-width', settings.outline_width, 'outline-width-value', 'px');
    setSlider('setting-outline-offset', settings.outline_offset, 'outline-offset-value', 'px');
    setSlider('setting-mirror-opacity', settings.mirror_opacity, 'mirror-opacity-value', '%');
    setSlider('setting-mirror-offset', settings.mirror_offset, 'mirror-offset-value', 'px');
    setSlider('setting-tilt-amount', settings.tilt_amount, 'tilt-amount-value', '°');

    // Apply checkboxes
    setCheckbox('setting-bounce', settings.bounce_on_speak);
    setCheckbox('setting-dim', settings.dim_when_idle);
    setCheckbox('setting-name', settings.show_name);
    setCheckbox('setting-grayscale-muted', settings.grayscale_muted);
    setCheckbox('setting-grayscale-deafened', settings.grayscale_deafened);
    setCheckbox('setting-border', settings.border_enabled);
    setCheckbox('setting-glow', settings.glow_enabled);
    setCheckbox('setting-shadow', settings.shadow_enabled);
    setCheckbox('setting-speaking-ring', settings.speaking_ring_enabled);
    setCheckbox('setting-name-bg', settings.name_background_enabled);
    setCheckbox('setting-flip', settings.flip_horizontal);
    setCheckbox('setting-hide-self', settings.hide_self);
    setCheckbox('setting-name-shadow', settings.name_shadow_enabled);
    setCheckbox('setting-name-glow', settings.name_glow_enabled);
    setCheckbox('setting-particles', settings.particles_enabled);
    setCheckbox('setting-animated-border', settings.animated_border_enabled);
    setCheckbox('setting-bg-effect', settings.bg_effect_enabled);
    setCheckbox('setting-outline', settings.outline_enabled);
    setCheckbox('setting-mirror', settings.mirror_enabled);
    setCheckbox('setting-tilt', settings.tilt_enabled);
    setCheckbox('setting-voice-indicator', settings.voice_indicator_enabled);
    setCheckbox('setting-status-text-enabled', settings.status_text_enabled);

    // Apply colors
    setColor('setting-border-color', settings.border_color);
    setColor('setting-glow-color', settings.glow_color);
    setColor('setting-name-color', settings.name_color);
    setColor('setting-speaking-ring-color', settings.speaking_ring_color);
    setColor('setting-shadow-color', settings.shadow_color);
    setColor('setting-name-bg-color', settings.name_background_color);
    setColor('setting-name-shadow-color', settings.name_shadow_color);
    setColor('setting-name-glow-color', settings.name_glow_color);
    setColor('setting-particle-color', settings.particle_color);
    setColor('setting-bg-effect-color', settings.bg_effect_color);
    setColor('setting-outline-color', settings.outline_color);
    setColor('setting-frame-color', settings.frame_color);
    setColor('setting-voice-indicator-color', settings.voice_indicator_color);
    setColor('setting-status-text-color', settings.status_text_color);

    // Overlay background
    if (settings.overlay_background !== undefined) {
        const isTransparent = !settings.overlay_background || settings.overlay_background === 'transparent';
        setCheckbox('setting-overlay-bg-transparent', isTransparent);
        if (!isTransparent) setColor('setting-overlay-bg', settings.overlay_background);
    }

    // Apply button groups (pass hiddenInputId so the value is committed for saveSettings)
    setButtonGroup('.position-btn', settings.overlay_position, 'position', 'setting-position');
    setButtonGroup('.style-btn[data-style]', settings.animation_style, 'style', 'setting-animation');
    setButtonGroup('.style-btn[data-idle-style]', settings.idle_animation_style, 'idleStyle', 'setting-idle-animation');
    setButtonGroup('.style-btn[data-transition]', settings.transition_style, 'transition', 'setting-transition');
    setButtonGroup('.style-btn[data-entry]', settings.entry_animation, 'entry', 'setting-entry-animation');
    setButtonGroup('.style-btn[data-border-style]', settings.border_style, 'borderStyle', 'setting-border-style');
    setButtonGroup('.shape-btn', settings.avatar_shape, 'shape', 'setting-shape');
    setButtonGroup('.style-btn[data-particle]', settings.particle_type, 'particle', 'setting-particle-type');
    setButtonGroup('.style-btn[data-anim-border]', settings.animated_border_type, 'animBorder', 'setting-animated-border-type');
    setButtonGroup('.style-btn[data-bg-effect]', settings.bg_effect_type, 'bgEffect', 'setting-bg-effect-type');
    setButtonGroup('.style-btn[data-accessory]', settings.accessory, 'accessory', 'setting-accessory');
    setButtonGroup('.style-btn[data-frame]', settings.frame, 'frame', 'setting-frame');
    setButtonGroup('.style-btn[data-voice-indicator]', settings.voice_indicator_type, 'voiceIndicator', 'setting-voice-indicator-type');
    setButtonGroup('.style-btn[data-font]', settings.name_font, 'font', 'setting-name-font');
    setButtonGroup('.style-btn[data-name-pos]', settings.name_position, 'namePos', 'setting-name-position');
    setButtonGroup('.style-btn[data-name-anim]', settings.name_animation, 'nameAnim', 'setting-name-animation');
    setButtonGroup('.style-btn[data-layout]', settings.group_layout, 'layout', 'setting-group-layout');
    setButtonGroup('.style-btn[data-highlight]', settings.speaking_highlight, 'highlight', 'setting-speaking-highlight');
    setButtonGroup('.style-btn[data-sort]', settings.sort_order, 'sort', 'setting-sort-order');

    // Apply text inputs
    const statusTextInput = document.getElementById('setting-status-text');
    if (statusTextInput && settings.status_text) {
        statusTextInput.value = settings.status_text;
    }

    const customCssInput = document.getElementById('setting-custom-css');
    if (customCssInput && settings.custom_css) {
        customCssInput.value = settings.custom_css;
    }

    // Update toggle options visibility
    ['border', 'glow', 'shadow', 'speaking-ring', 'name-bg', 'name-shadow', 'name-glow',
     'particles', 'animated-border', 'bg-effect', 'outline', 'mirror', 'tilt', 'voice-indicator'].forEach(opt => {
        const toggle = document.getElementById(`setting-${opt}`);
        const options = document.getElementById(`${opt}-options`);
        if (toggle && options) {
            options.style.display = toggle.checked ? 'block' : 'none';
        }
    });
    // status-text has a mismatched ID: div is 'status-text-options', not 'status-text-enabled-options'
    const sttToggle = document.getElementById('setting-status-text-enabled');
    const sttOptions = document.getElementById('status-text-options');
    if (sttToggle && sttOptions) sttOptions.style.display = sttToggle.checked ? 'block' : 'none';
}

// Generate a share code (base64 encoded settings)
function generateShareCode() {
    const config = USER_CONFIG || {};
    const settings = config.settings || {};

    // Create a compact version of settings
    const compactSettings = JSON.stringify(settings);
    const shareCode = btoa(compactSettings);

    // Copy to clipboard
    navigator.clipboard.writeText(shareCode).then(() => {
        showToast('Share code copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback: show in prompt
        prompt('Copy this share code:', shareCode);
    });
}

// Copy the share code to clipboard
function copyShareCode() {
    generateShareCode();
}

// Apply a share code
function applyShareCode() {
    const shareCodeInput = document.getElementById('share-code-input');
    const shareCode = shareCodeInput ? shareCodeInput.value.trim() : prompt('Paste share code:');

    if (!shareCode) {
        showToast('No share code provided', 'error');
        return;
    }

    try {
        const decoded = atob(shareCode);
        const settings = JSON.parse(decoded);

        applySettingsToForm(settings);
        showToast('Settings applied from share code! Click Save to keep.', 'success');
        updatePreview();
    } catch (error) {
        console.error('Share code error:', error);
        showToast('Invalid share code', 'error');
    }
}

// ── Debug Tools ────────────────────────────────────────────────────────────────

async function testSpeaking() {
    const out = document.getElementById('debug-output');
    out.style.display = 'block';
    out.textContent = 'Sending test speaking event…';
    try {
        const res = await fetch('/api/cubreactive/test-speaking', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (data.error) {
            out.textContent = 'Error: ' + data.error;
            showToast('Test failed: ' + data.error, 'error');
        } else {
            out.textContent = `Test sent to ${data.overlays} overlay connection(s).\nYour OBS overlay should show the speaking image for ~2 seconds.\nIf it did NOT react, the overlay is not connected — check the OBS browser source URL.`;
            showToast('Test speaking event sent!', 'success');
        }
    } catch (e) {
        out.textContent = 'Request failed: ' + e.message;
        showToast('Request failed', 'error');
    }
}

async function loadDebugStatus() {
    const out = document.getElementById('debug-output');
    out.style.display = 'block';
    out.textContent = 'Loading bot status…';
    try {
        const res = await fetch('/api/cubreactive/debug-status');
        const data = await res.json();
        if (data.error) {
            out.textContent = 'Error: ' + data.error;
        } else {
            const lines = [
                `WebSocket clients connected: ${data.wsClients}`,
                '',
                'Voice connections (bot in channel):',
                data.voiceConnections.length ? data.voiceConnections.map(c => `  ${c.channelId}: ${c.status}`).join('\n') : '  (none)',
                '',
                'Audio subscriptions (speaking detection active for):',
                data.subscriptions.length ? data.subscriptions.map(s => `  channel ${s.channelId}: [${s.users.join(', ')}]`).join('\n') : '  (none)',
                '',
                'Voice states (users bot knows about):',
                data.voiceStates.length ? data.voiceStates.map(s => `  ${s.username} (${s.userId}) — speaking:${s.speaking} muted:${s.muted} deaf:${s.deafened}`).join('\n') : '  (none — bot may not know you\'re in voice yet)',
                '',
                'Overlay connections (overlays subscribed per user):',
                data.overlayConnections.length ? data.overlayConnections.map(o => `  ${o.userId}: ${o.count} open connection(s)`).join('\n') : '  (none)',
                '',
                'Overlay channels (channels bot joined for overlays):',
                data.overlayChannels.length ? data.overlayChannels.map(c => `  channel ${c.channelId}: [${c.users.join(', ')}]`).join('\n') : '  (none)',
            ];
            out.textContent = lines.join('\n');
        }
    } catch (e) {
        out.textContent = 'Request failed: ' + e.message;
    }
}
