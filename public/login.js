// login.js
(function bootstrapLogin() {
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) {
    console.warn('[login] Telegram init data missing. Open the mini app inside Telegram.');
    return;
  }

  fetch('/api/whoami', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `tma ${initData}`,
    },
    body: JSON.stringify({ source: 'login' }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result?.ok) {
        throw new Error(result?.reason || 'whoami_failed');
      }

      const userId = result.userId || result.user?.id;
      if (!userId) {
        throw new Error('missing_userId');
      }

      window.userid = String(userId);
      try {
        localStorage.setItem('userid', String(userId));
        if (result.isAdmin != null) {
          localStorage.setItem('isAdmin', String(Boolean(result.isAdmin)));
        }
      } catch (storageErr) {
        console.warn('[login] Unable to persist userid', storageErr);
      }

      window.location.href = '/profile.html';
    })
    .catch((err) => {
      console.error('Failed to verify Telegram user', err);
    });
})();
