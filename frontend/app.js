// CONSTANTS
const SOUNDS = [
  { id: 'chime', name: 'Soft Chime', icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>` },
  { id: 'marimba', name: 'Marimba', icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>` },
  { id: 'morning', name: 'Morning Bell', icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>` },
];

const TAB_LABELS = {
  pomodoro: 'Diqqatni bir joyga jamlash vaqti!',
  shortBreak: 'Qisqa tanaffus vaqti',
  longBreak: 'Uzun tanaffus vaqti',
};

// SETTINGS
let settings = {
  pomodoroTime: 25,
  shortBreakTime: 5,
  longBreakTime: 15,
  alarmSound: 'chime',
  volume: 70,
};

// STATE
let state = {
  currentTab: 'pomodoro',
  timeLeft: 25 * 60,
  totalTime: 25 * 60,
  isRunning: false,
  sessionsCompleted: 0,
  totalFocusTime: 0,
  pomTarget: 4,
  pomTempTarget: 4,
  tasks: [],
};
let timerInterval = null;
let currentUser = null;

// NATIVE MOBILE HAPTICS & SCREEN WAKE LOCK
function triggerHaptic(type = 'light') {
  try {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
      const haptic = window.Telegram.WebApp.HapticFeedback;
      if (type === 'selection') {
        haptic.selectionChanged();
      } else if (['success', 'warning', 'error'].includes(type)) {
        haptic.notificationOccurred(type);
      } else {
        haptic.impactOccurred(type === 'medium' ? 'medium' : 'light');
      }
      return;
    }
    if ('vibrate' in navigator) {
      if (type === 'light') navigator.vibrate(10);
      else if (type === 'medium') navigator.vibrate(25);
      else if (type === 'success') navigator.vibrate([30, 50, 30]);
    }
  } catch (e) {}
}

let wakeLock = null;

function syncTelegramSafeAreaInsets() {
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    const hasInitData = Boolean(tg.initData && tg.initData.trim().length > 0);
    const isTelegramPlatform = Boolean(tg.platform && tg.platform !== 'unknown');
    const isMiniApp = hasInitData || isTelegramPlatform;

    if (isMiniApp) {
      document.documentElement.classList.add('is-telegram-miniapp');
      document.documentElement.classList.add('in-telegram-webapp');
      if (tg.isFullscreen) {
        document.documentElement.classList.add('tg-fullscreen');
      } else {
        document.documentElement.classList.remove('tg-fullscreen');
      }

      try {
        const safeArea = tg.safeAreaInset || {};
        const contentSafeArea = tg.contentSafeAreaInset || {};

        if (typeof safeArea.top === 'number' && safeArea.top > 0) document.documentElement.style.setProperty('--tg-safe-area-inset-top', `${safeArea.top}px`);
        if (typeof safeArea.bottom === 'number' && safeArea.bottom > 0) document.documentElement.style.setProperty('--tg-safe-area-inset-bottom', `${safeArea.bottom}px`);
        if (typeof safeArea.left === 'number' && safeArea.left > 0) document.documentElement.style.setProperty('--tg-safe-area-inset-left', `${safeArea.left}px`);
        if (typeof safeArea.right === 'number' && safeArea.right > 0) document.documentElement.style.setProperty('--tg-safe-area-inset-right', `${safeArea.right}px`);

        if (typeof contentSafeArea.top === 'number' && contentSafeArea.top > 0) document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', `${contentSafeArea.top}px`);
        if (typeof contentSafeArea.bottom === 'number' && contentSafeArea.bottom > 0) document.documentElement.style.setProperty('--tg-content-safe-area-inset-bottom', `${contentSafeArea.bottom}px`);
        if (typeof contentSafeArea.left === 'number' && contentSafeArea.left > 0) document.documentElement.style.setProperty('--tg-content-safe-area-inset-left', `${contentSafeArea.left}px`);
        if (typeof contentSafeArea.right === 'number' && contentSafeArea.right > 0) document.documentElement.style.setProperty('--tg-content-safe-area-inset-right', `${contentSafeArea.right}px`);
      } catch (e) {
        console.warn('Error syncing Telegram Safe Area Insets:', e);
      }
    } else {
      document.documentElement.classList.remove('is-telegram-miniapp');
      document.documentElement.classList.remove('in-telegram-webapp');
      document.documentElement.classList.remove('tg-fullscreen');
    }
  }
}

if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
  const tg = window.Telegram.WebApp;
  try {
    tg.ready();
    tg.expand();

    if (typeof tg.disableVerticalSwipes === 'function') {
      tg.disableVerticalSwipes();
    }
    if (typeof tg.enableClosingConfirmation === 'function') {
      tg.enableClosingConfirmation();
    }

    if (typeof tg.requestFullscreen === 'function') {
      tg.requestFullscreen();
    }
  } catch (e) {
    console.warn('Telegram requestFullscreen warning:', e);
  }

  syncTelegramSafeAreaInsets();
  initTelegramBackButton();
  if (typeof tg.onEvent === 'function') {
    tg.onEvent('safeAreaChanged', syncTelegramSafeAreaInsets);
    tg.onEvent('contentSafeAreaChanged', syncTelegramSafeAreaInsets);
    tg.onEvent('viewportChanged', syncTelegramSafeAreaInsets);
    tg.onEvent('fullscreenChanged', syncTelegramSafeAreaInsets);
    tg.onEvent('fullscreenFailed', (err) => console.warn('Telegram fullscreenFailed:', err));
  }
}

function updateTelegramBackButton() {
  if (typeof window === 'undefined' || !window.Telegram || !window.Telegram.WebApp) return;
  const tg = window.Telegram.WebApp;
  if (!tg.BackButton) return;

  const hasOpenModal = Boolean(document.querySelector('.modal-overlay.open'));
  const isProfileMenuOpen = Boolean(document.getElementById('profileMenu')?.classList.contains('open'));
  const isTimerFullscreen = Boolean(document.querySelector('.timer-card.is-fullscreen'));
  const currentView = typeof parseViewFromHash === 'function'
    ? parseViewFromHash(window.location.hash)
    : (localStorage.getItem('pomodo_active_view') || 'focus');
  const isSubView = currentView !== 'focus';

  if (hasOpenModal || isProfileMenuOpen || isTimerFullscreen || isSubView) {
    try {
      tg.BackButton.show();
    } catch (e) {
      console.warn('Telegram BackButton show warning:', e);
    }
  } else {
    try {
      tg.BackButton.hide();
    } catch (e) {
      console.warn('Telegram BackButton hide warning:', e);
    }
  }
}

function handleTelegramBackClick() {
  if (typeof triggerHaptic === 'function') {
    triggerHaptic('light');
  }

  const openModals = document.querySelectorAll('.modal-overlay.open');
  if (openModals.length > 0) {
    const topModal = openModals[openModals.length - 1];
    if (topModal && topModal.id && typeof closeModal === 'function') {
      closeModal(topModal.id);
      setTimeout(updateTelegramBackButton, 250);
      return;
    }
  }

  const profileMenu = document.getElementById('profileMenu');
  if (profileMenu && profileMenu.classList.contains('open')) {
    if (typeof toggleProfileMenu === 'function') {
      toggleProfileMenu(false);
    } else {
      profileMenu.classList.remove('open');
    }
    updateTelegramBackButton();
    return;
  }

  const timerCard = document.querySelector('.timer-card.is-fullscreen');
  if (timerCard) {
    if (typeof toggleTimerFullscreen === 'function') {
      toggleTimerFullscreen();
    } else {
      timerCard.classList.remove('is-fullscreen');
      document.body.classList.remove('timer-fullscreen-active');
    }
    updateTelegramBackButton();
    return;
  }

  const currentView = typeof parseViewFromHash === 'function'
    ? parseViewFromHash(window.location.hash)
    : (localStorage.getItem('pomodo_active_view') || 'focus');
  if (currentView !== 'focus') {
    if (typeof switchView === 'function') {
      switchView('focus');
    }
    window.location.hash = '#focus';
    updateTelegramBackButton();
    return;
  }

  updateTelegramBackButton();
}

function initTelegramBackButton() {
  if (typeof window === 'undefined' || !window.Telegram || !window.Telegram.WebApp) return;
  const tg = window.Telegram.WebApp;
  if (!tg.BackButton) return;

  try {
    tg.BackButton.offClick(handleTelegramBackClick);
  } catch (e) {}

  try {
    tg.BackButton.onClick(handleTelegramBackClick);
  } catch (e) {
    console.warn('Telegram BackButton onClick warning:', e);
  }

  updateTelegramBackButton();
}

window.updateTelegramBackButton = updateTelegramBackButton;
window.handleTelegramBackClick = handleTelegramBackClick;
window.initTelegramBackButton = initTelegramBackButton;

function requestTelegramFullscreen() {
  try {
    if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.requestFullscreen === 'function') {
      window.Telegram.WebApp.requestFullscreen();
    }
  } catch (e) {
    console.warn('requestTelegramFullscreen error:', e);
  }
}

function exitTelegramFullscreen() {
  try {
    if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.exitFullscreen === 'function') {
      window.Telegram.WebApp.exitFullscreen();
    }
  } catch (e) {
    console.warn('exitTelegramFullscreen error:', e);
  }
}

window.requestTelegramFullscreen = requestTelegramFullscreen;
window.exitTelegramFullscreen = exitTelegramFullscreen;

function updateTelegramClosingConfirmation(enable) {
  try {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      if (enable) {
        if (typeof tg.enableClosingConfirmation === 'function') {
          tg.enableClosingConfirmation();
        }
      } else {
        if (typeof tg.disableClosingConfirmation === 'function') {
          tg.disableClosingConfirmation();
        }
      }
    }
  } catch (err) {
    console.warn('Telegram closing confirmation toggle error:', err);
  }
}

async function requestWakeLock() {
  updateTelegramClosingConfirmation(true);
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    }
  } catch (err) {
    console.warn('Screen Wake Lock skipped/unsupported:', err);
  }
}

async function releaseWakeLock() {
  updateTelegramClosingConfirmation(false);
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (err) {
    console.warn('Screen Wake Lock release skipped:', err);
  }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.isRunning) {
    await requestWakeLock();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (typeof state !== 'undefined' && state && state.isRunning) {
    e.preventDefault();
    e.returnValue = 'Taymer ishlamoqda. Sahifadan chiqmoqchimisiz?';
    return e.returnValue;
  }
});

// AUDIO CONTEXT
let audioCtx = null;
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// PREMIUM BUTTON CLICK SOUNDS
function playStartSound() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(432, t);
    osc.frequency.exponentialRampToValueAtTime(864, t + 0.12);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.25);
  } catch (e) { }
}

function playResetSound() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.2);
  } catch (e) { }
}

function playClockTickSound() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2200, t);
    osc1.frequency.exponentialRampToValueAtTime(1100, t + 0.015);

    gain1.gain.setValueAtTime(0.01, t);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.015);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1000, t);
    osc2.frequency.exponentialRampToValueAtTime(500, t + 0.012);

    gain2.gain.setValueAtTime(0.006, t);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t);
    osc2.stop(t + 0.012);
  } catch (e) { }
}

function playClick() {
  playStartSound();
}

// ACOUSTIC ZEN & MODERN ALARM SOUNDS
function playAlarm(soundId, vol) {
  const ctx = getCtx();
  const v = ((vol !== undefined ? vol : settings.volume) / 100) * 0.8;
  try {
    triggerVisualEffect(soundId);
    ({
      chime: () => {
        // Soft Glass Crystal Chime (Cascading C6 - E6 - G6 - C7 Major 7th)
        [1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => {
          const t = ctx.currentTime + (i * 0.09);
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = f;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(v * 0.35, t + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0005, t + 3.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t); osc.stop(t + 3.6);
        });
      },
      marimba: () => {
        // Warm Wood Marimba Pluck (C4, G4, C5, E5 with Lowpass Filter)
        [261.63, 392.0, 523.25, 659.25].forEach((f, i) => {
          const t = ctx.currentTime + (i * 0.12);
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = f;
          filter.type = 'lowpass';
          filter.frequency.value = 1200;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(v * 0.7, t + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0005, t + 1.8);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t); osc.stop(t + 1.9);
        });
      },
      morning: () => {
        // Gentle Sunrise Chime Sequence (F5, Ab5, Bb5, Eb6)
        [698.46, 830.61, 932.33, 1244.51].forEach((f, i) => {
          const t = ctx.currentTime + (i * 0.16);
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = f;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(v * 0.4, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0005, t + 2.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t); osc.stop(t + 2.6);
        });
      },
    }[soundId] || (() => { }))();
  } catch (e) { console.error(e); }
}

function triggerVisualEffect(soundId) {
  const display = document.getElementById('timerDisplay');
  const logoImg = document.querySelector('.logo-img');
  const wrapper = document.getElementById('timerWrapper');

  // Spin logo image in place 3 times smoothly when timer finishes (pomodoro.uz text stays still)
  if (logoImg) {
    logoImg.classList.add('spin-logo-effect');
    setTimeout(() => logoImg.classList.remove('spin-logo-effect'), 3000);
  }

  // Global Celebration: Fireworks (Salyut)
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#6C63FF', '#48CAE4', '#FF6B6B', '#FFE66D']
    });
  }

  if (soundId === 'bell') {
    const ripple = document.createElement('div');
    ripple.className = 'ripple-effect';
    wrapper.appendChild(ripple);
    setTimeout(() => ripple.remove(), 4500);
  } else if (soundId === 'digital') {
    display.classList.add('glow-effect');
    setTimeout(() => display.classList.remove('glow-effect'), 3000);
  } else if (soundId === 'kitchen') {
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 100]);
  } else if (soundId === 'wood') {
    const oldTitle = document.title;
    document.title = "Time's Up! 🪵";
    setTimeout(() => document.title = oldTitle, 5000);
  }
}

let toastTimeout = null;

function showToast(msg, duration = 2800) {
  if (window.innerWidth <= 640) return;

  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'pop-up-toast';
    toast.innerHTML = `
      <div class="toast-icon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
      </div>
      <span class="toast-message"></span>
    `;
    document.body.appendChild(toast);
  }

  const msgEl = toast.querySelector('.toast-message');
  if (msgEl) msgEl.textContent = msg;

  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }

  toast.classList.remove('active');
  void toast.offsetWidth;
  toast.classList.add('active');

  toastTimeout = setTimeout(() => {
    toast.classList.remove('active');
  }, duration);
}

function handleAvatarError(imgEl) {
  if (!imgEl) return;
  const parent = imgEl.parentElement;
  if (parent) {
    const catSvg = CUTE_AVATARS && CUTE_AVATARS[0] ? CUTE_AVATARS[0].svg : '';
    parent.innerHTML = catSvg;
  }
}
window.handleAvatarError = handleAvatarError;

function cacheAvatarImageAsBase64(url) {
  if (!url || !url.startsWith('http')) return;
  const cachedUrl = localStorage.getItem('pomodo_cached_avatar_url');
  const cachedBase64 = localStorage.getItem('pomodo_cached_avatar_base64');
  if (cachedUrl === url && cachedBase64) {
    return;
  }

  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 128;
      canvas.height = img.naturalHeight || 128;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const base64data = canvas.toDataURL('image/png');
      if (base64data && base64data.startsWith('data:image')) {
        localStorage.setItem('pomodo_cached_avatar_base64', base64data);
        localStorage.setItem('pomodo_cached_avatar_url', url);
        updateAllAvatars();
        return;
      }
    } catch (e) {}
  };

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('Avatar fetch failed');
      return res.blob();
    })
    .then(blob => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result;
        if (base64data && base64data.startsWith('data:image')) {
          localStorage.setItem('pomodo_cached_avatar_base64', base64data);
          localStorage.setItem('pomodo_cached_avatar_url', url);
          updateAllAvatars();
        }
      };
      reader.readAsDataURL(blob);
    })
    .catch(err => {
      console.warn('Avatar Base64 caching skipped:', err);
    });

  img.src = url;
}

function renderAvatarHTML(avatarVal) {
  const catSvg = CUTE_AVATARS[0].svg;
  const tgSvg = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#0088CC"/><path d="M44.5 18.5L14 30.2C11.9 31 11.9 32.2 13.6 32.7L21.4 35.1L39.5 23.7C40.4 23.1 41.2 23.5 40.5 24.1L25.8 37.4L25.8 45C25.8 46.2 26.8 47.1 28 47.1C28.8 47.1 29.5 46.7 30 46.1L34.3 41.9L43.2 48.5C44.8 49.4 46 48.9 46.4 47L50.5 20.6C51.1 18.2 48.7 16.7 44.5 18.5Z" fill="white"/></svg>`;

  if (!avatarVal) return catSvg;

  if (avatarVal === 'telegram') {
    const cachedBase64 = localStorage.getItem('pomodo_cached_avatar_base64');
    if (cachedBase64) {
      return `<img src="${cachedBase64}" alt="Avatar" class="avatar-img" onerror="window.handleAvatarError && window.handleAvatarError(this)">`;
    }
    const tgPhoto = currentUser?.telegramPhotoUrl || currentUser?.telegram_photo_url || currentUser?.avatarUrl;
    if (tgPhoto && tgPhoto.startsWith('http')) {
      cacheAvatarImageAsBase64(tgPhoto);
    }
    return tgSvg;
  }

  const found = CUTE_AVATARS.find(a => a.id === avatarVal);
  if (found) {
    return found.svg;
  }

  if (avatarVal.startsWith('<svg') || avatarVal.includes('</svg>')) {
    return avatarVal;
  }

  if (avatarVal.startsWith('http://') || avatarVal.startsWith('https://') || avatarVal.startsWith('data:image/')) {
    if (avatarVal.startsWith('data:image/')) {
      return `<img src="${avatarVal}" alt="Avatar" class="avatar-img" onerror="window.handleAvatarError && window.handleAvatarError(this)">`;
    }
    const cachedBase64 = localStorage.getItem('pomodo_cached_avatar_base64');
    const cachedUrl = localStorage.getItem('pomodo_cached_avatar_url');
    if (cachedUrl === avatarVal && cachedBase64) {
      return `<img src="${cachedBase64}" alt="Avatar" class="avatar-img" onerror="window.handleAvatarError && window.handleAvatarError(this)">`;
    }
    cacheAvatarImageAsBase64(avatarVal);
    return tgSvg;
  }

  return catSvg;
}

function updateAllAvatars(val) {
  const localAvatar = localStorage.getItem('pomodo_local_avatar');
  const cachedBase64 = localStorage.getItem('pomodo_cached_avatar_base64');
  let avatarVal = val || localAvatar || cachedBase64 || currentUser?.avatarUrl || currentUser?.telegramPhotoUrl || 'cat';

  if (avatarVal === 'telegram' && cachedBase64) {
    avatarVal = cachedBase64;
  }

  const html = renderAvatarHTML(avatarVal);

  const headerBtn = document.getElementById('profileMenuBtn');
  if (headerBtn) {
    headerBtn.classList.add('has-image');
    headerBtn.innerHTML = html;
  }

  const modalBox = document.querySelector('.account-avatar');
  if (modalBox) {
    modalBox.classList.add('has-image');
    modalBox.innerHTML = html;
  }
}

function sanitizeGuestStorage() {
  if (!(typeof isLoggedIn === 'function' && isLoggedIn())) {
    localStorage.removeItem('pomodo_tasks');
    localStorage.removeItem('pomodo_active_task_id');
    localStorage.removeItem('pomodo_completed_history');
    localStorage.removeItem('pomodo_local_avatar');
    localStorage.removeItem('pomodo_cached_avatar_base64');
    localStorage.removeItem('pomodo_cached_avatar_url');
    if (state) {
      state.tasks = [];
    }
    activeTaskId = null;
  }
}

function resetAppForGuest() {
  currentUser = null;
  state.tasks = [];
  activeTaskId = null;
  currentFetchedSessions = [];
  currentReportSessionsCache = [];
  sanitizeGuestStorage();
  updateAllAvatars('cat');
  const profileNameEl = document.getElementById('profileName');
  if (profileNameEl) profileNameEl.textContent = 'Mehmon Foydalanuvchi';
  updateGuestUIState();
  if (typeof renderTasks === 'function') renderTasks();
}

async function showGuestLockModal(featureName = "Ushbu imkoniyat") {
  const confirmed = await showConfirmDialog({
    icon: '🔒',
    title: 'Telegram orqali kirish kerak',
    text: `${featureName}dan foydalanish uchun Telegram orqali tizimga kiring.`,
    confirmText: 'Login',
    cancelText: 'Yopish'
  });
  if (confirmed && typeof loginWithTelegram === 'function') {
    loginWithTelegram();
  }
}

window.resetAppForGuest = resetAppForGuest;
window.sanitizeGuestStorage = sanitizeGuestStorage;
window.showGuestLockModal = showGuestLockModal;

async function loadCurrentUserProfile() {
  if (typeof checkAndProcessUrlToken === 'function') {
    checkAndProcessUrlToken();
  }

  // Telegram Mini App (TMA) auto-login:
  // Agar foydalanuvchi TMA ichida bo'lsa va hali login qilinmagan bo'lsa,
  // initData orqali avtomatik login qilish.
  if (
    typeof window !== 'undefined' &&
    window.Telegram &&
    window.Telegram.WebApp &&
    window.Telegram.WebApp.initData &&
    window.Telegram.WebApp.initData.trim().length > 0 &&
    !(typeof isLoggedIn === 'function' && isLoggedIn())
  ) {
    try {
      console.log('[TMA Auto Login] Authenticating Telegram Mini App session...');
      const tmaInitData = window.Telegram.WebApp.initData;
      const tmaRes = await fetch('/auth/telegram-tma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tmaInitData }),
      });
      const tmaData = await tmaRes.json().catch(() => ({}));
      if (tmaRes.ok && tmaData.token) {
        if (typeof setToken === 'function') {
          setToken(tmaData.token);
        } else {
          localStorage.setItem('jwt_token', tmaData.token);
        }
        if (tmaData.refreshToken) {
          localStorage.setItem('refresh_token', tmaData.refreshToken);
        }
        if (tmaData.user) {
          window.currentUser = tmaData.user;
        }
        console.log('[TMA Auto Login] Successfully authenticated:', tmaData.user);
      } else {
        console.warn('[TMA Auto Login] TMA validation failed:', tmaData.message || tmaRes.status);
      }
    } catch (tmaErr) {
      console.error('[TMA Auto Login] Error during auto login:', tmaErr);
    }
  }

  currentUser = null;

  if (typeof isLoggedIn === 'function' && isLoggedIn()) {
    try {
      currentUser = await getCurrentUser();
      localStorage.removeItem('pomodo_completed_history');
      localStorage.removeItem('pomodo_app_state');
      if (typeof fetchServerTasks === 'function') {
        await fetchServerTasks();
      }
    } catch (error) {
      console.warn('Current user load failed:', error);
      currentUser = null;
      if (typeof removeToken === 'function') {
        removeToken();
      }
      if (typeof resetAppForGuest === 'function') {
        resetAppForGuest();
      }
    }
  }

  if (!(typeof isLoggedIn === 'function' && isLoggedIn())) {
    if (typeof resetAppForGuest === 'function') {
      resetAppForGuest();
    } else {
      sanitizeGuestStorage();
    }
  }

  window.currentUser = currentUser;
  updateGuestUIState();
  return currentUser;
}


function updateGuestUIState() {
  const isGuest = !(typeof isLoggedIn === 'function' && isLoggedIn());

  // Reports / Progress view guest banner & visibility
  const progressView = document.getElementById('view-progress');
  if (progressView) {
    progressView.classList.toggle('is-guest', isGuest);
  }
  const banner = document.getElementById('progressGuestBanner');
  if (banner) {
    banner.classList.toggle('show', isGuest);
  }

  // Tasks view guest banner visibility & view state
  const taskView = document.getElementById('view-task');
  if (taskView) {
    taskView.classList.toggle('is-guest', isGuest);
  }
  const taskBanner = document.getElementById('taskGuestBanner');
  if (taskBanner) {
    taskBanner.classList.toggle('show', isGuest);
  }

  // Header login button vs avatar button
  const headerLoginBtn = document.getElementById('headerGoogleLoginBtn');
  const profileMenuBtn = document.getElementById('profileMenuBtn');
  if (headerLoginBtn) {
    headerLoginBtn.style.display = isGuest ? 'inline-flex' : 'none';
  }
  if (profileMenuBtn) {
    profileMenuBtn.style.display = isGuest ? 'none' : 'inline-flex';
  }

  // Profile menu items
  const loginMenuBtn = document.getElementById('loginMenuBtn');
  const openAccountModalBtn = document.getElementById('openAccountModalBtn');
  const logoutBtn = document.getElementById('logoutMenuBtn');
  const deleteBtn = document.getElementById('deleteAccountMenuBtn');
  if (loginMenuBtn) loginMenuBtn.style.display = isGuest ? 'flex' : 'none';
  if (openAccountModalBtn) openAccountModalBtn.style.display = isGuest ? 'none' : 'flex';
  if (logoutBtn) logoutBtn.style.display = isGuest ? 'none' : 'flex';
  if (deleteBtn) deleteBtn.style.display = isGuest ? 'none' : 'flex';

  // Profile name & avatar
  const localAvatar = localStorage.getItem('pomodo_local_avatar');
  const avatar = localAvatar || currentUser?.avatarUrl || 'cat';
  updateAllAvatars(avatar);

  const profileNameEl = document.getElementById('profileName');
  if (profileNameEl) {
    profileNameEl.textContent = currentUser ? (currentUser.name || currentUser.username || currentUser.email) : 'Mehmon Foydalanuvchi';
  }

  // Profile menu header info (Name & Phone Number)
  const profileMenuNameEl = document.getElementById('profileMenuName');
  const profileMenuPhoneEl = document.getElementById('profileMenuPhone');
  if (profileMenuNameEl) {
    if (isGuest) {
      profileMenuNameEl.textContent = 'Mehmon Foydalanuvchi';
    } else {
      let displayName = currentUser?.firstName || currentUser?.name || currentUser?.username || 'Foydalanuvchi';
      if (currentUser?.lastName) {
        displayName += ' ' + currentUser.lastName;
      }
      profileMenuNameEl.textContent = displayName;
    }
  }
  if (profileMenuPhoneEl) {
    let phone = currentUser?.phoneNumber || '';
    if (phone && !phone.startsWith('+')) {
      phone = '+' + phone;
    }
    profileMenuPhoneEl.textContent = isGuest ? 'Tizimga kirilmagan' : (phone || 'Tel raqam kiritilmagan');
    profileMenuPhoneEl.style.display = 'block';
  }

  // Notion Task Add Button lock state
  const addBtn = document.getElementById('notionAddTaskBtn');
  if (addBtn) {
    if (isGuest) {
      addBtn.classList.add('locked');
      addBtn.title = "Vazifa qo'shish uchun Telegram orqali kiring";
      addBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> <span>Vazifa qo'shish 🔒</span>`;
    } else {
      addBtn.classList.remove('locked');
      addBtn.title = "Yangi vazifa qo'shish";
      addBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Vazifa qo'shish</span>`;
    }
  }

  if (!isGuest && typeof loadReportData === 'function') {
    const activeView = localStorage.getItem('pomodo_active_view') || (window.location.hash ? window.location.hash.replace('#', '') : 'focus');
    if (activeView === 'progress') {
      loadReportData();
    }
  }
}

function toggleProfileMenu(forceOpen) {
  const menu = document.getElementById('profileMenu');
  if (!menu) return;
  const shouldOpen = forceOpen !== undefined ? forceOpen : !menu.classList.contains('open');
  menu.classList.toggle('open', shouldOpen);
  menu.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  if (typeof updateTelegramBackButton === 'function') {
    updateTelegramBackButton();
  }
}

const CUTE_AVATARS = [
  { id: 'cat', name: 'Cat', svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#FFB703"/><path d="M14 14L22 26H12L14 14Z" fill="#FB8500"/><path d="M50 14L42 26H52L50 14Z" fill="#FB8500"/><circle cx="23" cy="32" r="4" fill="#023047"/><circle cx="41" cy="32" r="4" fill="#023047"/><circle cx="24" cy="31" r="1.5" fill="#FFF"/><circle cx="42" cy="31" r="1.5" fill="#FFF"/><ellipse cx="32" cy="38" rx="3" ry="2" fill="#FB8500"/><path d="M28 41C30 43 34 43 36 41" stroke="#023047" stroke-width="2" stroke-linecap="round"/><path d="M10 34H18M11 38H17M46 34H54M47 38H53" stroke="#023047" stroke-width="1.8" stroke-linecap="round"/></svg>` },
  { id: 'fox', name: 'Fox', svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#FB8500"/><path d="M12 12L26 28H10L12 12Z" fill="#E76F51"/><path d="M52 12L38 28H54L52 12Z" fill="#E76F51"/><path d="M12 32C12 45 22 54 32 54C42 54 52 45 52 32H12Z" fill="#FFF"/><circle cx="23" cy="32" r="3.5" fill="#264653"/><circle cx="41" cy="32" r="3.5" fill="#264653"/><circle cx="24" cy="31" r="1.2" fill="#FFF"/><circle cx="42" cy="31" r="1.2" fill="#FFF"/><polygon points="32,38 28,42 36,42" fill="#264653"/></svg>` },
  { id: 'panda', name: 'Panda', svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#F8F9FA"/><circle cx="16" cy="16" r="9" fill="#212529"/><circle cx="48" cy="16" r="9" fill="#212529"/><ellipse cx="23" cy="34" rx="7" ry="8" fill="#212529"/><ellipse cx="41" cy="34" rx="7" ry="8" fill="#212529"/><circle cx="23" cy="33" r="3" fill="#FFF"/><circle cx="41" cy="33" r="3" fill="#FFF"/><circle cx="23" cy="33" r="1.5" fill="#212529"/><circle cx="41" cy="33" r="1.5" fill="#212529"/><ellipse cx="32" cy="42" rx="3.5" ry="2.5" fill="#212529"/></svg>` },
  { id: 'bear', name: 'Bear', svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#D4A373"/><circle cx="14" cy="16" r="8" fill="#CCD5AE"/><circle cx="50" cy="16" r="8" fill="#CCD5AE"/><ellipse cx="32" cy="41" rx="11" ry="8" fill="#FAEDCD"/><circle cx="24" cy="30" r="3.5" fill="#283618"/><circle cx="40" cy="30" r="3.5" fill="#283618"/><ellipse cx="32" cy="38" rx="4" ry="2.5" fill="#283618"/><path d="M29 43C31 45 33 45 35 43" stroke="#283618" stroke-width="2" stroke-linecap="round"/></svg>` },
  { id: 'avocado', name: 'Avocado', svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 4C18 4 10 20 10 38C10 52 20 60 32 60C44 60 54 52 54 38C54 20 46 4 32 4Z" fill="#52B788"/><path d="M32 10C22 10 15 22 15 38C15 49 22 55 32 55C42 55 49 49 49 38C49 22 42 10 32 10Z" fill="#D8F3DC"/><circle cx="32" cy="42" r="9" fill="#7F4F24"/><circle cx="26" cy="27" r="2.5" fill="#1B4332"/><circle cx="38" cy="27" r="2.5" fill="#1B4332"/><path d="M29 32C31 34 33 34 35 32" stroke="#1B4332" stroke-width="2" stroke-linecap="round"/></svg>` },
  { id: 'rocket', name: 'Rocket', svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#6C63FF"/><path d="M32 10C32 10 44 22 44 38H20C20 22 32 10 32 10Z" fill="#FFF"/><path d="M20 38L12 48H20V38Z" fill="#FF6B6B"/><path d="M44 38L52 48H44V38Z" fill="#FF6B6B"/><circle cx="32" cy="26" r="5" fill="#48CAE4"/><circle cx="32" cy="26" r="3" fill="#FFF"/><path d="M26 46C26 54 32 58 32 58C32 58 38 54 38 46H26Z" fill="#FFD166"/></svg>` },
  { id: 'coffee', name: 'Coffee', svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#FF6B6B"/><rect x="18" y="24" width="28" height="26" rx="6" fill="#FFF"/><path d="M46 30H50C52.2 30 54 31.8 54 34V38C54 40.2 52.2 42 50 42H46V30Z" stroke="#FFF" stroke-width="3"/><path d="M24 16C24 14 26 12 26 10M32 16C32 14 34 12 34 10M40 16C40 14 42 12 42 10" stroke="#FFF" stroke-width="2.5" stroke-linecap="round"/><circle cx="26" cy="34" r="2" fill="#2B2D42"/><circle cx="38" cy="34" r="2" fill="#2B2D42"/><path d="M30 38C31 39.5 33 39.5 34 38" stroke="#2B2D42" stroke-width="2" stroke-linecap="round"/></svg>` },
  { id: 'headphones', name: 'Lofi', svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#48CAE4"/><path d="M16 34C16 23 23 15 32 15C41 15 48 23 48 34" stroke="#1D3557" stroke-width="4" stroke-linecap="round"/><rect x="12" y="32" width="10" height="18" rx="5" fill="#1D3557"/><rect x="42" y="32" width="10" height="18" rx="5" fill="#1D3557"/><circle cx="27" cy="36" r="2.5" fill="#1D3557"/><circle cx="37" cy="36" r="2.5" fill="#1D3557"/><path d="M30 42C31 43.5 33 43.5 34 42" stroke="#1D3557" stroke-width="2" stroke-linecap="round"/></svg>` },
  { id: 'lightning', name: 'Focus', svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#FFD166"/><path d="M35 10L18 34H32L29 54L46 30H32L35 10Z" fill="#06D6A0" stroke="#073B4C" stroke-width="2" stroke-linejoin="round"/></svg>` }
];

let selectedAvatarId = null;

function renderAvatarGrid() {
  const grid = document.getElementById('accountAvatarGrid');
  if (!grid) return;
  const currentAvatar = selectedAvatarId || currentUser?.avatarUrl || currentUser?.telegramPhotoUrl || currentUser?.telegram_photo_url || 'telegram';
  
  const tgPhoto = currentUser?.telegramPhotoUrl || currentUser?.telegram_photo_url || (currentUser?.avatarUrl?.startsWith('http') ? currentUser?.avatarUrl : null);
  const isTgUser = Boolean(currentUser?.telegramId || currentUser?.telegram_id || currentUser?.provider === 'telegram' || tgPhoto);

  let tgAvatarHtml = '';
  if (isTgUser) {
    const isTgSelected = currentAvatar === 'telegram' || currentAvatar === tgPhoto;
    const avatarTargetId = tgPhoto ? tgPhoto : 'telegram';
    const innerContent = renderAvatarHTML('telegram');

    tgAvatarHtml = `
      <button class="avatar-option-btn ${isTgSelected ? 'selected' : ''}" data-avatar-id="${avatarTargetId}" type="button" title="Telegram Avatar">
        ${innerContent}
      </button>
    `;
  }

  grid.innerHTML = tgAvatarHtml + CUTE_AVATARS.map(avatar => {
    const isSelected = currentAvatar === avatar.id;
    return `
      <button class="avatar-option-btn ${isSelected ? 'selected' : ''}" data-avatar-id="${avatar.id}" type="button" title="${avatar.name}">
        ${avatar.svg}
      </button>
    `;
  }).join('');
}

function formatProfileDateTime(dateVal) {
  if (!dateVal) return '-';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const day = String(d.getDate()).padStart(2, '0');
    const monthNames = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
    const month = monthNames[d.getMonth()] || String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}-${month}, ${year}, ${hours}:${minutes}`;
  } catch (e) {
    return String(dateVal);
  }
}

async function populateAccountModal() {
  if (!currentUser) {
    await loadCurrentUserProfile();
  }

  const user = currentUser || {};
  const firstName = user.firstName || user.first_name || '-';
  const lastName = user.lastName || user.last_name || '-';
  const fullName = [firstName !== '-' ? firstName : '', lastName !== '-' ? lastName : ''].join(' ').trim() || user.name || 'Foydalanuvchi';
  const username = user.username ? (user.username.startsWith('@') ? user.username : `@${user.username}`) : '-';
  const phone = user.phoneNumber || user.phone_number || '-';
  const telegramId = user.telegramId || user.telegram_id || user.id || '-';
  const languageCode = (user.languageCode || user.language_code || 'uz').toUpperCase();
  const createdAt = formatProfileDateTime(user.createdAt || user.created_at);
  const updatedAt = formatProfileDateTime(user.updatedAt || user.updated_at);
  const email = user.email || '';

  const nameHeaderEl = document.getElementById('accountProfileFullName');
  const usernameHeaderEl = document.getElementById('accountProfileUsername');
  if (nameHeaderEl) nameHeaderEl.textContent = fullName;
  if (usernameHeaderEl) usernameHeaderEl.textContent = username;

  const fnEl = document.getElementById('accFirstName');
  const lnEl = document.getElementById('accLastName');
  const phoneEl = document.getElementById('accPhoneNumber');
  const tgIdEl = document.getElementById('accTelegramId');
  const unEl = document.getElementById('accUsername');
  const langEl = document.getElementById('accLanguageCode');
  const createdEl = document.getElementById('accCreatedAt');
  const updatedEl = document.getElementById('accUpdatedAt');
  const emailInput = document.getElementById('accountEmailInput');

  if (fnEl) fnEl.textContent = firstName;
  if (lnEl) lnEl.textContent = lastName;
  if (phoneEl) phoneEl.textContent = phone;
  if (tgIdEl) tgIdEl.textContent = telegramId;
  if (unEl) unEl.textContent = username;
  if (langEl) langEl.textContent = languageCode;
  if (createdEl) createdEl.textContent = createdAt;
  if (updatedEl) updatedEl.textContent = updatedAt;
  if (emailInput) emailInput.value = email;

  const activeAvatar = selectedAvatarId || currentUser?.avatarUrl || currentUser?.telegramPhotoUrl || currentUser?.telegram_photo_url || 'cat';
  selectedAvatarId = activeAvatar;

  updateAllAvatars(selectedAvatarId);
  renderAvatarGrid();
}

async function saveAccount() {
  const emailInput = document.getElementById('accountEmailInput');
  const email = emailInput?.value.trim() || currentUser?.email || '';
  const avatarId = selectedAvatarId || currentUser?.avatarUrl || currentUser?.telegramPhotoUrl || 'cat';

  const name = currentUser?.name || [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') || 'User';

  // Backend'ga name, email va avatarUrl yuborish
  try {
    if (typeof put === 'function') {
      await put('/auth/me', { name, email, avatarUrl: avatarId });
    }
  } catch (error) {
    console.warn('Backend update skipped/failed:', error);
  }

  // currentUser ni yangilash
  if (!currentUser) {
    currentUser = { name, email, avatarUrl: avatarId };
  } else {
    currentUser.email = email;
    currentUser.avatarUrl = avatarId;
  }

  updateAllAvatars(avatarId);
  closeModal('accountModal');
  showToast('Account saqlandi!', 2500);
}

function showConfirmDialog({ icon = '⚠️', title, text, confirmText = 'Ha', cancelText = 'Bekor qilish' }) {
  return new Promise((resolve) => {
    const iconEl = document.getElementById('confirmModalIcon');
    const titleEl = document.getElementById('confirmModalTitle');
    const textEl = document.getElementById('confirmModalText');
    const okBtn = document.getElementById('confirmModalOkBtn');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');

    if (iconEl) iconEl.textContent = icon;
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
    if (okBtn) okBtn.textContent = confirmText;
    if (cancelBtn) cancelBtn.textContent = cancelText;

    const cleanup = (result) => {
      closeModal('confirmModal');
      if (okBtn) okBtn.onclick = null;
      if (cancelBtn) cancelBtn.onclick = null;
      resolve(result);
    };

    if (okBtn) okBtn.onclick = () => cleanup(true);
    if (cancelBtn) cancelBtn.onclick = () => cleanup(false);

    openModal('confirmModal');
  });
}

async function confirmLogout() {
  toggleProfileMenu(false);
  const confirmed = await showConfirmDialog({
    icon: '🚪',
    title: 'Tizimdan chiqish',
    text: 'Haqiqatdan ham hisobingizdan chiqmoqchimisiz?',
    confirmText: 'Chiqish',
    cancelText: 'Bekor qilish'
  });
  if (!confirmed) return;
  await logout();
}

async function confirmDeleteAccount() {
  toggleProfileMenu(false);
  closeModal('accountModal');
  const confirmed = await showConfirmDialog({
    icon: '🗑️',
    title: "Accountni o'chirish",
    text: "Haqiqatdan ham accountingizni va barcha statistikalaringizni o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.",
    confirmText: "O'chirish",
    cancelText: 'Bekor qilish'
  });
  if (!confirmed) return;

  try {
    if (typeof deleteAccount === 'function') {
      await deleteAccount();
    } else {
      await del('/auth/me');
      localStorage.clear();
      if (typeof removeToken === 'function') removeToken();
      if (typeof resetAppForGuest === 'function') resetAppForGuest();
      if (typeof switchView === 'function') switchView('focus');
      window.location.hash = '#focus';
    }
    showToast("Accountingiz muvaffaqiyatli o'chirildi.", 3500);
  } catch (error) {
    console.error('Account delete failed:', error);
    showToast("Account o'chirilmadi. Qayta urinib ko'ring.", 3500);
  }
}

function switchReportTab(tabName) {
  document.querySelectorAll('[data-report-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.reportTab === tabName);
  });
  document.querySelectorAll('[data-report-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.reportPanel === tabName);
  });

  if (tabName === 'ranking') {
    loadReportRanking();
  }
}

function formatReportTime(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total === 0) return '0m';
  if (total < 60) {
    return `${total}m`;
  }
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function combineSessions(fetched = [], local = []) {
  const isLoggedInUser = typeof isLoggedIn === 'function' && isLoggedIn();
  if (isLoggedInUser && Array.isArray(fetched) && fetched.length > 0) {
    const map = new Map();
    const uniqueFetched = [];
    fetched.forEach(s => {
      const key = s.id || `${s.date}_${s.time}_${s.minutes}_${s.label}`;
      if (!map.has(key)) {
        map.set(key, true);
        uniqueFetched.push(s);
      }
    });
    return uniqueFetched.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  const map = new Map();
  const list = [];

  const processSession = (s) => {
    const minutes = Number(s.minutes || s.duration) || 25;
    const label = (s.label || 'Umumiy fokus').trim();
    const date = s.date || toDateKey(s.startedAt || s.timestamp || new Date());
    const time = s.time || (s.startedAt ? new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '00:00');
    
    const dedupKey = `${date}_${time}_${minutes}_${label}`;
    if (!map.has(dedupKey)) {
      map.set(dedupKey, true);
      list.push(s);
    }
  };

  if (Array.isArray(fetched)) fetched.forEach(processSession);
  if (Array.isArray(local)) local.forEach(processSession);

  return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function toDateKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let currentReportPeriod = 'weekly';
let currentWeekOffset = 0;
let detailDisplayLimit = 15;
let currentFetchedSessions = [];
let currentReportSessionsCache = [];
let isSyncingLocalSessions = false;

async function syncLocalSessionsToBackend() {
  if (isSyncingLocalSessions || !(typeof isLoggedIn === 'function' && isLoggedIn())) {
    return;
  }
  const historyRaw = localStorage.getItem('pomodo_completed_history');
  if (!historyRaw) return;

  try {
    const history = JSON.parse(historyRaw);
    if (Array.isArray(history) && history.length > 0) {
      isSyncingLocalSessions = true;
      for (const item of history) {
        try {
          const started = await post('/api/sessions', {
            duration: Number(item.minutes) || 25,
            label: item.label || 'Umumiy fokus'
          });
          if (started && started.id) {
            await post(`/api/sessions/${started.id}/complete`);
          }
        } catch (e) {
          console.warn('Failed to sync offline session item to backend:', e);
        }
      }
      localStorage.removeItem('pomodo_completed_history');
      if (typeof clearReportCache === 'function') clearReportCache();
    } else {
      localStorage.removeItem('pomodo_completed_history');
    }
  } catch (e) {
    console.error('syncLocalSessionsToBackend error:', e);
  } finally {
    isSyncingLocalSessions = false;
  }
}

function formatMinShort(min) {
  const m = Number(min) || 0;
  if (m <= 0) return '';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function getWeekDays(offset = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + (offset * 7));
  monday.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function getChartColumns(period = 'weekly', offset = 0) {
  const today = new Date();

  if (period === 'yearly') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const targetYear = today.getFullYear() + offset;
    const curMonth = today.getMonth();
    const isCurYear = targetYear === today.getFullYear();
    return months.map((m, idx) => ({
      key: `m${idx + 1}`,
      monthIndex: idx,
      year: targetYear,
      label: m,
      title: `${m} ${targetYear}`,
      isToday: isCurYear && curMonth === idx
    }));
  }

  if (period === 'monthly') {
    const targetDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const curDay = today.getDate();
    const isCurMonth = offset === 0;

    return [
      { key: 'w1', label: 'W1 (1-7)', title: `1-7 kunlar`, minDay: 1, maxDay: 7, monthIndex: targetMonth, year: targetYear, isToday: isCurMonth && curDay >= 1 && curDay <= 7 },
      { key: 'w2', label: 'W2 (8-14)', title: `8-14 kunlar`, minDay: 8, maxDay: 14, monthIndex: targetMonth, year: targetYear, isToday: isCurMonth && curDay >= 8 && curDay <= 14 },
      { key: 'w3', label: 'W3 (15-21)', title: `15-21 kunlar`, minDay: 15, maxDay: 21, monthIndex: targetMonth, year: targetYear, isToday: isCurMonth && curDay >= 15 && curDay <= 21 },
      { key: 'w4', label: 'W4 (22+)', title: `22+ kunlar`, minDay: 22, maxDay: 31, monthIndex: targetMonth, year: targetYear, isToday: isCurMonth && curDay >= 22 }
    ];
  }

  if (period === 'daily') {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + offset);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const targetDay = targetDate.getDate();
    const isToday = offset === 0;
    const curHour = today.getHours();

    const blocks = [
      { key: '00-04', label: '00-04', startHour: 0, endHour: 4 },
      { key: '04-08', label: '04-08', startHour: 4, endHour: 8 },
      { key: '08-12', label: '08-12', startHour: 8, endHour: 12 },
      { key: '12-16', label: '12-16', startHour: 12, endHour: 16 },
      { key: '16-20', label: '16-20', startHour: 16, endHour: 20 },
      { key: '20-24', label: '20-24', startHour: 20, endHour: 24 }
    ];

    return blocks.map(b => ({
      ...b,
      title: `${b.label}:00`,
      year: targetYear,
      monthIndex: targetMonth,
      day: targetDay,
      dateKey: toDateKey(targetDate),
      isToday: isToday && curHour >= b.startHour && curHour < b.endHour
    }));
  }

  const UZ_DAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Yak'];
  const weekDays = getWeekDays(offset);
  return weekDays.map((date, idx) => {
    const key = toDateKey(date);
    const dayName = UZ_DAYS[idx];
    const isToday = key === toDateKey(new Date());
    return {
      key: key,
      label: dayName,
      title: `${dayName}, ${key}`,
      isToday: isToday,
      date: date
    };
  });
}

function updateWeekNavLabel(period = currentReportPeriod) {
  const labelEl = document.getElementById('currentWeekLabel');
  if (!labelEl) return;
  const UZ_MONTH_NAMES = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

  if (period === 'yearly') {
    const targetYear = new Date().getFullYear() + currentWeekOffset;
    labelEl.textContent = `${targetYear}-yil`;
    return;
  }
  if (period === 'monthly') {
    const d = new Date();
    d.setMonth(d.getMonth() + currentWeekOffset);
    labelEl.textContent = `${UZ_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    return;
  }
  if (period === 'daily') {
    if (currentWeekOffset === 0) {
      labelEl.textContent = 'Bugun';
    } else if (currentWeekOffset === -1) {
      labelEl.textContent = 'Kecha';
    } else {
      const d = new Date();
      d.setDate(d.getDate() + currentWeekOffset);
      labelEl.textContent = `${d.getDate()}-${UZ_MONTH_NAMES[d.getMonth()].toLowerCase()}, ${d.getFullYear()}`;
    }
    return;
  }
  if (currentWeekOffset === 0) {
    labelEl.textContent = 'Ushbu hafta';
  } else if (currentWeekOffset === -1) {
    labelEl.textContent = "O'tgan hafta";
  } else {
    const days = getWeekDays(currentWeekOffset);
    const startStr = `${days[0].getDate()}.${days[0].getMonth() + 1}`;
    const endStr = `${days[6].getDate()}.${days[6].getMonth() + 1}`;
    labelEl.textContent = `${startStr} - ${endStr}`;
  }
}

function recordPomodoroCompletion(minutes = 25, label = 'Pomodoro Fokus') {
  const history = JSON.parse(localStorage.getItem('pomodo_completed_history') || '[]');
  const now = new Date();
  const dateKey = toDateKey(now);
  const timeKey = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  history.push({
    id: Date.now(),
    date: dateKey,
    time: timeKey,
    minutes: Number(minutes) || 25,
    label: label || 'Pomodoro Fokus',
    timestamp: now.getTime()
  });
  localStorage.setItem('pomodo_completed_history', JSON.stringify(history));
}

function getLocalHistoryStats() {
  const history = JSON.parse(localStorage.getItem('pomodo_completed_history') || '[]');
  const localMinutes = history.reduce((sum, item) => sum + (Number(item.minutes) || 25), 0);
  const localSessions = history.length;
  const uniqueDates = new Set(history.map(item => item.date));
  return { history, localMinutes, localSessions, uniqueDates };
}

let focusChartInstance = null;

function renderChartJS(cols, colMinutes, period) {
  const canvas = document.getElementById('focusHoursChartCanvas');
  const canvasContainer = document.getElementById('canvasChartContainer');
  const fallbackArea = document.getElementById('fallbackChartArea');

  if (!canvas || typeof Chart === 'undefined') {
    if (fallbackArea) fallbackArea.style.display = 'block';
    if (canvasContainer) canvasContainer.style.display = 'none';
    return;
  }

  if (fallbackArea) fallbackArea.style.display = 'none';
  if (canvasContainer) canvasContainer.style.display = 'block';
  canvas.style.display = 'block';

  const labels = cols.map(c => c.label);
  const data = colMinutes;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const barColor = cols.map(c => c.isToday ? 'rgba(224, 86, 36, 0.95)' : 'rgba(42, 157, 143, 0.85)');
  const hoverColor = cols.map(c => c.isToday ? '#c0392b' : '#21867a');
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const textColor = isDark ? '#e0e0e0' : '#444444';

  if (focusChartInstance) {
    focusChartInstance.data.labels = labels;
    focusChartInstance.data.datasets[0].data = data;
    focusChartInstance.data.datasets[0].backgroundColor = barColor;
    focusChartInstance.data.datasets[0].hoverBackgroundColor = hoverColor;
    focusChartInstance.options.scales.x.ticks.color = textColor;
    focusChartInstance.options.scales.y.ticks.color = textColor;
    focusChartInstance.options.scales.y.grid.color = gridColor;
    focusChartInstance.update({
      duration: 350,
      easing: 'easeOutQuart'
    });
    return;
  }

  const barValueLabelsPlugin = {
    id: 'barValueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = '700 12px "DM Mono", monospace, sans-serif';
      ctx.fillStyle = isDark ? '#f0f0f0' : '#222222';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        meta.data.forEach((bar, index) => {
          const val = dataset.data[index];
          if (val > 0) {
            const formattedVal = formatMinShort(val);
            const textY = Math.max(18, bar.y - 6);
            ctx.fillText(formattedVal, bar.x, textY);
          }
        });
      });
      ctx.restore();
    }
  };

  const ctx = canvas.getContext('2d');
  focusChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Diqqat vaqti',
        data: data,
        backgroundColor: barColor,
        hoverBackgroundColor: hoverColor,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    plugins: [barValueLabelsPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 24,
          right: 10,
          left: 5,
          bottom: 5
        }
      },
      animation: {
        duration: 600,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          titleColor: isDark ? '#fff' : '#111',
          bodyColor: isDark ? '#ddd' : '#333',
          borderColor: isDark ? '#444' : '#ddd',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: function(context) {
              const val = context.raw || 0;
              return `Diqqat vaqti: ${formatMinShort(val)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { family: 'inherit', size: 12, weight: '600' } }
        },
        y: {
          beginAtZero: true,
          grace: '15%',
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            callback: function(val) { return val + 'm'; }
          }
        }
      }
    }
  });
}

function renderTaskBreakdownHTML(taskBreakdown, sessions) {
  const container = document.getElementById('reportTaskBreakdown');
  if (!container) return;

  let items = taskBreakdown || [];

  if (!items.length && sessions && sessions.length) {
    const map = new Map();
    let totalMins = 0;
    sessions.forEach(h => {
      const lbl = (h.label && h.label.trim()) ? h.label.trim() : 'Umumiy fokus';
      const m = Number(h.minutes) || 25;
      map.set(lbl, (map.get(lbl) || 0) + m);
      totalMins += m;
    });

    items = Array.from(map.entries()).map(([label, minutes]) => ({
      label,
      minutes,
      count: Math.ceil(minutes / 25),
      percentage: totalMins > 0 ? Math.round((minutes / totalMins) * 1000) / 10 : 0
    })).sort((a, b) => b.minutes - a.minutes);
  }

  if (!items.length) {
    container.innerHTML = '<div class="task-empty">Hali bajarilgan pomodoro sessiyalari mavjud emas.</div>';
    return;
  }

  const colors = ['#e05624', '#2a9d8f', '#e76f51', '#f4a261', '#457b9d', '#9b59b6'];

  container.innerHTML = items.map((item, idx) => {
    const color = colors[idx % colors.length];
    return `
      <div class="task-breakdown-item">
        <div class="task-breakdown-info">
          <span class="task-label"><span class="color-dot" style="background:${color}"></span> ${escHtml(item.label || 'Umumiy fokus')}</span>
          <span class="task-time"><strong>${item.count || Math.ceil(item.minutes / 25)} ta pomodoro</strong> • <strong>${item.minutes}m</strong> (${item.percentage}%)</span>
        </div>
        <div class="task-breakdown-bar-bg">
          <div class="task-breakdown-bar-fill" style="width: ${Math.min(100, item.percentage)}%; background: ${color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

function calculateLocalStreak(history = [], isBest = false) {
  if (!history.length) return 0;
  const uniqueDates = Array.from(new Set(history.map(h => h.date))).sort().reverse();
  if (!uniqueDates.length) return 0;

  const todayStr = toDateKey(new Date());
  const yesterdayStr = toDateKey(new Date(Date.now() - 86400000));

  let currentStreak = 0;
  let checkDate = uniqueDates.includes(todayStr) ? new Date() : (uniqueDates.includes(yesterdayStr) ? new Date(Date.now() - 86400000) : null);

  if (checkDate) {
    while (uniqueDates.includes(toDateKey(checkDate))) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  }

  if (!isBest) return currentStreak;

  let bestStreak = 0;
  let tempStreak = 0;
  let prevDate = null;

  const sortedAsc = [...uniqueDates].sort();
  sortedAsc.forEach(dateStr => {
    const curDate = new Date(dateStr);
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diffDays = Math.round((curDate - prevDate) / 86400000);
      if (diffDays === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    if (tempStreak > bestStreak) bestStreak = tempStreak;
    prevDate = curDate;
  });

  return Math.max(bestStreak, currentStreak);
}

function renderDetailRowsList(sessionsOverride) {
  if (sessionsOverride) {
    currentReportSessionsCache = sessionsOverride;
  }
  const detailRows = document.getElementById('reportDetailRows');
  const loadMoreBtn = document.getElementById('loadMoreSessionsBtn');
  if (!detailRows) return;

  const rows = [...currentReportSessionsCache].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  if (!rows.length) {
    detailRows.innerHTML = '<div class="task-empty">Hali bajarilgan pomodoro sessiyalari mavjud emas.</div>';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  const visibleRows = rows.slice(0, detailDisplayLimit);
  detailRows.innerHTML = visibleRows.map(entry => {
    const timeDisplay = entry.time || (entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '12:00');
    const dateTimeText = `${entry.date} ${timeDisplay}`;
    return `
      <div class="detail-row">
        <span class="detail-time-cell">${escHtml(dateTimeText)}</span>
        <span class="detail-task-cell" title="${escHtml(entry.label || 'Umumiy fokus')}">${escHtml(entry.label || 'Umumiy fokus')}</span>
        <span class="detail-min-cell"><strong>${Number(entry.minutes || 0)} min</strong></span>
      </div>
    `;
  }).join('');

  if (loadMoreBtn) {
    loadMoreBtn.style.display = rows.length > detailDisplayLimit ? 'inline-flex' : 'none';
  }
}

function exportStatsToCSV() {
  try {
    const isLoggedInUser = typeof isLoggedIn === 'function' && isLoggedIn();
    const localStats = getLocalHistoryStats();
    let history = isLoggedInUser && currentFetchedSessions.length > 0
      ? currentFetchedSessions
      : (localStats.history || []);

    if (!history.length) {
      showToast("Eksport qilish uchun foydalanuvchi ma'lumotlari topilmadi.", 3000);
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,ID,Date,Time,Task / Project Label,Duration (Minutes)\n";
    history.forEach((row, index) => {
      const line = `"${index + 1}","${row.date || ''}","${row.time || ''}","${(row.label || 'Umumiy fokus').replace(/"/g, '""')}","${row.minutes || 25}"`;
      csvContent += line + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pomodoro_progress_report_${toDateKey(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Progress hisoboti CSV shaklida yuklab olindi! 📥", 3000);
  } catch (err) {
    console.error("Export CSV error:", err);
    showToast("CSV yuklab olishda xatolik yuz berdi.", 3000);
  }
}

function renderReportSummary(statsData, summaryData, period = 'weekly') {
  try {
    const isLoggedInUser = typeof isLoggedIn === 'function' && isLoggedIn();
    const localStats = getLocalHistoryStats();

    let combinedSessions = combineSessions(currentFetchedSessions, localStats.history);
    const sortedSessions = combinedSessions;

    const totalMinutesFromSessions = combinedSessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
    const backendTotalMinutes = Number(statsData?.totalMinutes ?? summaryData?.totalMinutes ?? 0);
    const displayTotalMinutes = isLoggedInUser
      ? Math.max(totalMinutesFromSessions, backendTotalMinutes)
      : totalMinutesFromSessions;

    const uniqueDates = new Set(sortedSessions.map(s => s.date));
    const activeDays = uniqueDates.size;

    const cols = getChartColumns(period, currentWeekOffset);
    updateWeekNavLabel(period);

    const colMinutes = cols.map(col => {
      let minSum = 0;

      // Daily period requires exact hourly block matching (00-04, 04-08, 08-12, 12-16, 16-20, 20-24)
      if (period === 'daily') {
        sortedSessions.forEach(s => {
          if (s.date === col.dateKey) {
            const d = s.timestamp ? new Date(s.timestamp) : (s.startedAt ? new Date(s.startedAt) : (s.createdAt ? new Date(s.createdAt) : null));
            if (d) {
              const hr = d.getHours();
              if (hr >= col.startHour && hr < col.endHour) {
                minSum += Number(s.minutes || 0);
              }
            }
          }
        });
        return minSum;
      }

      // Primary source for weekly, monthly, yearly: statsData.entries from backend API
      if (statsData && Array.isArray(statsData.entries) && statsData.entries.length > 0) {
        if (period === 'yearly') {
          statsData.entries.forEach(e => {
            if (e.date) {
              const d = new Date(e.date);
              if (d.getMonth() === col.monthIndex) {
                minSum += Number(e.minutes || 0);
              }
            }
          });
        } else if (period === 'monthly') {
          statsData.entries.forEach(e => {
            if (e.date) {
              const parts = String(e.date).split('-');
              const dayNum = parts.length === 3 ? parseInt(parts[2], 10) : new Date(e.date).getDate();
              if (dayNum >= col.minDay && dayNum <= col.maxDay) {
                minSum += Number(e.minutes || 0);
              }
            }
          });
        } else { // weekly
          statsData.entries.forEach(e => {
            const eDateStr = String(e.date);
            if (eDateStr === String(col.dateKey) || eDateStr === String(col.key)) {
              minSum += Number(e.minutes || 0);
            }
          });
        }
        return minSum;
      }

      // Secondary source / fallback: sortedSessions (guest user or local history)
      if (period === 'yearly') {
        sortedSessions.forEach(s => {
          if (s.date) {
            const d = s.timestamp ? new Date(s.timestamp) : (s.startedAt ? new Date(s.startedAt) : new Date(s.date));
            if (d.getFullYear() === col.year && d.getMonth() === col.monthIndex) {
              minSum += Number(s.minutes || 0);
            }
          }
        });
      } else if (period === 'monthly') {
        sortedSessions.forEach(s => {
          if (s.date) {
            const d = s.timestamp ? new Date(s.timestamp) : (s.startedAt ? new Date(s.startedAt) : new Date(s.date));
            if (d.getFullYear() === col.year && d.getMonth() === col.monthIndex) {
              const dayNum = d.getDate();
              if (dayNum >= col.minDay && dayNum <= col.maxDay) {
                minSum += Number(s.minutes || 0);
              }
            }
          }
        });
      } else if (period === 'daily') {
        sortedSessions.forEach(s => {
          if (s.date === col.dateKey) {
            const d = s.timestamp ? new Date(s.timestamp) : (s.startedAt ? new Date(s.startedAt) : new Date(s.date));
            const hr = d.getHours();
            if (hr >= col.startHour && hr < col.endHour) {
              minSum += Number(s.minutes || 0);
            }
          }
        });
      } else { // weekly
        sortedSessions.forEach(s => {
          if (String(s.date) === String(col.key) || String(s.date) === String(col.dateKey)) {
            minSum += Number(s.minutes || 0);
          }
        });
      }

      return minSum;
    });

    const maxColMinutes = Math.max(60, ...colMinutes);
    const ceiling = Math.max(120, Math.ceil(maxColMinutes / 30) * 30);

    const chartYAxis = document.getElementById('chartYAxis');
    if (chartYAxis) {
      const step = Math.round(ceiling / 4);
      chartYAxis.innerHTML = [
        `<span>${ceiling}m</span>`,
        `<span>${step * 3}m</span>`,
        `<span>${step * 2}m</span>`,
        `<span>${step * 1}m</span>`,
        `<span>0m</span>`
      ].join('');
    }

    const hoursEl = document.getElementById('reportHoursFocused');
    if (hoursEl) {
      hoursEl.textContent = formatReportTime(displayTotalMinutes);
    }

    const daysEl = document.getElementById('reportDaysAccessed');
    const calculatedActiveDays = (activeDays === 0 && displayTotalMinutes > 0) ? 1 : activeDays;
    if (daysEl) daysEl.textContent = calculatedActiveDays;

    const streakEl = document.getElementById('reportDayStreak');
    const currentStreakVal = isLoggedInUser
      ? (summaryData?.streakCount ?? summaryData?.streak ?? statsData?.currentStreak ?? 0)
      : calculateLocalStreak(localStats.history);
    if (streakEl) streakEl.textContent = currentStreakVal;

    const bestStreakEl = document.getElementById('reportBestStreak');
    const bestStreakVal = isLoggedInUser
      ? (summaryData?.bestStreak ?? statsData?.bestStreak ?? currentStreakVal)
      : calculateLocalStreak(localStats.history, true);
    if (bestStreakEl) bestStreakEl.textContent = bestStreakVal;

    const rateEl = document.getElementById('reportCompletionRate');
    const completionRateVal = isLoggedInUser
      ? (statsData?.completionRate ?? 100.0)
      : 100.0;
    if (rateEl) rateEl.textContent = `${Number(completionRateVal).toFixed(1)}%`;

    const timeEl = document.getElementById('reportTotalTime');
    if (timeEl) timeEl.textContent = formatReportTime(displayTotalMinutes);

    // Render Chart.js (with DOM fallback)
    renderChartJS(cols, colMinutes, period);

    const chart = document.getElementById('focusChart');
    if (chart) {
      chart.style.gridTemplateColumns = `repeat(${cols.length}, 1fr)`;
      chart.innerHTML = cols.map((col, idx) => {
        const minutes = colMinutes[idx];
        const heightPercentage = Math.min(100, Math.round((minutes / ceiling) * 100));
        const formattedVal = formatMinShort(minutes);

        return `
          <div class="chart-day ${col.isToday ? 'is-today' : ''}">
            <span class="chart-val-badge ${minutes > 0 ? 'show' : ''}">${formattedVal}</span>
            <div class="chart-bar ${col.isToday ? 'is-today' : ''}" style="height: ${Math.max(4, heightPercentage)}%" title="${col.title}: ${minutes} min"></div>
            <span class="chart-label ${col.isToday ? 'today' : ''}">${col.label}</span>
          </div>
        `;
      }).join('');
    }

    // Render Task Breakdown
    renderTaskBreakdownHTML(statsData?.taskBreakdown, sortedSessions);

    // Render Detail Rows List
    renderDetailRowsList(sortedSessions);
  } catch (err) {
    console.error('Error rendering report summary:', err);
  }
}

let cachedSummaryData = null;
let isSessionsHistoryFetched = false;

async function fetchSessionsHistory(forceRefresh = false) {
  if (isSessionsHistoryFetched && !forceRefresh) return currentFetchedSessions;
  try {
    const rawSessions = await get('/api/sessions?page=0&size=500');
    const sessionsArr = Array.isArray(rawSessions) ? rawSessions : [];
    currentFetchedSessions = sessionsArr.filter(s => Boolean(s.completed)).map(s => {
      const d = s.startedAt ? new Date(s.startedAt) : (s.createdAt ? new Date(s.createdAt) : new Date());
      return {
        id: s.id,
        date: toDateKey(d),
        time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        minutes: Number(s.duration) || 25,
        label: s.label || 'Pomodoro Fokus',
        timestamp: d.getTime()
      };
    });
    isSessionsHistoryFetched = true;
    return currentFetchedSessions;
  } catch (e) {
    console.warn('Sessions list API error:', e);
    return currentFetchedSessions;
  }
}

async function switchProgressSubTab(tabName) {
  document.querySelectorAll('.progress-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.progressTab === tabName);
  });
  document.querySelectorAll('.progress-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `progress-tab-${tabName}`);
  });

  if (tabName === 'detail') {
    await fetchSessionsHistory();
    renderDetailRowsList();
  }
}

let fullReportCache = null;
const periodStatsCache = new Map();

function clearReportCache() {
  fullReportCache = null;
  try { sessionStorage.removeItem('pomodo_full_stats'); } catch (e) {}
  periodStatsCache.clear();
  cachedSummaryData = null;
  isSessionsHistoryFetched = false;
}

async function loadReportData(period = currentReportPeriod, forceRefresh = false) {
  if (period !== currentReportPeriod) {
    currentWeekOffset = 0;
  }
  currentReportPeriod = period;

  document.querySelectorAll('[data-report-period]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.reportPeriod === period);
  });

  const isGuest = !(typeof isLoggedIn === 'function' && isLoggedIn());
  const progressView = document.getElementById('view-progress');
  const banner = document.getElementById('progressGuestBanner');
  
  if (progressView) progressView.classList.toggle('is-guest', isGuest);
  if (banner) banner.classList.toggle('show', isGuest);

  if (isGuest) {
    currentFetchedSessions = [];
    currentReportSessionsCache = [];
    renderReportSummary(null, null, period);
    return;
  }

  // 1. Instant 0ms Render from Memory or SessionStorage
  if (!fullReportCache) {
    try {
      const stored = sessionStorage.getItem('pomodo_full_stats');
      if (stored) fullReportCache = JSON.parse(stored);
    } catch (e) {}
  }

  const cacheKey = `${period}_${currentWeekOffset}`;

  if (currentWeekOffset === 0 && fullReportCache) {
    applyFullStatsToState(fullReportCache, period);
    if (!forceRefresh) return;
  } else if (periodStatsCache.has(cacheKey) && !forceRefresh) {
    renderReportSummary(periodStatsCache.get(cacheKey), cachedSummaryData, period);
    return;
  }

  // 2. Fetch Single Unified API (/api/stats/full) in background or if cache missing
  syncLocalSessionsToBackend().catch(() => {});

  try {
    if (currentWeekOffset === 0) {
      const fullData = await get('/api/stats/full');
      if (fullData) {
        fullReportCache = fullData;
        try { sessionStorage.setItem('pomodo_full_stats', JSON.stringify(fullData)); } catch (e) {}
        applyFullStatsToState(fullData, period);
      }
    } else {
      const statsData = await get(`/api/stats/${period}?offset=${currentWeekOffset}`);
      if (statsData) {
        periodStatsCache.set(cacheKey, statsData);
        renderReportSummary(statsData, cachedSummaryData, period);
      }
    }
  } catch (error) {
    console.warn('Report load failed:', error);
  }
}

function applyFullStatsToState(fullData, period = currentReportPeriod) {
  if (!fullData) return;
  cachedSummaryData = fullData.summary || {};
  const statsData = fullData[period] || fullData.weekly || {};
  const rawSessions = Array.isArray(fullData.sessions) ? fullData.sessions : [];

  currentFetchedSessions = rawSessions.filter(s => Boolean(s.completed)).map(s => {
    const d = s.startedAt ? new Date(s.startedAt) : (s.createdAt ? new Date(s.createdAt) : new Date());
    return {
      id: s.id,
      date: toDateKey(d),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      minutes: Number(s.duration) || 25,
      label: s.label || 'Pomodoro Fokus',
      timestamp: d.getTime()
    };
  });
  isSessionsHistoryFetched = true;

  renderReportSummary(statsData, cachedSummaryData, period);
}

// TIMER LOGIC
function getTabTime(tab) {
  return {
    pomodoro: settings.pomodoroTime,
    shortBreak: settings.shortBreakTime,
    longBreak: settings.longBreakTime,
  }[tab || state.currentTab] * 60;
}

function updateTabIndicator() {
  const activeTab = document.querySelector('.tab-btn.active');
  const indicator = document.getElementById('tabIndicator');
  if (activeTab && indicator) {
    const w = activeTab.offsetWidth;
    const l = activeTab.offsetLeft;
    if (w > 0) {
      indicator.style.width = w + 'px';
      indicator.style.left = l + 'px';
      indicator.style.opacity = '1';
    } else {
      setTimeout(() => {
        const retryTab = document.querySelector('.tab-btn.active');
        if (retryTab && indicator && retryTab.offsetWidth > 0) {
          indicator.style.width = retryTab.offsetWidth + 'px';
          indicator.style.left = retryTab.offsetLeft + 'px';
          indicator.style.opacity = '1';
        }
      }, 60);
    }
  }
}

function switchTab(tab) {
  triggerHaptic('light');
  releaseWakeLock();
  state.currentTab = tab;
  state.isRunning = false;
  state.endTime = null;
  clearInterval(timerInterval); timerInterval = null;
  state.timeLeft = getTabTime(tab);
  state.totalTime = state.timeLeft;

  const btn = document.getElementById('startBtn');
  btn.textContent = 'START';
  btn.className = 'btn-primary';
  document.getElementById('timerWrapper').classList.remove('running');

  ['tabPomodoro', 'tabShortBreak', 'tabLongBreak'].forEach(id => document.getElementById(id).classList.remove('active'));
  const idMap = { pomodoro: 'tabPomodoro', shortBreak: 'tabShortBreak', longBreak: 'tabLongBreak' };
  document.getElementById(idMap[tab]).classList.add('active');

  updateTabIndicator();

  document.getElementById('sessionLabel').textContent = TAB_LABELS[tab];
  updateDisplay();
  saveState();
}

let currentBackendSessionId = null;

async function createPomodoroSession(duration, label, taskId) {
  try {
    if (typeof post !== 'function') return null;
    const body = {
      duration: duration || 25,
      label: label || 'Umumiy fokus'
    };
    if (taskId && typeof taskId === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(taskId)) {
      body.taskId = taskId;
    }
    const res = await post('/api/sessions', body);
    if (res && res.id) {
      currentBackendSessionId = res.id;
    }
    return res;
  } catch (err) {
    console.warn('createPomodoroSession API error:', err);
    throw err;
  }
}

async function completePomodoroSession(duration, label, taskId) {
  try {
    if (typeof post !== 'function') return null;
    if (!currentBackendSessionId) {
      const started = await createPomodoroSession(duration, label, taskId);
      if (started && started.id) {
        currentBackendSessionId = started.id;
      }
    }
    if (currentBackendSessionId) {
      const res = await post(`/api/sessions/${currentBackendSessionId}/complete`);
      currentBackendSessionId = null;
      if (typeof clearReportCache === 'function') clearReportCache();
      return res;
    }
  } catch (err) {
    console.warn('completePomodoroSession API error:', err);
    currentBackendSessionId = null;
    throw err;
  }
}

window.createPomodoroSession = createPomodoroSession;
window.completePomodoroSession = completePomodoroSession;

function toggleTimer() {
  const isStarting = !state.isRunning;

  if (isStarting && state.currentTab === 'pomodoro') {
    if (state.timeLeft <= 0) {
      state.timeLeft = getTabTime('pomodoro');
      state.totalTime = state.timeLeft;
    }
    // Asynchronous non-blocking background session start
    if (state.timeLeft === state.totalTime && typeof createPomodoroSession === 'function') {
      if (typeof isLoggedIn === 'function' && isLoggedIn()) {
        const activeTask = getActiveTask();
        createPomodoroSession(settings.pomodoroTime, getActiveTaskLabel(), activeTask ? activeTask.id : null).catch(error => {
          console.warn('Pomodoro backend session start skipped/failed:', error);
        });
      }
    }
  }

  if (isStarting) {
    playStartSound();
    triggerHaptic('medium');
    requestWakeLock();
  } else {
    playResetSound();
    triggerHaptic('light');
    releaseWakeLock();
  }

  state.isRunning = isStarting;
  const btn = document.getElementById('startBtn');
  if (state.isRunning) {
    state.endTime = Date.now() + state.timeLeft * 1000;
    if (btn) {
      btn.textContent = 'PAUSE';
      btn.className = 'btn-pause';
    }
    document.getElementById('timerWrapper')?.classList.add('running');
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tick, 1000);
  } else {
    state.endTime = null;
    if (btn) {
      btn.textContent = state.timeLeft < state.totalTime ? 'RESUME' : 'START';
      btn.className = 'btn-primary';
    }
    document.getElementById('timerWrapper')?.classList.remove('running');
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
  saveState();
}

function triggerLogoSpin() {
  document.querySelectorAll('.logo-img').forEach(img => {
    img.classList.remove('is-spinning');
    void img.offsetWidth;
    img.classList.add('is-spinning');
    setTimeout(() => img.classList.remove('is-spinning'), 1300);
  });
}

async function tick() {
  if (state.endTime) {
    const remaining = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
    const elapsedSeconds = state.timeLeft - remaining;
    if (elapsedSeconds > 0 && state.currentTab === 'pomodoro') {
      state.totalFocusTime += elapsedSeconds;
    }
    state.timeLeft = remaining;
  } else {
    state.timeLeft--;
    if (state.currentTab === 'pomodoro') state.totalFocusTime++;
  }
  updateDisplay();
  saveState();

  if (state.timeLeft <= 0) {
    clearInterval(timerInterval); timerInterval = null;
    state.isRunning = false;
    state.endTime = null;
    document.getElementById('timerWrapper').classList.remove('running');
    triggerHaptic('success');
    triggerLogoSpin();
    releaseWakeLock();

    if (isYtReady && lofiPlaying) {
      const originalVol = document.getElementById('lofiVolume').value;
      ytPlayer.setVolume(originalVol * 0.2); // Drop to 20%
      setTimeout(() => {
        if (isYtReady && lofiPlaying) ytPlayer.setVolume(originalVol);
      }, 4500); // Restore after alarm
    }

    playAlarm(settings.alarmSound, settings.volume);

    if (state.currentTab === 'pomodoro') {
      const activeTask = getActiveTask();
      const sessionLabel = activeTask ? activeTask.text : 'Umumiy fokus';
      const isLoggedInUser = typeof isLoggedIn === 'function' && isLoggedIn();
      const durationMins = Math.max(1, Math.round((state.totalTime || (settings.pomodoroTime * 60)) / 60));

      if (isLoggedInUser && typeof completePomodoroSession === 'function') {
        try {
          await completePomodoroSession(durationMins, sessionLabel, activeTask ? activeTask.id : null);
          if (typeof clearReportCache === 'function') clearReportCache();
          if (typeof loadReportData === 'function') loadReportData(currentReportPeriod, true).catch(() => {});
          document.dispatchEvent(new CustomEvent('pomodoroCompleted'));
        } catch (error) {
          console.warn('Pomodoro backend session complete failed:', error);
          recordPomodoroCompletion(durationMins, sessionLabel);
          if (typeof loadReportData === 'function') loadReportData(currentReportPeriod, true).catch(() => {});
          document.dispatchEvent(new CustomEvent('pomodoroCompleted'));
          if (typeof showAlert === 'function') {
            showAlert({
              icon: '⚠️',
              title: 'Serverga saqlashda xatolik',
              text: 'Pomodoro yakunlandi, lekin serverga saqlashda tarmoq xatoligi yuz berdi. Sessiya lokal saqlandi va aloqa tiklanganda sinxronizatsiya qilinadi.',
              confirmText: 'Tushunarli'
            });
          }
        }
      } else {
        recordPomodoroCompletion(durationMins, sessionLabel);
        if (typeof loadReportData === 'function') loadReportData(currentReportPeriod, true).catch(() => {});
        document.dispatchEvent(new CustomEvent('pomodoroCompleted'));
      }

      if (activeTask) {
        activeTask.act = (activeTask.act || 0) + 1;
        showToast(`"${activeTask.text}" vazifasi uchun +1 Pomodoro vaqti saqlandi!`, 3500);
        updateActiveTaskBar();
        saveTasks();
        renderTasks();
      }

      state.sessionsCompleted++;
      const target = state.pomTarget || 4;
      const cyclePos = state.sessionsCompleted % target;
      const animIdx = (cyclePos === 0 ? target : cyclePos) - 1;
      renderPomDots(animIdx);
      setTimeout(() => renderPomDots(), 2000);

      if (state.sessionsCompleted > 0 && state.sessionsCompleted % target === 0) {
        switchTab('longBreak');
      } else {
        switchTab('shortBreak');
      }
    } else {
      switchTab('pomodoro');
      renderPomDots();
    }

    saveState();
  }
}

function resetTimer() {
  playResetSound();
  triggerHaptic('light');
  releaseWakeLock();
  if (state.currentTab === 'pomodoro' && typeof cancelPomodoro === 'function') {
    cancelPomodoro();
  }
  clearInterval(timerInterval); timerInterval = null;
  state.isRunning = false;
  state.endTime = null;
  state.timeLeft = getTabTime();
  state.totalTime = state.timeLeft;
  const btn = document.getElementById('startBtn');
  btn.textContent = 'START';
  btn.className = 'btn-primary';
  document.getElementById('timerWrapper').classList.remove('running');
  document.getElementById('sessionLabel').textContent = TAB_LABELS[state.currentTab];
  updateDisplay();
  saveState();
}

function updateDisplay() {
  const min = Math.floor(state.timeLeft / 60);
  const sec = state.timeLeft % 60;
  document.getElementById('timerDisplay').textContent =
    String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');

  const totalMin = Math.floor(state.totalFocusTime / 60);
  const totalFocusEl = document.getElementById('totalFocus');
  if (totalFocusEl) {
    if (totalMin < 60) {
      totalFocusEl.textContent = `${totalMin}m`;
    } else {
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      totalFocusEl.textContent = m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
  }
  document.getElementById('sessionsCompleted').textContent = state.sessionsCompleted;

  const target = state.pomTarget || 4;
  const cyclePos = state.sessionsCompleted % target;
  const currentCycleCompleted = (state.sessionsCompleted > 0 && cyclePos === 0) ? target : cyclePos;
  const targetEl = document.getElementById('targetStat');
  if (targetEl) targetEl.textContent = `${currentCycleCompleted} / ${target}`;

  const activeDaysEl = document.getElementById('activeDaysStat') || document.getElementById('streakStat');
  if (activeDaysEl) {
    const localStats = getLocalHistoryStats();
    const backendSessions = currentFetchedSessions || [];
    const allDates = new Set();

    if (Array.isArray(backendSessions)) {
      backendSessions.forEach(s => { if (s.date) allDates.add(s.date); });
    }
    if (localStats.uniqueDates) {
      localStats.uniqueDates.forEach(d => allDates.add(d));
    }

    if (state.totalFocusTime > 0 || state.sessionsCompleted > 0) {
      allDates.add(toDateKey(new Date()));
    }

    const finalActiveDays = Math.max(allDates.size, (state.totalFocusTime > 0 || state.sessionsCompleted > 0) ? 1 : 0);
    activeDaysEl.textContent = `${finalActiveDays} Kun`;
  }
}

// POMODORO DOTS
function renderPomDots(animateIndex = -1) {
  const container = document.getElementById('pomDots');
  if (!container) return;

  const target = state.pomTarget || 4;
  const cyclePos = state.sessionsCompleted % target;
  const currentCycleCompleted = (state.sessionsCompleted > 0 && cyclePos === 0) ? target : cyclePos;

  let html = '';
  for (let i = 0; i < target; i++) {
    let classes = ['pom-dot'];
    if (i < currentCycleCompleted) {
      classes.push('done');
      if (i === animateIndex) classes.push('just-done');
    } else if (i === currentCycleCompleted && currentCycleCompleted < target) {
      classes.push('current');
    }
    html += `<div class="${classes.join(' ')}"></div>`;
  }
  container.innerHTML = html;
}

// TASKS
async function clearFinishedTasks() {
  const finished = state.tasks.filter(t => t.done).length;
  if (!finished) return;
  const ok = await showConfirmDialog({
    icon: '',
    title: 'Bajarilganlarni tozalash',
    text: `${finished} ta bajarilgan vazifa o'chiriladi. Davom etilsinmi?`,
    confirmText: 'Tozalash',
    cancelText: 'Bekor qilish'
  });
  if (!ok) return;
  state.tasks = state.tasks.filter(t => !t.done);
  renderTasks(); saveTasks();
}

async function clearAllTasks() {
  if (!state.tasks.length) return;
  const ok = await showConfirmDialog({
    icon: '',
    title: 'Hammasini o\'chirish',
    text: `${state.tasks.length} ta vazifaning barchasi o'chiriladi. Davom etilsinmi?`,
    confirmText: 'Hammasini o\'chirish',
    cancelText: 'Bekor qilish'
  });
  if (!ok) return;
  state.tasks = [];
  renderTasks(); saveTasks();
}

function truncateTaskText(text, maxWords = 3, maxChars = 20) {
  if (!text) return '';
  const trimmed = String(text).trim();
  const words = trimmed.split(/\s+/);
  
  if (words.length > maxWords) {
    const wordTruncated = words.slice(0, maxWords).join(' ');
    if (wordTruncated.length <= maxChars) {
      return wordTruncated + '...';
    }
  }
  
  if (trimmed.length > maxChars) {
    return trimmed.substring(0, maxChars).trim() + '...';
  }
  
  return trimmed;
}

let activeTaskId = null;

function getActiveTask() {
  if (!activeTaskId) return null;
  return state.tasks.find(t => t.id === activeTaskId || String(t.id) === String(activeTaskId)) || null;
}

function updateActiveTaskBar() {
  const cardEl = document.getElementById('activeTaskBar');
  const badgeTextEl = document.getElementById('activeTaskBadgeText');
  const nameEl = document.getElementById('activeTaskName');
  const detachBtn = document.getElementById('detachTaskBtn');
  const fsLabel = document.getElementById('fullscreenTaskLabel');
  const activeTask = getActiveTask();

  if (activeTask && !activeTask.done) {
    if (cardEl) cardEl.classList.add('has-active-task');
    if (badgeTextEl) badgeTextEl.textContent = 'Fokusda';
    if (nameEl) {
      nameEl.textContent = activeTask.text;
      nameEl.title = activeTask.text;
    }
    if (detachBtn) detachBtn.classList.remove('is-hidden');
    if (fsLabel) {
      fsLabel.textContent = activeTask.text;
      fsLabel.title = activeTask.text;
      fsLabel.classList.add('has-task');
    }
  } else {
    activeTaskId = null;
    if (cardEl) cardEl.classList.remove('has-active-task');
    if (badgeTextEl) badgeTextEl.textContent = 'Biriktirilmagan';
    if (nameEl) {
      nameEl.textContent = 'Joriy taymer uchun vazifa biriktiring';
      nameEl.removeAttribute('title');
    }
    if (detachBtn) detachBtn.classList.add('is-hidden');
    if (fsLabel) {
      fsLabel.textContent = '';
      fsLabel.removeAttribute('title');
      fsLabel.classList.remove('has-task');
    }
  }
}

function selectActiveTask(taskId) {
  activeTaskId = taskId;
  if (taskId) {
    localStorage.setItem('pomodo_active_task_id', String(taskId));
  } else {
    localStorage.removeItem('pomodo_active_task_id');
  }
  updateActiveTaskBar();
  renderTaskPickerList();
  renderTasks();
}

function unselectActiveTask() {
  activeTaskId = null;
  localStorage.removeItem('pomodo_active_task_id');
  updateActiveTaskBar();
  renderTaskPickerList();
  renderTasks();
}

function renderTaskPickerList() {
  const container = document.getElementById('taskPickerList');
  if (!container) return;

  const pendingTasks = state.tasks.filter(t => !t.done);
  if (!pendingTasks.length) {
    container.innerHTML = '<div class="task-empty" style="font-size: 13px;">Vazifalar yo\'q. Yangi vazifa qo\'shing!</div>';
    return;
  }

  container.innerHTML = pendingTasks.map(t => {
    const isSelected = activeTaskId === t.id || String(activeTaskId) === String(t.id);
    return `
      <div class="task-picker-item ${isSelected ? 'is-selected' : ''}" data-select-task-id="${t.id}" title="${escHtml(t.text)}">
        <span class="task-picker-item-title">${escHtml(t.text)}</span>
      </div>
    `;
  }).join('');
}

let expandedTaskId = null;
let editingTaskId = null;

function toggleTaskExpand(taskId) {
  if (editingTaskId === taskId) return;
  expandedTaskId = expandedTaskId === taskId ? null : taskId;
  triggerHaptic('light');
  renderTasks();
}

function startTaskEdit(taskId, e) {
  if (e) e.stopPropagation();
  const task = state.tasks.find(t => t.id === taskId || String(t.id) === String(taskId));
  if (!task) return;

  editingTaskId = taskId;
  triggerHaptic('light');

  const input = byId('quickTaskInput');
  const card = byId('taskTextareaCard');
  const btnText = byId('quickAddTaskBtnText');
  const cancelBtn = byId('cancelEditTaskBtn');
  const charCounter = byId('taskCharCount');

  if (input) {
    input.value = task.text;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    if (charCounter) charCounter.textContent = `${task.text.length} / 31`;
  }

  if (btnText) btnText.textContent = 'Saqlash';
  if (cancelBtn) cancelBtn.style.display = 'inline-block';
  if (card) {
    card.classList.add('is-editing-mode');
  }

  renderTasks();

  const container = document.querySelector('.task-view-container');
  if (container) {
    container.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (input) {
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 100);
  }
}

function cancelTaskEdit(e) {
  if (e) e.stopPropagation();
  editingTaskId = null;

  const input = byId('quickTaskInput');
  const card = byId('taskTextareaCard');
  const btnText = byId('quickAddTaskBtnText');
  const cancelBtn = byId('cancelEditTaskBtn');
  const charCounter = byId('taskCharCount');

  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }
  if (charCounter) charCounter.textContent = '0 / 31';
  if (btnText) btnText.textContent = 'Qo\'shish';
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (card) card.classList.remove('is-editing-mode');

  renderTasks();
}

// Make functions globally available for inline onclick handlers
window.toggleTaskExpand = toggleTaskExpand;
window.startTaskEdit = startTaskEdit;
window.cancelTaskEdit = cancelTaskEdit;

function updateTasksCountBadge() {
  const badge = document.getElementById('tasksCountBadge');
  if (!badge) return;
  const doneCount = state.tasks ? state.tasks.filter(t => t.done).length : 0;
  const totalCount = state.tasks ? state.tasks.length : 0;
  badge.textContent = `${doneCount} / ${totalCount}`;
}

function renderTasks() {
  const list = document.getElementById('taskList');
  if (!state.tasks) state.tasks = [];
  updateTasksCountBadge();

  if (!list) return;

  if (!state.tasks.length) {
    list.innerHTML = `
      <div class="task-empty" style="padding: 16px 8px; border: none; background: transparent; min-height: auto; font-size: 14px;">
        <p style="color: var(--text-sub); margin: 0;">Hali vazifalar mavjud emas. Yangi vazifa qo'shish uchun "+ Vazifa qo'shish" tugmasini bosing.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = state.tasks.map((t, i) => {
    if (!t.id) t.id = 'task_' + i + '_' + Date.now();

    return `
      <div class="notion-task-row ${t.done ? 'done' : ''}" data-task-id="${t.id}">
        <button class="notion-task-checkbox ${t.done ? 'checked' : ''}" data-task-toggle="${i}" type="button" title="${t.done ? 'Qayta tiklash' : 'Bajarildi deb belgilash'}">
          ${t.done ? '<svg class="notion-task-checkbox-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </button>
        <textarea class="notion-task-input" placeholder="Vazifa nomi..." data-task-input-index="${i}" autocomplete="off" rows="1">${escHtml(t.text || '')}</textarea>
        ${(t.act && t.act > 0) ? `<span class="notion-task-count-badge" style="font-size:12px; opacity:0.85; margin-right:8px; display:inline-flex; align-items:center; gap:2px; white-space:nowrap; font-weight:600; color:var(--accent);" title="${t.act} ta pomodoro bajarilgan"> ${t.act}</span>` : ''}
        <button class="notion-task-delete-btn" data-task-remove="${i}" type="button" title="O'chirish">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.notion-task-input').forEach(ta => autoAdjustTextareaHeight(ta));
}

function autoAdjustTextareaHeight(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function addNewNotionTask(focusNew = true, insertAfterIndex = -1) {
  if (!(typeof isLoggedIn === 'function' && isLoggedIn())) {
    showGuestLockModal("Vazifa qo'shish");
    return;
  }
  if (!state.tasks) state.tasks = [];
  const newTask = {
    id: 'task_' + Date.now(),
    text: '',
    done: false
  };

  if (insertAfterIndex >= 0 && insertAfterIndex < state.tasks.length) {
    state.tasks.splice(insertAfterIndex + 1, 0, newTask);
  } else {
    state.tasks.push(newTask);
  }

  const targetIndex = insertAfterIndex >= 0 ? insertAfterIndex + 1 : state.tasks.length - 1;

  renderTasks();
  saveTasks();

  if (focusNew) {
    setTimeout(() => {
      const input = document.querySelector(`.notion-task-input[data-task-input-index="${targetIndex}"]`);
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 20);
  }
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toggleTask(i) {
  const task = state.tasks[i];
  if (!task) return;
  task.done = !task.done;
  if (task.done && (activeTaskId === task.id || String(activeTaskId) === String(task.id))) {
    unselectActiveTask();
  }
  renderTasks(); saveTasks();
}

function removeTask(i, focusPrevious = false) {
  const task = state.tasks[i];
  if (task && (activeTaskId === task.id || String(activeTaskId) === String(task.id))) {
    unselectActiveTask();
  }
  state.tasks.splice(i, 1);
  renderTasks(); saveTasks();

  if (focusPrevious) {
    const prevIndex = Math.max(0, i - 1);
    setTimeout(() => {
      const prevInput = document.querySelector(`.notion-task-input[data-task-input-index="${prevIndex}"]`);
      if (prevInput) {
        prevInput.focus();
        prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
      }
    }, 20);
  }
}

function getActiveTaskLabel() {
  const activeTask = getActiveTask();
  return activeTask ? activeTask.text : 'Umumiy fokus';
}

let savedBodyScrollY = 0;

function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;

  if (id === 'reportModal') {
    switchReportPeriod('summary');
    renderReportView();
  }
  if (id === 'accountModal') {
    populateAccountModal().then(() => {
      setTimeout(() => {
        document.getElementById('accountNameInput')?.focus();
      }, 120);
    });
  }
  if (id === 'settingsModal') {
    populateSettings();
    const content = document.querySelector('#settingsModal .modal-content');
    if (content) content.scrollTop = 0;
  }
  if (id === 'pomModal') {
    state.pomTempTarget = state.pomTarget;
    document.getElementById('pomPickerVal').textContent = state.pomTempTarget;
    updatePomTimeHint();
  }
  if (id === 'addTaskModal') {
    document.getElementById('taskModalInput').value = '';
    setTimeout(() => document.getElementById('taskModalInput').focus(), 120);
  }

  const content = overlay.querySelector('.modal-content');
  if (content) {
    content.classList.remove('closing');
    content.style.transform = '';
    content.style.transition = '';
  }
  overlay.style.opacity = '';

  overlay.classList.add('open');
  if (!document.body.classList.contains('modal-open')) {
    savedBodyScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedBodyScrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
  }
  if (typeof updateTelegramBackButton === 'function') {
    updateTelegramBackButton();
  }
}

window.openModal = openModal;
window.closeModal = closeModal;

document.addEventListener('focusin', (e) => {
  const modalOverlay = e.target.closest('.modal-overlay');
  if (modalOverlay && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
    modalOverlay.classList.add('keyboard-open');
    const content = modalOverlay.querySelector('.modal-content');
    if (content) {
      content.classList.add('is-input-focused');
      setTimeout(() => {
        try {
          e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (err) {}
      }, 100);
    }
  }
});

document.addEventListener('focusout', (e) => {
  const modalOverlay = e.target.closest('.modal-overlay');
  if (modalOverlay) {
    modalOverlay.classList.remove('keyboard-open');
    const content = modalOverlay.querySelector('.modal-content');
    if (content) {
      content.classList.remove('is-input-focused');
    }
  }
});

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay || !overlay.classList.contains('open')) return;

  const content = overlay.querySelector('.modal-content');
  const isMobile = window.innerWidth <= 768;

  if (isMobile && content) {
    content.classList.add('closing');
    content.style.transform = 'translate3d(0, 100%, 0)';
    setTimeout(() => {
      overlay.classList.remove('open');
      content.classList.remove('closing');
      content.style.transform = '';
      content.style.transition = '';
      overlay.style.opacity = '';
      finishCloseModal();
    }, 220);
  } else {
    overlay.classList.remove('open');
    if (content) {
      content.style.transform = '';
      content.style.transition = '';
    }
    overlay.style.opacity = '';
    finishCloseModal();
  }
}

function finishCloseModal() {
  if (!document.querySelector('.modal-overlay.open')) {
    document.body.classList.remove('modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(0, savedBodyScrollY);
  }
  if (typeof updateTelegramBackButton === 'function') {
    updateTelegramBackButton();
  }
}

// GLOBAL NON-PASSIVE TOUCHMOVE LISTENER TO 100% PREVENT BACKGROUND SCROLL ON MOBILE
document.addEventListener('touchmove', (e) => {
  const activeOverlay = document.querySelector('.modal-overlay.open');
  if (!activeOverlay) return;

  const content = activeOverlay.querySelector('.modal-content');
  if (!content) {
    if (e.cancelable) e.preventDefault();
    return;
  }

  const isInsideContent = content.contains(e.target);
  if (!isInsideContent) {
    // Touch is on backdrop or outside modal content -> 100% PREVENT background scroll!
    if (e.cancelable) e.preventDefault();
    return;
  }

  // If keyboard is open or an input is focused, prevent bottom sheet drag & background propagation
  if (activeOverlay.classList.contains('keyboard-open') || document.activeElement?.closest('.modal-content') === content) {
    e.stopPropagation();
  }
}, { passive: false });

function initBottomSheetGestures() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    const content = overlay.querySelector('.modal-content');
    const handle = overlay.querySelector('.bottom-sheet-handle');
    if (!content) return;

    let startY = 0;
    let currentY = 0;
    let startTime = 0;
    let isDragging = false;
    let dragOnHandle = false;
    let animationFrameId = null;

    overlay.addEventListener('touchstart', (e) => {
      if (e.target === overlay) {
        e.stopPropagation();
      }
    }, { passive: true });

    const onTouchStart = (e) => {
      if (window.innerWidth > 768) return;
      if (overlay.classList.contains('keyboard-open') || document.activeElement?.closest('.modal-content') === content) {
        return;
      }
      const touch = e.touches[0];
      startY = touch.clientY;
      currentY = startY;
      startTime = Date.now();
      isDragging = false;
      dragOnHandle = handle && (e.target === handle || handle.contains(e.target));
      if (dragOnHandle) {
        e.stopPropagation();
      }
    };

    const onTouchMove = (e) => {
      if (window.innerWidth > 768) return;
      if (overlay.classList.contains('keyboard-open') || document.activeElement?.closest('.modal-content') === content) {
        return;
      }
      const touch = e.touches[0];
      const deltaY = touch.clientY - startY;
      const isTop = content.scrollTop <= 0;

      if (dragOnHandle || (isTop && deltaY > 0)) {
        if (e.cancelable) {
          e.preventDefault();
        }
        e.stopPropagation();

        if (!isDragging && deltaY > 3) {
          isDragging = true;
          content.style.transition = 'none';
          content.style.willChange = 'transform';
        }

        if (isDragging) {
          currentY = touch.clientY;
          if (animationFrameId) cancelAnimationFrame(animationFrameId);
          animationFrameId = requestAnimationFrame(() => {
            const dragAmount = Math.max(0, currentY - startY);
            content.style.transform = `translate3d(0, ${dragAmount}px, 0)`;
          });
        }
      }
    };

    const onTouchEnd = () => {
      if (window.innerWidth > 768 || !isDragging) return;
      isDragging = false;
      dragOnHandle = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);

      const deltaY = currentY - startY;
      const deltaTime = Math.max(1, Date.now() - startTime);
      const velocityY = deltaY / deltaTime;

      content.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';

      if (deltaY > 90 || (deltaY > 30 && velocityY > 0.45)) {
        triggerHaptic('light');
        content.style.transform = 'translate3d(0, 100%, 0)';
        setTimeout(() => {
          closeModal(overlay.id);
          content.style.willChange = '';
        }, 180);
      } else {
        content.style.transform = 'translate3d(0, 0, 0)';
        setTimeout(() => {
          content.style.transition = '';
          content.style.willChange = '';
        }, 220);
      }
    };

    content.addEventListener('touchstart', onTouchStart, { passive: true });
    content.addEventListener('touchmove', onTouchMove, { passive: false });
    content.addEventListener('touchend', onTouchEnd, { passive: true });
    content.addEventListener('touchcancel', onTouchEnd, { passive: true });
  });
}

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('mousedown', e => { if (e.target === o) closeModal(o.id); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const openModals = document.querySelectorAll('.modal-overlay.open');
    if (openModals.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      openModals.forEach(m => closeModal(m.id));
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    if (document.getElementById('addTaskModal').classList.contains('open')) {
      e.preventDefault(); addTaskFromModal();
    } else if (document.getElementById('settingsModal').classList.contains('open')) {
      e.preventDefault(); saveSettings();
    } else if (document.getElementById('pomModal').classList.contains('open')) {
      e.preventDefault(); savePomTarget();
    } else if (document.getElementById('accountModal').classList.contains('open')) {
      e.preventDefault(); saveAccount();
    }
  }
});

function addTaskFromModal() {
  const input = document.getElementById('taskModalInput');
  const text = input.value.trim();
  if (!text) return;
  state.tasks.push({ text, done: false });
  input.value = '';
  renderTasks(); saveTasks();
  closeModal('addTaskModal');
}

// POMODORO PICKER
function changePomTarget(d) {
  playClockTickSound();
  triggerHaptic('light');
  if (state.pomTempTarget === undefined) state.pomTempTarget = state.pomTarget || 4;
  state.pomTempTarget = Math.max(1, Math.min(20, state.pomTempTarget + d));
  const valEl = document.getElementById('pomPickerVal');
  if (valEl) valEl.textContent = state.pomTempTarget;
  updatePomTimeHint();
}

function updatePomTimeHint() {
  const currentTarget = state.pomTempTarget || state.pomTarget || 4;
  const mins = currentTarget * (settings.pomodoroTime || 25);
  const h = Math.floor(mins / 60), m = mins % 60;
  const hintEl = document.getElementById('pomPickerTime');
  if (hintEl) {
    hintEl.textContent = '= ~' + (h > 0 ? h + ' soat ' : '') + m + ' daqiqa fokus';
  }
}

function savePomTarget() {
  if (state.pomTempTarget !== undefined && !isNaN(state.pomTempTarget)) {
    state.pomTarget = Math.max(1, Math.min(20, state.pomTempTarget));
  } else {
    state.pomTarget = state.pomTarget || 4;
  }
  state.pomTempTarget = state.pomTarget;
  state.sessionsCompleted = 0;
  renderPomDots();
  updateDisplay();
  saveState();
  closeModal('pomModal');
  showToast(`Pomodoro maqsadi ${state.pomTarget} ta qilib o'zgartirildi (0/${state.pomTarget})!`, 2500);
}

// SETTINGS
function populateSettings() {
  const setPom = document.getElementById('setPomodoro');
  const setShort = document.getElementById('setShortBreak');
  const setLong = document.getElementById('setLongBreak');
  if (setPom) setPom.value = settings.pomodoroTime;
  if (setShort) setShort.value = settings.shortBreakTime;
  if (setLong) setLong.value = settings.longBreakTime;
  const volSlider = document.getElementById('volumeSlider');
  if (volSlider) {
    volSlider.value = settings.volume;
    volSlider.style.setProperty('--settings-vol-percent', `${settings.volume}%`);
  }
  const volLbl = document.getElementById('volLabel');
  if (volLbl) volLbl.textContent = settings.volume + '%';
  renderSoundGrid();
  updateThemeUI(localStorage.getItem('pomodo_theme') || 'neumorphism');
}

let activePreviewSoundId = null;
let soundPreviewTimer = null;

function playSoundPreview(id) {
  activePreviewSoundId = id;
  renderSoundGrid();
  playAlarm(id);

  if (soundPreviewTimer) clearTimeout(soundPreviewTimer);
  soundPreviewTimer = setTimeout(() => {
    activePreviewSoundId = null;
    renderSoundGrid();
  }, 2400);
}

function renderSoundGrid() {
  const grid = document.getElementById('soundGrid');
  if (!grid) return;
  grid.innerHTML = SOUNDS.map(s => {
    const isSelected = settings.alarmSound === s.id;
    const isPlaying = activePreviewSoundId === s.id;
    return `
      <div class="sound-card ${isSelected ? 'selected' : ''} ${isPlaying ? 'is-playing' : ''}" data-sound-id="${s.id}">
        <div class="sound-card-left">
          <span class="sound-icon">${s.icon}</span>
          <span class="sound-name">${escHtml(s.name)}</span>
        </div>
        <button class="sound-preview-btn ${isPlaying ? 'playing' : ''}" data-sound-preview="${s.id}" type="button" title="Eshitib ko'rish">
          ${isPlaying ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>'}
        </button>
      </div>
    `;
  }).join('');
}

function selectSound(id, autoPlayPreview = true) {
  settings.alarmSound = id;
  try {
    localStorage.setItem('pomodo_settings', JSON.stringify(settings));
  } catch (e) {}
  if (autoPlayPreview) {
    playSoundPreview(id);
  } else {
    renderSoundGrid();
  }
}

function updateVolLabel() {
  const volSlider = document.getElementById('volumeSlider');
  if (!volSlider) return;
  const val = Math.max(0, Math.min(100, parseInt(volSlider.value) || 0));
  settings.volume = val;
  volSlider.style.setProperty('--settings-vol-percent', `${val}%`);
  const volLbl = document.getElementById('volLabel');
  if (volLbl) volLbl.textContent = val + '%';
  try {
    localStorage.setItem('pomodo_settings', JSON.stringify(settings));
  } catch (e) {}
}

function saveSettings() {
  const setPom = document.getElementById('setPomodoro');
  const setShort = document.getElementById('setShortBreak');
  const setLong = document.getElementById('setLongBreak');
  if (setPom) {
    const val = Math.max(1, Math.min(60, parseInt(setPom.value) || 25));
    settings.pomodoroTime = val;
    setPom.value = val;
  }
  if (setShort) {
    const val = Math.max(1, Math.min(30, parseInt(setShort.value) || 5));
    settings.shortBreakTime = val;
    setShort.value = val;
  }
  if (setLong) {
    const val = Math.max(1, Math.min(60, parseInt(setLong.value) || 15));
    settings.longBreakTime = val;
    setLong.value = val;
  }
  const volSlider = document.getElementById('volumeSlider');
  if (volSlider) settings.volume = parseInt(volSlider.value);
  localStorage.setItem('pomodo_settings', JSON.stringify(settings));
  if (!state.isRunning && state.timeLeft === state.totalTime) {
    state.timeLeft = getTabTime();
    state.totalTime = state.timeLeft;
    updateDisplay();
  }
  showToast("Sozlamalar saqlandi! ⚙️", 2000);
}

// PERSISTENCE
function saveState() {
  localStorage.setItem('pomodo_state', JSON.stringify({
    sessionsCompleted: state.sessionsCompleted,
    totalFocusTime: state.totalFocusTime,
    pomTarget: state.pomTarget,
    currentTab: state.currentTab,
    timeLeft: state.timeLeft,
    totalTime: state.totalTime,
    isRunning: state.isRunning,
    endTime: state.endTime,
    date: new Date().toDateString(),
  }));
}

let taskSyncDebounceTimer = null;

async function syncTasksWithBackend() {
  if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return;

  if (taskSyncDebounceTimer) {
    clearTimeout(taskSyncDebounceTimer);
  }

  taskSyncDebounceTimer = setTimeout(async () => {
    try {
      const payload = {
        tasks: (state.tasks || []).map((t, index) => {
          const isUuid = typeof t.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.id);
          return {
            id: isUuid ? t.id : null,
            text: t.text || '',
            done: !!t.done,
            position: index
          };
        })
      };

      const updatedRemoteTasks = await post('/api/tasks/sync', payload);
      if (Array.isArray(updatedRemoteTasks)) {
        state.tasks = updatedRemoteTasks.map(rt => ({
          id: rt.id,
          text: rt.text || '',
          done: !!rt.done
        }));
        localStorage.setItem('pomodo_tasks', JSON.stringify(state.tasks));
      }
    } catch (err) {
      console.warn('Backend task sync error:', err);
    }
  }, 300);
}

function computeTasksHash(tasksList) {
  if (!Array.isArray(tasksList)) return '';
  return tasksList.map(t => `${t.id || ''}:${t.text || ''}:${!!t.done}`).join('|');
}

async function fetchServerTasks() {
  if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return;
  try {
    const remoteTasks = await get('/api/tasks');
    if (Array.isArray(remoteTasks)) {
      const mapped = remoteTasks.map(t => ({
        id: t.id,
        text: t.text || '',
        done: !!t.done
      }));

      const currentHash = computeTasksHash(state.tasks);
      const remoteHash = computeTasksHash(mapped);

      if (currentHash !== remoteHash) {
        state.tasks = mapped;
        localStorage.setItem('pomodo_tasks', JSON.stringify(state.tasks));
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof updateActiveTaskBar === 'function') updateActiveTaskBar();
      }
    }
  } catch (err) {
    console.warn('Failed to load server tasks:', err);
  }
}

function saveTasks() {
  if (typeof isLoggedIn === 'function' && isLoggedIn()) {
    localStorage.setItem('pomodo_tasks', JSON.stringify(state.tasks));
    if (activeTaskId) {
      localStorage.setItem('pomodo_active_task_id', String(activeTaskId));
    } else {
      localStorage.removeItem('pomodo_active_task_id');
    }
    syncTasksWithBackend();
  } else {
    localStorage.removeItem('pomodo_tasks');
    localStorage.removeItem('pomodo_active_task_id');
  }
}

let lastBugReportTime = 0;

function openBugReportModal() {
  toggleProfileMenu(false);

  const desc = document.getElementById('bugReportDescription');
  if (desc) desc.value = '';

  const nameEl = document.getElementById('bugReportUserName');
  const phoneEl = document.getElementById('bugReportUserPhone');
  const tgIdEl = document.getElementById('bugReportUserTgId');

  const user = currentUser || {};
  let fullName = user.firstName || user.name || user.username || 'Foydalanuvchi';
  if (user.lastName) fullName += ' ' + user.lastName;

  if (nameEl) nameEl.textContent = `Foydalanuvchi: ${fullName}`;
  if (phoneEl) phoneEl.textContent = `Tel: ${user.phoneNumber || 'Kiritilmagan'}`;
  if (tgIdEl) tgIdEl.textContent = user.telegramId || user.id || 'Noma\'lum';

  openModal('bugReportModal');
}

async function sendBugReport() {
  const categorySelect = document.getElementById('bugReportCategory');
  const descTextarea = document.getElementById('bugReportDescription');
  const sendBtn = document.getElementById('sendBugReportBtn');

  const category = categorySelect ? categorySelect.value : 'Taymer ishlashida xatolik';
  const description = descTextarea ? descTextarea.value.trim() : '';

  if (!description || description.length < 2) {
    showToast("Iltimos, xato haqida batafsil tavsif yozing!", 3000);
    if (descTextarea) descTextarea.focus();
    return;
  }

  const now = Date.now();
  if (now - lastBugReportTime < 5000) {
    showToast("Iltimos, bir oz kutib qayta urining.", 2500);
    return;
  }

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span>Yuborilmoqda...</span>';
  }

  try {
    const payload = {
      category: category,
      description: description,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent
    };

    let sent = false;
    if (typeof post === 'function') {
      try {
        await post('/api/feedback/bug-report', payload);
        sent = true;
      } catch (e) {
        console.warn('API bug report endpoint error, using fallback:', e);
      }
    }

    if (!sent && typeof api === 'function') {
      try {
        await api('POST', '/api/feedback/bug-report', payload);
        sent = true;
      } catch (e) {
        console.warn('API bug report endpoint error:', e);
      }
    }

    lastBugReportTime = Date.now();
    if (descTextarea) descTextarea.value = '';
    closeModal('bugReportModal');
    showToast('Xabaringiz adminga muvaffaqiyatli yetkazildi!', 3500);
    if (typeof triggerHaptic === 'function') triggerHaptic('success');
  } catch (error) {
    console.error('Bug report submit error:', error);
    if (descTextarea) descTextarea.value = '';
    closeModal('bugReportModal');
    showToast('Xabaringiz qabul qilindi! Rahmat.', 3500);
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<span>Adminga jo\'natish</span>';
    }
  }
}

function loadAll() {
  try {
    const s = JSON.parse(localStorage.getItem('pomodo_settings'));
    if (s) Object.assign(settings, s);
    if (!SOUNDS.some(snd => snd.id === settings.alarmSound)) {
      settings.alarmSound = 'chime';
    }
  } catch (e) { }
  try {
    const st = JSON.parse(localStorage.getItem('pomodo_state'));
    if (st) {
      if (st.date === new Date().toDateString()) {
        state.sessionsCompleted = st.sessionsCompleted || 0;
        state.totalFocusTime = st.totalFocusTime || 0;
      }
      state.pomTarget = st.pomTarget || 4;
      if (st.currentTab && TAB_LABELS[st.currentTab]) {
        state.currentTab = st.currentTab;
      }
      if (st.totalTime) state.totalTime = st.totalTime;

      if (st.isRunning && st.endTime && st.endTime > Date.now()) {
        state.endTime = st.endTime;
        state.timeLeft = Math.round((st.endTime - Date.now()) / 1000);
        state.isRunning = true;
        updateTelegramClosingConfirmation(true);
      } else if (st.timeLeft !== undefined && !st.isRunning) {
        state.timeLeft = st.timeLeft;
      }
    }
  } catch (e) { }

  if (typeof isLoggedIn === 'function' && isLoggedIn()) {
    try { const t = JSON.parse(localStorage.getItem('pomodo_tasks')); if (Array.isArray(t)) state.tasks = t; } catch (e) { }

    const savedActiveTaskId = localStorage.getItem('pomodo_active_task_id');
    if (savedActiveTaskId && Array.isArray(state.tasks)) {
      const found = state.tasks.find(t => t.id === savedActiveTaskId || String(t.id) === String(savedActiveTaskId));
      if (found && !found.done) {
        activeTaskId = found.id;
      } else {
        localStorage.removeItem('pomodo_active_task_id');
        activeTaskId = null;
      }
    }
    fetchServerTasks();
  } else {
    sanitizeGuestStorage();
  }
  updateActiveTaskBar();
}

// THEME LOGIC
function updateThemeColorMeta(theme) {
  const meta = document.getElementById('metaThemeColor');
  if (!meta) return;
  const themeColors = {
    'neumorphism': '#E6EAEF',
    'clay-dark': '#171921',
    'sand-sage': '#EFE7DA'
  };
  const color = themeColors[theme] || '#E6EAEF';
  meta.setAttribute('content', color);
}

function setTheme(theme) {
  // Prevent flicker: disable all transitions briefly while switching theme
  const html = document.documentElement;
  html.classList.add('no-theme-transition');
  html.setAttribute('data-theme', theme);
  localStorage.setItem('pomodo_theme', theme);
  updateThemeUI(theme);
  updateThemeColorMeta(theme);
  // Re-enable transitions after a frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      html.classList.remove('no-theme-transition');
    });
  });
}

function updateThemeUI(theme) {
  document.querySelectorAll('.theme-option').forEach(opt => {
    if (opt.getAttribute('data-theme-id') === theme) {
      opt.classList.add('active');
    } else {
      opt.classList.remove('active');
    }
  });
  updateThemeColorMeta(theme);
}

async function clearLocalStorage() {
  const confirmed = await showConfirmDialog({
    icon: '🧹',
    title: "Ma'lumotlarni tozalash",
    text: "Barcha mahalliy ma'lumotlarni o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.",
    confirmText: "O'chirish",
    cancelText: 'Bekor qilish'
  });
  if (confirmed) {
    localStorage.clear();
    location.reload();
  }
}

// LOFI PLAYER LOGIC (YOUTUBE IFRAME API)
let ytPlayer;
let lofiPlaying = false;
let isYtReady = false;
let lofiSeeking = false;
let lofiProgressInterval;

function getOrigin() {
  if (window.location.origin && window.location.origin !== 'null') return window.location.origin;
  return window.location.protocol + '//' + window.location.hostname + (window.location.port ? ':' + window.location.port : '');
}

function loadYoutubeScript() {
  if (window.YT && window.YT.Player) return;
  if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;

  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  tag.onerror = () => {
    console.error("YouTube API failed to load");
    showToast("Music Player yuklanishida xatolik. Sahifani yangilang.", 3000);
  };
  const firstScriptTag = document.getElementsByTagName('script')[0];
  if (firstScriptTag) {
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  } else {
    document.head.appendChild(tag);
  }
}

// Start loading early
loadYoutubeScript();

window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
  if (ytPlayer) return;
  ytPlayer = new YT.Player('ytplayer', {
    height: '1',
    width: '1',
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      'autoplay': 0,
      'playsinline': 1,
      'rel': 0,
      'modestbranding': 1,
      'enablejsapi': 1,
      'origin': getOrigin(),
      'listType': 'playlist',
      'list': 'PLiv5O-nkp6yIcMMKaQuRLCwGNDbgb7OER'
    },
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange,
      'onError': (e) => {
        console.error('YT Player Error:', e.data);
        isYtReady = false;
        if (e.data === 150 || e.data === 101) {
          showToast("Ushbu pleylistni ushbu saytda ijro etib bo'lmaydi.", 3000);
        }
      }
    }
  });
};

if (window.YT && window.YT.Player && !ytPlayer) {
  window.onYouTubeIframeAPIReady();
}

function syncLofiVolumeImmediately() {
  try {
    const savedVol = localStorage.getItem('pomodo_lofi_vol') ?? '50';
    const volVal = Math.max(0, Math.min(100, Math.round(Number(savedVol) || 0)));
    const slider = document.getElementById('lofiVolume');
    const label = document.getElementById('lofiVolVal');
    if (slider) {
      slider.value = volVal;
      slider.style.setProperty('--vol-percent', `${volVal}%`);
    }
    if (label) {
      label.textContent = `${volVal}%`;
    }
  } catch (e) {}
}

syncLofiVolumeImmediately();

function onPlayerReady(event) {
  isYtReady = true;
  syncLofiVolumeImmediately();
  const savedVol = localStorage.getItem('pomodo_lofi_vol') || 50;

  try {
    const iframe = typeof ytPlayer.getIframe === 'function' ? ytPlayer.getIframe() : document.getElementById('ytplayer');
    if (iframe) {
      iframe.setAttribute('allow', 'autoplay; encrypted-media; accelerometer; clipboard-write; gyroscope; picture-in-picture');
    }
  } catch (e) {}

  changeLofiVolume(savedVol);

  if (!lofiProgressInterval) {
    lofiProgressInterval = setInterval(updateLofiProgress, 1000);
  }
}

function onPlayerStateChange(event) {
  const lofiCard = document.getElementById('lofiCard');
  if (event.data == YT.PlayerState.PLAYING) {
    lofiPlaying = true;
    if (lofiCard) lofiCard.classList.add('is-playing');
    document.getElementById('lofiPlayIcon')?.classList.add('is-hidden');
    document.getElementById('lofiPauseIcon')?.classList.remove('is-hidden');
  } else {
    lofiPlaying = false;
    if (lofiCard) lofiCard.classList.remove('is-playing');
    document.getElementById('lofiPlayIcon')?.classList.remove('is-hidden');
    document.getElementById('lofiPauseIcon')?.classList.add('is-hidden');

    if (event.data == YT.PlayerState.ENDED) {
      ytPlayer.playVideoAt(0); // Loop
    }
  }
}

function toggleLofi() {
  if (!isYtReady || !ytPlayer) {
    loadYoutubeScript();
    showToast("Player yuklanmoqda... bir necha soniyadan so'ng qayta urinib ko'ring.", 3000);
    return;
  }
  try {
    if (lofiPlaying) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  } catch (e) {
    console.error("Lofi Toggle Error:", e);
  }
}

function lofiNext() {
  if (!isYtReady || !ytPlayer) return;
  ytPlayer.nextVideo();
}

function lofiPrev() {
  if (!isYtReady || !ytPlayer) return;
  ytPlayer.previousVideo();
}

let previousVolumeBeforeMute = 50;

function toggleLofiMute() {
  const slider = document.getElementById('lofiVolume');
  if (!slider) return;
  const currentVol = Number(slider.value) || 0;
  if (currentVol > 0) {
    previousVolumeBeforeMute = currentVol;
    changeLofiVolume(0);
  } else {
    changeLofiVolume(previousVolumeBeforeMute || 50);
  }
}

function changeLofiVolume(val) {
  const volVal = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
  const slider = document.getElementById('lofiVolume');
  const label = document.getElementById('lofiVolVal');

  if (slider) {
    slider.value = volVal;
    slider.style.setProperty('--vol-percent', `${volVal}%`);
  }
  if (label) label.textContent = `${volVal}%`;

  localStorage.setItem('pomodo_lofi_vol', volVal);

  if (ytPlayer) {
    try {
      if (typeof ytPlayer.unMute === 'function' && volVal > 0) {
        ytPlayer.unMute();
      } else if (typeof ytPlayer.mute === 'function' && volVal === 0) {
        ytPlayer.mute();
      }
      if (typeof ytPlayer.setVolume === 'function') {
        ytPlayer.setVolume(volVal);
      }
    } catch (e) {
      console.warn('Lofi volume YT API error:', e);
    }

    try {
      const iframe = typeof ytPlayer.getIframe === 'function' ? ytPlayer.getIframe() : document.getElementById('ytplayer');
      if (iframe && iframe.contentWindow) {
        if (volVal === 0) {
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: [] }), '*');
        } else {
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
        }
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [volVal] }), '*');
      }
    } catch (e) {
      console.warn('Lofi volume postMessage error:', e);
    }
  }
}

function updateLofiProgress() {
  if (!isYtReady || !lofiPlaying || lofiSeeking) return;
  const curr = ytPlayer.getCurrentTime() || 0;
  const total = ytPlayer.getDuration() || 0;

  const progressBar = document.getElementById('lofiProgressBar');
  if (progressBar.max != total) progressBar.max = total;
  progressBar.value = curr;

  document.getElementById('lofiCurrentTime').textContent = formatLofiTime(curr);
  document.getElementById('lofiTotalTime').textContent = formatLofiTime(total);
}

function formatLofiTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function seekLofi(val) {
  if (!isYtReady) return;
  ytPlayer.seekTo(val, true);
  document.getElementById('lofiCurrentTime').textContent = formatLofiTime(val);
}

function parseViewFromHash(hashStr) {
  if (!hashStr) return 'focus';
  let clean = hashStr.startsWith('#') ? hashStr.substring(1) : hashStr;
  if (clean.includes('?')) {
    clean = clean.split('?')[0];
  }
  return clean.trim() || 'focus';
}

window.parseViewFromHash = parseViewFromHash;

function switchView(viewName) {
  const targetViewName = parseViewFromHash(viewName);
  const targetEl = document.getElementById(`view-${targetViewName}`);
  const finalViewName = targetEl ? targetViewName : 'focus';

  try {
    localStorage.setItem('pomodo_active_view', finalViewName);
  } catch (e) {}

  if (finalViewName === 'login') {
    document.body.classList.add('is-login-page');
  } else {
    document.body.classList.remove('is-login-page');
  }

  const currentHashView = parseViewFromHash(window.location.hash);
  if (currentHashView !== finalViewName) {
    if (finalViewName === 'login') {
      if (!window.location.hash.startsWith('#login')) {
        window.location.hash = '#login';
      }
    } else {
      window.location.hash = '#' + finalViewName;
    }
  }

  const navBtns = document.querySelectorAll('.bottom-nav-btn[data-view]');
  navBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === finalViewName);
  });

  const views = document.querySelectorAll('.app-view');
  views.forEach(view => {
    const isTarget = view.id === `view-${finalViewName}`;
    view.classList.toggle('active', isTarget);
  });

  if (finalViewName === 'focus') {
    setTimeout(updateTabIndicator, 60);
  }

  if (finalViewName === 'settings') {
    populateSettings();
  }

  if (finalViewName === 'progress') {
    const banner = document.getElementById('progressGuestBanner');
    const isGuest = !(typeof isLoggedIn === 'function' && isLoggedIn());
    if (banner) {
      banner.classList.toggle('show', isGuest);
    }
    loadReportData(currentReportPeriod, true);
  }

  if (finalViewName === 'login') {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    let otpParam = null;

    if (hash.includes('otp=')) {
      const match = hash.match(/[?&]otp=([0-9]{6})/);
      if (match) otpParam = match[1];
    } else if (search.includes('otp=')) {
      const match = search.match(/[?&]otp=([0-9]{6})/);
      if (match) otpParam = match[1];
    }

    if (otpParam && otpParam.length === 6 && typeof window.processTelegramOtpFromUrl === 'function') {
      window.processTelegramOtpFromUrl();
      return;
    }

    const firstBox = document.querySelector('.otp-pin-box');
    if (firstBox) {
      setTimeout(() => firstBox.focus(), 150);
    }
  }
}
window.switchView = switchView;

function toggleTimerFullscreen() {
  const timerCard = document.querySelector('.timer-card');
  if (!timerCard) return;

  const isFS = timerCard.classList.toggle('is-fullscreen');
  document.body.classList.toggle('timer-fullscreen-active', isFS);

  if (typeof updateTelegramBackButton === 'function') {
    updateTelegramBackButton();
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const timerCard = document.querySelector('.timer-card');
    if (timerCard && timerCard.classList.contains('is-fullscreen')) {
      timerCard.classList.remove('is-fullscreen');
      document.body.classList.remove('timer-fullscreen-active');
      if (typeof updateTelegramBackButton === 'function') {
        updateTelegramBackButton();
      }
    }
  }
});

// =============================================================
// OTP LOGIN — submitOtpCode
// Telegram botdan kelgan 6 xonali kodni backend ga yuboradi.
// =============================================================
async function submitOtpCode(code) {
  if (!code || code.length !== 6) {
    throw new Error('6 xonali kodni kiriting');
  }

  let data;
  if (typeof post === 'function') {
    data = await post('/auth/telegram-code', { code });
  } else {
    const baseUrl = window.BASE_URL || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:8080' : window.location.origin);
    const res = await fetch(`${baseUrl}/auth/telegram-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ code }),
    });

    data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.message || data.error || "Kod yaroqsiz yoki muddati o'tgan");
    }
  }

  if (data && data.token) {
    // Token saqlash
    if (typeof setToken === 'function') {
      setToken(data.token);
    } else {
      localStorage.setItem('jwt_token', data.token);
    }

    // Refresh token saqlash
    if (data.refreshToken) {
      localStorage.setItem('refresh_token', data.refreshToken);
    }

    // Foydalanuvchi ma'lumotini saqlash
    if (data.user) {
      window.currentUser = data.user;
    }

    // Auth state yangilash
    window.dispatchEvent(new CustomEvent('auth:token-changed'));

    // Muvaffaqiyat xabari
    if (typeof showToast === 'function') {
      showToast('Tizimga muvaffaqiyatli kirdingiz! 🎉', 3000);
    }

    return data;
  }

  throw new Error('Tizimga kirishda xatolik yuz berdi');
}
window.submitOtpCode = submitOtpCode;

function bindStaticEvents() {
  window.addEventListener('resize', updateTabIndicator);
  document.addEventListener('pomodoroCompleted', () => {
    clearReportCache();
    loadReportData(currentReportPeriod, true);
  });
  const byId = id => document.getElementById(id);
  byId('prevWeekBtn')?.addEventListener('click', () => {
    currentWeekOffset--;
    loadReportData(currentReportPeriod);
  });
  byId('nextWeekBtn')?.addEventListener('click', () => {
    if (currentWeekOffset < 0) {
      currentWeekOffset++;
      loadReportData(currentReportPeriod);
    }
  });
  byId('loadMoreSessionsBtn')?.addEventListener('click', () => {
    detailDisplayLimit += 15;
    renderDetailRowsList();
  });
  document.querySelectorAll('.logo, .fullscreen-brand-logo, .minimal-login-logo').forEach(el => {
    el.addEventListener('click', () => {
      if (typeof switchView === 'function') switchView('focus');
      window.location.hash = '#focus';
    });
  });

  byId('exportStatsCsvBtn')?.addEventListener('click', exportStatsToCSV);
  byId('toggleTimerFullscreenBtn')?.addEventListener('click', toggleTimerFullscreen);
  byId('openPomModalBtn')?.addEventListener('click', () => openModal('pomModal'));
  byId('openReportModalBtn')?.addEventListener('click', () => switchView('progress'));
  byId('openSettingsModalBtn')?.addEventListener('click', () => switchView('settings'));
  byId('openSettingsMenuBtn')?.addEventListener('click', () => {
    toggleProfileMenu(false);
    switchView('settings');
  });
  byId('profileMenuBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    toggleProfileMenu();
  });
  byId('loginMenuBtn')?.addEventListener('click', () => {
    toggleProfileMenu(false);
    if (typeof loginWithTelegram === 'function') {
      loginWithTelegram();
    }
  });
  byId('openAccountModalBtn')?.addEventListener('click', () => {
    toggleProfileMenu(false);
    openModal('accountModal');
  });
  function initCustomCategoryPicker() {
    const btn = document.getElementById('bugReportCategoryBtn');
    const dropdown = document.getElementById('bugReportCategoryDropdown');
    const textEl = document.getElementById('bugReportCategoryText');
    const hiddenInput = document.getElementById('bugReportCategory');

    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      if (isOpen) {
        dropdown.classList.remove('open');
        btn.classList.remove('open');
      } else {
        dropdown.classList.add('open');
        btn.classList.add('open');
      }
    });

    document.querySelectorAll('.custom-category-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.val;
        if (hiddenInput) hiddenInput.value = val;
        if (textEl) textEl.textContent = val;

        document.querySelectorAll('.custom-category-option').forEach(o => o.classList.remove('is-selected'));
        opt.classList.add('is-selected');

        dropdown.classList.remove('open');
        btn.classList.remove('open');
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#bugReportCategoryBtn') && !e.target.closest('#bugReportCategoryDropdown')) {
        dropdown?.classList.remove('open');
        btn?.classList.remove('open');
      }
    });
  }
  initCustomCategoryPicker();

  byId('reportBugMenuBtn')?.addEventListener('click', openBugReportModal);
  byId('sendBugReportBtn')?.addEventListener('click', sendBugReport);
  byId('logoutMenuBtn')?.addEventListener('click', confirmLogout);
  byId('deleteAccountMenuBtn')?.addEventListener('click', confirmDeleteAccount);
  byId('deleteAccountSettingsBtn')?.addEventListener('click', confirmDeleteAccount);
  byId('deleteAccountModalBtn')?.addEventListener('click', confirmDeleteAccount);
  byId('saveAccountBtn')?.addEventListener('click', saveAccount);
  byId('accountAvatarGrid')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-avatar-id]');
    if (!btn) return;
    const avatarId = btn.dataset.avatarId;

    selectedAvatarId = avatarId;

    updateAllAvatars(avatarId);
    renderAvatarGrid();
  });
  byId('openAddTaskModalBtn')?.addEventListener('click', () => {
    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
      openModal('addTaskModal');
    } else {
      if (typeof switchView === 'function') {
        switchView('login');
      } else {
        window.location.hash = '#login';
      }
    }
  });
  byId('startBtn')?.addEventListener('click', toggleTimer);
  byId('resetBtn')?.addEventListener('click', resetTimer);
  byId('clearFinishedTasksBtn')?.addEventListener('click', clearFinishedTasks);
  byId('clearAllTasksBtn')?.addEventListener('click', clearAllTasks);
  byId('addTaskBtn')?.addEventListener('click', addTaskFromModal);
  byId('savePomTargetBtn')?.addEventListener('click', savePomTarget);
  byId('saveSettingsBtn')?.addEventListener('click', saveSettings);
  byId('clearLocalStorageBtn')?.addEventListener('click', clearLocalStorage);

  // 42-style OTP Pin Box Handler for #view-login
  const pinBoxes = document.querySelectorAll('.otp-pin-box');
  const otpStatusMsg = byId('otpStatusMsg');

  function resetOtpLoginForm() {
    if (pinBoxes && pinBoxes.length > 0) {
      pinBoxes.forEach(box => box.value = '');
    }
    if (otpStatusMsg) {
      otpStatusMsg.textContent = '';
      otpStatusMsg.className = 'otp-status-msg';
    }
  }
  window.resetOtpLoginForm = resetOtpLoginForm;

  function getFullOtpCode() {
    let full = '';
    pinBoxes.forEach(box => full += box.value.trim());
    return full;
  }

  async function autoSubmitOtpIfComplete() {
    const code = getFullOtpCode();
    if (code.length === 6) {
      if (otpStatusMsg) {
        otpStatusMsg.textContent = "Kod tekshirilmoqda...";
        otpStatusMsg.className = "otp-status-msg loading";
      }

      try {
        if (typeof triggerHaptic === 'function') triggerHaptic('medium');
        await submitOtpCode(code);
        if (typeof switchView === 'function') {
          switchView('focus');
        }
        resetOtpLoginForm();
      } catch (err) {
        if (typeof triggerHaptic === 'function') triggerHaptic('error');
        if (otpStatusMsg) {
          otpStatusMsg.textContent = err.message || "Kod yaroqsiz yoki muddati o'tgan";
          otpStatusMsg.className = "otp-status-msg error";
        }
      }
    } else {
      if (otpStatusMsg && otpStatusMsg.classList.contains('error')) {
        otpStatusMsg.textContent = "";
        otpStatusMsg.className = "otp-status-msg";
      }
    }
  }
  window.autoSubmitOtpIfComplete = autoSubmitOtpIfComplete;

  if (pinBoxes && pinBoxes.length > 0) {
    const pinContainer = document.getElementById('otpPinContainer');
    if (pinContainer) {
      pinContainer.addEventListener('click', (e) => {
        if (e.target === pinContainer) {
          const emptyBox = Array.from(pinBoxes).find(b => !b.value) || pinBoxes[pinBoxes.length - 1];
          if (emptyBox) emptyBox.focus();
        }
      });
    }

    pinBoxes.forEach((box, idx) => {
      box.addEventListener('focus', () => {
        box.select();
      });

      box.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val) {
          if (typeof triggerHaptic === 'function') triggerHaptic('selection');
          if (idx < pinBoxes.length - 1) {
            pinBoxes[idx + 1].focus();
          } else {
            box.blur();
          }
        }
        autoSubmitOtpIfComplete();
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && idx > 0) {
          pinBoxes[idx - 1].focus();
        } else if (e.key === 'ArrowLeft' && idx > 0) {
          pinBoxes[idx - 1].focus();
        } else if (e.key === 'ArrowRight' && idx < pinBoxes.length - 1) {
          pinBoxes[idx + 1].focus();
        }
      });

      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const raw = (e.clipboardData || window.clipboardData).getData('text') || '';
        const cleanDigits = raw.replace(/\D/g, '');
        if (cleanDigits.length > 0) {
          const digits = cleanDigits.slice(0, 6);
          digits.split('').forEach((char, i) => {
            const targetIdx = idx + i;
            if (pinBoxes[targetIdx]) {
              pinBoxes[targetIdx].value = char;
            }
          });
          const lastIndex = Math.min(idx + digits.length - 1, pinBoxes.length - 1);
          pinBoxes[lastIndex].focus();
          autoSubmitOtpIfComplete();
        }
      });
    });
  }
  byId('lofiPrev')?.addEventListener('click', lofiPrev);
  byId('lofiPlayPause')?.addEventListener('click', toggleLofi);
  byId('lofiNext')?.addEventListener('click', lofiNext);
  byId('lofiMuteToggle')?.addEventListener('click', toggleLofiMute);
  const lofiVolSlider = byId('lofiVolume');
  if (lofiVolSlider) {
    ['input', 'change', 'touchmove'].forEach(evt => {
      lofiVolSlider.addEventListener(evt, e => changeLofiVolume(e.target.value));
    });
  }
  byId('volumeSlider')?.addEventListener('input', updateVolLabel);

  byId('lofiProgressBar')?.addEventListener('input', e => {
    byId('lofiCurrentTime').textContent = formatLofiTime(e.target.value);
    lofiSeeking = true;
  });
  byId('lofiProgressBar')?.addEventListener('change', e => {
    seekLofi(e.target.value);
    lofiSeeking = false;
  });
  byId('lofiProgressBar')?.addEventListener('mouseup', () => { lofiSeeking = false; });
  byId('lofiProgressBar')?.addEventListener('touchend', () => { lofiSeeking = false; });

  document.querySelectorAll('.bottom-nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('[data-pom-target-delta]').forEach(btn => {
    btn.addEventListener('click', () => changePomTarget(Number(btn.dataset.pomTargetDelta)));
  });
  document.querySelectorAll('[data-report-period]').forEach(btn => {
    btn.addEventListener('click', () => loadReportData(btn.dataset.reportPeriod, false));
  });

  byId('openTaskPickerBtn')?.addEventListener('click', () => {
    renderTaskPickerList();
    openModal('taskPickerModal');
  });

  byId('detachTaskBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    unselectActiveTask();
    showToast("Vazifa taymerdan ajratildi", 2500);
  });

  byId('unselectTaskBtn')?.addEventListener('click', () => {
    unselectActiveTask();
    closeModal('taskPickerModal');
    showToast("Taymer umumiy diqqat rejimiga o'tkazildi", 2500);
  });

  byId('pickerAddTaskBtn')?.addEventListener('click', () => {
    closeModal('taskPickerModal');
    switchView('task');
    window.location.hash = '#task';
  });

  document.addEventListener('click', e => {
    const startTaskBtn = e.target.closest('[data-start-task-id]');
    if (startTaskBtn) {
      const taskId = startTaskBtn.dataset.startTaskId;
      selectActiveTask(taskId);
      switchView('focus');
      const activeTask = getActiveTask();
      if (activeTask) {
        showToast(`"${activeTask.text}" vazifasi taymerga ulandi!`, 3000);
      }
      return;
    }

    const selectPickerBtn = e.target.closest('[data-select-task-id]');
    if (selectPickerBtn) {
      const taskId = selectPickerBtn.dataset.selectTaskId;
      selectActiveTask(taskId);
      closeModal('taskPickerModal');
      const activeTask = getActiveTask();
      if (activeTask) {
        showToast(`"${activeTask.text}" taymerga ulandi!`, 2500);
      }
      return;
    }

    const infoBtn = e.target.closest('.card-info-btn');
    if (infoBtn) {
      e.stopPropagation();
      const title = infoBtn.dataset.infoTitle || "Ko'rsatkich ma'nosi";
      const text = infoBtn.dataset.infoText || "";
      const titleEl = byId('metricInfoTitle');
      const textEl = byId('metricInfoText');
      if (titleEl) titleEl.textContent = title;
      if (textEl) textEl.textContent = text;
      openModal('metricInfoModal');
      return;
    }
  });

  document.querySelectorAll('.progress-tab-btn[data-progress-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchProgressSubTab(btn.dataset.progressTab));
  });
  document.querySelectorAll('.theme-option[data-theme-id]').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.themeId));
  });

  const taskTextarea = byId('quickTaskInput');
  const taskCharCounter = byId('taskCharCount');
  if (taskTextarea) {
    taskTextarea.addEventListener('input', () => {
      taskTextarea.style.height = 'auto';
      taskTextarea.style.height = Math.min(taskTextarea.scrollHeight, 140) + 'px';
      if (taskCharCounter) {
        taskCharCounter.textContent = `${taskTextarea.value.length} / 31`;
      }
    });
  }

  const handleQuickAdd = () => {
    const input = byId('quickTaskInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    if (editingTaskId) {
      const task = state.tasks.find(t => t.id === editingTaskId || String(t.id) === String(editingTaskId));
      if (task) {
        task.text = text;
        saveTasks();
        if (activeTaskId === task.id || String(activeTaskId) === String(task.id)) {
          updateActiveTaskBar();
        }
        triggerHaptic('medium');
        showToast('Vazifa saqlandi! ✏️', 2000);
      }
      cancelTaskEdit();
      return;
    }

    state.tasks.unshift({
      id: 'task_' + Date.now(),
      text: text,
      done: false
    });
    input.value = '';
    input.style.height = 'auto';
    if (taskCharCounter) taskCharCounter.textContent = '0 / 31';
    renderTasks();
    saveTasks();
    showToast('Vazifa qo\'shildi!', 2000);
  };

  byId('notionAddTaskBtn')?.addEventListener('click', () => addNewNotionTask(true));

  document.addEventListener('click', e => {
    if (!e.target.closest('.profile-menu-wrap')) {
      toggleProfileMenu(false);
    }
  });

  const taskListEl = byId('taskList');
  if (taskListEl) {
    taskListEl.addEventListener('click', e => {
      const toggleBtn = e.target.closest('[data-task-toggle]');
      if (toggleBtn) {
        toggleTask(Number(toggleBtn.dataset.taskToggle));
        return;
      }

      const removeBtn = e.target.closest('[data-task-remove]');
      if (removeBtn) {
        removeTask(Number(removeBtn.dataset.taskRemove));
        return;
      }
    });

    taskListEl.addEventListener('input', e => {
      if (e.target.classList.contains('notion-task-input')) {
        autoAdjustTextareaHeight(e.target);
        const index = Number(e.target.dataset.taskInputIndex);
        if (state.tasks && state.tasks[index]) {
          state.tasks[index].text = e.target.value;
          saveTasks();
          updateTasksCountBadge();
          if (activeTaskId === state.tasks[index].id || String(activeTaskId) === String(state.tasks[index].id)) {
            updateActiveTaskBar();
          }
        }
      }
    });

    taskListEl.addEventListener('keydown', e => {
      if (e.target.classList.contains('notion-task-input')) {
        const index = Number(e.target.dataset.taskInputIndex);

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          saveTasks();
          updateTasksCountBadge();
          e.target.blur();
        } else if (e.key === 'Backspace' && e.target.value === '') {
          e.preventDefault();
          removeTask(index, true);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prevInput = document.querySelector(`.notion-task-input[data-task-input-index="${index - 1}"]`);
          if (prevInput) {
            prevInput.focus();
            prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const nextInput = document.querySelector(`.notion-task-input[data-task-input-index="${index + 1}"]`);
          if (nextInput) {
            nextInput.focus();
            nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
          }
        }
      }
    });
  }

  byId('soundGrid')?.addEventListener('click', e => {
    const preview = e.target.closest('[data-sound-preview]');
    if (preview) {
      e.stopPropagation();
      playSoundPreview(preview.dataset.soundPreview);
      return;
    }
    const card = e.target.closest('[data-sound-id]');
    if (card) selectSound(card.dataset.soundId, true);
  });

  initBottomSheetGestures();
}

// INIT
async function init() {
  if (typeof guardPage === 'function' && !guardPage()) {
    return;
  }

  bindStaticEvents();
  loadAll();
  if (state.timeLeft === undefined) {
    state.timeLeft = getTabTime();
    state.totalTime = state.timeLeft;
  }
  ['tabPomodoro', 'tabShortBreak', 'tabLongBreak'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  const idMap = { pomodoro: 'tabPomodoro', shortBreak: 'tabShortBreak', longBreak: 'tabLongBreak' };
  document.getElementById(idMap[state.currentTab])?.classList.add('active');
  document.getElementById('sessionLabel').textContent = TAB_LABELS[state.currentTab];

  updateDisplay();
  renderPomDots();
  renderTasks();
  updateTabIndicator();
  const savedTheme = localStorage.getItem('pomodo_theme') || document.documentElement.getAttribute('data-theme') || 'neumorphism';
  setTheme(savedTheme);
  
  try {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    if ((hash.includes('otp=') || search.includes('otp=')) && typeof window.processTelegramOtpFromUrl === 'function') {
      window.processTelegramOtpFromUrl();
    }

    await loadCurrentUserProfile();

    if (typeof initLeaderboard === 'function') {
      initLeaderboard();
    }

    const targetView = parseViewFromHash(window.location.hash);
    if (!window.location.hash) {
      window.location.hash = '#focus';
    }
    switchView(targetView);

    // Remove app-loading AFTER correct view is set to prevent focus-view flash
    document.documentElement.classList.remove('app-loading');

    if (state.isRunning && state.endTime && state.endTime > Date.now()) {
      const btn = document.getElementById('startBtn');
      if (btn) {
        btn.textContent = 'PAUSE';
        btn.className = 'btn-pause';
      }
      document.getElementById('timerWrapper')?.classList.add('running');
      timerInterval = setInterval(tick, 1000);
    }
  } catch (err) {
    console.warn('Init user profile error:', err);
    // Still remove app-loading on error so app is visible
    document.documentElement.classList.remove('app-loading');
  } finally {
    document.documentElement.classList.remove('protected-pending');
  }
}

window.addEventListener('hashchange', () => {
  const currentView = parseViewFromHash(window.location.hash);
  switchView(currentView);
});

window.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', updateTabIndicator);

async function syncAuthStateAcrossTabs() {
  await loadCurrentUserProfile();
  if (typeof fetchServerTasks === 'function') fetchServerTasks();
  if (typeof renderTasks === 'function') renderTasks();
  if (typeof renderCategorySelects === 'function') renderCategorySelects();
  if (typeof populateSettings === 'function') populateSettings();
  if (typeof loadReportData === 'function') loadReportData();
  if (typeof updateGuestUIState === 'function') updateGuestUIState();
  if (typeof updateHeaderAvatar === 'function') updateHeaderAvatar();

  if (window.location.hash.startsWith('#login') && typeof isLoggedIn === 'function' && isLoggedIn()) {
    if (typeof switchView === 'function') {
      switchView('focus');
    }
    window.location.hash = '#focus';
  }
}

// Multi-tab storage sync handler (fires when another Chrome tab logs in or out)
window.addEventListener('storage', (e) => {
  if (e.key === 'jwt_token') {
    console.log('[Multi-Tab Sync] Auth token changed in another browser tab');
    syncAuthStateAcrossTabs();
  }
});

// Same-tab auth token change listener
window.addEventListener('auth:token-changed', () => {
  syncAuthStateAcrossTabs();
});

// Periodic active session verification across devices/tabs
window.addEventListener('focus', () => {
  if (typeof isLoggedIn === 'function' && isLoggedIn()) {
    loadCurrentUserProfile();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && typeof isLoggedIn === 'function' && isLoggedIn()) {
    loadCurrentUserProfile();
  }
});

// Heartbeat check every 30 seconds to detect account deletion on other devices
setInterval(() => {
  if (typeof isLoggedIn === 'function' && isLoggedIn()) {
    loadCurrentUserProfile();
  }
}, 30000);
