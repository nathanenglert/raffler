/* =========================================================
   Raffler — app logic
   Weighted random selection, local persistence, slot-reel
   animation, confetti, CSV import/export.
   ========================================================= */

(() => {
  'use strict';

  // ----- State -----------------------------------------------------------
  // Namespace so each redesign variant has its own contestants/history.
  // Set window.RAFFLER_NS = 'carnival' (etc.) before loading this script.
  const NS = (typeof window !== 'undefined' && window.RAFFLER_NS) ? ':' + window.RAFFLER_NS : '';
  const STORAGE_KEY = 'raffler:contestants:v1' + NS;
  const HISTORY_KEY = 'raffler:history:v1' + NS;
  const SEEDED_KEY  = 'raffler:seeded' + NS;
  const MAX_HISTORY = 25;

  /** @type {{id: string, name: string, tickets: number}[]} */
  let contestants = loadJSON(STORAGE_KEY, []);
  /** @type {{name: string, at: number, pick: number}[]} */
  let history = loadJSON(HISTORY_KEY, []);

  // Backfill pick numbers for history saved before they were tracked.
  // history is newest-first, so the last entry is the oldest = pick #1.
  if (history.some((h) => typeof h.pick !== 'number')) {
    const n = history.length;
    history = history.map((h, i) => ({ ...h, pick: typeof h.pick === 'number' ? h.pick : n - i }));
    saveHistory();
  }

  let isSpinning = false;

  // ----- DOM -------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const els = {
    addForm: $('#add-form'),
    nameInput: $('#name-input'),
    ticketsInput: $('#tickets-input'),
    bulkInput: $('#bulk-input'),
    bulkAddBtn: $('#bulk-add-btn'),
    importCsvBtn: $('#import-csv-btn'),
    exportCsvBtn: $('#export-csv-btn'),
    csvFile: $('#csv-file'),
    list: $('#contestant-list'),
    emptyState: $('#empty-state'),
    statsBadge: $('#stats-badge'),
    clearBtn: $('#clear-btn'),
    reel: $('#reel'),
    reelTrack: $('#reel-track'),
    drawBtn: $('#draw-btn'),
    winnersInput: $('#winners-input'),
    uniqueToggle: $('#unique-toggle'),
    historyList: $('#history-list'),
    historyEmpty: $('#history-empty'),
    clearHistoryBtn: $('#clear-history-btn'),
    winnerModal: $('#winner-modal'),
    winnerName: $('#winner-name'),
    winnerMeta: $('#winner-meta'),
    drawAgainBtn: $('#draw-again-btn'),
    howtoBtn: $('#howto-btn'),
    howtoModal: $('#howto-modal'),
    confetti: $('#confetti'),
  };

  // ----- Storage ---------------------------------------------------------
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }
  function saveContestants() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(contestants)); } catch (_) {}
  }
  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
  }

  // ----- Helpers ---------------------------------------------------------
  const uid = () => Math.random().toString(36).slice(2, 10);

  function sanitizeName(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }
  function clampTickets(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v) || v < 1) return 1;
    return Math.min(v, 9999);
  }
  function totalTickets() {
    return contestants.reduce((s, c) => s + c.tickets, 0);
  }
  function colorFor(name) {
    // Deterministic gradient color from name (hash → hue).
    let h = 0;
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    return `linear-gradient(135deg, hsl(${hue}, 70%, 56%), hsl(${(hue + 40) % 360}, 80%, 50%))`;
  }
  function initialsFor(name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function fmtTime(ts) {
    const d = new Date(ts);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ----- Render ---------------------------------------------------------
  function render() {
    renderList();
    renderStats();
    renderHistory();
    updateDrawButton();
  }

  function renderList() {
    els.list.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const c of contestants) {
      const li = document.createElement('li');
      li.className = 'contestant-item';
      li.dataset.id = c.id;

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.style.background = colorFor(c.name);
      avatar.textContent = initialsFor(c.name);

      const name = document.createElement('div');
      name.className = 'contestant-name';
      name.textContent = c.name;
      name.title = c.name;

      const tickets = document.createElement('div');
      tickets.className = 'ticket-control';
      tickets.innerHTML = `
        <button type="button" aria-label="Decrease tickets" data-act="dec">−</button>
        <span class="ticket-count">${c.tickets}</span>
        <button type="button" aria-label="Increase tickets" data-act="inc">+</button>
      `;

      const remove = document.createElement('button');
      remove.className = 'remove-btn';
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${c.name}`);
      remove.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71 12 12.01l6.3 6.3-1.4 1.42-6.3-6.3-6.3 6.3-1.42-1.42 6.3-6.3-6.3-6.3 1.42-1.4 6.3 6.3 6.3-6.3z"/></svg>`;
      remove.dataset.act = 'remove';

      li.append(avatar, name, tickets, remove);
      frag.appendChild(li);
    }
    els.list.appendChild(frag);
    els.clearBtn.disabled = contestants.length === 0;
  }

  function renderStats() {
    const people = contestants.length;
    const tickets = totalTickets();
    els.statsBadge.textContent = `${people} ${people === 1 ? 'person' : 'people'} · ${tickets} ${tickets === 1 ? 'ticket' : 'tickets'}`;
  }

  function renderHistory() {
    els.historyList.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const w of history) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="h-pick">#${w.pick}</span><span class="h-name">${escapeHtml(w.name)}</span><span class="h-time">${fmtTime(w.at)}</span>`;
      frag.appendChild(li);
    }
    els.historyList.appendChild(frag);
  }

  function updateDrawButton() {
    els.drawBtn.disabled = contestants.length === 0 || isSpinning;
  }

  // ----- Mutations ------------------------------------------------------
  function addContestant(name, tickets) {
    const n = sanitizeName(name);
    if (!n) return false;
    const t = clampTickets(tickets);
    // Merge if duplicate (case-insensitive) — accumulate tickets.
    const existing = contestants.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (existing) {
      existing.tickets = clampTickets(existing.tickets + t);
    } else {
      contestants.push({ id: uid(), name: n, tickets: t });
    }
    saveContestants();
    render();
    return true;
  }
  function removeContestant(id) {
    const li = els.list.querySelector(`[data-id="${id}"]`);
    if (li) li.classList.add('removing');
    setTimeout(() => {
      contestants = contestants.filter((c) => c.id !== id);
      saveContestants();
      render();
    }, 220);
  }
  function adjustTickets(id, delta) {
    const c = contestants.find((c) => c.id === id);
    if (!c) return;
    const next = c.tickets + delta;
    if (next < 1) { removeContestant(id); return; }
    c.tickets = clampTickets(next);
    saveContestants();
    render();
  }
  function clearAll() {
    if (contestants.length === 0) return;
    if (!confirm(`Remove all ${contestants.length} contestants?`)) return;
    contestants = [];
    saveContestants();
    render();
  }
  function pushHistory(name) {
    const nextPick = history.reduce((m, h) => Math.max(m, h.pick || 0), 0) + 1;
    history.unshift({ name, at: Date.now(), pick: nextPick });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    saveHistory();
  }
  function clearHistory() {
    if (history.length === 0) return;
    history = [];
    saveHistory();
    render();
  }

  // ----- Bulk / CSV -----------------------------------------------------
  function parseBulk(text) {
    const lines = String(text).split(/\r?\n/);
    const entries = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Split on last comma so names with commas in them still kind of work.
      const m = trimmed.match(/^(.*?)(?:[,\t]\s*(\d+))?$/);
      const name = sanitizeName(m && m[1] ? m[1] : trimmed);
      const tickets = clampTickets(m && m[2] ? m[2] : 1);
      if (name) entries.push({ name, tickets });
    }
    return entries;
  }
  function bulkAdd(text) {
    const entries = parseBulk(text);
    if (entries.length === 0) return 0;
    let added = 0;
    for (const e of entries) {
      if (addContestant(e.name, e.tickets)) added++;
    }
    return added;
  }
  function exportCSV() {
    if (contestants.length === 0) {
      alert('Nothing to export yet — add some contestants first.');
      return;
    }
    const lines = ['name,tickets'];
    for (const c of contestants) {
      const safe = c.name.includes(',') || c.name.includes('"')
        ? `"${c.name.replace(/"/g, '""')}"`
        : c.name;
      lines.push(`${safe},${c.tickets}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raffler-contestants-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importCSV(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const lines = text.split(/\r?\n/);
      // Strip header if present
      if (lines[0] && /^name\s*,/i.test(lines[0])) lines.shift();
      const added = bulkAdd(lines.join('\n'));
      if (added > 0) flashHint(`Imported ${added} contestant${added === 1 ? '' : 's'}.`);
    };
    reader.onerror = () => alert('Could not read the file.');
    reader.readAsText(file);
  }
  function flashHint(message) {
    els.statsBadge.textContent = message;
    setTimeout(renderStats, 1800);
  }

  // ----- Weighted draw --------------------------------------------------
  function weightedPick(pool) {
    if (pool.length === 0) return null;
    const total = pool.reduce((s, c) => s + c.tickets, 0);
    if (total <= 0) return null;
    // Use crypto for stronger randomness
    let r;
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      r = (buf[0] / 0x100000000) * total;
    } else {
      r = Math.random() * total;
    }
    for (const c of pool) {
      r -= c.tickets;
      if (r < 0) return c;
    }
    return pool[pool.length - 1];
  }

  // ----- Reel animation -------------------------------------------------
  function setReel(items, { animate = true } = {}) {
    els.reelTrack.innerHTML = '';
    for (const text of items) {
      const div = document.createElement('div');
      div.className = 'reel-item';
      div.textContent = text;
      els.reelTrack.appendChild(div);
    }
    if (!animate) {
      els.reelTrack.style.transition = 'none';
      els.reelTrack.style.transform = 'translateY(0)';
    }
  }
  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildSpinSequence(pool, winner) {
    // Weighted tape: each contestant appears once per ticket. So if Ali has 5
    // tickets and Chris has 1, "Ali" flies by ~5× more often during the spin —
    // the visual reflects the actual odds.
    const weightedNames = [];
    for (const c of pool) {
      for (let t = 0; t < c.tickets; t++) weightedNames.push(c.name);
    }
    if (weightedNames.length === 0) return { sequence: [winner.name], winnerIndex: 0 };

    // Vary length each spin (28–43 items) so the reel doesn't feel canned.
    const targetLen = 28 + Math.floor(Math.random() * 16);
    const seq = [];
    while (seq.length < targetLen) {
      // Re-shuffle each cycle so the order is fresh.
      seq.push(...shuffleInPlace([...weightedNames]));
    }

    // Reserve a few trailing items AFTER the winner. Without them, the area
    // below the winning row is blank and the wheel reads as "ran out of names"
    // instead of "happened to stop here."
    const trail = 3 + Math.floor(Math.random() * 3); // 3–5 trailing names
    const winnerIndex = seq.length - 1 - trail;
    seq[winnerIndex] = winner.name;

    // Scrub any other occurrences of the winner's name in the neighborhood of
    // the landing position so the row above/below isn't a duplicate.
    const altNames = weightedNames.filter((n) => n !== winner.name);
    if (altNames.length > 0) {
      for (let off = -1; off <= trail; off++) {
        if (off === 0) continue;
        const idx = winnerIndex + off;
        if (idx < 0 || idx >= seq.length) continue;
        if (seq[idx] === winner.name) {
          seq[idx] = altNames[Math.floor(Math.random() * altNames.length)];
        }
      }
    }

    return { sequence: seq, winnerIndex };
  }

  async function spinTo(winner, pool) {
    const ITEM_H = window.innerWidth < 460 ? 70 : 80;
    const { sequence, winnerIndex } = buildSpinSequence(pool, winner);
    setReel(sequence, { animate: false });
    // Force reflow before animating
    void els.reelTrack.offsetHeight;

    // Track is CSS-positioned so the first item is centered (top offset = (reelH - itemH)/2).
    // The reel intentionally overshoots a few pixels, then settles back — gives
    // the spin a satisfying "thunk" instead of a sterile glide.
    const targetY = -(winnerIndex * ITEM_H);
    const overshoot = 14;
    const duration = 2800 + Math.round(Math.random() * 900); // 2.8–3.7s, varies per spin

    els.reelTrack.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    els.reelTrack.style.transform = `translateY(${targetY - overshoot}px)`;

    await new Promise((resolve) => {
      const onEnd = () => {
        els.reelTrack.removeEventListener('transitionend', onEnd);
        resolve();
      };
      els.reelTrack.addEventListener('transitionend', onEnd);
      setTimeout(onEnd, duration + 300); // safety
    });

    // Settle: spring back to the exact landing position.
    els.reelTrack.style.transition = 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)';
    els.reelTrack.style.transform = `translateY(${targetY}px)`;
    await new Promise((resolve) => setTimeout(resolve, 320));

    // Highlight winner in reel
    const items = els.reelTrack.querySelectorAll('.reel-item');
    const winnerEl = items[winnerIndex];
    if (winnerEl) winnerEl.classList.add('winner');
  }

  function resetReel(message = 'Ready when you are…') {
    els.reelTrack.style.transition = 'none';
    els.reelTrack.style.transform = 'translateY(0)';
    els.reelTrack.innerHTML = `<div class="reel-item placeholder">${escapeHtml(message)}</div>`;
  }

  async function draw() {
    if (isSpinning || contestants.length === 0) return;

    const requested = Math.max(1, Math.min(50, parseInt(els.winnersInput.value || '1', 10)));
    const unique = els.uniqueToggle.checked;

    // Cap draws by what the pool actually supports:
    //   unique  → one draw per person (their remaining tickets are discarded)
    //   default → one draw per ticket (winners can repeat until tickets run out)
    const maxPossible = unique ? contestants.length : totalTickets();
    const count = Math.min(requested, maxPossible);

    isSpinning = true;
    els.drawBtn.classList.add('is-spinning');
    els.drawBtn.querySelector('.draw-btn-label').textContent = 'Drawing…';
    updateDrawButton();

    // Snapshot the starting total for accurate odds in the winner modal.
    const drawStartTotal = totalTickets();

    // Local pool for picking; mirrors changes into `contestants` for persistence.
    let pool = contestants.map((c) => ({ ...c }));
    const winners = [];

    for (let i = 0; i < count; i++) {
      if (pool.length === 0) break;
      const winner = weightedPick(pool);
      if (!winner) break;
      // Capture a snapshot so later mutations don't change displayed odds.
      winners.push({ id: winner.id, name: winner.name, tickets: winner.tickets });
      await spinTo(winner, pool);
      pushHistory(winner.name);

      if (unique) {
        pool = pool.filter((c) => c.id !== winner.id);
        contestants = contestants.filter((c) => c.id !== winner.id);
      } else {
        // Consume one ticket from the winner in both the pool and master list.
        const poolIdx = pool.findIndex((c) => c.id === winner.id);
        if (poolIdx !== -1) {
          pool[poolIdx] = { ...pool[poolIdx], tickets: pool[poolIdx].tickets - 1 };
          if (pool[poolIdx].tickets <= 0) pool.splice(poolIdx, 1);
        }
        const masterIdx = contestants.findIndex((c) => c.id === winner.id);
        if (masterIdx !== -1) {
          contestants[masterIdx] = { ...contestants[masterIdx], tickets: contestants[masterIdx].tickets - 1 };
          if (contestants[masterIdx].tickets <= 0) contestants.splice(masterIdx, 1);
        }
      }
      saveContestants();

      // Brief pause between multiple draws
      if (i < count - 1) await sleep(700);
    }

    render();

    isSpinning = false;
    els.drawBtn.classList.remove('is-spinning');
    els.drawBtn.querySelector('.draw-btn-label').textContent = contestants.length > 0 ? 'Pick another' : 'Pool empty';
    updateDrawButton();

    showWinnerModal(winners, drawStartTotal);
    fireConfetti();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function showWinnerModal(winners, drawStartTotal) {
    if (winners.length === 0) return;
    if (winners.length === 1) {
      const w = winners[0];
      els.winnerName.textContent = w.name;
      const pct = drawStartTotal > 0 ? ((w.tickets / drawStartTotal) * 100).toFixed(1) : '0';
      els.winnerMeta.textContent = `${w.tickets} ticket${w.tickets === 1 ? '' : 's'} · ${pct}% odds`;
    } else {
      els.winnerName.textContent = `${winners.length} winners`;
      const names = winners.map((w) => w.name).join(', ');
      els.winnerMeta.textContent = names.length > 200 ? names.slice(0, 200) + '…' : names;
    }
    openModal(els.winnerModal);
  }

  // ----- Modals ---------------------------------------------------------
  function openModal(modal) {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    // Focus first focusable element
    const focusable = modal.querySelector('button:not([data-close-modal]), [href], input');
    if (focusable) focusable.focus();
  }
  function closeModal(modal) {
    modal.hidden = true;
    document.body.style.overflow = '';
  }
  function bindModal(modal) {
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.closeModal !== undefined) closeModal(modal);
    });
  }

  // ----- Confetti -------------------------------------------------------
  const confettiCtx = els.confetti.getContext('2d');
  let confettiParticles = [];
  let confettiRunning = false;

  function sizeConfetti() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.confetti.width = window.innerWidth * dpr;
    els.confetti.height = window.innerHeight * dpr;
    els.confetti.style.width = window.innerWidth + 'px';
    els.confetti.style.height = window.innerHeight + 'px';
    confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function fireConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    sizeConfetti();
    const colors = ['#7c5cff', '#22d3ee', '#f472b6', '#fbbf24', '#34d399', '#ffffff'];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const burst = 140;
    for (let i = 0; i < burst; i++) {
      confettiParticles.push({
        x: W / 2 + (Math.random() - 0.5) * W * 0.4,
        y: H / 2,
        vx: (Math.random() - 0.5) * 14,
        vy: -10 - Math.random() * 8,
        g: 0.35,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        life: 0,
        maxLife: 120 + Math.random() * 60,
        shape: Math.random() < 0.5 ? 'rect' : 'circle',
      });
    }
    if (!confettiRunning) {
      confettiRunning = true;
      requestAnimationFrame(stepConfetti);
    }
  }
  function stepConfetti() {
    confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    confettiParticles = confettiParticles.filter((p) => p.life < p.maxLife && p.y < window.innerHeight + 30);
    for (const p of confettiParticles) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life++;
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      confettiCtx.save();
      confettiCtx.globalAlpha = alpha;
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rot);
      confettiCtx.fillStyle = p.color;
      if (p.shape === 'rect') {
        confettiCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        confettiCtx.beginPath();
        confettiCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        confettiCtx.fill();
      }
      confettiCtx.restore();
    }
    if (confettiParticles.length > 0) {
      requestAnimationFrame(stepConfetti);
    } else {
      confettiRunning = false;
      confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
  window.addEventListener('resize', () => {
    if (confettiRunning) sizeConfetti();
  });

  // ----- Events ---------------------------------------------------------
  els.addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.nameInput.value;
    const tickets = els.ticketsInput.value;
    if (addContestant(name, tickets)) {
      els.nameInput.value = '';
      els.ticketsInput.value = '1';
      els.nameInput.focus();
    }
  });

  els.list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const li = btn.closest('.contestant-item');
    if (!li) return;
    const id = li.dataset.id;
    const act = btn.dataset.act;
    if (act === 'inc') adjustTickets(id, +1);
    else if (act === 'dec') adjustTickets(id, -1);
    else if (act === 'remove') removeContestant(id);
  });

  els.bulkAddBtn.addEventListener('click', () => {
    const text = els.bulkInput.value;
    const added = bulkAdd(text);
    if (added > 0) {
      els.bulkInput.value = '';
      flashHint(`Added ${added} contestant${added === 1 ? '' : 's'}.`);
    } else {
      flashHint('No contestants found in that text.');
    }
  });

  els.exportCsvBtn.addEventListener('click', exportCSV);
  els.importCsvBtn.addEventListener('click', () => els.csvFile.click());
  els.csvFile.addEventListener('change', () => {
    const file = els.csvFile.files && els.csvFile.files[0];
    if (file) importCSV(file);
    els.csvFile.value = '';
  });

  els.clearBtn.addEventListener('click', clearAll);
  els.clearHistoryBtn.addEventListener('click', clearHistory);

  els.drawBtn.addEventListener('click', draw);
  els.drawAgainBtn.addEventListener('click', () => {
    closeModal(els.winnerModal);
    // small delay so the modal can close visually
    setTimeout(draw, 220);
  });

  els.howtoBtn.addEventListener('click', () => openModal(els.howtoModal));
  bindModal(els.winnerModal);
  bindModal(els.howtoModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!els.winnerModal.hidden) closeModal(els.winnerModal);
      if (!els.howtoModal.hidden) closeModal(els.howtoModal);
    }
  });

  // Seed if first visit, so the app isn't empty for newcomers
  if (contestants.length === 0 && history.length === 0 && !localStorage.getItem(SEEDED_KEY)) {
    contestants = [
      { id: uid(), name: 'Alex', tickets: 3 },
      { id: uid(), name: 'Brianna', tickets: 5 },
      { id: uid(), name: 'Chen', tickets: 2 },
      { id: uid(), name: 'Dani', tickets: 1 },
    ];
    saveContestants();
    try { localStorage.setItem(SEEDED_KEY, '1'); } catch (_) {}
  }

  // Initial render
  resetReel();
  render();
})();
