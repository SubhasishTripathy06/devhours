/* ══════════════════════════════════════════════
   DevHours — script.js
   Vanilla JS, LocalStorage persistence, PWA
   ══════════════════════════════════════════════ */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const STORAGE_KEY = 'devhours_projects_v2';
const RING_RADIUS  = 82;                          // must match CSS r=""
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // 515.22

// ─── State ───────────────────────────────────────────────────────────────────
let projects     = [];          // Array of project objects
let activeId     = null;        // ID of the currently open detail modal
let timerInterval = null;       // setInterval handle for live display

// ─── Helpers ─────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function saveProjects() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function loadProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    projects = raw ? JSON.parse(raw) : [];
  } catch {
    projects = [];
  }
}

/**
 * Return total seconds for a project including any currently-running session.
 */
function totalSecondsFor(p) {
  let s = p.spentSeconds || 0;
  if (p.runningStart) {
    s += Math.floor((Date.now() - p.runningStart) / 1000);
  }
  return s;
}

function secondsToHM(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function secondsToHMS(s) {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const sc = Math.floor(s % 60);
  return [h, m, sc].map(n => String(n).padStart(2, '0')).join(':');
}

function progress(p) {
  const targetSec = (p.targetHours || 1) * 3600;
  return clamp(totalSecondsFor(p) / targetSec, 0, 1);
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const activeGrid    = document.getElementById('activeGrid');
const archiveGrid   = document.getElementById('archiveGrid');
const archiveSection= document.getElementById('archiveSection');
const emptyActive   = document.getElementById('emptyActive');
const totalHoursDisplay = document.getElementById('totalHoursDisplay');

// Detail modal
const detailOverlay  = document.getElementById('detailOverlay');
const detailClose    = document.getElementById('detailClose');
const ringFill       = document.getElementById('ringFill');
const detailPct      = document.getElementById('detailPct');
const detailName     = document.getElementById('detailName');
const detailSpent    = document.getElementById('detailSpent');
const detailTarget   = document.getElementById('detailTarget');
const detailRemaining= document.getElementById('detailRemaining');
const liveTimer      = document.getElementById('liveTimer');
const liveTimerDisplay = document.getElementById('liveTimerDisplay');
const btnStart       = document.getElementById('btnStart');
const btnPause       = document.getElementById('btnPause');
const btnEdit        = document.getElementById('btnEdit');
const btnDelete      = document.getElementById('btnDelete');
const completeCheck  = document.getElementById('completeCheck');

// Form modal
const formOverlay    = document.getElementById('formOverlay');
const formTitle      = document.getElementById('formTitle');
const inputName      = document.getElementById('inputName');
const inputTarget    = document.getElementById('inputTarget');
const inputSpent     = document.getElementById('inputSpent');
const editSpentRow   = document.getElementById('editSpentRow');
const btnFormSave    = document.getElementById('btnFormSave');
const btnFormCancel  = document.getElementById('btnFormCancel');

// Confirm modal
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmName    = document.getElementById('confirmName');
const btnConfirmYes  = document.getElementById('btnConfirmYes');
const btnConfirmNo   = document.getElementById('btnConfirmNo');

// Add button
const btnAdd = document.getElementById('btnAdd');

// ─── Render ──────────────────────────────────────────────────────────────────
function render() {
  const active   = projects.filter(p => !p.archived);
  const archived = projects.filter(p => p.archived);

  // Total hours
  const totalSec = projects.reduce((acc, p) => acc + totalSecondsFor(p), 0);
  totalHoursDisplay.textContent = `${(totalSec / 3600).toFixed(1)}h total`;

  // Active grid
  activeGrid.innerHTML = '';
  if (active.length === 0) {
    activeGrid.appendChild(emptyActive);
    emptyActive.style.display = '';
  } else {
    emptyActive.style.display = 'none';
    active.forEach(p => activeGrid.appendChild(buildCard(p)));
  }

  // Archive
  if (archived.length > 0) {
    archiveSection.style.display = '';
    archiveGrid.innerHTML = '';
    archived.forEach(p => archiveGrid.appendChild(buildCard(p)));
  } else {
    archiveSection.style.display = 'none';
  }
}

function buildCard(p) {
  const pct       = progress(p);
  const pctPct    = Math.round(pct * 100);
  const spent     = totalSecondsFor(p);
  const targetSec = p.targetHours * 3600;
  const done      = pct >= 1;
  const running   = !!p.runningStart;

  const card = document.createElement('div');
  card.className = 'project-card' + (p.archived ? ' archived' : '');
  card.dataset.id = p.id;

  card.innerHTML = `
    <div class="card-header">
      <span class="card-name" title="${esc(p.name)}">${esc(p.name)}</span>
      <span class="card-pct${done ? ' done' : ''}">${pctPct}%</span>
    </div>
    <div class="card-hours">
      ${secondsToHM(spent)} / ${p.targetHours}h
    </div>
    <div class="progress-bar-track">
      <div class="progress-bar-fill${done ? ' done' : ''}" style="width:${pctPct}%"></div>
    </div>
    <div class="card-running-badge${running ? ' visible' : ''}">
      <div class="running-dot"></div>
      running
    </div>
  `;

  if (!p.archived) {
    card.addEventListener('click', () => openDetail(p.id));
  }

  return card;
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function openDetail(id) {
  activeId = id;
  detailOverlay.classList.add('open');
  updateDetail();
  startLiveTimer();
}

function closeDetail() {
  detailOverlay.classList.remove('open');
  stopLiveTimer();
  activeId = null;
}

function updateDetail() {
  const p = projects.find(x => x.id === activeId);
  if (!p) return;

  const pct       = progress(p);
  const pctPct    = Math.round(pct * 100);
  const spent     = totalSecondsFor(p);
  const targetSec = p.targetHours * 3600;
  const remaining = Math.max(0, targetSec - spent);
  const done      = pct >= 1;
  const running   = !!p.runningStart;

  // Ring
  const offset = RING_CIRCUMFERENCE * (1 - pct);
  ringFill.style.strokeDashoffset = offset;
  ringFill.classList.toggle('done', done);

  // Text
  detailPct.textContent       = pctPct + '%';
  detailName.textContent      = p.name;
  detailSpent.textContent     = secondsToHM(spent);
  detailTarget.textContent    = p.targetHours + 'h';
  detailRemaining.textContent = secondsToHM(remaining);

  // Complete overlay
  completeCheck.classList.toggle('visible', done);
  if (done) { detailPct.style.opacity = '0'; } else { detailPct.style.opacity = '1'; }

  // Buttons
  btnStart.style.display = running || done ? 'none' : '';
  btnPause.style.display = running ? '' : 'none';
  btnEdit.style.display  = running ? 'none' : '';

  // Live timer
  if (running) {
    liveTimer.style.display = 'flex';
    liveTimerDisplay.textContent = secondsToHMS(spent);
  } else {
    liveTimer.style.display = 'none';
  }
}

function startLiveTimer() {
  stopLiveTimer();
  timerInterval = setInterval(() => {
    const p = projects.find(x => x.id === activeId);
    if (!p || !p.runningStart) { stopLiveTimer(); return; }
    updateDetail();
    // also update card in background
    const card = activeGrid.querySelector(`[data-id="${activeId}"]`);
    if (card) {
      const spent = totalSecondsFor(p);
      const pct = Math.round(progress(p) * 100);
      const hoursEl = card.querySelector('.card-hours');
      const fillEl  = card.querySelector('.progress-bar-fill');
      const pctEl   = card.querySelector('.card-pct');
      if (hoursEl) hoursEl.textContent = `${secondsToHM(spent)} / ${p.targetHours}h`;
      if (fillEl)  fillEl.style.width  = pct + '%';
      if (pctEl)   pctEl.textContent   = pct + '%';
    }
  }, 1000);
}

function stopLiveTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

// ─── Timer Controls ───────────────────────────────────────────────────────────
function startTimer(id) {
  // Stop any other running timer first
  projects.forEach(p => {
    if (p.runningStart && p.id !== id) {
      p.spentSeconds = totalSecondsFor(p);
      p.runningStart  = null;
    }
  });

  const p = projects.find(x => x.id === id);
  if (!p || p.runningStart) return;
  p.runningStart = Date.now();
  saveProjects();
  render();
  updateDetail();
  startLiveTimer();
}

function pauseTimer(id) {
  const p = projects.find(x => x.id === id);
  if (!p || !p.runningStart) return;
  p.spentSeconds = totalSecondsFor(p);
  p.runningStart  = null;

  // Auto-archive if complete
  if (progress(p) >= 1) { p.archived = true; }

  saveProjects();
  render();
  updateDetail();
}

// ─── Add / Edit Form ──────────────────────────────────────────────────────────
let editingId = null;

function openAddForm() {
  editingId = null;
  formTitle.textContent       = 'New project';
  btnFormSave.textContent     = 'Create project';
  inputName.value             = '';
  inputTarget.value           = '';
  inputSpent.value            = '';
  editSpentRow.style.display  = 'none';
  formOverlay.classList.add('open');
  inputName.focus();
}

function openEditForm(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  formTitle.textContent       = 'Edit project';
  btnFormSave.textContent     = 'Save changes';
  inputName.value             = p.name;
  inputTarget.value           = p.targetHours;
  inputSpent.value            = parseFloat((p.spentSeconds / 3600).toFixed(2));
  editSpentRow.style.display  = '';
  closeDetail();
  formOverlay.classList.add('open');
  inputName.focus();
}

function closeForm() {
  formOverlay.classList.remove('open');
}

function saveForm() {
  const name        = inputName.value.trim();
  const targetHours = parseFloat(inputTarget.value);
  const spentHours  = parseFloat(inputSpent.value) || 0;

  if (!name)             { shake(inputName);   return; }
  if (!targetHours || targetHours <= 0) { shake(inputTarget); return; }

  if (editingId) {
    const p = projects.find(x => x.id === editingId);
    p.name         = name;
    p.targetHours  = targetHours;
    p.spentSeconds = spentHours * 3600;
    p.archived     = progress(p) >= 1;
  } else {
    projects.push({
      id:           uid(),
      name,
      targetHours,
      spentSeconds: 0,
      runningStart: null,
      archived:     false,
      createdAt:    Date.now(),
    });
  }

  saveProjects();
  closeForm();
  render();
}

function shake(el) {
  el.style.animation = 'none';
  el.offsetWidth;
  el.style.animation = 'shake .35s ease';
  el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
  el.focus();
}

// ─── Delete ───────────────────────────────────────────────────────────────────
let deletingId = null;

function openConfirm(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  deletingId = id;
  confirmName.textContent = p.name;
  confirmOverlay.classList.add('open');
}

function closeConfirm() {
  confirmOverlay.classList.remove('open');
  deletingId = null;
}

function confirmDelete() {
  if (!deletingId) return;
  projects = projects.filter(x => x.id !== deletingId);
  saveProjects();
  closeConfirm();
  closeDetail();
  render();
}

// ─── Event Wiring ─────────────────────────────────────────────────────────────
btnAdd.addEventListener('click', openAddForm);

// Detail modal
detailClose.addEventListener('click', closeDetail);
detailOverlay.addEventListener('click', e => { if (e.target === detailOverlay) closeDetail(); });

btnStart.addEventListener('click', () => { if (activeId) startTimer(activeId); });
btnPause.addEventListener('click', () => { if (activeId) pauseTimer(activeId); });
btnEdit.addEventListener('click', () => { if (activeId) openEditForm(activeId); });
btnDelete.addEventListener('click', () => { if (activeId) openConfirm(activeId); });

// Form modal
btnFormSave.addEventListener('click', saveForm);
btnFormCancel.addEventListener('click', closeForm);
formOverlay.addEventListener('click', e => { if (e.target === formOverlay) closeForm(); });

// Keyboard shortcuts in form
inputName.addEventListener('keydown', e => { if (e.key === 'Enter') inputTarget.focus(); });
inputTarget.addEventListener('keydown', e => { if (e.key === 'Enter') saveForm(); });
inputSpent.addEventListener('keydown', e => { if (e.key === 'Enter') saveForm(); });

// Confirm modal
btnConfirmYes.addEventListener('click', confirmDelete);
btnConfirmNo.addEventListener('click', closeConfirm);
confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) closeConfirm(); });

// Global keyboard: Escape closes any open modal
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (confirmOverlay.classList.contains('open')) { closeConfirm(); return; }
  if (formOverlay.classList.contains('open'))    { closeForm();    return; }
  if (detailOverlay.classList.contains('open'))  { closeDetail();  return; }
});

// ─── Shake animation (injected into <style>) ──────────────────────────────────
(function injectShakeAnim() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%,100%{transform:translateX(0)}
      20%{transform:translateX(-6px)}
      40%{transform:translateX(6px)}
      60%{transform:translateX(-4px)}
      80%{transform:translateX(4px)}
    }
  `;
  document.head.appendChild(style);
})();

// ─── PWA Service Worker ────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadProjects();
render();

// If a timer was running before refresh, resume the live ticker
const runningProject = projects.find(p => p.runningStart);
if (runningProject) {
  // Timer was already running — just restart the display interval
  startLiveTimer();
  // Open the active project detail if desired (commented out — feels intrusive on refresh)
  // openDetail(runningProject.id);
}
