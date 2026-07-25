const BASE_URL = (() => {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:8080';
  }
  return window.location.origin;
})();
const TOKEN_KEY = 'jwt_token';

/**
 * Reads the JWT token from localStorage.
 * @returns {string|null} Saved JWT token or null.
 */
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Saves the JWT token to localStorage.
 * @param {string} token JWT token from backend callback.
 * @returns {void}
 */
function setToken(token) {
  const oldToken = localStorage.getItem(TOKEN_KEY);
  if (oldToken && oldToken !== token) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('jwt_refresh_token');
  }
  localStorage.setItem(TOKEN_KEY, token);
  if (oldToken !== token) {
    window.dispatchEvent(new CustomEvent('auth:token-changed', { detail: { token } }));
  }
}

/**
 * Removes the JWT token from localStorage.
 * @returns {void}
 */
function removeToken() {
  const hadToken = Boolean(localStorage.getItem(TOKEN_KEY));
  localStorage.removeItem(TOKEN_KEY);
  if (hadToken) {
    window.dispatchEvent(new CustomEvent('auth:token-changed', { detail: { token: null } }));
  }
}

/**
 * Checks whether the current browser session has a JWT token.
 * @returns {boolean} True when token exists.
 */
function isLoggedIn() {
  return Boolean(getToken());
}

/**
 * Redirects the user to the focus view after an unauthorized response.
 * @returns {void}
 */
function redirectToLogin() {
  if (window.location.hash !== '#focus') {
    window.location.href = '/#focus';
  }
}

/**
 * Sends a JSON request to the backend and returns parsed JSON when available.
 * @param {string} method HTTP method.
 * @param {string} endpoint Backend endpoint beginning with "/".
 * @param {object} [body] Optional request body.
 * @returns {Promise<any>} Parsed JSON response, null for empty responses.
 */
async function api(method, endpoint, body) {
  const headers = {
    Accept: 'application/json',
  };
  const token = getToken();
  const options = {
    method,
    headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);

    if (!response.ok) {
      let errorMessage = '';
      try {
        const errorJson = await response.json();
        if (errorJson && (errorJson.message || errorJson.error)) {
          errorMessage = errorJson.message || errorJson.error;
        }
      } catch (e) {
        // Fallback to text if response is not JSON
      }

      if (!errorMessage) {
        const text = await response.text().catch(() => '');
        errorMessage = text || `Xatolik yuz berdi (Status ${response.status})`;
      }

      if (response.status === 401) {
        removeToken();
        if (errorMessage === 'Unauthorized' || !errorMessage) {
          errorMessage = "Tizimga kirish muddati tugagan yoki ruxsat berilmadi";
        }
      }

      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

/**
 * Sends a GET request.
 * @param {string} endpoint Backend endpoint.
 * @returns {Promise<any>} Parsed response.
 */
async function get(endpoint) {
  return await api('GET', endpoint);
}

/**
 * Sends a POST request.
 * @param {string} endpoint Backend endpoint.
 * @param {object} [body] Optional request body.
 * @returns {Promise<any>} Parsed response.
 */
async function post(endpoint, body) {
  return await api('POST', endpoint, body);
}

/**
 * Sends a PUT request.
 * @param {string} endpoint Backend endpoint.
 * @param {object} [body] Optional request body.
 * @returns {Promise<any>} Parsed response.
 */
async function put(endpoint, body) {
  return await api('PUT', endpoint, body);
}

/**
 * Sends a DELETE request.
 * @param {string} endpoint Backend endpoint.
 * @returns {Promise<any>} Parsed response.
 */
async function del(endpoint) {
  return await api('DELETE', endpoint);
}

let currentBackendSessionId = null;

/**
 * Creates a new Pomodoro session in backend database.
 * @param {number} duration Duration in minutes.
 * @param {string} label Task label.
 * @returns {Promise<object>} Created session response.
 */
async function createPomodoroSession(duration, label, taskId) {
  try {
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

/**
 * Completes the active Pomodoro session in backend database.
 * @param {number} duration Duration in minutes.
 * @param {string} label Task label.
 * @param {string} taskId Task UUID.
 * @returns {Promise<object>} Completed session response.
 */
async function completePomodoroSession(duration, label, taskId) {
  try {
    if (!currentBackendSessionId) {
      const started = await createPomodoroSession(duration, label, taskId);
      if (started && started.id) {
        currentBackendSessionId = started.id;
      }
    }
    if (currentBackendSessionId) {
      const res = await post(`/api/sessions/${currentBackendSessionId}/complete`);
      currentBackendSessionId = null;
      return res;
    }
  } catch (err) {
    console.warn('completePomodoroSession API error:', err);
    currentBackendSessionId = null;
    throw err;
  }
}

window.BASE_URL = BASE_URL;
window.getToken = getToken;
window.setToken = setToken;
window.removeToken = removeToken;
window.isLoggedIn = isLoggedIn;
window.api = api;
window.get = get;
window.post = post;
window.put = put;
window.del = del;
window.createPomodoroSession = createPomodoroSession;
window.completePomodoroSession = completePomodoroSession;

