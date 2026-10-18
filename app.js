const $ = (id) => document.getElementById(id);
const state = {
  days: [], workoutsById: new Map(), modulesById: new Map(), logs: [],
  dayIndex: 0, moduleIndex: 0, startedAt: null, timerId: null,
};

function pad(value) { return String(value).padStart(2, '0'); }
function mmss(seconds) { return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`; }
function todayIndex() {
  const weekday = new Date().getDay(); // Sunday is 0; the schedule starts on Monday.
  return weekday === 0 ? 6 : weekday - 1;
}
function currentDay() { return state.days[state.dayIndex]; }
function currentWorkout() { return state.workoutsById.get(currentDay().workoutId); }
function currentSteps() {
  return currentWorkout().steps.flatMap((step) => {
    const repeatCount = step.repeat || 1;
    return Array.from({ length: repeatCount }, (_, index) => ({
      module: state.modulesById.get(step.moduleId), repeatIndex: index + 1, repeatCount,
    }));
  });
}
function currentModules() { return currentSteps().map((step) => step.module); }
function currentModule() { return currentModules()[state.moduleIndex]; }
function repeatDetails(steps, index) {
  const step = steps[index];
  return { round: step.repeatIndex, total: step.repeatCount };
}

function parseInstructionSections(markdown) {
  const sections = new Map();
  let currentId = null;
  let lines = [];
  const save = () => { if (currentId) sections.set(currentId, lines.join('\n').trim()); };
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const match = line.match(/^##\s+(\d{2}-[a-z0-9-]+)\s*$/i);
    if (match) { save(); currentId = match[1]; lines = []; }
    else if (currentId) lines.push(line);
  }
  save();
  return sections;
}
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
  const listPattern = /^(\s*)([-*+] |\d+\. )(.*)$/;
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
      const parseList = (indent, ordered) => {
        const list = document.createElement(ordered ? 'ol' : 'ul');
        let lastItem = null;
        while (index < lines.length) {
          const itemMatch = lines[index].match(listPattern);
          if (!itemMatch) break;
          const itemIndent = itemMatch[1].replace(/\t/g, '    ').length;
          const itemOrdered = /^\d+\. /.test(itemMatch[2]);
          if (itemIndent < indent) break;
          if (itemIndent > indent) {
            if (lastItem) lastItem.append(parseList(itemIndent, itemOrdered));
            else index += 1;
            continue;
          }
          if (itemOrdered !== ordered) break;
          const item = document.createElement('li');
          appendInlineMarkdown(item, itemMatch[3].trimEnd());
          list.append(item);
          lastItem = item;
          index += 1;
          while (index < lines.length && /^\s+\S/.test(lines[index]) && !lines[index].match(listPattern)) {
            item.append(document.createElement('br'));
            appendInlineMarkdown(item, lines[index].trim());
            index += 1;
          }
        }
        return list;
      };
      const indent = firstListItem[1].replace(/\t/g, '    ').length;
      const ordered = /^\d+\. /.test(firstListItem[2]);
      container.append(parseList(indent, ordered));
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
  const workout = currentWorkout();
  const steps = currentSteps();
  const modules = steps.map((step) => step.module);
  const isToday = state.dayIndex === todayIndex();
  const module = modules[state.moduleIndex];
  $('weekHeader').classList.toggle('is-today', isToday);
  $('dayName').textContent = day.label;
  $('workoutName').textContent = workout.name;
  $('todayButton').disabled = isToday || Boolean(state.startedAt);
  $('previousDay').disabled = Boolean(state.startedAt);
  $('nextDay').disabled = Boolean(state.startedAt);
  $('railDay').textContent = day.label.toUpperCase();
  $('workoutNameRail').textContent = workout.name;
  $('workoutSummary').textContent = workout.summary || '';
  $('workoutDescription').textContent = workout.description || '';

  $('moduleCategory').textContent = module.category || 'TRAINING';
  $('moduleId').textContent = module.id;
  $('moduleTitle').textContent = module.title;
  renderInstructions(module.instructions);
  const repeat = repeatDetails(steps, state.moduleIndex);
  $('moduleDuration').textContent = module.duration || '';
  $('moduleRepeat').hidden = repeat.total < 2;
  $('moduleRepeat').textContent = repeat.total > 1 ? `ROUND ${pad(repeat.round)} / ${pad(repeat.total)}` : '';
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
    const title = item.title.startsWith(titlePrefix) ? item.title.slice(titlePrefix.length) : item.title;
    const repeat = repeatDetails(steps, index);
    text.textContent = repeat.total > 1 ? `Round ${repeat.round} of ${repeat.total} · ${title}` : title;
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
  $('visualColumn').classList.toggle('has-image', hasImage);
  if (hasImage) {
    image.src = module.image;
    image.alt = module.imageAlt || '';
    image.removeAttribute('style');
  } else {
    image.removeAttribute('src');
    image.alt = '';
    $('visualIndex').textContent = pad(state.moduleIndex + 1);
  }

  const active = Boolean(state.startedAt);
  const toggle = $('moduleToggle');
  toggle.classList.toggle('is-pressed', active);
  toggle.setAttribute('aria-pressed', String(active));
  toggle.setAttribute('aria-label', active ? 'Done and save this module' : 'Start this module');
  $('moduleToggleText').textContent = active ? 'Done' : 'Start';
  $('timerPanel').classList.toggle('timer-idle', !active);
  $('timerPanel').setAttribute('aria-hidden', String(!active));
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
  const workout = currentWorkout();
  const module = currentModule();
  const repeat = repeatDetails(currentSteps(), state.moduleIndex);
  state.startedAt = {
    timestamp: now.getTime(), date: localDate(now),
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    moduleId: module.id, module: module.title,
    moduleRound: repeat.total > 1 ? repeat.round : null, moduleRoundTotal: repeat.total > 1 ? repeat.total : null,
    workoutId: workout.id, workoutName: workout.name, workoutDay: day.label,
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
    workoutId: state.startedAt.workoutId, workoutName: state.startedAt.workoutName, workoutDay: state.startedAt.workoutDay,
    moduleId: state.startedAt.moduleId, module: state.startedAt.module,
    moduleRound: state.startedAt.moduleRound, moduleRoundTotal: state.startedAt.moduleRoundTotal,
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
  const hasNextModule = state.moduleIndex < currentModules().length - 1;
  if (hasNextModule) state.moduleIndex += 1;
  $('statusText').textContent = hasNextModule ? 'Session saved · Next module' : 'Workout complete';
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
    const workoutName = entry.workoutName || entry.setName;
    const workoutDay = entry.workoutDay || entry.setDay;
    set.textContent = workoutName ? `${workoutDay || ''} · ${workoutName}` : 'Training session';
    const module = document.createElement('span');
    module.className = 'log-module';
    module.textContent = entry.moduleRound && entry.moduleRoundTotal
      ? `${entry.module || ''} · Round ${entry.moduleRound}/${entry.moduleRoundTotal}`
      : entry.module || '';
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
    if (!Array.isArray(data.workouts) || !Array.isArray(data.modules)) throw new Error('modules.json must define workouts and modules.');
    let instructionSections = new Map();
    if (data.instructionsFile) {
      const instructionsResponse = await fetch(data.instructionsFile, { cache: 'no-store' });
      if (!instructionsResponse.ok) throw new Error(`Could not load ${data.instructionsFile}.`);
      instructionSections = parseInstructionSections(await instructionsResponse.text());
    }
    data.modules.forEach((module, index) => {
      const expectedId = String(index + 1).padStart(2, '0');
      if (!module.id?.startsWith(`${expectedId}-`)) throw new Error(`Module ${index + 1} must use the ID prefix ${expectedId} and modules must stay in number order.`);
      if (instructionSections.has(module.id)) module.instructions = instructionSections.get(module.id);
      if (typeof module.instructions !== 'string') throw new Error(`No Markdown instructions were found for module ${module.id}. Add a section headed ## ${module.id} in ${data.instructionsFile || 'modules.json'}.`);
    });
    state.workoutsById = new Map(data.workouts.map((workout) => [workout.id, workout]));
    state.modulesById = new Map(data.modules.map((module) => [module.id, module]));
    state.days = data.days;
    for (const day of state.days) {
      const workout = state.workoutsById.get(day.workoutId);
      const expandedCount = Array.isArray(workout?.steps) ? workout.steps.reduce((total, step) => total + (step.repeat || 1), 0) : 0;
      if (!Array.isArray(workout?.steps) || !workout.steps.length || expandedCount > 16) throw new Error(`The ${day.label} workout must expand to between one and sixteen module steps.`);
      if (workout.steps.some((step) => !state.modulesById.has(step.moduleId) || !Number.isInteger(step.repeat || 1) || (step.repeat || 1) < 1)) throw new Error(`The ${day.label} workout has an invalid or missing module step.`);
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
    $('workoutDescription').textContent = 'Start the local server with python server.py, then check modules.json.';
    $('statusText').textContent = 'Plan unavailable';
    console.error(error);
  }
}

$('moduleToggle').addEventListener('click', () => { if (state.startedAt) done(); else start(); });
$('railToggle').addEventListener('click', () => {
  const collapsed = !$('workspace').classList.contains('rail-collapsed');
  $('workspace').classList.toggle('rail-collapsed', collapsed);
  $('railToggle').setAttribute('aria-expanded', String(!collapsed));
  $('railToggle').setAttribute('aria-label', collapsed ? 'Expand side panel' : 'Collapse side panel');
  $('railToggle').title = collapsed ? 'Expand side panel' : 'Collapse side panel';
  $('railToggle').querySelector('path').setAttribute('d', collapsed
    ? 'm10 6 6 6-6 6M4 6l6 6-6 6'
    : 'm14 6-6 6 6 6M20 6l-6 6 6 6');
  try { localStorage.setItem('training-side-panel-collapsed', String(collapsed)); } catch (error) { /* The control still works for this page view. */ }
});
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
try {
  $('workspace').classList.toggle('rail-collapsed', localStorage.getItem('training-side-panel-collapsed') === 'true');
  const collapsed = $('workspace').classList.contains('rail-collapsed');
  $('railToggle').setAttribute('aria-expanded', String(!collapsed));
  $('railToggle').setAttribute('aria-label', collapsed ? 'Expand side panel' : 'Collapse side panel');
  $('railToggle').title = collapsed ? 'Expand side panel' : 'Collapse side panel';
  if (collapsed) $('railToggle').querySelector('path').setAttribute('d', 'm10 6 6 6-6 6M4 6l6 6-6 6');
} catch (error) { /* Ignore unavailable local storage. */ }
init();
