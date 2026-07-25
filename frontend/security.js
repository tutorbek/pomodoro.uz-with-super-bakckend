(function () {
      const isLocal = window.location.protocol === 'file:';
      const isBot = /Wget|curl|python-requests|Go-http-client/i.test(navigator.userAgent);
      const isMirror = window.location.hostname !== 'pomodoro.uz' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' &&
        !window.location.hostname.endsWith('.pages.dev') && // For Cloudflare Pages
        !window.location.hostname.endsWith('.vercel.app'); // For Vercel

      if (isLocal || isBot || (isMirror && window.location.hostname !== "")) {
        console.warn("Access Denied: Protected Environment");
        document.documentElement.innerHTML = `
          <div class="protected-message">
            <h1 class="protected-message__title">Pomodoro.uz — Himoyalangan Kontent</h1>
            <p class="protected-message__text">Xavfsizlik maqsadida ushbu loyihani lokal fayl sifatida yoki skraperlar orqali ishlatish cheklangan. Iltimos, rasmiy saytdan foydalaning.</p>
            <a class="protected-message__link" href="https://pomodoro.uz">pomodoro.uz ga o'tish →</a>
          </div>`;
        window.stop();
      }
    })();

const savedTheme = localStorage.getItem('pomodo_theme');
if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme);
}
