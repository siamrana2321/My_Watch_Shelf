'use strict';
const KEY = 'screenlog-library-v2';
const GENRES = ["Action", "Adventure", "Animation", "Anime", "Award-Winning", "Biography", "Boys' Love (BL)", "Children", "Comedy", "Coming-of-Age", "Crime", "Cult", "Cyberpunk", "Dance", "Documentary", "Drama", "Family", "Fantasy", "Food", "Game Show", "Gourmet", "Historical", "Horror", "Idols", "Isekai", "Josei", "Kids", "Magic", "Martial Arts", "Mecha", "Medical", "Military", "Music", "Mystery", "Nature", "Parody", "Police", "Psychological", "Reality", "Reincarnation", "Romance", "Samurai", "School", "Sci-Fi", "Seinen", "Shoujo", "Shounen", "Slice of Life", "Sports", "Spy", "Supernatural", "Survival", "Suspense", "Talk Show", "Thriller", "Time Travel", "Travel", "Vampire", "War", "Western", "Workplace", "Yaoi", "Yuri"];
const labels = { all: 'Home', watching: 'Watching', planned: 'Watchlist', completed: 'Completed', 'on-hold': 'On Hold', dropped: 'Dropped', favorites: 'Favorites' };
const statusNames = { planned: 'Plan to watch', watching: 'Watching', completed: 'Completed', 'on-hold': 'On hold', dropped: 'Dropped' };
const types = { movie: 'Movie', series: 'TV series', anime: 'Anime series', 'anime-movie': 'Anime movie', documentary: 'Documentary' };
const RATING_WORDS = ['Not rated', 'Awful', 'Bad', 'Average', 'Great', 'Masterpiece'];
const $ = id => document.getElementById(id);

let storageOk = true;
let items = load();
let currentFilter = 'all', activeGenre = 'all', detailId = null;
let lastFocus = null, undoData = null, toastTimer = null;

/* ---------- helpers ---------- */
const isSeries = x => x.type === 'series' || x.type === 'anime';
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
function esc(s = '') { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
function safeUrl(u) { return /^https?:\/\//i.test(u || '') || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u || '') ? u : ''; }
function posInt(v, min) { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= min ? n : null; }

/* ---- season helpers: seasonEpisodes = [eps in S1, eps in S2, ...] ---- */
const seasonList = x => Array.isArray(x.seasonEpisodes) ? x.seasonEpisodes : [];
const seasonCount = (x, s) => seasonList(x)[s - 1] || 0;
function totalEps(x) {
  const se = seasonList(x);
  if (se.length) return se.every(Boolean) ? se.reduce((a, b) => a + b, 0) : 0;
  return Number(x.totalEpisodes) || 0;
}
function watchedEps(x) { // episodes watched overall
  const se = seasonList(x); let w = Number(x.episode) || 0;
  for (let i = 0; i < Math.min(x.season - 1, se.length); i++) w += se[i] || 0;
  return w;
}
function atEnd(x) { const se = seasonList(x); return se.length > 0 && x.season === se.length && seasonCount(x, x.season) > 0 && x.episode >= seasonCount(x, x.season); }
function finishSeries(x) { // "completed" → last season, last episode
  const se = seasonList(x);
  if (se.length) { x.season = se.length; if (seasonCount(x, x.season)) x.episode = seasonCount(x, x.season); }
  else if (x.totalEpisodes) x.episode = x.totalEpisodes;
}
function hue(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

function clean(x) {
  if (!x || typeof x !== 'object' || !String(x.title || '').trim()) return null;
  let se = Array.isArray(x.seasonEpisodes) ? x.seasonEpisodes.slice(0, 60).map(v => posInt(v, 1)) : [];
  if (!se.length && posInt(x.totalSeasons, 1) === 1 && posInt(x.totalEpisodes, 1)) se = [posInt(x.totalEpisodes, 1)]; // old data: single season
  const seasons = se.length || posInt(x.totalSeasons, 1);
  const season = Math.min(posInt(x.season, 1) || 1, seasons || 9999);
  let episode = posInt(x.episode, 0) || 0;
  if (se[season - 1]) episode = Math.min(episode, se[season - 1]);
  return {
    id: x.id || uid(),
    title: String(x.title).trim().slice(0, 120),
    type: types[x.type] ? x.type : 'movie',
    year: posInt(x.year, 1888),
    status: statusNames[x.status] ? x.status : 'planned',
    rating: Math.min(5, Math.max(0, Math.round(Number(x.rating)) || 0)),
    genres: Array.isArray(x.genres) ? x.genres.map(String) : (x.genre ? [String(x.genre)] : []),
    poster: safeUrl(String(x.poster || '').trim()),
    notes: String(x.notes || '').slice(0, 2000),
    favorite: !!x.favorite,
    season, episode,
    seasonEpisodes: se,
    totalSeasons: seasons || null,
    totalEpisodes: se.length ? null : posInt(x.totalEpisodes, 1),
    updated: Number(x.updated) || Date.now()
  };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem('screenlog-library-v1') || '[]';
    const arr = JSON.parse(raw);
    return (Array.isArray(arr) ? arr : []).map(clean).filter(Boolean);
  } catch (e) { return []; }
}
function writeLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(items)); storageOk = true; }
  catch (e) { storageOk = false; }
  $('storageBanner').hidden = storageOk;
}
function save() { writeLocal(); render(); }
function pct(x) {
  // Series: progress inside the CURRENT season (completed = 100%)
  if (!isSeries(x)) return x.status === 'completed' ? 100 : 0;
  if (x.status === 'completed') return 100;
  const n = seasonList(x).length ? seasonCount(x, x.season) : (Number(x.totalEpisodes) || 0);
  return n ? Math.min(100, Math.round((x.episode / n) * 100)) : 0;
}
function hasPct(x) { return isSeries(x) && (x.status === 'completed' || (seasonList(x).length ? seasonCount(x, x.season) : x.totalEpisodes));
}
function toast(msg, actionLabel, action) {
  const t = $('toast'), btn = $('toastAction');
  $('toastMsg').textContent = msg;
  btn.hidden = !actionLabel;
  btn.textContent = actionLabel || '';
  undoData = action || null;
  t.classList.add('show');
  t.classList.toggle('has-action', !!actionLabel);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); undoData = null; }, actionLabel ? 6000 : 2400);
}
$('toastAction').onclick = () => { if (undoData) undoData(); undoData = null; $('toast').classList.remove('show'); };

/* ---------- genre UI ---------- */
function makeGenreUI(chosen = []) {
  $('genrePicker').innerHTML = GENRES.map(g => `<label class="genre-option"><input type="checkbox" value="${esc(g)}" ${chosen.includes(g) ? 'checked' : ''}><span>${esc(g)}</span></label>`).join('');
}
function selectedGenres() { return [...document.querySelectorAll('#genrePicker input:checked')].map(x => x.value); }
function initGenreFilters() {
  $('genreFilter').innerHTML = '<option value="all">All genres</option>' + GENRES.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
}

/* ---------- star rating input ---------- */
function setRating(n) {
  $('ratingInput').value = n;
  $('ratingText').textContent = n ? `${n}/5 — ${RATING_WORDS[n]}` : 'Not rated';
  $('starInput').innerHTML = [1, 2, 3, 4, 5].map(i => `<button type="button" role="radio" aria-checked="${i === n}" aria-label="${i} star${i > 1 ? 's' : ''}, ${RATING_WORDS[i]}" data-star="${i}" class="${i <= n ? 'on' : ''}">★</button>`).join('') +
    (n ? '<button type="button" class="star-clear" data-star="0">Clear</button>' : '');
}
$('starInput').onclick = e => {
  const b = e.target.closest('[data-star]'); if (!b) return;
  const v = Number(b.dataset.star);
  setRating(v === Number($('ratingInput').value) && v !== 0 ? 0 : v);
  const again = $('starInput').querySelector(`[data-star="${Math.max(1, v)}"]`); if (again && v) again.focus();
};

/* ---------- render ---------- */
function render() {
  const counts = { all: items.length, watching: 0, planned: 0, completed: 0, 'on-hold': 0, dropped: 0, favorites: items.filter(x => x.favorite).length };
  items.forEach(x => counts[x.status] = (counts[x.status] || 0) + 1);
  const title = labels[currentFilter];
  $('listHeading').textContent = currentFilter === 'all' ? 'My Library' : title;
  document.title = (currentFilter === 'all' ? '' : title + ' · ') + 'My Watch Shelf';

  const words = $('searchInput').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const type = $('typeFilter').value;
  const genre = activeGenre !== 'all' ? activeGenre : $('genreFilter').value;
  let shown = items.filter(x =>
    (currentFilter === 'all' || (currentFilter === 'favorites' ? x.favorite : x.status === currentFilter)) &&
    (type === 'all' || x.type === type) &&
    (genre === 'all' || x.genres.includes(genre)) &&
    (!words.length || words.every(w => `${x.title} ${x.genres.join(' ')} ${x.year || ''} ${types[x.type]} ${x.notes}`.toLowerCase().includes(w))));
  const sort = $('sortSelect').value;
  shown.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'rating' ? (b.rating - a.rating) || a.title.localeCompare(b.title) : sort === 'year' ? (b.year || 0) - (a.year || 0) : sort === 'progress' ? pct(b) - pct(a) : (b.updated || 0) - (a.updated || 0));

  $('resultCount').textContent = `${shown.length} ${shown.length === 1 ? 'title' : 'titles'}`;
  $('activeFilters').innerHTML =
    (activeGenre !== 'all' ? `<button type="button" class="filter-chip" data-cleargenre>Genre: ${esc(activeGenre)} ×</button>` : '') +
    (activeGenre === 'all' && genre !== 'all' ? `<button type="button" class="filter-chip" data-clearselect>Genre: ${esc(genre)} ×</button>` : '');
  refreshDropdowns();

  $('library').innerHTML = shown.map(card).join('');
  const es = $('emptyState');
  es.classList.toggle('show', shown.length === 0);
  es.querySelector('h3').textContent = items.length ? 'Nothing Matches Those Filters' : 'My Watch Shelf Starts Here';
  es.querySelector('p').textContent = items.length ? 'Clear a filter or try another search.' : 'Add movies, TV series and anime. Keep your progress, ratings and favorites together.';
  $('emptyAddBtn').hidden = items.length > 0;
  $('clearFiltersBtn').hidden = !(items.length > 0);
  document.querySelectorAll('.nav-item').forEach(b => { const on = b.dataset.filter === currentFilter; b.classList.toggle('active', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
}
function poster(x, cls) {
  return x.poster ? `<img class="${cls}" src="${esc(x.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-poster>` : '';
}
function card(x) {
  const p = pct(x), ser = isSeries(x);
  const cnt = seasonCount(x, x.season);
  const where = ser && x.status !== 'planned' ? `S${x.season} · Ep ${x.episode}${cnt ? ` / ${cnt}` : (x.totalEpisodes ? ` / ${x.totalEpisodes}` : '')}` : (ser && seasonList(x).length ? `${seasonList(x).length} season${seasonList(x).length > 1 ? 's' : ''}` : '');
  const meta = [x.year, where].filter(Boolean).join(' · ') || types[x.type];
  const action = ser
    ? `<button type="button" data-action="progress" data-id="${x.id}" aria-label="Add one episode to ${esc(x.title)}">＋ Episode</button>`
    : `<button type="button" data-action="progress" data-id="${x.id}" aria-label="${x.status === 'completed' ? 'Mark ' + esc(x.title) + ' as not watched' : 'Mark ' + esc(x.title) + ' as watched'}">${x.status === 'completed' ? '↺ Unwatch' : '✓ Watched'}</button>`;
  return `<article class="title-card" tabindex="0" role="button" aria-label="Open details for ${esc(x.title)}" data-open="${x.id}">
   <div class="poster" style="--h:${hue(x.title)}"><div class="poster-placeholder" aria-hidden="true"><span>${esc(x.title.slice(0, 1).toUpperCase())}</span></div>${poster(x, 'poster-img')}<div class="poster-shade"></div>
    <span class="type-pill">${types[x.type]}</span>
    <button type="button" class="fav-btn ${x.favorite ? 'on' : ''}" data-action="favorite" data-id="${x.id}" aria-pressed="${x.favorite}" aria-label="${x.favorite ? 'Remove ' : 'Add '}${esc(x.title)} ${x.favorite ? 'from' : 'to'} favorites">♥</button>
    <span class="status ${x.status}"><i></i>${statusNames[x.status]}</span>
    ${ser ? `<div class="progress-track" role="progressbar" aria-label="Overall progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><div class="progress-fill" style="width:${p}%"></div></div>` : ''}</div>
   <div class="card-body"><div class="card-title" title="${esc(x.title)}">${esc(x.title)}</div>
    <div class="card-meta"><span>${esc(meta)}</span>${hasPct(x) ? `<b title="Progress in the current season">${p}%</b>` : ''}</div>
    <div class="card-sub">${x.rating ? `<span class="rating" aria-label="Rated ${x.rating} out of 5">${stars(x.rating)}</span>` : ''}<span class="genre-tags">${x.genres.slice(0, 2).map(g => `<span class="genre-tag">${esc(g)}</span>`).join('')}</span></div>
    <div class="card-actions">${action}<button type="button" data-action="edit" data-id="${x.id}" aria-label="Edit ${esc(x.title)}">Edit</button></div></div></article>`;
}
/* broken poster → fall back to the letter placeholder */
document.addEventListener('error', e => { if (e.target.matches && e.target.matches('img[data-poster]')) e.target.remove(); }, true);

/* ---------- modals & focus ---------- */
function focusables(root) { return [...root.querySelectorAll('button:not([hidden]):not([disabled]),input:not([type=hidden]):not([disabled]),select:not(.dd-native),textarea,[tabindex="0"]')].filter(e => e.offsetParent !== null || e === document.activeElement); }
function openLayer(bd) { lastFocus = document.activeElement; bd.classList.add('open'); document.body.classList.add('no-scroll'); }
function closeLayer(bd) {
  if (!bd.classList.contains('open')) return;
  bd.classList.remove('open');
  if (!document.querySelector('.modal-backdrop.open,.detail-backdrop.open')) document.body.classList.remove('no-scroll');
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}
function openModal(x = null, keepFocusTarget = false) {
  if (!keepFocusTarget) lastFocus = document.activeElement;
  $('titleForm').reset();
  $('editId').value = x?.id || '';
  $('modalTitle').textContent = x ? 'Edit Title' : 'Add a Title';
  $('titleInput').value = x?.title || '';
  $('kindInput').value = x?.type || 'movie';
  $('yearInput').value = x?.year || '';
  $('statusInput').value = x?.status || 'planned';
  posterData = /^data:image\//i.test(x?.poster || '') ? x.poster : '';
  $('posterInput').value = posterData ? '' : (x?.poster || '');
  $('notesInput').value = x?.notes || '';
  $('favoriteInput').checked = !!x?.favorite;
  $('seasonInput').value = x?.season || 1;
  $('episodeInput').value = x?.episode || 0;
  $('totalSeasonsInput').value = x?.totalSeasons || '';
  renderSeasonInputs(seasonList(x || {}), x?.totalSeasons || 0);
  setRating(x?.rating || 0);
  makeGenreUI(x?.genres || []);
  $('formError').hidden = true; updatePosterPreview();
  stepIdx = 0; maxVisited = x ? 99 : 0; showStep(0, false);
  refreshDropdowns();
  $('modalBackdrop').classList.add('open'); document.body.classList.add('no-scroll');
  $('titleInput').focus();
}
const closeModal = () => closeLayer($('modalBackdrop'));
/* per-season episode inputs */
function readSeasonValues() { return [...document.querySelectorAll('#seasonEpisodes .se')].map(i => posInt(i.value, 1)); }
function renderSeasonInputs(vals, n) {
  n = Math.min(60, Math.max(0, Math.floor(Number(n)) || 0));
  $('seasonEpisodes').innerHTML = Array.from({ length: n }, (_, i) =>
    `<label class="season-box">Season ${i + 1}<input class="se" type="number" inputmode="numeric" min="1" max="999" placeholder="eps" value="${vals[i] || ''}" aria-label="Episodes in season ${i + 1}"></label>`).join('');
  updateTotals();
}
function updateTotals() {
  const v = readSeasonValues(), line = $('totalEpsLine');
  if (!v.length) line.hidden = true;
  else {
    const known = v.filter(Boolean).length, sum = v.reduce((a, b) => a + (b || 0), 0);
    line.hidden = false;
    line.textContent = known === v.length ? `Total: ${sum} episodes across ${v.length} season${v.length > 1 ? 's' : ''}` : `${known} of ${v.length} seasons filled in. Fill them all to see the total and % progress.`;
  }
  const s = Math.max(1, Number($('seasonInput').value) || 1), max = v[s - 1];
  $('seasonInput').max = v.length || '';
  $('episodeInput').max = max || '';
  $('epMax').textContent = max ? `(0–${max} in season ${s})` : 'in this season';
}
$('totalSeasonsInput').addEventListener('input', () => { const old = readSeasonValues(); renderSeasonInputs(old, $('totalSeasonsInput').value); });
$('seasonEpisodes').addEventListener('input', updateTotals);
$('seasonInput').addEventListener('input', updateTotals);
/* ---------- add/edit wizard (stepper like an upload flow) ---------- */
const STEPS = [{ key: 'basics', label: 'Basics' }, { key: 'details', label: 'Genres & Rating' }, { key: 'progress', label: 'Progress' }, { key: 'finish', label: 'Finish' }];
let stepIdx = 0, maxVisited = 0;
const activeSteps = () => STEPS.filter(st => st.key !== 'progress' || isSeries({ type: $('kindInput').value }));
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function showError(msg) { const e = $('formError'); e.textContent = msg; e.hidden = !msg; }
function refreshStepUI() {
  const list = activeSteps(), editing = !!$('editId').value;
  stepIdx = Math.min(stepIdx, list.length - 1);
  document.querySelectorAll('#titleForm .step').forEach(el => el.classList.toggle('active', el.dataset.step === list[stepIdx].key));
  $('stepper').innerHTML = list.map((st, i) => `<li class="${i === stepIdx ? 'current' : ''}${i < stepIdx ? ' done' : ''}"><button type="button" data-goto="${i}" ${!editing && i > maxVisited ? 'disabled' : ''} ${i === stepIdx ? 'aria-current="step"' : ''} aria-label="Step ${i + 1} of ${list.length}: ${st.label}"><span class="dot">${i < stepIdx ? CHECK_SVG : i + 1}</span><span class="lbl">${st.label}</span></button></li>`).join('');
  const last = stepIdx === list.length - 1;
  $('backBtn').hidden = stepIdx === 0; $('nextBtn').hidden = last; $('saveBtn').hidden = !(last || editing);
  $('saveBtn').textContent = editing ? 'Save changes' : 'Save title';
}
function showStep(i, focus = true) {
  stepIdx = Math.max(0, Math.min(i, activeSteps().length - 1)); maxVisited = Math.max(maxVisited, stepIdx);
  showError(''); refreshStepUI(); $('stepsBox').scrollTop = 0;
  if (focus) { const f = document.querySelector('#titleForm .step.active .dd-btn, #titleForm .step.active input:not([type=hidden]):not(.dd-native), #titleForm .step.active textarea'); if (f) f.focus(); }
}
function validateStep(key, quiet = false) {
  const el = document.querySelector(`#titleForm .step[data-step="${key}"]`);
  if (key === 'basics' && !$('titleInput').value.trim()) { if (!quiet) { showError('Please enter a title to continue.'); $('titleInput').focus(); } return false; }
  for (const inp of el.querySelectorAll('input:not([type=hidden]),textarea')) {
    if (!inp.checkValidity()) { if (!quiet) { const lab = inp.closest('label'); showError(`${lab ? lab.firstChild.textContent.trim() + ': ' : (inp.getAttribute('aria-label') ? inp.getAttribute('aria-label') + ': ' : '')}${inp.validationMessage || 'please check this value'}`); inp.focus(); } return false; }
  }
  return true;
}
function validateAll() {
  const list = activeSteps();
  for (let i = 0; i < list.length; i++) if (!validateStep(list[i].key, true)) { showStep(i, false); validateStep(list[i].key); return false; }
  return true;
}
const goNext = () => { if (validateStep(activeSteps()[stepIdx].key)) showStep(stepIdx + 1); };
const toggleProgress = () => { refreshStepUI(); };
$('nextBtn').onclick = goNext;
$('backBtn').onclick = () => showStep(stepIdx - 1);
$('saveBtn').onclick = () => doSave();
$('stepper').onclick = e => {
  const b = e.target.closest('[data-goto]'); if (!b || b.disabled) return;
  const j = Number(b.dataset.goto); if (j > stepIdx && !validateStep(activeSteps()[stepIdx].key)) return; showStep(j);
};
let posterData = ''; // an uploaded (resized) image, kept as a data URL
const effectivePoster = () => posterData || $('posterInput').value.trim();
function updatePosterPreview() {
  const url = effectivePoster(), box = $('posterPreview'), img = box.querySelector('img');
  if (!/^(https?:\/\/|data:image\/)/i.test(url)) { box.hidden = true; img.removeAttribute('src'); return; }
  img.onload = () => { box.hidden = false; }; img.onerror = () => { box.hidden = true; }; img.src = url;
}
async function handlePosterFile(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { showError('Please choose an image file (JPG, PNG or WebP).'); return; }
  if (file.size > 12 * 1024 * 1024) { showError('That image is too large (12 MB max).'); return; }
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = objUrl; });
    const sc = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
    const g = c.getContext('2d'); g.fillStyle = '#14161d'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.86, data = c.toDataURL('image/jpeg', q);
    while (data.length > 300000 && q > 0.4) { q -= 0.1; data = c.toDataURL('image/jpeg', q); } // keep it small so storage doesn't fill up
    posterData = data; $('posterInput').value = ''; showError(''); updatePosterPreview();
  } catch (e) { showError('Could not read that image. Please try a different file.'); }
  finally { URL.revokeObjectURL(objUrl); }
}
$('posterInput').addEventListener('input', () => { if ($('posterInput').value) posterData = ''; updatePosterPreview(); });
$('posterClear').onclick = () => { posterData = ''; $('posterInput').value = ''; updatePosterPreview(); };
const dz = $('dropzone');
dz.onclick = () => $('posterFile').click();
dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('posterFile').click(); } };
$('posterFile').onchange = e => { handlePosterFile(e.target.files[0]); e.target.value = ''; };
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', e => handlePosterFile(e.dataTransfer.files[0]));

function detail(id) {
  const x = items.find(a => a.id === id); if (!x) return;
  detailId = id;
  const p = pct(x), ser = isSeries(x);
  $('detailContent').innerHTML = `<button type="button" class="detail-close" id="detailClose" aria-label="Close details">×</button>
  <div class="detail-hero" style="--h:${hue(x.title)}"><div class="detail-poster detail-placeholder" aria-hidden="true">${esc(x.title[0].toUpperCase())}</div>${poster(x, 'detail-poster detail-img')}
   <div class="detail-info"><span class="status ${x.status}">${statusNames[x.status]}</span><h2>${esc(x.title)}</h2>
   <p>${esc([x.year, types[x.type], x.genres.join(' · ')].filter(Boolean).join(' · '))}</p>
   ${x.rating ? `<div class="rating" aria-label="Rated ${x.rating} out of 5">${stars(x.rating)} <span class="rating-word">${RATING_WORDS[x.rating]}</span></div>` : '<p>Not rated yet</p>'}
   ${ser ? `<p class="where">Season ${x.season} · Episode ${x.episode}${seasonCount(x, x.season) ? ` of ${seasonCount(x, x.season)}` : ''}${hasPct(x) ? ` · ${p}%` : ''}${totalEps(x) ? `<br><span class="overall">${watchedEps(x)} / ${totalEps(x)} episodes overall</span>` : ''}</p>` : ''}</div></div>
  <div class="detail-content">
   <label class="detail-status">Status <select id="detailStatus">${Object.entries(statusNames).map(([k, v]) => `<option value="${k}" ${k === x.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
   ${ser ? `<div class="ep-stepper"><button type="button" data-detail="ep-minus" aria-label="Go back one episode">− Episode</button><span>S${x.season} · Ep ${x.episode}</span><button type="button" data-detail="ep-plus" aria-label="Add one episode">＋ Episode</button></div>` : ''}
   ${ser && seasonList(x).length ? `<h3>SEASONS</h3><div class="season-bars">${seasonList(x).map((n, i) => { const s = i + 1, w = s < x.season ? 100 : s === x.season ? (n ? Math.min(100, Math.round(x.episode / n * 100)) : 0) : 0, label = s < x.season ? (n ? `${n}/${n}` : 'done') : s === x.season ? `${x.episode}/${n || '?'}` : `0/${n || '?'}`; return `<div class="sbar${s === x.season ? ' current' : ''}"><span>Season ${s}</span><div class="progress-track"><div class="progress-fill" style="width:${w}%"></div></div><em>${label}</em></div>`; }).join('')}</div>` : ''}
   <h3>MY NOTES</h3><div class="detail-notes">${esc(x.notes || 'No notes yet. Edit this title to add your thoughts.')}</div>
   <div class="detail-controls"><button type="button" data-detail="edit">Edit title</button><button type="button" data-detail="favorite" aria-pressed="${x.favorite}">${x.favorite ? '♥ Remove favorite' : '♡ Add favorite'}</button><button type="button" class="danger" data-detail="delete">Delete title</button></div>
  </div>`;
  enhanceSelect($('detailStatus'));
  if (!$('detailBackdrop').classList.contains('open')) openLayer($('detailBackdrop'));
  $('detailClose').onclick = closeDetail;
  if (arguments[1] !== 'keepFocus') $('detailClose').focus();
}
function closeDetail() { closeLayer($('detailBackdrop')); detailId = null; }

/* ---------- actions ---------- */
function touch(x) { x.updated = Date.now(); }
function doProgress(x) {
  if (isSeries(x)) {
    const N = seasonList(x).length, cnt = seasonCount(x, x.season), total = totalEps(x);
    if (N) {
      if (atEnd(x)) { x.status = 'completed'; toast('Already at the last episode'); touch(x); save(); return; }
      if (cnt && x.episode >= cnt) { x.season++; x.episode = 1; } else x.episode++;
      x.status = atEnd(x) ? 'completed' : 'watching';
    } else {
      if (total && x.episode >= total) { toast('Already at the last episode'); return; }
      x.episode++;
      x.status = total && x.episode >= total ? 'completed' : 'watching';
    }
    touch(x); save();
    toast(x.status === 'completed' ? `Finished ${x.title}!` : `${x.title}: season ${x.season}, episode ${x.episode}`);
  } else {
    x.status = x.status === 'completed' ? 'planned' : 'completed';
    touch(x); save();
    toast(x.status === 'completed' ? `Marked “${x.title}” as watched` : `Moved “${x.title}” back to my watchlist`);
  }
}
function deleteItem(x) {
  const idx = items.findIndex(i => i.id === x.id), copy = items[idx];
  items = items.filter(i => i.id !== x.id); save();
  toast(`Deleted “${x.title}”`, 'Undo', () => { items.splice(Math.min(idx, items.length), 0, copy); save(); toast('Restored'); });
}
function resetFilters() {
  $('searchInput').value = ''; $('typeFilter').value = 'all'; $('genreFilter').value = 'all'; activeGenre = 'all'; render();
}

$('addBtn').onclick = $('emptyAddBtn').onclick = () => openModal();
$('clearFiltersBtn').onclick = () => { currentFilter = 'all'; resetFilters(); };
$('closeModal').onclick = $('cancelModal').onclick = closeModal;
$('kindInput').onchange = toggleProgress;
$('modalBackdrop').onclick = e => { if (e.target === $('modalBackdrop')) closeModal(); };
$('detailBackdrop').onclick = e => { if (e.target === $('detailBackdrop')) closeDetail(); };

async function doSave() {
  if (!validateAll()) return;
  const id = $('editId').value, title = $('titleInput').value.trim();
  const old = id ? items.find(x => x.id === id) : null;
  if (!old && items.some(x => x.title.toLowerCase() === title.toLowerCase() && x.type === $('kindInput').value) &&
      !(await askConfirm({ title: 'Already On My Shelf', message: `“${title}” is already in my library. Add it again?`, confirmText: 'Add Anyway', icon: 'question' }))) return;
  const obj = clean({
    id: id || uid(), title, type: $('kindInput').value, year: $('yearInput').value, status: $('statusInput').value,
    rating: $('ratingInput').value, genres: selectedGenres(), poster: effectivePoster(), notes: $('notesInput').value,
    favorite: $('favoriteInput').checked, season: $('seasonInput').value, episode: $('episodeInput').value,
    totalSeasons: $('totalSeasonsInput').value, seasonEpisodes: readSeasonValues(), updated: Date.now()
  });
  if (isSeries(obj)) { if (obj.status === 'completed') finishSeries(obj); }
  else { obj.season = 1; obj.episode = 0; obj.seasonEpisodes = []; obj.totalSeasons = null; obj.totalEpisodes = null; }
  if (old) items = items.map(x => x.id === id ? obj : x); else items.unshift(obj);
  save(); closeModal();
  toast(id ? 'Title updated' : 'Added to my library');
  if (detailId === id) detail(id, 'keepFocus');
}
$('titleForm').onsubmit = e => { e.preventDefault(); if (!$('saveBtn').hidden) doSave(); else goNext(); };

$('filters').onclick = e => { const b = e.target.closest('[data-filter]'); if (!b) return; currentFilter = b.dataset.filter; activeGenre = 'all'; render(); closeDrawer(); window.scrollTo({ top: 0 }); };
// clicking the logo = go home: clear filters, close any panel, jump to the top
document.querySelectorAll('.brand').forEach(a => a.addEventListener('click', e => {
  e.preventDefault(); closeDrawer(); closeModal(); closeDetail();
  currentFilter = 'all'; activeGenre = 'all'; resetFilters(); window.scrollTo({ top: 0, behavior: 'smooth' });
}));

/* ---------- mobile drawer (hamburger) ---------- */
function openDrawer() { document.body.classList.add('drawer-open'); $('menuBtn').setAttribute('aria-expanded', 'true'); setTimeout(() => { if (document.body.classList.contains('drawer-open')) $('drawerClose').focus(); }, 60); }
function closeDrawer(restore) { if (!document.body.classList.contains('drawer-open')) return; document.body.classList.remove('drawer-open'); $('menuBtn').setAttribute('aria-expanded', 'false'); if (restore) $('menuBtn').focus(); }
$('menuBtn').onclick = openDrawer;
$('drawerClose').onclick = () => closeDrawer(true);
$('drawerBackdrop').onclick = () => closeDrawer(true);
document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => closeDrawer()));
window.matchMedia('(min-width: 1061px)').addEventListener('change', e => { if (e.matches) closeDrawer(); });

/* ---------- custom dropdowns (replace native select popups) ---------- */
const dropdowns = [];
let openDD = null, openedAt = 0;
function enhanceSelect(sel) {
  const wrap = document.createElement('div'); wrap.className = 'dd';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dd-btn'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  const label = sel.getAttribute('aria-label') || (sel.closest('label') ? sel.closest('label').firstChild.textContent.trim() : '');
  btn.innerHTML = '<span class="dd-val"></span><svg class="dd-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const list = document.createElement('div'); list.className = 'dd-list'; list.setAttribute('role', 'listbox'); list.tabIndex = -1; list.hidden = true;
  sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel); wrap.appendChild(btn); wrap.appendChild(list);
  sel.classList.add('dd-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  const dd = { sel, wrap, btn, list, label };
  dropdowns.push(dd); sel._dd = dd;
  btn.addEventListener('click', () => (openDD === dd ? closeDropdown() : openDropdown(dd)));
  btn.addEventListener('keydown', e => {
    if (['ArrowDown', 'ArrowUp'].includes(e.key) && openDD !== dd) { e.preventDefault(); openDropdown(dd); }
  });
  // preventDefault stops the surrounding <label> from "clicking" the hidden native select (which popped a 2nd dropdown)
  list.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const o = e.target.closest('[role=option]'); if (o) choose(dd, o.dataset.value); });
  btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
  list.addEventListener('keydown', e => {
    const opts = [...list.querySelectorAll('[role=option]')], i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); opts[Math.min(opts.length - 1, i + 1)].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); opts[Math.max(0, i - 1)].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); opts[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); opts[opts.length - 1].focus(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (document.activeElement.dataset.value !== undefined) choose(dd, document.activeElement.dataset.value); }
    else if (e.key === 'Tab') { closeDropdown(); }
    else if (e.key.length === 1) { const m = opts.find(o => o.textContent.toLowerCase().startsWith(e.key.toLowerCase()) && opts.indexOf(o) > i) || opts.find(o => o.textContent.toLowerCase().startsWith(e.key.toLowerCase())); if (m) m.focus(); }
  });
  refreshDropdown(dd);
}
function refreshDropdown(dd) {
  const o = dd.sel.options[dd.sel.selectedIndex];
  dd.btn.querySelector('.dd-val').textContent = o ? o.textContent : '';
  dd.btn.setAttribute('aria-label', `${dd.label}: ${o ? o.textContent : ''}`);
}
function refreshDropdowns() {
  for (let i = dropdowns.length - 1; i >= 0; i--) if (!document.contains(dropdowns[i].wrap)) dropdowns.splice(i, 1); // drop removed ones
  dropdowns.forEach(refreshDropdown);
}
function buildList(dd) {
  dd.list.innerHTML = [...dd.sel.options].map(o => `<div role="option" tabindex="-1" data-value="${esc(o.value)}" aria-selected="${o.selected}" class="${o.selected ? 'sel' : ''}"><span>${esc(o.textContent)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>`).join('');
}
function placeList(dd) {
  const r = dd.btn.getBoundingClientRect(), l = dd.list;
  l.style.minWidth = r.width + 'px'; l.style.left = '0px'; l.style.top = '0px'; l.style.maxHeight = '';
  const lh = Math.min(l.scrollHeight, 320), below = innerHeight - r.bottom - 12, above = r.top - 12;
  const up = below < Math.min(lh, 200) && above > below, h = Math.min(320, up ? above : below);
  l.style.maxHeight = h + 'px';
  const lw = l.offsetWidth; let left = r.left; if (left + lw > innerWidth - 8) left = Math.max(8, innerWidth - 8 - lw);
  l.style.left = left + 'px'; l.style.top = up ? Math.max(8, r.top - Math.min(l.scrollHeight, h) - 6) + 'px' : (r.bottom + 6) + 'px';
}
function openDropdown(dd) {
  closeDropdown(); buildList(dd); dd.list.hidden = false; dd.btn.setAttribute('aria-expanded', 'true'); dd.wrap.classList.add('open'); openDD = dd;
  placeList(dd);
  openedAt = Date.now();
  const cur = dd.list.querySelector('.sel') || dd.list.querySelector('[role=option]');
  if (cur) { cur.focus({ preventScroll: true }); dd.list.scrollTop = Math.max(0, cur.offsetTop - (dd.list.clientHeight - cur.offsetHeight) / 2); } // scroll only the list, never the page/dialog
}
function closeDropdown(returnFocus) {
  if (!openDD) return; const dd = openDD; openDD = null;
  dd.list.hidden = true; dd.btn.setAttribute('aria-expanded', 'false'); dd.wrap.classList.remove('open');
  if (returnFocus) dd.btn.focus();
}
function choose(dd, value) {
  dd.sel.value = value; dd.sel.dispatchEvent(new Event('change', { bubbles: true })); refreshDropdown(dd);
  const same = dd.btn; closeDropdown(); if (document.contains(same)) same.focus();
}
// clicking the text of a label (e.g. "Format") opens our dropdown instead of the hidden native select
document.addEventListener('click', e => {
  const lab = e.target.closest('label'); if (!lab) return;
  const wrap = lab.querySelector('.dd'); if (!wrap || wrap.contains(e.target)) return;
  e.preventDefault(); const dd = dropdowns.find(d => d.wrap === wrap); if (dd) (openDD === dd ? closeDropdown() : openDropdown(dd));
});
document.addEventListener('mousedown', e => { if (openDD && !openDD.wrap.contains(e.target)) closeDropdown(); });
window.addEventListener('resize', () => closeDropdown());
document.addEventListener('scroll', e => { if (openDD && Date.now() - openedAt > 250 && !openDD.list.contains(e.target)) closeDropdown(); }, true);
['typeFilter', 'genreFilter', 'sortSelect', 'kindInput', 'statusInput'].forEach(id => enhanceSelect($(id)));

$('activeFilters').onclick = e => { if (e.target.closest('[data-cleargenre]')) activeGenre = 'all'; if (e.target.closest('[data-clearselect]')) $('genreFilter').value = 'all'; render(); };
['searchInput', 'typeFilter', 'genreFilter', 'sortSelect'].forEach(id => $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', () => { if (id === 'genreFilter') activeGenre = 'all'; render(); }));

$('library').onclick = e => {
  const b = e.target.closest('button[data-action]'), c = e.target.closest('[data-open]');
  if (b) {
    const x = items.find(i => i.id === b.dataset.id); if (!x) return;
    const a = b.dataset.action;
    if (a === 'favorite') { x.favorite = !x.favorite; touch(x); save(); toast(x.favorite ? 'Added to favorites' : 'Removed from favorites'); const nb = document.querySelector(`.fav-btn[data-id="${x.id}"]`); if (nb) nb.focus(); }
    if (a === 'edit') openModal(x);
    if (a === 'progress') doProgress(x);
    return;
  }
  if (c) detail(c.dataset.open);
};
$('library').onkeydown = e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.title-card')) { e.preventDefault(); detail(e.target.dataset.open); }
};
$('detailContent').onclick = async e => {
  const b = e.target.closest('[data-detail]'); if (!b) return;
  const x = items.find(i => i.id === detailId); if (!x) return;
  const a = b.dataset.detail;
  if (a === 'edit') { $('detailBackdrop').classList.remove('open'); detailId = null; openModal(x, true); }
  if (a === 'ep-plus') { doProgress(x); detail(x.id, 'keepFocus'); const n = $('detailContent').querySelector('[data-detail="ep-plus"]'); if (n) n.focus(); }
  if (a === 'ep-minus') {
    if (x.episode > 1) x.episode--;
    else if (x.season > 1 && seasonList(x).length) { x.season--; x.episode = seasonCount(x, x.season) || 0; }
    else if (x.episode > 0) x.episode--;
    if (x.status === 'completed' && !atEnd(x) && !(totalEps(x) && watchedEps(x) >= totalEps(x))) x.status = 'watching';
    touch(x); save();
    detail(x.id, 'keepFocus'); const n = $('detailContent').querySelector('[data-detail="ep-minus"]'); if (n) n.focus();
  }
  if (a === 'favorite') { x.favorite = !x.favorite; touch(x); save(); detail(x.id, 'keepFocus'); const n = $('detailContent').querySelector('[data-detail="favorite"]'); if (n) n.focus(); }
  if (a === 'delete' && await askConfirm({ title: 'Delete This Title?', message: `“${x.title}” will be removed from my library.\nYou can undo this right after.`, confirmText: 'Delete', cancelText: 'Keep It', tone: 'danger', icon: 'trash' })) { closeDetail(); deleteItem(x); }
};
$('detailContent').onchange = e => {
  if (e.target.id !== 'detailStatus') return;
  const x = items.find(i => i.id === detailId); if (!x) return;
  x.status = e.target.value;
  if (isSeries(x) && x.status === 'completed') finishSeries(x);
  touch(x); save(); detail(x.id, 'keepFocus'); $('detailStatus')._dd.btn.focus(); toast('Status updated');
};

document.addEventListener('keydown', e => {
  if ($('confirmBackdrop').classList.contains('open')) { // the confirm dialog is always on top: it owns the keyboard
    if (e.key === 'Escape') { e.preventDefault(); closeConfirm(false); }
    else if (e.key === 'Tab') {
      const f = [$('confirmCancel'), $('confirmOk')].filter(b => !b.hidden), i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
    }
    return;
  }
  if (e.key === 'Escape') {
    if (openDD) { e.stopPropagation(); closeDropdown(true); return; }
    if (document.body.classList.contains('drawer-open')) { closeDrawer(true); return; }
    if ($('modalBackdrop').classList.contains('open')) closeModal();
    else if ($('detailBackdrop').classList.contains('open')) closeDetail();
    return;
  }
  if (e.key === 'Tab') { // keep focus inside the open dialog
    const bd = document.querySelector('.modal-backdrop.open') || document.querySelector('.detail-backdrop.open') || (document.body.classList.contains('drawer-open') ? $('sidebar') : null);
    if (!bd) return;
    const f = focusables(bd); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!bd.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    return;
  }
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  const dialogOpen = document.querySelector('.modal-backdrop.open,.detail-backdrop.open');
  if (e.key === '/' && !typing && !dialogOpen && !e.ctrlKey && !e.metaKey) { e.preventDefault(); $('searchInput').focus(); }
});

/* ---------- custom confirm / alert dialog (replaces the browser's popups) ---------- */
const CONFIRM_ICONS = {
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3L12 4zM12 10v4M12 17.5h.01"/></svg>',
  question: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 114.6 1.3c-.8 1-2.2 1.4-2.2 2.8M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'
};
let confirmResolve = null, confirmPrevFocus = null;
function askConfirm({ title = 'Are You Sure?', message = '', confirmText = 'OK', cancelText = 'Cancel', tone = 'default', icon = 'question', alertOnly = false } = {}) {
  return new Promise(resolve => {
    if (confirmResolve) confirmResolve(false);
    confirmResolve = resolve; confirmPrevFocus = document.activeElement;
    const box = $('confirmBackdrop');
    box.dataset.tone = tone;
    $('confirmIcon').innerHTML = CONFIRM_ICONS[icon] || CONFIRM_ICONS.question;
    $('confirmTitle').textContent = title; $('confirmMsg').textContent = message;
    $('confirmOk').textContent = confirmText; $('confirmOk').className = 'primary-btn' + (tone === 'danger' ? ' danger' : '');
    $('confirmCancel').textContent = cancelText; $('confirmCancel').hidden = alertOnly;
    box.classList.add('open');
    (tone === 'danger' ? $('confirmCancel') : $('confirmOk')).focus(); // destructive actions never get the default focus
  });
}
function closeConfirm(result) {
  if (!confirmResolve) return;
  const r = confirmResolve; confirmResolve = null;
  $('confirmBackdrop').classList.remove('open');
  if (confirmPrevFocus && document.contains(confirmPrevFocus)) confirmPrevFocus.focus();
  r(result);
}
$('confirmOk').onclick = () => closeConfirm(true);
$('confirmCancel').onclick = () => closeConfirm(false);
$('confirmBackdrop').onclick = e => { if (e.target === $('confirmBackdrop')) closeConfirm(false); };

/* ---------- backup ---------- */
const doExport = async () => {
  if (!items.length && !(await askConfirm({ title: 'Export An Empty Backup?', message: 'My library is empty right now, so the backup file will contain no titles.', confirmText: 'Export Anyway', icon: 'question' }))) return;
  const blob = new Blob([JSON.stringify({ app: 'My Watch Shelf', version: 2, items }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'), d = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob); a.download = `my-watch-shelf-backup-${d}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup exported');
};
document.querySelectorAll('[data-act=export]').forEach(b => b.addEventListener('click', doExport));
document.querySelectorAll('[data-act=import]').forEach(b => b.addEventListener('click', () => $('importFile').click()));
$('importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text()), arr = Array.isArray(d) ? d : d.items;
    if (!Array.isArray(arr)) throw Error('bad');
    const valid = arr.map(clean).filter(Boolean);
    if (!valid.length) throw Error('empty');
    const skipped = arr.length - valid.length;
    const ok = await askConfirm({ title: 'Replace My Library?', message: `This replaces my current ${items.length} title${items.length === 1 ? '' : 's'} with the ${valid.length} in this file${skipped ? ` (${skipped} invalid skipped)` : ''}.\nTip: export a backup first if you’re unsure.`, confirmText: 'Replace Library', tone: 'danger', icon: 'warn' });
    if (!ok) { e.target.value = ''; return; }
    items = valid; save(); toast(`Imported ${valid.length} titles`);
  } catch (err) { await askConfirm({ title: 'Not A Valid Backup', message: 'That file is not a valid My Watch Shelf backup.\nChoose a .json file created with Export backup.', confirmText: 'Got It', alertOnly: true, icon: 'info' }); }
  e.target.value = '';
};


initGenreFilters(); makeGenreUI(); setRating(0);
try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); } catch (e) { storageOk = false; $('storageBanner').hidden = false; }
render();
// cloud sync was removed: clear anything it may have saved in this browser (including any pasted token)
try { localStorage.removeItem('screenlog-sync-v1'); localStorage.removeItem('screenlog-deleted-v1'); } catch (e) { /* ignore */ }
