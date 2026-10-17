const $ = (id) => document.getElementById(id);
const state = { modules: [], index: 0, startedAt: null, timerId: null, logs: [] };
function pad(value) { return String(value).padStart(2, '0'); }
function mmss(seconds) { return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`; }
function currentModule() { return state.modules[state.index]; }
function render() {
  const module = currentModule();
  if (!module) return;
  $('moduleCategory').textContent = module.category || `MODULE · ${pad(state.index + 1)}`;
  $('moduleTitle').textContent = module.title;
  $('moduleDescription').textContent = module.description || '';
  $('moduleFocus').textContent = module.focus || '';
  $('focusBox').hidden = !module.focus;
  $('moduleDuration').textContent = module.duration || '';
  $('moduleNumber').textContent = pad(state.index + 1);
  $('moduleTotal').textContent = pad(state.modules.length);
  $('visualIndex').textContent = pad(state.index + 1);
  $('progressFill').style.width = `${((state.index + 1) / state.modules.length) * 100}%`;
  $('backButton').disabled = state.index === 0;
  $('nextButton').disabled = state.index === state.modules.length - 1;
  $('moduleDots').replaceChildren(...state.modules.map((_, i) => {
    const dot = document.createElement('span'); dot.className = `module-dot${i === state.index ? ' active' : ''}`; dot.setAttribute('aria-label', `Module ${i + 1}`); return dot;
  }));
  $('startButton').hidden = Boolean(state.startedAt);
  $('doneButton').hidden = !state.startedAt;
  $('timerPanel').hidden = !state.startedAt;
  if (state.startedAt) updateTimer();
}
function updateTimer() {
  if (!state.startedAt) return;
  $('timerDisplay').textContent = mmss(Math.floor((Date.now() - state.startedAt.timestamp) / 1000));
}
function start() {
  if (state.startedAt) return;
  const now = new Date();
  state.startedAt = { timestamp: now.getTime(), date: now.toLocaleDateString(), time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), module: currentModule().title };
  $('timerStarted').textContent = `Started ${state.startedAt.time}`;
  $('statusText').textContent = 'Session in progress';
  state.timerId = window.setInterval(updateTimer, 250);
  render();
}
async function done() {
  if (!state.startedAt) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - state.startedAt.timestamp) / 1000));
  const entry = { module: state.startedAt.module, date: state.startedAt.date, startTime: state.startedAt.time, duration: mmss(elapsed), seconds: elapsed };
  try {
    const response = await fetch('/api/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    if (!response.ok) throw new Error('The log file could not be updated.');
    state.logs = (await response.json()).logs;
    updateLogCount();
  } catch (error) {
    $('statusText').textContent = 'Could not save log — try Done again';
    console.error(error);
    return;
  }
  clearInterval(state.timerId); state.timerId = null; state.startedAt = null;
  $('statusText').textContent = 'Session saved';
  render();
}
function navigate(delta) {
  const target = state.index + delta;
  if (target < 0 || target >= state.modules.length) return;
  state.index = target;
  $('statusText').textContent = state.startedAt ? 'Session in progress' : 'Ready when you are';
  render();
}
function updateLogCount() { $('logCount').textContent = state.logs.length; }
function renderLog() {
  const container = $('logEntries'); container.replaceChildren();
  if (!state.logs.length) { container.innerHTML = '<div class="empty-log">Your completed sessions will appear here.</div>'; return; }
  for (const entry of state.logs) {
    const row = document.createElement('div'); row.className = 'log-entry';
    const title = document.createElement('strong'); title.textContent = entry.module;
    const meta = document.createElement('span'); meta.textContent = `${entry.date} · Started ${entry.startTime}`;
    const duration = document.createElement('span'); duration.className = 'log-duration'; duration.textContent = entry.duration;
    row.append(title, meta, duration); container.append(row);
  }
}
async function init() {
  $('footerDate').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()).toUpperCase();
  try {
    const [modulesResponse, logsResponse] = await Promise.all([fetch('./modules.json'), fetch('/api/logs')]);
    if (!modulesResponse.ok) throw new Error('Could not load modules.json');
    if (!logsResponse.ok) throw new Error('Could not load session-log.json');
    const data = await modulesResponse.json();
    if (!Array.isArray(data.modules) || !data.modules.length) throw new Error('Add at least one module to modules.json');
    state.logs = await logsResponse.json();
    // Preserve any sessions saved by an earlier browser-only version of the app.
    if (state.logs.length === 0) {
      try {
        const oldLogs = JSON.parse(localStorage.getItem('training-session-log') || '[]');
        if (Array.isArray(oldLogs) && oldLogs.length) {
          for (const entry of [...oldLogs].reverse()) {
            await fetch('/api/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
          }
          localStorage.removeItem('training-session-log');
          state.logs = await (await fetch('/api/logs')).json();
        }
      } catch (migrationError) { console.warn('Could not migrate older browser session logs.', migrationError); }
    }
    state.modules = data.modules;
    updateLogCount();
    $('statusText').textContent = 'Ready when you are';
    render();
  } catch (error) {
    $('moduleTitle').textContent = 'Could not load modules.';
    $('moduleDescription').textContent = 'Start the local server with python server.py, then open the address it prints. Check modules.json if this keeps happening.';
    $('statusText').textContent = 'Module data unavailable';
    console.error(error);
  }
}
$('startButton').addEventListener('click', start);
$('doneButton').addEventListener('click', done);
$('backButton').addEventListener('click', () => navigate(-1));
$('nextButton').addEventListener('click', () => navigate(1));
$('logToggle').addEventListener('click', () => { renderLog(); $('logDialog').showModal(); });
$('closeLog').addEventListener('click', () => $('logDialog').close());
$('clearLog').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/logs', { method: 'DELETE' });
    if (!response.ok) throw new Error('The log file could not be cleared.');
    state.logs = [];
    updateLogCount();
    renderLog();
  } catch (error) { console.error(error); }
});
document.addEventListener('keydown', (event) => {
  if ($('logDialog').open || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'ArrowLeft') navigate(-1);
  if (event.key === 'ArrowRight') navigate(1);
  if (event.key === 'Escape') $('logDialog').close();
});
init();
