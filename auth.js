const Auth = (() => {

  // ── GOOGLE (GIS Token Client) ───────────────────────────────────────────
  const Google = (() => {
    const SCOPES = [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar',
      'openid', 'email', 'profile'
    ].join(' ');

    let _inflight = null;

    function clientId()    { return localStorage.getItem('apex_google_client_id') || ''; }
    function storedToken() { return localStorage.getItem('apex_google_token') || ''; }
    function storedExpiry(){ return parseInt(localStorage.getItem('apex_google_expiry') || '0'); }
    function email()       { return localStorage.getItem('apex_google_email') || localStorage.getItem('apex_email') || ''; }
    function isValid()     { return !!storedToken() && Date.now() < storedExpiry() - 60000; }
    function isConnected() { return !!localStorage.getItem('apex_google_connected'); }

    function _save(res) {
      localStorage.setItem('apex_google_token',     res.access_token);
      localStorage.setItem('apex_google_expiry',    String(Date.now() + res.expires_in * 1000));
      localStorage.setItem('apex_google_connected', '1');
    }

    function _request(prompt) {
      return new Promise((resolve, reject) => {
        if (!window.google?.accounts?.oauth2) {
          reject(new Error('Google Identity Services not loaded yet'));
          return;
        }
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId(),
          scope: SCOPES,
          login_hint: email(),
          callback(res) {
            if (res.error) { reject(new Error(res.error_description || res.error)); return; }
            _save(res);
            _inflight = null;
            resolve(res.access_token);
          }
        });
        client.requestAccessToken({ prompt });
      });
    }

    async function getToken() {
      if (isValid()) return storedToken();
      if (_inflight) return _inflight;
      _inflight = _request('none').catch(() => _request(''));
      return _inflight;
    }

    async function connect() {
      if (!clientId()) throw new Error('Add your Google Client ID in Settings first.');
      const token = await _request('consent');
      _inflight = null;
      try {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (r.ok) {
          const u = await r.json();
          if (u.email) {
            localStorage.setItem('apex_google_email', u.email);
            localStorage.setItem('apex_email', u.email);
          }
        }
      } catch {}
      return token;
    }

    function disconnect() {
      const t = storedToken();
      if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t, () => {});
      ['apex_google_token','apex_google_expiry','apex_google_connected','apex_google_email']
        .forEach(k => localStorage.removeItem(k));
      _inflight = null;
    }

    function prewarm() {
      if (isConnected() && clientId()) setTimeout(() => getToken().catch(() => {}), 0);
    }

    return { getToken, connect, disconnect, isConnected, isValid, email, prewarm };
  })();

  // ── MICROSOFT (MSAL.js v2 SPA) ──────────────────────────────────────────
  const Microsoft = (() => {
    const SCOPES = ['Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite', 'User.Read'];
    let _app = null, _account = null, _inflight = null;

    function clientId()    { return localStorage.getItem('apex_ms_client_id') || ''; }
    function storedToken() { return localStorage.getItem('apex_ms_token') || ''; }
    function storedExpiry(){ return parseInt(localStorage.getItem('apex_ms_expiry') || '0'); }
    function isValid()     { return !!storedToken() && Date.now() < storedExpiry() - 60000; }
    function isConnected() { return !!localStorage.getItem('apex_ms_connected'); }

    function _getApp() {
      if (_app) return _app;
      if (!clientId() || !window.msal) return null;
      try {
        _app = new msal.PublicClientApplication({
          auth: {
            clientId: clientId(),
            authority: 'https://login.microsoftonline.com/common',
            redirectUri: window.location.origin + window.location.pathname
          },
          cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
        });
        const accs = _app.getAllAccounts();
        if (accs.length) _account = accs[0];
      } catch(e) {
        console.warn('[APEX Auth] MSAL init failed:', e.message);
        _app = null;
      }
      return _app;
    }

    function _save(res) {
      const expiry = res.expiresOn ? res.expiresOn.getTime() : Date.now() + 3600000;
      localStorage.setItem('apex_ms_token',     res.accessToken);
      localStorage.setItem('apex_ms_expiry',    String(expiry));
      localStorage.setItem('apex_ms_connected', '1');
      if (res.account) {
        _account = res.account;
        localStorage.setItem('apex_ms_email', res.account.username || '');
      }
      _inflight = null;
      return res.accessToken;
    }

    async function getToken() {
      if (isValid()) return storedToken();
      if (_inflight) return _inflight;
      const app = _getApp();
      if (!app) throw new Error('MSAL not initialized — add Azure Client ID in Settings.');
      const req = { scopes: SCOPES, account: _account };
      _inflight = app.acquireTokenSilent(req)
        .then(res => _save(res))
        .catch(() => app.acquireTokenPopup(req).then(res => _save(res)));
      return _inflight;
    }

    async function connect() {
      if (!clientId()) throw new Error('Add your Azure Client ID in Settings first.');
      const app = _getApp();
      if (!app) throw new Error('MSAL library not loaded yet — refresh and try again.');
      const res = await app.acquireTokenPopup({ scopes: SCOPES });
      return _save(res);
    }

    function disconnect() {
      try { _getApp()?.clearCache(); } catch {}
      ['apex_ms_token','apex_ms_expiry','apex_ms_connected','apex_ms_email']
        .forEach(k => localStorage.removeItem(k));
      _app = null; _account = null; _inflight = null;
    }

    function prewarm() {
      if (isConnected() && clientId()) setTimeout(() => getToken().catch(() => {}), 50);
    }

    return { getToken, connect, disconnect, isConnected, isValid, prewarm };
  })();

  function prewarm() { Google.prewarm(); Microsoft.prewarm(); }

  return { Google, Microsoft, prewarm };
})();
