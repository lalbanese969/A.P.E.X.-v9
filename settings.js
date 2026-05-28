const SettingsView = (() => {
  // Built-in defaults — shown in fields if user hasn't overridden them
  const DEFAULTS = {
    google_client_id: '395196249030-o81bj4tae9ra01h0v04810nl0evpt1so.apps.googleusercontent.com',
    ms_client_id:     '805553a5-80f5-4b7a-849f-690c520bb144'
  };

  function save(key, val) { localStorage.setItem(`apex_${key}`, val); }
  function load(key)      { return localStorage.getItem(`apex_${key}`) || DEFAULTS[key] || ''; }

  function statusEl(id)   { return document.getElementById(id); }

  function setStatus(id, text, ok) {
    const el = statusEl(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'settings-status' + (ok ? ' connected' : '');
  }

  // ── GOOGLE SECTION ────────────────────────────────────────────────────────
  function googleStatus() {
    if (typeof Auth === 'undefined') return 'NOT CONNECTED';
    if (Auth.Google.isConnected()) {
      const em = load('google_email') || load('email');
      return '● CONNECTED' + (em ? ' — ' + em : '');
    }
    return 'NOT CONNECTED';
  }

  function bindGoogle(container) {
    container.querySelector('#s-save-google-id').addEventListener('click', () => {
      const id = container.querySelector('#s-google-client-id').value.trim();
      save('google_client_id', id);
      setStatus('s-google-status', id ? 'CLIENT ID SAVED' : 'NO CLIENT ID', !!id);
    });

    container.querySelector('#s-connect-google').addEventListener('click', async () => {
      setStatus('s-google-status', 'OPENING AUTH WINDOW...', false);
      try {
        await Auth.Google.connect();
        setStatus('s-google-status', googleStatus(), true);
        refreshConnectBtns(container);
        // Reload email/calendar views if they exist
        if (typeof EmailView !== 'undefined')    EmailView.refresh();
        if (typeof CalendarView !== 'undefined') CalendarView.refresh();
      } catch(e) {
        setStatus('s-google-status', '✕ ' + e.message, false);
      }
    });

    container.querySelector('#s-disconnect-google').addEventListener('click', () => {
      Auth.Google.disconnect();
      setStatus('s-google-status', 'DISCONNECTED', false);
      refreshConnectBtns(container);
    });
  }

  // ── MICROSOFT SECTION ─────────────────────────────────────────────────────
  function msStatus() {
    if (typeof Auth === 'undefined') return 'NOT CONNECTED';
    if (Auth.Microsoft.isConnected()) {
      const em = load('ms_email');
      return '● CONNECTED' + (em ? ' — ' + em : '');
    }
    return 'NOT CONNECTED';
  }

  function bindMicrosoft(container) {
    container.querySelector('#s-save-ms-id').addEventListener('click', () => {
      const id = container.querySelector('#s-ms-client-id').value.trim();
      save('ms_client_id', id);
      setStatus('s-ms-status', id ? 'CLIENT ID SAVED' : 'NO CLIENT ID', !!id);
    });

    container.querySelector('#s-connect-ms').addEventListener('click', async () => {
      setStatus('s-ms-status', 'OPENING AUTH WINDOW...', false);
      try {
        await Auth.Microsoft.connect();
        setStatus('s-ms-status', msStatus(), true);
        refreshConnectBtns(container);
        if (typeof EmailView !== 'undefined')    EmailView.refresh();
        if (typeof CalendarView !== 'undefined') CalendarView.refresh();
      } catch(e) {
        setStatus('s-ms-status', '✕ ' + e.message, false);
      }
    });

    container.querySelector('#s-disconnect-ms').addEventListener('click', () => {
      Auth.Microsoft.disconnect();
      setStatus('s-ms-status', 'DISCONNECTED', false);
      refreshConnectBtns(container);
    });
  }

  function refreshConnectBtns(container) {
    const gConn = typeof Auth !== 'undefined' && Auth.Google.isConnected();
    const mConn = typeof Auth !== 'undefined' && Auth.Microsoft.isConnected();
    container.querySelector('#s-connect-google').style.display    = gConn ? 'none' : '';
    container.querySelector('#s-disconnect-google').style.display = gConn ? '' : 'none';
    container.querySelector('#s-connect-ms').style.display        = mConn ? 'none' : '';
    container.querySelector('#s-disconnect-ms').style.display     = mConn ? '' : 'none';
  }

  // ── CATEGORIES ─────────────────────────────────────────────────────────────
  const CAT_COLORS = ['#1a73e8','#d50000','#e67c73','#f4511e','#f6bf26','#33b679',
                      '#0f9d58','#039be5','#3f51b5','#7986cb','#8e24aa','#616161','#ff6a00'];

  function getCategories() {
    const def = typeof CalendarView !== 'undefined' ? CalendarView.DEFAULT_CATEGORIES : [];
    try { return JSON.parse(localStorage.getItem('apex_categories') || 'null') || def; }
    catch { return def; }
  }

  function saveCategories(cats) {
    localStorage.setItem('apex_categories', JSON.stringify(cats));
    if (typeof CalendarView !== 'undefined') CalendarView.refresh();
  }

  function renderCategories(container) {
    const list = container.querySelector('#s-categories-list');
    if (!list) return;
    const cats = getCategories();
    list.innerHTML = cats.map((c, i) => `
      <div class="s-cat-row" data-idx="${i}">
        <div class="s-cat-swatch" style="background:${c.color}" data-idx="${i}" title="Click to change color"></div>
        <input class="s-cat-name settings-input" data-idx="${i}" value="${c.name}" placeholder="Category name" style="flex:1;min-width:80px"/>
        <input class="s-cat-kw settings-input" data-idx="${i}" value="${(c.keywords||[]).join(', ')}" placeholder="keyword1, keyword2" style="flex:2"/>
        <button class="s-cat-del" data-idx="${i}" title="Remove">✕</button>
      </div>`).join('');

    // Swatch click → cycle color
    list.querySelectorAll('.s-cat-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        const idx = +sw.dataset.idx;
        const cur = CAT_COLORS.indexOf(cats[idx].color);
        cats[idx].color = CAT_COLORS[(cur + 1) % CAT_COLORS.length];
        saveCategories(cats);
        renderCategories(container);
      });
    });

    // Name change
    list.querySelectorAll('.s-cat-name').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx = +inp.dataset.idx;
        cats[idx].name = inp.value.trim();
        saveCategories(cats);
      });
    });

    // Keywords change
    list.querySelectorAll('.s-cat-kw').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx = +inp.dataset.idx;
        cats[idx].keywords = inp.value.split(',').map(k => k.trim()).filter(Boolean);
        saveCategories(cats);
      });
    });

    // Delete
    list.querySelectorAll('.s-cat-del').forEach(btn => {
      btn.addEventListener('click', () => {
        cats.splice(+btn.dataset.idx, 1);
        saveCategories(cats);
        renderCategories(container);
      });
    });
  }

  function init() {
    const container = document.getElementById('view-settings');
    const gConn = typeof Auth !== 'undefined' && Auth.Google.isConnected();
    const mConn = typeof Auth !== 'undefined' && Auth.Microsoft.isConnected();

    container.innerHTML = `
      <div class="settings-scroll">

        <!-- GOOGLE -->
        <div class="settings-section">
          <div class="settings-section-title">GOOGLE ACCOUNT</div>
          <div class="settings-row">
            <label class="settings-label">CLIENT ID</label>
            <input class="settings-input" id="s-google-client-id" type="text"
              placeholder="xxxxxxxx.apps.googleusercontent.com"
              value="${load('google_client_id')}"/>
          </div>
          <div class="settings-row-btns">
            <button class="settings-save-btn" id="s-save-google-id">SAVE</button>
            <button class="settings-connect-btn" id="s-connect-google"
              style="${gConn ? 'display:none' : ''}">CONNECT GOOGLE</button>
            <button class="settings-connect-btn" id="s-disconnect-google"
              style="${gConn ? '' : 'display:none'}">DISCONNECT GOOGLE</button>
          </div>
          <div class="settings-status${gConn ? ' connected' : ''}" id="s-google-status">
            ${googleStatus()}
          </div>
          <div class="settings-hint">
            Covers Gmail &amp; Google Calendar. Get your Client ID at
            console.cloud.google.com &rarr; APIs &amp; Services &rarr; Credentials.
            Add your origin as an Authorized JavaScript origin (no redirect URI needed for token flow).
          </div>
        </div>

        <!-- MICROSOFT -->
        <div class="settings-section">
          <div class="settings-section-title">MICROSOFT ACCOUNT</div>
          <div class="settings-row">
            <label class="settings-label">AZURE CLIENT ID</label>
            <input class="settings-input" id="s-ms-client-id" type="text"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value="${load('ms_client_id')}"/>
          </div>
          <div class="settings-row-btns">
            <button class="settings-save-btn" id="s-save-ms-id">SAVE</button>
            <button class="settings-connect-btn" id="s-connect-ms"
              style="${mConn ? 'display:none' : ''}">CONNECT MICROSOFT</button>
            <button class="settings-connect-btn" id="s-disconnect-ms"
              style="${mConn ? '' : 'display:none'}">DISCONNECT MICROSOFT</button>
          </div>
          <div class="settings-status${mConn ? ' connected' : ''}" id="s-ms-status">
            ${msStatus()}
          </div>
          <div class="settings-hint">
            Covers Outlook &amp; Outlook Calendar. Register at portal.azure.com &rarr;
            App Registrations. Platform: Single-page application (SPA).
            Add your origin as a redirect URI.
          </div>
        </div>

        <!-- EVENT CATEGORIES -->
        <div class="settings-section">
          <div class="settings-section-title">EVENT CATEGORIES</div>
          <div class="settings-hint">Keywords auto-color your calendar events. Click a swatch to cycle colors.</div>
          <div id="s-categories-list"></div>
          <div class="settings-row-btns" style="margin-top:10px">
            <button class="settings-connect-btn" id="s-add-cat">+ ADD CATEGORY</button>
          </div>
        </div>

        <!-- GEMINI -->
        <div class="settings-section">
          <div class="settings-section-title">AI — GEMINI</div>
          <div class="settings-row">
            <label class="settings-label">API KEY</label>
            <input class="settings-input" id="s-gemini" type="password"
              placeholder="AIza..." value="${load('gemini_key')}"/>
          </div>
          <div class="settings-row">
            <label class="settings-label">MODEL</label>
            <select class="settings-input settings-select" id="s-gemini-model">
              ${[
                ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite  — fastest, cheapest'],
                ['gemini-2.5-flash',      'Gemini 2.5 Flash       — fast, balanced'],
                ['gemini-2.5-pro',        'Gemini 2.5 Pro         — most capable'],
              ].map(([val, label]) =>
                `<option value="${val}"${(load('gemini_model')||'gemini-2.5-flash-lite') === val ? ' selected' : ''}>${label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="settings-row-btns">
            <button class="settings-save-btn" id="s-save-gemini">SAVE</button>
            <button class="settings-connect-btn" id="s-test-gemini">TEST CONNECTION</button>
          </div>
          <div class="settings-status" id="s-gemini-status">
            ${load('gemini_key') ? '● KEY SAVED — ' + (load('gemini_model') || 'gemini-2.5-flash-lite') : 'NO KEY SET'}
          </div>
        </div>

        <!-- OLLAMA -->
        <div class="settings-section">
          <div class="settings-section-title">AI — OLLAMA</div>
          <div class="settings-row">
            <label class="settings-label">BASE URL</label>
            <input class="settings-input" id="s-ollama" type="text"
              placeholder="http://localhost:11434"
              value="${load('ollama_url') || 'http://localhost:11434'}"/>
          </div>
          <div class="settings-row">
            <label class="settings-label">DEFAULT MODEL</label>
            <input class="settings-input" id="s-ollama-model" type="text"
              placeholder="llama3" value="${load('ollama_model') || 'llama3'}"/>
          </div>
          <div class="settings-row-btns">
            <button class="settings-save-btn" id="s-save-ollama">SAVE</button>
          </div>
          <div class="settings-status" id="s-ollama-status">
            ${load('ollama_url') ? '● CONFIGURED' : 'USING DEFAULT LOCALHOST'}
          </div>
        </div>

      </div>
    `;

    bindGoogle(container);
    bindMicrosoft(container);
    renderCategories(container);

    container.querySelector('#s-add-cat').addEventListener('click', () => {
      const cats = getCategories();
      cats.push({ name: 'New Category', keywords: [], color: CAT_COLORS[0] });
      saveCategories(cats);
      renderCategories(container);
    });

    container.querySelector('#s-save-gemini').addEventListener('click', () => {
      const key = container.querySelector('#s-gemini').value.trim();
      const mdl = container.querySelector('#s-gemini-model').value || 'gemini-2.5-flash-lite';
      save('gemini_key', key);
      save('gemini_model', mdl);
      setStatus('s-gemini-status', key ? `● KEY SAVED — ${mdl}` : 'NO KEY SET', !!key);
    });

    container.querySelector('#s-test-gemini').addEventListener('click', async () => {
      setStatus('s-gemini-status', 'TESTING...', false);
      try {
        const reply = await AI.sendToGemini([{ role: 'user', text: 'Reply with exactly: "APEX online."' }]);
        setStatus('s-gemini-status', '● ' + reply.trim(), true);
      } catch(e) {
        setStatus('s-gemini-status', '✕ ' + e.message, false);
      }
    });

    container.querySelector('#s-save-ollama').addEventListener('click', () => {
      save('ollama_url',   container.querySelector('#s-ollama').value.trim());
      save('ollama_model', container.querySelector('#s-ollama-model').value.trim());
      setStatus('s-ollama-status', '● SAVED', true);
    });
  }

  return { init };
})();
