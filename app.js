const $ = (id) => document.getElementById(id);
const debugTimer = new URLSearchParams(window.location.search).get('debugTimer') === '1';
const timerScale = debugTimer ? 0.1 : 1;
const state = {
  days: [], workoutsById: new Map(), modulesById: new Map(),
  dayIndex: 0, moduleIndex: 0, startedAt: null, timerId: null, timedSession: null,
};

function pad(value) { return String(value).padStart(2, '0'); }
function mmss(seconds) { return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`; }
function todayIndex() {
  const weekday = new Date().getDay(); // Sunday is 0; the schedule starts on Monday.
  return weekday === 0 ? 6 : weekday - 1;
}
function currentDay() { return state.days[state.dayIndex]; }
function currentWorkout() { return state.workoutsById.get(currentDay().workoutId); }
function currentRefs() { return currentWorkout().modules; }
function currentModules() { return currentRefs().map((ref) => state.modulesById.get(ref.moduleId)); }
function currentModule() { return currentModules()[state.moduleIndex]; }
function repeatDetails(index) {
  const total = currentRefs()[index]?.repeat || 1;
  const session = state.timedSession;
  return { round: session ? Math.min(session.totalRounds, Math.floor(elapsedMs(session) / session.roundMs) + 1) : 1, total };
}
function isTimed(module = currentModule()) { return Array.isArray(module?.steps) && module.steps.length > 0; }
function elapsedMs(session) { return session.elapsedMs + (session.paused ? 0 : Math.max(0, Date.now() - session.runningSince)); }
function stepDurationMs(step) { return step.durationSeconds * 1000 * timerScale; }
function roundDuration(module = currentModule()) { return module.steps.reduce((sum, step) => sum + stepDurationMs(step), 0); }

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
  const refs = currentRefs();
  const modules = currentModules();
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
  const timed = isTimed(module);
  $('instructionsPane').classList.toggle('timed-mode', timed);
  $('instructionsLabel').hidden = timed;
  $('moduleInstructions').hidden = timed;
  const repeat = repeatDetails(state.moduleIndex);
  $('moduleDuration').textContent = module.duration || '';
  $('moduleRepeat').hidden = repeat.total < 2;
  $('moduleRepeat').textContent = repeat.total > 1 ? `ROUND ${pad(repeat.round)} / ${pad(repeat.total)}` : '';
  $('moduleNumber').textContent = pad(state.moduleIndex + 1);
  $('moduleTotal').textContent = pad(modules.length);
  $('progressFill').style.width = `${((state.moduleIndex + 1) / modules.length) * 100}%`;
  $('backButton').disabled = state.moduleIndex === 0;
  $('nextButton').disabled = state.moduleIndex === modules.length - 1;

  const list = $('moduleList');
  list.replaceChildren(...modules.map((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `module-link${index === state.moduleIndex ? ' active' : ''}${index < state.moduleIndex ? ' visited' : ''}`;
    button.setAttribute('aria-current', index === state.moduleIndex ? 'step' : 'false');
    const number = document.createElement('span');
    number.className = 'module-link-number';
    number.textContent = item.id.split('-')[0];
    const text = document.createElement('span');
    text.className = 'module-link-text';
    const titlePrefix = `${day.label} ${item.id.split('-')[0]}-`;
    const title = item.title.startsWith(titlePrefix) ? item.title.slice(titlePrefix.length) : item.title;
    const repeat = repeatDetails(index);
    const count = refs[index].repeat || 1;
    text.textContent = count > 1 ? `${count} rounds · ${title}` : title;
    button.append(number, text);
    button.addEventListener('click', () => navigateModuleTo(index));
    return button;
  }));

  setModuleVisual(module, state.timedSession?.activeStepIndex >= 0 ? state.timedSession.activeStepIndex : 0);

  renderTimedSteps(module);
  const active = Boolean(state.startedAt);
  const toggle = $('moduleToggle');
  const paused = Boolean(state.timedSession?.paused);
  toggle.classList.toggle('is-pressed', active && (!timed || !paused));
  toggle.setAttribute('aria-pressed', String(active && (!timed || !paused)));
  toggle.setAttribute('aria-label', active ? (timed ? (paused ? 'Resume intervals' : 'Pause intervals') : 'Done with this module') : 'Start this module');
  $('moduleToggleText').textContent = active ? (timed ? (paused ? 'Resume' : 'Pause') : 'Done') : 'Start';
  $('moduleToggle').querySelector('.module-toggle-icon').textContent = active && timed ? (paused ? '▶' : 'Ⅱ') : active ? '✓' : '▶';
  $('timerLabel').textContent = active && timed ? (debugTimer ? 'STEP TIMER · DEBUG ×0.1' : 'STEP TIMER') : 'MODULE TIMER';
  $('endIntervals').hidden = !active || !timed;
  $('timerPanel').classList.toggle('timer-idle', !active);
  $('timerPanel').setAttribute('aria-hidden', String(!active));
  if (state.startedAt) updateTimer();
}

function renderTimedSteps(module) {
  const panel = $('timedSequence');
  const timed = isTimed(module);
  panel.hidden = !timed;
  if (!timed) { $('timedStepList').replaceChildren(); return; }
  const list = $('timedStepList');
  list.replaceChildren(...module.steps.map((step, index) => {
    const item = document.createElement('li');
    const stepType = step.type || 'movement';
    item.className = `timed-step timed-step--${stepType}`;
    item.dataset.stepIndex = index;
    item.dataset.stepType = stepType;
    const label = document.createElement('span');
    label.className = 'timed-step-name';
    label.textContent = step.label;
    const duration = document.createElement('span');
    duration.className = 'timed-step-duration';
    duration.textContent = `${step.durationSeconds} sec`;
    const type = document.createElement('span');
    type.className = 'timed-step-type';
    type.textContent = stepType === 'recovery' ? 'RECOVERY' : 'MOVEMENT';
    const cue = document.createElement('small');
    cue.textContent = step.instructions || '';
    item.append(label, duration, type, cue);
    return item;
  }));
  updateTimedDisplay();
}

function setModuleVisual(module, stepIndex = 0) {
  const step = isTimed(module) ? module.steps[stepIndex] : null;
  const source = step?.image || module.image;
  const hasImage = Boolean(source);
  const image = $('moduleImage');
  image.hidden = !hasImage;
  $('visualColumn').hidden = !hasImage;
  $('moduleContent').classList.toggle('with-image', hasImage);
  $('visualPlaceholder').hidden = true;
  $('visualColumn').classList.toggle('has-image', hasImage);
  if (hasImage) {
    if (image.getAttribute('src') !== source) image.src = source;
    image.alt = step?.image ? (step.imageAlt || module.imageAlt || '') : (module.imageAlt || '');
    image.removeAttribute('style');
  } else {
    image.removeAttribute('src');
    image.alt = '';
    $('visualIndex').textContent = pad(state.moduleIndex + 1);
  }
}

function updateTimer() {
  if (!state.startedAt) return;
  if (state.timedSession) {
    updateTimedDisplay();
    if (!state.timedSession.paused) saveElapsedRounds();
  } else $('timerDisplay').textContent = mmss(Math.floor((Date.now() - state.startedAt.timestamp) / 1000));
}

function updateTimedDisplay() {
  const session = state.timedSession;
  if (!session) return;
  const module = currentModule();
  const duration = session.roundMs;
  const elapsed = elapsedMs(session);
  const completedRounds = Math.floor(elapsed / duration);
  const withinRound = elapsed % duration;
  let cursor = 0;
  let activeIndex = module.steps.length - 1;
  for (let i = 0; i < module.steps.length; i += 1) {
    cursor += stepDurationMs(module.steps[i]);
    if (withinRound < cursor || completedRounds >= session.totalRounds) { activeIndex = i; break; }
  }
  const previousActive = session.activeStepIndex;
  session.activeStepIndex = activeIndex;
  setModuleVisual(module, activeIndex);
  let start = 0;
  const items = [...$('timedStepList').children];
  items.forEach((item, index) => {
    const end = start + stepDurationMs(module.steps[index]);
    item.classList.toggle('is-complete', completedRounds >= session.totalRounds || withinRound >= end);
    item.classList.toggle('is-current', index === activeIndex && completedRounds < session.totalRounds);
    item.classList.toggle('is-upcoming', index > activeIndex && completedRounds < session.totalRounds);
    if (index === activeIndex && completedRounds < session.totalRounds) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
    start = end;
  });
  if (previousActive !== activeIndex) $('stepAnnouncement').textContent = `Step ${activeIndex + 1} of ${module.steps.length}: ${module.steps[activeIndex].label}`;
  const stepStart = module.steps.slice(0, activeIndex).reduce((sum, step) => sum + stepDurationMs(step), 0);
  const stepElapsed = Math.max(0, withinRound - stepStart);
  const remaining = Math.max(0, Math.ceil((stepDurationMs(module.steps[activeIndex]) - stepElapsed) / 1000));
  $('timerDisplay').textContent = mmss(remaining);
  $('stepPosition').textContent = completedRounds >= session.totalRounds ? 'ROUND COMPLETE' : `STEP ${pad(activeIndex + 1)} / ${pad(module.steps.length)}`;
  $('moduleRepeat').textContent = `ROUND ${pad(Math.min(session.totalRounds, completedRounds + 1))} / ${pad(session.totalRounds)}`;
  $('stepProgressFill').style.width = `${Math.min(100, (withinRound / duration) * 100)}%`;
}

function start() {
  if (state.startedAt) return;
  const module = currentModule();
  const repeat = repeatDetails(state.moduleIndex);
  state.startedAt = {
    timestamp: Date.now(),
  };
  if (isTimed(module)) state.timedSession = {
    totalRounds: repeat.total, roundMs: roundDuration(module), elapsedMs: 0, runningSince: Date.now(),
    paused: false, completedRounds: 0, activeStepIndex: -1,
  };
  $('statusText').textContent = 'In progress';
  state.timerId = window.setInterval(updateTimer, 250);
  render();
}

function done(targetIndex = null) {
  if (!state.startedAt) return;
  if (state.timedSession) { toggleTimedPause(); return; }
  clearInterval(state.timerId);
  state.timerId = null;
  state.startedAt = null;
  finishCurrentModule(targetIndex === null ? 'Module complete · Next module' : 'Module complete · Selected module', targetIndex);
}

function finishCurrentModule(message, targetIndex = null) {
  clearInterval(state.timerId); state.timerId = null; state.startedAt = null; state.timedSession = null;
  const hasNext = state.moduleIndex < currentModules().length - 1;
  if (targetIndex !== null) state.moduleIndex = targetIndex;
  else if (hasNext) state.moduleIndex += 1;
  $('statusText').textContent = targetIndex !== null ? message : hasNext ? message : 'Workout complete';
  render();
}

function toggleTimedPause() {
  const session = state.timedSession;
  if (!session) return;
  if (!session.paused) {
    session.elapsedMs = elapsedMs(session); session.paused = true;
    $('statusText').textContent = 'Intervals paused';
  } else {
    session.runningSince = Date.now(); session.paused = false;
    $('statusText').textContent = 'Intervals in progress';
    saveElapsedRounds();
  }
  render();
}

async function saveElapsedRounds() {
  const session = state.timedSession;
  if (!session) return;
  const completed = Math.min(session.totalRounds, Math.floor(elapsedMs(session) / session.roundMs));
  if (completed <= session.completedRounds) return;
  session.completedRounds = completed;
  if (completed >= session.totalRounds) {
    if (session.navigationTarget !== undefined) {
      finishCurrentModule('Intervals saved · Selected module', session.navigationTarget);
    } else {
      $('statusText').textContent = 'Intervals complete · Next module';
      finishCurrentModule('Intervals complete · Next module');
    }
  } else render();
}

async function endIntervals(targetIndex = null) {
  const session = state.timedSession;
  if (!session) return;
  session.elapsedMs = elapsedMs(session);
  session.paused = true;
  if (targetIndex !== null) session.navigationTarget = targetIndex;
  else delete session.navigationTarget;
  saveElapsedRounds();
  if (state.timedSession !== session) return;
  finishCurrentModule(targetIndex === null ? 'Intervals ended · Next module' : 'Intervals ended · Selected module', targetIndex);
}

function navigateDay(delta) {
  if (state.startedAt) return;
  state.dayIndex = (state.dayIndex + delta + state.days.length) % state.days.length;
  state.moduleIndex = 0;
  $('statusText').textContent = state.startedAt ? 'In progress' : 'Ready';
  render();
}

function navigateModule(delta) {
  const target = state.moduleIndex + delta;
  if (target < 0 || target >= currentModules().length) return;
  navigateModuleTo(target);
}

async function navigateModuleTo(target) {
  if (target < 0 || target >= currentModules().length || target === state.moduleIndex) return;
  if (state.timedSession) { await endIntervals(target); return; }
  if (state.startedAt) { await done(target); return; }
  state.moduleIndex = target;
  $('statusText').textContent = 'Ready';
  render();
}

async function init() {
  try {
    const planResponse = await fetch('./modules.json');
    if (!planResponse.ok) throw new Error('Could not load modules.json');
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
      const refs = workout?.modules;
      if (!Array.isArray(refs) || !refs.length || refs.length > 16) throw new Error(`The ${day.label} workout must contain between one and sixteen modules.`);
      if (refs.some((ref) => !state.modulesById.has(ref.moduleId) || !Number.isInteger(ref.repeat || 1) || (ref.repeat || 1) < 1)) throw new Error(`The ${day.label} workout has an invalid or missing module reference.`);
    }
    for (const module of state.modulesById.values()) if (module.steps && (!module.steps.length || module.steps.some((step) => !step.label || !['movement', 'recovery'].includes(step.type) || !Number.isInteger(step.durationSeconds) || step.durationSeconds < 1))) throw new Error(`Module ${module.id} has invalid timed steps. Use type "movement" or "recovery" and a positive durationSeconds value.`);
    state.dayIndex = todayIndex();
    $('statusText').textContent = 'Ready';
    render();
  } catch (error) {
    $('moduleTitle').textContent = 'Could not load the weekly plan.';
    $('workoutDescription').textContent = 'Start the local server with python server.py, then check modules.json.';
    $('statusText').textContent = 'Plan unavailable';
    console.error(error);
  }
}

$('moduleToggle').addEventListener('click', () => {
  if (!state.startedAt) start();
  else if (state.timedSession) toggleTimedPause();
  else done();
});
$('endIntervals').addEventListener('click', () => endIntervals());
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
document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
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
