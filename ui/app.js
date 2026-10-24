'use strict';

const $ = selector => document.querySelector(selector);
const page = $('#page'), text = $('#text'), tip = $('#tip'), q = $('#q'), results = $('#results');
const overlays = [$('#books'), $('#palette'), $('#help')];

const S = { t: 'KJV', b: 43, c: 1, size: 20, flow: false, y: 0 };
try { Object.assign(S, JSON.parse(localStorage.lectio)); } catch {}

let META, sel = null, loadSeq = 0, busyTimer = 0, fadeFrame = 0, saveTimer = 0, lastY = 0;

const esc = s => String(s).replace(/[&<>"]/g, ch => `&#${ch.charCodeAt(0)};`);
const book = b => META.books[b - 1];
const title = b => (book(b).name === 'Psalms' ? 'Psalm' : book(b).name);
const translation = () => META.translations.find(t => t.id === S.t);
const api = (name, params = {}) =>
  fetch(`api/${name}?${new URLSearchParams(params)}`).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { localStorage.lectio = JSON.stringify({ ...S, y: Math.round(scrollY) }); }, 300);
}

// ---- Theme

const THEME = {
  '--bg': ['background'], '--fg': ['foreground'], '--accent': ['accent', 'blue'], '--red': ['red'],
  '--bg-raised': ['lighter_background'], '--bg-sunken': ['darker_background', 'dark_background'],
  '--fg-soft': ['light_foreground'], '--muted': ['muted'], '--sel': ['selection'],
};

function applyTheme(colors) {
  const root = document.documentElement.style;
  for (const [prop, keys] of Object.entries(THEME)) {
    const value = keys.map(k => colors[k]).find(Boolean);
    if (value) root.setProperty(prop, value);
    else root.removeProperty(prop);
  }
  root.colorScheme = colors.mode === 'light' ? 'light' : 'dark';
}

// ---- Reading

async function load(b, c, { verse, end, select, y = 0, pending } = {}) {
  const seq = ++loadSeq;
  clearTimeout(busyTimer);
  busyTimer = setTimeout(() => document.body.classList.add('busy'), 150);
  const res = await (pending || api('chapter', { t: S.t, b, c }));
  if (seq !== loadSeq) return;
  clearTimeout(busyTimer);
  document.body.classList.remove('busy');

  Object.assign(S, { b, c });
  document.title = `${title(b)} ${c} · ${S.t}`;
  $('#where span').textContent = `${title(b)} ${c}`;
  $('#book-title').textContent = book(b).name;
  $('#chapter-num').textContent = c;
  text.className = `text ${S.flow ? 'flow' : 'lines'}`;
  text.innerHTML = res.ok ? res.html : problem(res);
  $('#copyright').innerHTML = res.ok ? res.copyright : '';
  for (const button of $('#translations').children) button.classList.toggle('on', button.textContent === S.t);
  pager();
  clearSelection();
  hideTip();

  // Show the bar without its slide so the fade is the only movement.
  document.body.classList.add('jump');
  document.body.classList.remove('hide-bar');
  $('#back').hidden = !trail.length;
  if (verse) scrollToVerse(verse, select, end || verse);
  else scrollTo(0, y);
  lastY = scrollY;
  fadeIn();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('jump')));
  save();

  const next = res.ok && translation().key && neighbour(b, c, 1);
  if (next) setTimeout(() => api('chapter', { t: S.t, b: next[0], c: next[1] }), 600);
}

// WebKitGTK shows a blank frame when a CSS opacity animation ends, so fade from JS.
function fadeIn() {
  cancelAnimationFrame(fadeFrame);
  const start = performance.now();
  page.style.opacity = 0;
  const tick = now => {
    const p = Math.min(1, (now - start) / 260);
    page.style.opacity = p < 1 ? 1 - (1 - p) ** 3 : '';
    if (p < 1) fadeFrame = requestAnimationFrame(tick);
  };
  fadeFrame = requestAnimationFrame(tick);
}

function problem(res) {
  const t = translation();
  if (res.needsKey) {
    return `<div class="card"><h3>${t.id} needs an API key</h3>
      <p>${esc(res.error)} Get a free key at <a href="${t.signup}">${new URL(t.signup).host}</a>,
      then add it to <code>~/.config/lectio/config.toml</code>:</p>
      <pre>${t.key} = "your-key"</pre><p>Then press <kbd>r</kbd>.</p></div>`;
  }
  return `<div class="card"><h3>Couldn't load ${S.t}</h3><p>${esc(res.error)}</p><p>Press <kbd>r</kbd> to try again.</p></div>`;
}

function neighbour(b, c, d) {
  if (d > 0) return c < book(b).chapters ? [b, c + 1] : b < META.books.length ? [b + 1, 1] : null;
  return c > 1 ? [b, c - 1] : b > 1 ? [b - 1, book(b - 1).chapters] : null;
}

function step(d) {
  const n = neighbour(S.b, S.c, d);
  if (n) load(...n);
}

function pager() {
  for (const [button, d] of [[$('#foot-prev'), -1], [$('#foot-next'), 1]]) {
    const n = neighbour(S.b, S.c, d);
    button.hidden = !n;
    if (n) {
      button.textContent = d < 0 ? `← ${title(n[0])} ${n[1]}` : `${title(n[0])} ${n[1]} →`;
      button.onclick = () => load(...n);
    }
  }
}

function setTranslation(id) {
  if (id === S.t) return;
  const verse = scrollY > 200 && [...text.querySelectorAll('.vn')].find(vn => vn.getBoundingClientRect().top > 60);
  S.t = id;
  load(S.b, S.c, { verse: verse && +verse.dataset.v });
}

function scrollToVerse(v, select, end = v) {
  const vn = text.querySelector(`.vn[data-v="${v}"]`);
  if (!vn) return scrollTo(0, 0);
  scrollTo(0, vn.getBoundingClientRect().top + scrollY - innerHeight * 0.3);
  if (select) {
    sel = { a: v, b: Math.max(v, end) };
    paint();
  }
}

// ---- Selecting and copying verses

function verseRange(a, b) {
  const start = text.querySelector(`.vn[data-v="${a}"]`);
  if (!start) return null;
  const range = document.createRange();
  range.setStartBefore(start);
  const end = text.querySelector(`.vn[data-v="${b + 1}"]`) || text.querySelector('.footnotes');
  if (end) range.setEndBefore(end);
  else range.setEnd(text, text.childNodes.length);
  return range;
}

function paint() {
  text.querySelectorAll('.vn.on').forEach(vn => vn.classList.remove('on'));
  CSS.highlights.delete('verses');
  if (!sel) return;
  for (let v = sel.a; v <= sel.b; v++) text.querySelector(`.vn[data-v="${v}"]`)?.classList.add('on');
  CSS.highlights.set('verses', new Highlight(verseRange(sel.a, sel.b)));
}

function clearSelection() {
  sel = null;
  paint();
}

async function copySelection() {
  if (!sel) return;
  const box = document.createElement('div');
  box.append(verseRange(sel.a, sel.b).cloneContents());
  box.querySelectorAll('.vn, .tn, .a-tn, sup, h3, h4, .subhead, .psa-title').forEach(n => n.remove());
  box.querySelectorAll('p, br, div').forEach(n => n.after(' '));
  const ref = `${title(S.b)} ${S.c}:${sel.a === sel.b ? sel.a : `${sel.a}–${sel.b}`} (${S.t})`;
  const res = await api('copy', { text: `${box.textContent.replace(/\s+/g, ' ').trim()}\n— ${ref}` });
  toast(res.ok ? `Copied ${ref}` : `Couldn't copy: ${res.error}`);
}

text.addEventListener('click', e => {
  const vn = e.target.closest('.vn');
  if (vn) {
    const v = +vn.dataset.v;
    if (e.shiftKey && sel) sel = { a: Math.min(sel.a, v), b: Math.max(sel.b, v) };
    else sel = sel?.a === v && sel?.b === v ? null : { a: v, b: v };
    paint();
  }
  const marker = e.target.closest(NOTE_MARKERS);
  if (marker) {
    e.preventDefault();
    showTip(marker);
  }
});

// ---- Footnotes and cross-references

const NOTE_MARKERS = '.a-tn, sup.footnote a, a.cf';
const REFERENCE = /\b(?:[1-3] ?)?[A-Z][a-z]+\.?(?: of [A-Z][a-z]+)? \d+:\d+(?:[-–]\d+)?/g;

function noteFor(marker) {
  if (marker.dataset.refs) return esc(marker.dataset.refs); // ESV cross-reference
  if (marker.classList.contains('a-tn')) return marker.nextElementSibling?.innerHTML; // NLT: note follows the marker
  // ESV footnotes are listed at the end, each one running from its link to the next <br>.
  const box = document.createElement('div');
  const target = document.getElementById(marker.getAttribute('href').slice(1));
  for (let n = target?.closest('.footnote')?.nextSibling; n && n.nodeName !== 'BR'; n = n.nextSibling) {
    box.append(n.cloneNode(true));
  }
  return box.innerHTML.trim();
}

// Turn references like "Isa 9:1-2" in note text (not inside tags) into links.
function linkReferences(html) {
  return html.replace(/(<[^>]*>)|[^<]+/g, (part, tag) => tag || part.replace(REFERENCE, ref =>
    (parseRef(ref)?.v ? `<a class="ref" data-ref="${ref}">${ref}</a>` : ref)));
}

function showTip(marker) {
  const content = noteFor(marker);
  if (!content) return;
  tip.innerHTML = linkReferences(content);
  tip.hidden = false;
  const r = marker.getBoundingClientRect();
  tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 12, Math.max(12, r.left - tip.offsetWidth / 2))}px`;
  tip.style.top = `${r.bottom + 10 + tip.offsetHeight > innerHeight ? r.top - tip.offsetHeight - 10 : r.bottom + 10}px`;
}

function hideTip() {
  tip.hidden = true;
}

// The note stays open briefly after leaving the marker, so the pointer can reach its links.
let tipTimer = 0;
text.addEventListener('mouseover', e => {
  const marker = e.target.closest(NOTE_MARKERS);
  if (marker) {
    clearTimeout(tipTimer);
    showTip(marker);
  }
});
text.addEventListener('mouseout', e => {
  if (e.target.closest(NOTE_MARKERS)) tipTimer = setTimeout(hideTip, 300);
});
tip.addEventListener('mouseenter', () => clearTimeout(tipTimer));
tip.addEventListener('mouseleave', hideTip);
tip.addEventListener('click', e => {
  const link = e.target.closest('a.ref');
  if (link) {
    hideTip();
    jump(parseRef(link.dataset.ref));
  }
});

// ---- References like "jn 3:16", "1 cor 13", "ps 23"

function norm(s) {
  return s.toLowerCase().replace(/^(iii|ii|i)\s+/, m => m.trim().length).replace(/[^a-z0-9]/g, '');
}

function findBooks(s) {
  const n = norm(s);
  if (!n) return [];
  const keys = bk => [norm(bk.name), ...bk.aliases];
  const exact = META.books.filter(bk => keys(bk).includes(n));
  return [...exact, ...META.books.filter(bk => !exact.includes(bk) && keys(bk).some(k => k.startsWith(n)))];
}

function parseRef(s) {
  const m = s.trim().match(/^(.*?[a-z].*?)\s*(?:(\d+)(?:\s*[:.\s]\s*(\d+))?(?:\s*[-–]\s*(\d+))?)?\s*$/i);
  const bk = m && findBooks(m[1])[0];
  if (!bk) return null;
  let [c, v, end] = [+m[2] || null, +m[3] || null, +m[4] || null];
  if (bk.chapters === 1 && c > 1 && !v) [c, v] = [1, c];
  if (c > bk.chapters) return null;
  return { b: META.books.indexOf(bk) + 1, c, v, end: v && end };
}

// ---- Go to / search palette

let items = [], active = 0, searchTimer = 0, searchSeq = 0, searchNote = '', searchWords = [];

function openPalette() {
  show($('#palette'));
  q.value = '';
  updatePalette();
  q.focus();
}

function updatePalette() {
  const s = q.value.trim();
  const ref = s && parseRef(s);
  items = [];
  searchNote = '';
  clearTimeout(searchTimer);
  if (ref?.c) items.push({ label: `${title(ref.b)} ${ref.c}${ref.v ? `:${ref.v}` : ''}`, hint: 'go', ref });
  for (const bk of s ? findBooks(s.replace(/[\s\d:.]+$/, '')).slice(0, 5) : []) {
    const b = META.books.indexOf(bk) + 1;
    if (!items.some(i => i.ref.b === b)) items.push({ label: bk.name, hint: `${bk.chapters} ch`, ref: { b, c: 1 } });
  }
  if (s.length >= 3 && !ref?.c) searchTimer = setTimeout(() => runSearch(s), 200);
  active = 0;
  renderResults();
}

async function runSearch(s) {
  const seq = ++searchSeq;
  const res = await api('search', { t: S.t, q: s });
  if (seq !== searchSeq || q.value.trim() !== s || !res.ok) return;
  searchWords = res.words;
  const shown = res.total > res.hits.length ? ` · first ${res.hits.length}` : '';
  searchNote = res.total ? `${res.total} verse${res.total === 1 ? '' : 's'} · ${res.t}${shown}` : `No verses found in ${res.t}`;
  const hits = res.hits.map(h => ({ ref: parseRef(h.ref), snippet: h.text })).filter(h => h.ref?.v);
  for (const h of hits) h.label = `${title(h.ref.b)} ${h.ref.c}:${h.ref.v}`;
  items = items.filter(i => !i.snippet).concat(hits);
  renderResults();
}

function highlight(snippet) {
  return searchWords.reduce(
    (out, w) => out.replace(new RegExp(`\\b(${w.replace(/[^\w]/g, '\\$&')}[\\w’']*)`, 'gi'), '<mark>$1</mark>'),
    esc(snippet),
  );
}

function renderResults() {
  const firstHit = items.findIndex(i => i.snippet);
  results.innerHTML = items.map((it, i) =>
    (i === firstHit ? `<li class="note">${esc(searchNote)}</li>` : '') +
    `<li data-i="${i}" class="${i === active ? 'on' : ''}"><span class="ref">${esc(it.label)}</span>` +
    (it.snippet ? `<span class="snip">${highlight(it.snippet)}</span>` : `<span class="hint">${esc(it.hint)}</span>`) + '</li>',
  ).join('') || `<li class="note">${esc(searchNote || 'Type a reference like jn 3:16, ps 23 or 1 cor 13, or words to search')}</li>`;
  results.querySelector('li.on')?.scrollIntoView({ block: 'nearest' });
}

function choose(it) {
  if (!it) return;
  closeOverlays();
  jump(it.ref);
}

// Jumps (search, references, the book picker) can be undone with back; paging through chapters can't.
const trail = [];

function jump({ b, c, v, end }) {
  trail.push({ t: S.t, b: S.b, c: S.c, y: scrollY });
  load(b, c || 1, v ? { verse: v, end, select: true } : {});
}

function back() {
  const place = trail.pop();
  if (!place) return;
  S.t = place.t;
  load(place.b, place.c, { y: place.y });
}

q.addEventListener('input', updatePalette);
q.addEventListener('keydown', e => {
  const move = { ArrowDown: 1, ArrowUp: -1 }[e.key] || (e.ctrlKey && { n: 1, j: 1, p: -1, k: -1 }[e.key]);
  if (move) {
    e.preventDefault();
    active = Math.max(0, Math.min(items.length - 1, active + move));
    renderResults();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    choose(items[active]);
  }
});
results.addEventListener('mousedown', e => {
  const li = e.target.closest('li[data-i]');
  if (li) {
    e.preventDefault();
    choose(items[li.dataset.i]);
  }
});

// ---- Book and chapter picker

function button(label, onclick, on = false) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = onclick;
  b.classList.toggle('on', on);
  return b;
}

function openBooks() {
  $('#books .sheet').replaceChildren(...[['Old Testament', 0, 39], ['New Testament', 39, 66]].map(([heading, from, to]) => {
    const section = document.createElement('section');
    section.innerHTML = `<h4>${heading}</h4><div class="grid"></div>`;
    section.lastChild.append(...META.books.slice(from, to).map((bk, i) => {
      const b = from + i + 1;
      return button(bk.name, () => (bk.chapters === 1 ? choose({ ref: { b, c: 1 } }) : openChapters(b)), b === S.b);
    }));
    return section;
  }));
  show($('#books'));
}

function openChapters(b) {
  const section = document.createElement('section');
  section.innerHTML = `<h4><button class="back">← Books</button>${esc(book(b).name)}</h4><div class="grid chapters"></div>`;
  section.querySelector('.back').onclick = openBooks;
  for (let c = 1; c <= book(b).chapters; c++) {
    section.lastChild.append(button(c, () => choose({ ref: { b, c } }), b === S.b && c === S.c));
  }
  $('#books .sheet').replaceChildren(section);
}

// ---- Window

function show(overlay) {
  closeOverlays();
  overlay.hidden = false;
}

function closeOverlays() {
  overlays.forEach(o => { o.hidden = true; });
  hideTip();
}

overlays.forEach(o => o.addEventListener('mousedown', e => { if (e.target === o) closeOverlays(); }));

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el.timer);
  el.timer = setTimeout(() => { el.hidden = true; }, 1800);
}

function resize(d) {
  S.size = d ? Math.max(14, Math.min(34, S.size + d)) : 20;
  document.documentElement.style.setProperty('--size', `${S.size}px`);
  save();
}

addEventListener('scroll', () => {
  document.body.classList.toggle('scrolled', scrollY > 8);
  document.body.classList.toggle('hide-bar', scrollY > lastY && scrollY > 160);
  lastY = scrollY;
  hideTip();
  save();
}, { passive: true });
addEventListener('mousemove', e => { if (e.clientY < 56) document.body.classList.remove('hide-bar'); });

addEventListener('mouseup', e => { if (e.button === 3) back(); }); // mouse back button

$('#back').onclick = back;
$('#where').onclick = openBooks;
$('#search').onclick = openPalette;
$('#prev').onclick = () => step(-1);
$('#next').onclick = () => step(1);

document.addEventListener('keydown', e => {
  const k = e.key;
  const open = overlays.some(o => !o.hidden);
  if (k === 'Escape') return open ? closeOverlays() : clearSelection();
  if (e.ctrlKey && k === 'k') {
    e.preventDefault();
    return openPalette();
  }
  if (open || e.target === q) return;
  if (e.ctrlKey && k === 'c' && sel && getSelection().isCollapsed) return copySelection();
  if (k === 'Backspace' || (e.altKey && k === 'ArrowLeft')) return back();
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const ids = META.translations.map(t => t.id);
  const cycle = d => setTranslation(ids[(ids.indexOf(S.t) + d + ids.length) % ids.length]);
  const actions = {
    ArrowLeft: () => step(-1), h: () => step(-1),
    ArrowRight: () => step(1), l: () => step(1),
    j: () => scrollBy({ top: 90, behavior: 'smooth' }),
    k: () => scrollBy({ top: -90, behavior: 'smooth' }),
    '/': openPalette, g: openPalette,
    b: openBooks,
    '?': () => show($('#help')),
    t: () => cycle(1), T: () => cycle(-1),
    y: copySelection,
    r: () => load(S.b, S.c, { y: scrollY }),
    v: () => { S.flow = !S.flow; text.className = `text ${S.flow ? 'flow' : 'lines'}`; save(); },
    '+': () => resize(2), '=': () => resize(2), '-': () => resize(-2), 0: () => resize(0),
  };
  const action = actions[k] || (ids[k - 1] && (() => setTranslation(ids[k - 1])));
  if (action) {
    e.preventDefault();
    action();
  }
});

// ---- Start: fetch the saved chapter while the app info loads

async function init() {
  const pending = api('chapter', { t: S.t, b: S.b, c: S.c });
  META = await api('meta');
  if (!META.ok) {
    document.title = "Lectio couldn't start";
    text.innerHTML = `<div class="card"><h3>Lectio couldn't start</h3><p>${esc(META.error)}</p></div>`;
    return;
  }
  const root = document.documentElement.style;
  applyTheme(META.theme);
  if (META.fonts.ui) root.setProperty('--ui-font', `"${META.fonts.ui}", monospace`);
  if (META.fonts.reading) root.setProperty('--reading-font', `"${META.fonts.reading}", serif`);
  root.setProperty('--size', `${S.size}px`);
  $('#translations').replaceChildren(...META.translations.map((t, i) => {
    const b = button(t.id, () => setTranslation(t.id));
    b.title = `Press ${i + 1}`;
    return b;
  }));
  const known = translation();
  if (!known) S.t = META.translations[0].id;
  await load(S.b, S.c, { y: S.y, pending: known && pending });
}

init();
