// ── CLOCK ────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById('tb-time');
  const dateEl = document.getElementById('tb-date');
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  if (timeEl) {
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    const s = String(now.getSeconds()).padStart(2,'0');
    timeEl.textContent = `${h}:${m}:${s}`;
  }
  if (dateEl) {
    dateEl.textContent = `${days[now.getDay()]} ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]}`;
  }
}
setInterval(updateClock, 1000);
updateClock();

// ── NAVIGATION ───────────────────────────────────────
const views = ['chat','email','calendar','settings'];
let currentView = 'chat';

function showView(name, isNew = false) {
  currentView = name;

  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('active', v === name);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const match = btn.dataset.view === name && !btn.dataset.new;
    btn.classList.toggle('active', match);
  });

  const toggle = document.getElementById('chat-mode-toggle');
  const titleBar = document.getElementById('view-title-bar');
  const titles = { email: 'EMAIL', calendar: 'CALENDAR', settings: 'SETTINGS' };

  if (name === 'chat') {
    toggle && toggle.classList.remove('hidden');
    titleBar && titleBar.classList.add('hidden');
    titleBar && (titleBar.textContent = '');
  } else {
    toggle && toggle.classList.add('hidden');
    titleBar && titleBar.classList.remove('hidden');
    titleBar && (titleBar.textContent = titles[name] || '');
  }

  if (isNew) Chat.newChat();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showView(btn.dataset.view, !!btn.dataset.new);
  });
});

// ── TASKS ────────────────────────────────────────────
let tasks = JSON.parse(localStorage.getItem('apex_tasks') || '[]');

function saveTasks() {
  localStorage.setItem('apex_tasks', JSON.stringify(tasks));
}

function renderTasks() {
  const list = document.getElementById('tasks-list');
  if (!list) return;
  if (tasks.length === 0) {
    list.innerHTML = '<div class="tasks-empty">NO TASKS<br/>PRESS + TO ADD</div>';
    return;
  }
  list.innerHTML = tasks.map((t, i) => `
    <div class="task-item">
      <div class="task-check${t.done ? ' done' : ''}" data-i="${i}"></div>
      <span class="task-text${t.done ? ' done' : ''}">${t.text}</span>
      <button class="task-del" data-i="${i}" title="Remove">&#215;</button>
    </div>`).join('');

  list.querySelectorAll('.task-check').forEach(el => {
    el.addEventListener('click', () => {
      tasks[+el.dataset.i].done = !tasks[+el.dataset.i].done;
      saveTasks(); renderTasks();
    });
  });
  list.querySelectorAll('.task-del').forEach(el => {
    el.addEventListener('click', () => {
      tasks.splice(+el.dataset.i, 1);
      saveTasks(); renderTasks();
    });
  });
}

const addTaskBtn = document.getElementById('add-task-btn');
const taskInputWrap = document.getElementById('task-input-wrap');
const taskInput = document.getElementById('task-input');

addTaskBtn && addTaskBtn.addEventListener('click', () => {
  taskInputWrap.classList.toggle('hidden');
  if (!taskInputWrap.classList.contains('hidden')) taskInput.focus();
});

taskInput && taskInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const val = taskInput.value.trim();
    if (val) {
      tasks.push({ text: val, done: false });
      saveTasks(); renderTasks();
      taskInput.value = '';
      taskInputWrap.classList.add('hidden');
    }
  }
  if (e.key === 'Escape') taskInputWrap.classList.add('hidden');
});

renderTasks();

// ── INIT ─────────────────────────────────────────────
HoneycombBg.init(document.getElementById('honeycomb-canvas'));
Chat.init();
EmailView.init();
CalendarView.init();
SettingsView.init();

// ── PWA INSTALL ───────────────────────────────────────
let installPrompt = null;
const overlay = document.getElementById('install-overlay');
const installBtn = document.getElementById('install-btn');

if (window.matchMedia('(display-mode: standalone)').matches) {
  overlay && overlay.classList.add('hidden');
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
});
installBtn && installBtn.addEventListener('click', async () => {
  if (installPrompt) {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') overlay && overlay.classList.add('hidden');
    installPrompt = null;
  } else {
    overlay && overlay.classList.add('hidden');
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
