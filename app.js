const $ = (id) => document.getElementById(id);
const state = {
  days: [], setsById: new Map(), modulesById: new Map(), logs: [],
  dayIndex: 0, moduleIndex: 0, startedAt: null, timerId: null,
};

function pad(value) { return String(value).padStart(2, '0'); }
function mmss(seconds) { return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`; }
function todayIndex() {
  const weekday = new Date().getDay(); // Sunday is 0; the schedule starts on Monday.
  return weekday === 0 ? 6 : weekday - 1;
}
function currentDay() { return state.days[state.dayIndex]; }
function currentSet() { return state.setsById.get(currentDay().setId); }
function currentModules() { return currentSet().moduleIds.map((id) => state.modulesById.get(id)); }
function currentModule() { return currentModules()[state.moduleIndex]; }

function appendInlineMarkdown(parent, text) {
  const syntax = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let offset = 0;
  for (const match of text.matchAll(syntax)) {
    parent.append(document.createTextNode(text.slice(offset, match.index)));
    const token = match[0];
    const element = document.createElement(token.startsWith('**') ? 'strong' : token.startsWith('*') ? 'em' : 'code');
    element.textContent = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1);
    parent.append(element);
    offset = match.index + token.length;
  }
  parent.append(document.createTextNode(text.slice(offset)));
}

function renderInstructions(markdown) {
  const container = $('moduleInstructions');
  container.replaceChildren();
  const lines = String(markdown || '').split(/\r?\n/);
  const headingPattern = /^#{1,3}\s+/;
  const listPattern = /^\s*([-*+] |\d+\. )(.*)$/;
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim()) { index += 1; continue; }
    const heading = lines[index].match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const headingElement = document.createElement(`h${heading[1].length + 2}`);
      appendInlineMarkdown(headingElement, heading[2]);
      container.append(headingElement);
      index += 1;
      continue;
    }
    const firstListItem = lines[index].match(listPattern);
    if (firstListItem) {
      const ordered = /^\s*\d+\. /.test(lines[index]);
      const list = document.createElement(ordered ? 'ol' : 'ul');
      while (index < lines.length) {
        const itemMatch = lines[index].match(listPattern);
        if (!itemMatch || /^\s*\d+\. /.test(lines[index]) !== ordered) break;
        let itemText = itemMatch[2];
        index += 1;
        while (index < lines.length && /^\s+\S/.test(lines[index]) && !lines[index].match(listPattern)) {
          itemText += ` ${lines[index].trim()}`;
          index += 1;
        }
        const item = document.createElement('li');
        appendInlineMarkdown(item, itemText);
        list.append(item);
      }
      container.append(list);
      continue;
    }
    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() && !headingPattern.test(lines[index]) && !listPattern.test(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    if (paragraphLines.length) {
      const paragraph = document.createElement('p');
      appendInlineMarkdown(paragraph, paragraphLines.join(' '));
      container.append(paragraph);
    }
  }
}

function render() {
  const day = currentDay();
  const set = currentSet();
  const modules = currentModules();
  const isToday = state.dayIndex === todayIndex();
  const module = modules[state.moduleIndex];
  $('weekHeader').classList.toggle('is-today', isToday);
  $('dayName').textContent = day.label;
  $('setName').textContent = set.name;
  $('todayButton').disabled = isToday || Boolean(state.startedAt);
  $('previousDay').disabled = Boolean(state.startedAt);
  $('nextDay').disabled = Boolean(state.startedAt);
  $('railDay').textContent = day.label.toUpperCase();
  $('railSet').textContent = set.name;

  $('moduleCategory').textContent = module.category || 'TRAINING';
  $('moduleId').textContent = module.id;
  $('moduleTitle').textContent = module.title;
  renderInstructions(module.instructions);
  $('moduleDuration').textContent = module.duration || '';
  $('moduleNumber').textContent = pad(state.moduleIndex + 1);
  $('moduleTotal').textContent = pad(modules.length);
  $('progressFill').style.width = `${((state.moduleIndex + 1) / modules.length) * 100}%`;
  $('backButton').disabled = state.moduleIndex === 0 || Boolean(state.startedAt);
  $('nextButton').disabled = state.moduleIndex === modules.length - 1 || Boolean(state.startedAt);

  const list = $('moduleList');
  list.replaceChildren(...modules.map((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `module-link${index === state.moduleIndex ? ' active' : ''}${index < state.moduleIndex ? ' visited' : ''}`;
    button.setAttribute('aria-current', index === state.moduleIndex ? 'step' : 'false');
    button.disabled = Boolean(state.startedAt);
    const number = document.createElement('span');
    number.className = 'module-link-number';
    number.textContent = item.id.split('-')[0];
    const text = document.createElement('span');
    text.className = 'module-link-text';
    const titlePrefix = `${day.label} ${item.id.split('-')[0]}-`;
    text.textContent = item.title.startsWith(titlePrefix) ? item.title.slice(titlePrefix.length) : item.title;
    button.append(number, text);
    button.addEventListener('click', () => { state.moduleIndex = index; render(); });
    return button;
  }));

  const image = $('moduleImage');
  const hasImage = Boolean(module.image);
  image.hidden = !hasImage;
  $('visualColumn').hidden = !hasImage;
  $('moduleContent').classList.toggle('with-image', hasImage);
  $('visualPlaceholder').hidden = true;
  $('visualCaption').hidden = !hasImage;
  $('visualColumn').classList.toggle('has-image', hasImage);
  if (hasImage) {
    image.src = module.image;
    image.alt = module.imageAlt || '';
  } else {
    image.removeAttribute('src');
    image.alt = '';
    $('visualIndex').textContent = pad(state.moduleIndex + 1);
  }

  $('startButton').hidden = Boolean(state.startedAt);
  $('doneButton').hidden = !state.startedAt;
  $('timerPanel').hidden = !state.startedAt;
  if (state.startedAt) updateTimer();
}

function updateTimer() {
  if (!state.startedAt) return;
  $('timerDisplay').textContent = mmss(Math.floor((Date.now() - state.startedAt.timestamp) / 1000));
}

function localDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function start() {
  if (state.startedAt) return;
  const now = new Date();
  const day = currentDay();
  const set = currentSet();
  const module = currentModule();
  state.startedAt = {
    timestamp: now.getTime(), date: localDate(now),
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    moduleId: module.id, module: module.title,
    setId: set.id, setName: set.name, setDay: day.label,
  };
  $('statusText').textContent = 'In progress';
  $('timerStarted').textContent = `Started ${state.startedAt.time}`;
  state.timerId = window.setInterval(updateTimer, 250);
  render();
}

async function done() {
  if (!state.startedAt) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - state.startedAt.timestamp) / 1000));
  const entry = {
    setId: state.startedAt.setId, setName: state.startedAt.setName, setDay: state.startedAt.setDay,
    moduleId: state.startedAt.moduleId, module: state.startedAt.module,
    date: state.startedAt.date, startTime: state.startedAt.time,
    duration: mmss(elapsed), seconds: elapsed,
  };
  try {
    const response = await fetch('/api/logs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
    });
    if (!response.ok) throw new Error('The log file could not be updated.');
    state.logs = (await response.json()).logs;
    updateLogCount();
  } catch (error) {
    $('statusText').textContent = 'Could not save log — try Done again';
    console.error(error);
    return;
  }
  clearInterval(state.timerId);
  state.timerId = null;
  state.startedAt = null;
  $('statusText').textContent = 'Session saved';
  render();
}

function navigateDay(delta) {
  state.dayIndex = (state.dayIndex + delta + state.days.length) % state.days.length;
  state.moduleIndex = 0;
  $('statusText').textContent = state.startedAt ? 'In progress' : 'Ready';
  render();
}

function navigateModule(delta) {
  const target = state.moduleIndex + delta;
  if (target < 0 || target >= currentModules().length) return;
  state.moduleIndex = target;
  if (!state.startedAt) $('statusText').textContent = 'Ready';
  render();
}

function updateLogCount() { $('logCount').textContent = state.logs.length; }

function renderLog() {
  const container = $('logEntries');
  container.replaceChildren();
  if (!state.logs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-log';
    empty.textContent = 'Completed sessions will appear here across all training days.';
    container.append(empty);
    return;
  }
  for (const entry of state.logs) {
    const row = document.createElement('div');
    row.className = 'log-entry';
    const set = document.createElement('strong');
    set.textContent = entry.setName ? `${entry.setDay || ''} · ${entry.setName}` : 'Training session';
    const module = document.createElement('span');
    module.className = 'log-module';
    module.textContent = entry.module || '';
    const meta = document.createElement('span');
    meta.textContent = `${entry.date || ''} · Started ${entry.startTime || ''}`;
    const duration = document.createElement('span');
    duration.className = 'log-duration';
    duration.textContent = entry.duration || '';
    row.append(set, module, meta, duration);
    container.append(row);
  }
}

async function init() {
  try {
    const [planResponse, logsResponse] = await Promise.all([fetch('./modules.json'), fetch('/api/logs')]);
    if (!planResponse.ok) throw new Error('Could not load modules.json');
    if (!logsResponse.ok) throw new Error('Could not load session-log.json');
    const data = await planResponse.json();
    if (!Array.isArray(data.days) || data.days.length !== 7) throw new Error('modules.json must define all seven weekdays.');
    if (!Array.isArray(data.sets) || !Array.isArray(data.modules)) throw new Error('modules.json must define sets and modules.');
    data.modules.forEach((module, index) => {
      const expectedId = String(index + 1).padStart(2, '0');
      if (!module.id?.startsWith(`${expectedId}-`)) throw new Error(`Module ${index + 1} must use the ID prefix ${expectedId} and modules must stay in number order.`);
      if (typeof module.instructions !== 'string') throw new Error(`Module ${module.id} needs an instructions field.`);
    });
    state.setsById = new Map(data.sets.map((set) => [set.id, set]));
    state.modulesById = new Map(data.modules.map((module) => [module.id, module]));
    state.days = data.days;
    for (const day of state.days) {
      const set = state.setsById.get(day.setId);
      if (!set || !Array.isArray(set.moduleIds) || !set.moduleIds.length || set.moduleIds.length > 5) throw new Error(`The ${day.label} set must contain between one and five modules.`);
      if (set.moduleIds.some((id) => !state.modulesById.has(id))) throw new Error(`The ${day.label} set references a missing module.`);
    }
    state.logs = await logsResponse.json();
    // Import any sessions saved by the earlier browser-only version if the local file is empty.
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
    state.dayIndex = todayIndex();
    updateLogCount();
    $('statusText').textContent = 'Ready';
    render();
  } catch (error) {
    $('moduleTitle').textContent = 'Could not load the weekly plan.';
    $('moduleDescription').textContent = 'Start the local server with python server.py, then check modules.json.';
    $('statusText').textContent = 'Plan unavailable';
    console.error(error);
  }
}

$('startButton').addEventListener('click', start);
$('doneButton').addEventListener('click', done);
$('previousDay').addEventListener('click', () => navigateDay(-1));
$('nextDay').addEventListener('click', () => navigateDay(1));
$('todayButton').addEventListener('click', () => {
  state.dayIndex = todayIndex();
  state.moduleIndex = 0;
  $('statusText').textContent = 'Ready';
  render();
});
$('backButton').addEventListener('click', () => navigateModule(-1));
$('nextButton').addEventListener('click', () => navigateModule(1));
$('logToggle').addEventListener('click', () => { renderLog(); $('logDialog').showModal(); });
$('closeLog').addEventListener('click', () => $('logDialog').close());
$('fullscreenButton').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    $('statusText').textContent = 'Full screen unavailable';
    console.error('Could not change full-screen mode.', error);
  }
});
document.addEventListener('fullscreenchange', () => {
  const active = Boolean(document.fullscreenElement);
  $('fullscreenButton').setAttribute('aria-pressed', String(active));
  $('fullscreenButton').setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
  $('fullscreenButton').title = active ? 'Exit full screen' : 'Enter full screen';
  $('fullscreenGlyph').setAttribute('d', active
    ? 'M8 3v3a2 2 0 0 1-2 2H3m13-5v3a2 2 0 0 0 2 2h3M3 16h3a2 2 0 0 1 2 2v3m8 0v-3a2 2 0 0 1 2-2h3'
    : 'M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3');
});
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
  if (event.key === 'ArrowLeft') navigateModule(-1);
  if (event.key === 'ArrowRight') navigateModule(1);
});
init();
