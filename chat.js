const Chat = (() => {
  const APEX_SVG_SMALL = `
    <svg class="apex-hex-small" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <polygon points="40,4 70,21 70,59 40,76 10,59 10,21"
               fill="#0a0a0a" stroke="#FF6B00" stroke-width="2" stroke-linejoin="miter"/>
      <polygon points="40,12 62,25 62,55 40,68 18,55 18,25"
               fill="none" stroke="#FF6B00" stroke-width="0.8" opacity="0.3"/>
      <text x="40" y="44" font-family="'Arial Black',Impact,sans-serif"
            font-size="14" font-weight="900" fill="#FF6B00" text-anchor="middle">A</text>
      <text x="40" y="56" font-family="'Courier New',monospace"
            font-size="7" fill="#FF6B00" text-anchor="middle" letter-spacing="2" opacity="0.7">P.E.X</text>
    </svg>`;

  let messages = [];
  let mode = 'focus';
  let thinking = false;

  const focusHex = () => document.getElementById('apex-hex-large');
  const focusResponse = () => document.getElementById('focus-response');
  const messagesEl = () => document.getElementById('messages');
  const input = () => document.getElementById('chat-input');
  const sendBtn = () => document.getElementById('send-btn');

  function setThinking(val) {
    thinking = val;
    const hex = focusHex();
    const smalls = document.querySelectorAll('.apex-hex-small');
    if (val) {
      hex && hex.classList.add('thinking');
      smalls.forEach(s => s.classList.add('thinking'));
      if (mode === 'focus') {
        const r = focusResponse();
        r && (r.textContent = '...');
      }
    } else {
      hex && hex.classList.remove('thinking');
      smalls.forEach(s => s.classList.remove('thinking'));
    }
  }

  function renderMessages() {
    const el = messagesEl();
    if (!el) return;
    el.innerHTML = messages.map(m => {
      if (m.role === 'apex') {
        return `<div class="msg-apex">
          ${APEX_SVG_SMALL}
          <div class="msg-apex-text">${m.text}</div>
        </div>`;
      }
      return `<div class="msg-user"><div class="msg-user-text">${m.text}</div></div>`;
    }).join('');
    const scroll = document.getElementById('messages-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  function apexReply(text) {
    messages.push({ role: 'apex', text });
    if (mode === 'focus') {
      const r = focusResponse();
      if (r) { r.textContent = text; r.classList.remove('empty'); }
    }
    if (mode === 'full') renderMessages();
  }

  async function send() {
    const val = input().value.trim();
    if (!val || thinking) return;
    input().value = '';

    messages.push({ role: 'user', text: val });
    if (mode === 'full') renderMessages();

    setThinking(true);

    await new Promise(r => setTimeout(r, 1400 + Math.random() * 800));
    setThinking(false);

    apexReply(`[APEX] Received: "${val}" — AI integration coming soon.`);
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === m);
    });
    document.getElementById('mode-focus').classList.toggle('active', m === 'focus');
    document.getElementById('mode-full').classList.toggle('active', m === 'full');

    if (m === 'full') {
      if (messages.length === 0) {
        messages.push({ role: 'apex', text: 'SYSTEM READY — HOW CAN I ASSIST?' });
      }
      renderMessages();
    }
  }

  function newChat() {
    messages = [];
    const r = focusResponse();
    if (r) { r.textContent = 'SYSTEM READY — HOW CAN I ASSIST?'; r.classList.add('empty'); }
    renderMessages();
  }

  function init() {
    const s = sendBtn();
    const inp = input();
    s && s.addEventListener('click', send);
    inp && inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    const r = focusResponse();
    if (r) r.classList.add('empty');
  }

  return { init, newChat, setMode };
})();
