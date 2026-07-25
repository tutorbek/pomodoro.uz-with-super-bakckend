// auth.js — Authentication module
// Provides: loginWithTelegram, getCurrentUser, logout, deleteAccount,
//           checkAndProcessUrlToken, autoLoginTelegramMiniApp
// Depends on: api.js (getToken, setToken, removeToken, isLoggedIn, get, post, del)

/**
 * URL-dagi ?token= parametrini o'qib, localStorage ga saqlaydi.
 */
function checkAndProcessUrlToken() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  let token = null;

  if (hash.includes('token=')) {
    const m = hash.match(/[?&]token=([^&]+)/);
    if (m) token = m[1];
  } else if (search.includes('token=')) {
    const m = search.match(/[?&]token=([^&]+)/);
    if (m) token = m[1];
  }

  if (token && typeof setToken === 'function') {
    setToken(token);
    window.dispatchEvent(new CustomEvent('auth:token-changed'));
  }
}

/**
 * Backend dan joriy foydalanuvchini oladi.
 * @returns {Promise<object>} User object
 */
async function getCurrentUser() {
  if (typeof get === 'function') {
    return await get('/auth/me');
  }
  // fallback: bevosita fetch
  const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('jwt_token');
  const res = await fetch('/auth/me', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = new Error('Unauthorized');
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

/**
 * Tizimdan chiqadi: backend logout + token tozalash.
 */
async function logout() {
  try {
    const token = typeof getToken === 'function' ? getToken() : null;
    if (token && typeof post === 'function') {
      await post('/auth/logout', {}).catch(() => {});
    }
  } catch (_) {}

  if (typeof removeToken === 'function') removeToken();
  if (typeof resetAppForGuest === 'function') resetAppForGuest();
  if (typeof switchView === 'function') switchView('focus');
  window.location.hash = '#focus';
  if (typeof showToast === 'function') showToast('Tizimdan chiqildingiz', 2500);
}

/**
 * Accountni butunlay o'chiradi.
 */
async function deleteAccount() {
  if (typeof del === 'function') {
    await del('/auth/me');
  } else {
    const token = typeof getToken === 'function' ? getToken() : null;
    await fetch('/auth/me', {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  localStorage.clear();
  if (typeof removeToken === 'function') removeToken();
  if (typeof resetAppForGuest === 'function') resetAppForGuest();
  if (typeof switchView === 'function') switchView('focus');
  window.location.hash = '#focus';
}

/**
 * Telegram Mini App initData orqali avtomatik login qiladi.
 */
async function autoLoginTelegramMiniApp() {
  if (typeof window === 'undefined' || !window.Telegram || !window.Telegram.WebApp) return;
  const initData = window.Telegram.WebApp.initData;
  if (!initData || initData.trim().length === 0) return;

  if (typeof isLoggedIn === 'function' && isLoggedIn()) {
    console.log('[TMA Auto Login] User already authenticated');
    return;
  }

  try {
    console.log('[TMA Auto Login] Authenticating Telegram Mini App session...');
    const res = await fetch('/auth/telegram-tma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.token) {
      if (typeof setToken === 'function') {
        setToken(data.token);
      } else {
        localStorage.setItem('jwt_token', data.token);
      }
      if (data.refreshToken) {
        localStorage.setItem('refresh_token', data.refreshToken);
      }
      if (data.user) {
        window.currentUser = data.user;
      }
      window.dispatchEvent(new CustomEvent('auth:token-changed'));
      console.log('[TMA Auto Login] Successfully authenticated:', data.user);
    } else {
      console.warn('[TMA Auto Login] Response:', data.message || res.status);
    }
  } catch (err) {
    console.error('[TMA Auto Login] Error:', err);
  }
}

/**
 * Telegram orqali login sahifasiga yo'naltiradi.
 */
function loginWithTelegram() {
  if (typeof window.switchView === 'function') {
    window.switchView('login');
  } else {
    window.location.hash = '#login';
  }
}

// Global scope ga chiqarish (app.js typeof tekshiruvi uchun)
window.checkAndProcessUrlToken = checkAndProcessUrlToken;
window.getCurrentUser = getCurrentUser;
window.logout = logout;
window.deleteAccount = deleteAccount;
window.autoLoginTelegramMiniApp = autoLoginTelegramMiniApp;
window.loginWithTelegram = loginWithTelegram;

/**
 * OAuth/token callback sahifasida chaqiriladi.
 * URL'dan ?token= yoki #token= parametrini o'qib localStorage ga saqlaydi,
 * keyin bosh sahifaga redirect qiladi.
 */
function handleCallback() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  let token = null;

  if (hash.includes('token=')) {
    const m = hash.match(/[?&]token=([^&]+)/);
    if (m) token = decodeURIComponent(m[1]);
  } else if (search.includes('token=')) {
    const m = search.match(/[?&]token=([^&]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }

  if (token) {
    localStorage.setItem('jwt_token', token);
    // Redirect to main app
    window.location.replace('/#focus');
  } else {
    // No token found — redirect anyway
    window.location.replace('/#focus');
  }
}
window.handleCallback = handleCallback;

