const SettingsView = (() => {
  function save(key, val) { localStorage.setItem(`apex_${key}`, val); }
  function load(key) { return localStorage.getItem(`apex_${key}`) || ''; }

  function init() {
    const container = document.getElementById('view-settings');
    container.innerHTML = `
      <div class="settings-scroll">

        <div class="settings-section">
          <div class="settings-section-title">EMAIL</div>
          <div class="settings-row">
            <label class="settings-label">GMAIL ADDRESS</label>
            <input class="settings-input" id="s-email" type="email" placeholder="your@gmail.com" value="${load('email')}"/>
          </div>
          <div class="settings-row-btns">
            <button class="settings-connect-btn" id="s-connect-gmail">CONNECT GOOGLE MAIL</button>
          </div>
          <div class="settings-status" id="s-gmail-status">
            ${load('email') ? '&#9679; CONFIGURED — ' + load('email') : 'NOT CONNECTED'}
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">CALENDAR</div>
          <div class="settings-row">
            <label class="settings-label">GOOGLE CALENDAR</label>
          </div>
          <div class="settings-row-btns">
            <button class="settings-connect-btn" id="s-connect-cal">CONNECT GOOGLE CALENDAR</button>
          </div>
          <div class="settings-status" id="s-cal-status">NOT CONNECTED</div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">AI — GEMINI</div>
          <div class="settings-row">
            <label class="settings-label">GEMINI API KEY</label>
            <input class="settings-input" id="s-gemini" type="password" placeholder="AIza..." value="${load('gemini_key')}"/>
          </div>
          <div class="settings-row-btns">
            <button class="settings-save-btn" id="s-save-gemini">SAVE KEY</button>
          </div>
          <div class="settings-status" id="s-gemini-status">
            ${load('gemini_key') ? '&#9679; KEY SAVED' : 'NO KEY SET'}
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">AI — OLLAMA</div>
          <div class="settings-row">
            <label class="settings-label">OLLAMA BASE URL</label>
            <input class="settings-input" id="s-ollama" type="text" placeholder="http://localhost:11434" value="${load('ollama_url') || 'http://localhost:11434'}"/>
          </div>
          <div class="settings-row">
            <label class="settings-label">DEFAULT MODEL</label>
            <input class="settings-input" id="s-ollama-model" type="text" placeholder="llama3" value="${load('ollama_model') || 'llama3'}"/>
          </div>
          <div class="settings-row-btns">
            <button class="settings-save-btn" id="s-save-ollama">SAVE</button>
          </div>
          <div class="settings-status" id="s-ollama-status">
            ${load('ollama_url') ? '&#9679; CONFIGURED' : 'USING DEFAULT LOCALHOST'}
          </div>
        </div>

      </div>
    `;

    container.querySelector('#s-save-gemini').addEventListener('click', () => {
      const val = container.querySelector('#s-gemini').value.trim();
      save('gemini_key', val);
      const st = container.querySelector('#s-gemini-status');
      st.textContent = val ? '● KEY SAVED' : 'NO KEY SET';
      st.className = 'settings-status' + (val ? ' connected' : '');
    });

    container.querySelector('#s-save-ollama').addEventListener('click', () => {
      save('ollama_url', container.querySelector('#s-ollama').value.trim());
      save('ollama_model', container.querySelector('#s-ollama-model').value.trim());
      const st = container.querySelector('#s-ollama-status');
      st.textContent = '● SAVED';
      st.className = 'settings-status connected';
    });

    container.querySelector('#s-connect-gmail').addEventListener('click', () => {
      const email = container.querySelector('#s-email').value.trim();
      if (email) {
        save('email', email);
        const st = container.querySelector('#s-gmail-status');
        st.textContent = '● CONFIGURED — ' + email;
        st.className = 'settings-status connected';
      }
    });

    container.querySelector('#s-connect-cal').addEventListener('click', () => {
      const st = container.querySelector('#s-cal-status');
      st.textContent = '● GOOGLE CALENDAR INTEGRATION COMING SOON';
      st.className = 'settings-status';
    });
  }

  return { init };
})();
