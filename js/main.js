// Animations du portfolio (défilement, hero, quadrants, couloir 3D…). Nécessite js/lenis.min.js.
(() => {
const d = document, root = d.documentElement, W = window;
const $ = (s, r = d) => r.querySelector(s);
const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const seg = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eo = t => 1 - Math.pow(1 - t, 3);
const RM = root.classList.contains('rm');
const DPR = Math.min(W.devicePixelRatio || 1, 2);
const COARSE = W.matchMedia('(pointer: coarse)').matches;
const FINE = W.matchMedia('(hover: hover) and (pointer: fine)').matches;
const EASE = COARSE ? .35 : .12;
const LEAD = 1500;
let paused = false;
let vw = W.innerWidth, vh = W.innerHeight;

/* ---------- Hauteur d'écran stable (mobile) ---------- */
function setSvh() { root.style.setProperty('--svh', (W.innerHeight * .01) + 'px'); }
setSvh();

/* ---------- Défilement fluide ---------- */
const lenis = RM ? null : new W.Lenis({ lerp: COARSE ? .2 : .1, smoothWheel: true, wheelMultiplier: 1 });
const scrollToEl = el => {
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.6, easing: t => 1 - Math.pow(1 - t, 4) });
  else el.scrollIntoView();
};

/* ---------- Impression : balayage + trame ---------- */
const PP = 560;
function edge(n) {
  const host = n.offsetParent || d.body;
  const e = d.createElement('i');
  e.className = 'pedge';
  e.style.left = n.offsetLeft + 'px';
  e.style.top = n.offsetTop + 'px';
  e.style.width = n.offsetWidth + 'px';
  e.style.setProperty('--h', n.offsetHeight + 'px');
  host.appendChild(e);
  setTimeout(() => e.remove(), PP + 120);
}
function print(n, delay) {
  if (!n || n.__printed) return;
  n.__printed = true;
  if (RM) { n.classList.remove('ppa'); return; }
  setTimeout(() => {
    edge(n);
    n.classList.remove('ppa');
    n.classList.add('ppp', 'ht');
    setTimeout(() => n.classList.add('fine'), 240);
    setTimeout(() => n.classList.add('crisp'), 480);
    setTimeout(() => { n.classList.remove('ppp', 'ht', 'fine', 'crisp'); n.classList.add('ppd'); }, PP + 420);
  }, delay || 0);
}
$$('.pr').forEach(n => { if (!RM) n.classList.add('ppa'); });
if (RM) $$('.ppa').forEach(n => n.classList.remove('ppa'));

/* ---------- Odomètres ---------- */
function buildOdo(b) {
  const s = b.getAttribute('data-odo') || b.textContent;
  b.textContent = '';
  b.setAttribute('aria-label', s);
  const cells = [];
  for (const ch of s) {
    const od = d.createElement('span'); od.className = 'od'; od.setAttribute('aria-hidden', 'true');
    const strip = d.createElement('span'); strip.className = 'od-strip';
    if (ch >= '0' && ch <= '9') {
      for (let k = 0; k < 20; k++) { const c = d.createElement('span'); c.className = 'od-i'; c.textContent = String(k % 10); strip.appendChild(c); }
      const last = d.createElement('span'); last.className = 'od-i'; last.textContent = ch; strip.appendChild(last);
      cells.push(strip);
    } else {
      const only = d.createElement('span'); only.className = 'od-i'; only.textContent = ch === ' ' ? ' ' : ch; strip.appendChild(only);
      od.className = 'od od-fix';
    }
    od.appendChild(strip); b.appendChild(od);
  }
  b.__cells = cells;
  if (RM) cells.forEach(st => { st.style.transform = 'translate3d(0,calc(var(--od) * -20),0)'; });
}
function roll(b, delay) {
  if (!b || !b.__cells || b.__rolled || RM) return;
  b.__rolled = true;
  b.__cells.forEach((st, n) => {
    setTimeout(() => {
      st.style.transition = 'transform 1100ms cubic-bezier(.16,1,.3,1)';
      st.style.transform = 'translate3d(0,calc(var(--od) * -20),0)';
    }, (delay || 0) + n * 70);
  });
}
$$('.odo').forEach(buildOdo);

/* ---------- Apparitions ---------- */
const io = new IntersectionObserver(es => {
  es.forEach(e => {
    if (!e.isIntersecting) return;
    const t = e.target;
    io.unobserve(t);
    if (t.classList.contains('pr')) print(t, 80);
    else if (t.classList.contains('odo')) roll(t, 200);
    else t.classList.add('in');
  });
}, { rootMargin: '0px 0px -10% 0px' });
$$('.rv, .pr, .odo').forEach(el => {
  if (el.closest('[data-panel]') || el.closest('#board') || el.closest('.qtitle')) return;
  io.observe(el);
});

/* ---------- Fils (canvas) ---------- */
/* Fils de Bézier qui convergent vers un point focal.
   - attirés légèrement par la souris (o.pull)
   - impulsions lumineuses qui filent vers le focal (o.pulses) */
function Threads(cv, o) {
  const ctx = cv.getContext('2d');
  const SEG = 30;
  let w = 1, h = 1, lines = [];
  const m = { x: -1e4, y: -1e4, sx: -1e4, sy: -1e4, on: 0, k: 0 };
  const pulses = [], rings = [];
  let nextPulse = 0;
  if (!COARSE && !RM && o.pull) {
    W.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect();
      m.x = e.clientX - r.left; m.y = e.clientY - r.top;
      if (m.sx < -9e3) { m.sx = m.x; m.sy = m.y; }
      m.on = 1;
    }, { passive: true });
    d.documentElement.addEventListener('pointerleave', () => { m.on = 0; });
  }
  function build() {
    let x = o.seed;
    const R = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
    lines = [];
    const f = o.focal(w, h);
    for (let i = 0; i < o.n; i++) {
      const t = i / (o.n - 1);
      const side = o.mirror ? (i % 2 ? 1 : -1) : -1;
      lines.push({
        side,
        sy: lerp(-h * .3, h * 1.3, o.mirror ? ((i >> 1) / Math.ceil(o.n / 2)) : t) + (R() - .5) * h * .05,
        fx: f.x, fy: f.y + (R() - .5) * (o.spread || 6),
        w: .5 + R() * .8,
        a: o.alpha[0] + R() * (o.alpha[1] - o.alpha[0]),
        v: i % o.vEvery === 3,
        ph: R() * 6.283,
        del: Math.abs(t - .5) * .5 + R() * .08,
        px: new Float32Array(SEG + 1), py: new Float32Array(SEG + 1)
      });
    }
  }
  function size() {
    const r = cv.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
    cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }
  /* point le long d'un fil déjà calculé (t entre 0 et 1) */
  function at(L, t) {
    const f = clamp(t, 0, 1) * SEG, i = Math.min(SEG - 1, f | 0), r = f - i;
    return [lerp(L.px[i], L.px[i + 1], r), lerp(L.py[i], L.py[i + 1], r)];
  }
  function draw(prog, time, fade) {
    ctx.clearRect(0, 0, w, h);
    if (fade <= .002) return;
    /* souris lissée */
    m.k += ((m.on ? 1 : 0) - m.k) * .06;
    m.sx += (m.x - m.sx) * .14; m.sy += (m.y - m.sy) * .14;
    const pull = (o.pull || 0) * m.k * fade, S2 = 2 * (o.reach || 170) * (o.reach || 170);
    for (const L of lines) {
      const a = eo(clamp((prog * 1.4 - L.del) / .7, 0, 1));
      L.full = a;
      if (a <= .004) continue;
      const drift = time ? Math.sin(time * .00035 + L.ph) * 10 : 0;
      const x0 = L.side < 0 ? -40 : w + 40, y0 = L.sy + drift;
      const dx = L.fx - x0;
      const c1x = x0 + dx * .3, c1y = y0;
      const c2x = L.fx - dx * .28, c2y = L.fy + (y0 - L.fy) * .05;
      ctx.beginPath();
      for (let k = 0; k <= SEG; k++) {
        const t = (k / SEG) * a, u = 1 - t;
        let xx = u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * L.fx;
        let yy = u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * L.fy;
        if (pull > .001) {
          /* attraction douce, nulle aux extrémités pour garder l'ancrage sur le logo */
          const ex = m.sx - xx, ey = m.sy - yy;
          const g = pull * Math.exp(-(ex * ex + ey * ey) / S2) * Math.min(1, (1 - t) * 3.5);
          xx += ex * g; yy += ey * g;
        }
        L.px[k] = xx; L.py[k] = yy;
        if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.lineWidth = L.v ? L.w + .5 : L.w;
      ctx.strokeStyle = L.v ? 'rgba(179,92,255,' + Math.min(1, L.a * 2.4 * fade).toFixed(3) + ')' : 'rgba(214,210,232,' + (L.a * fade).toFixed(3) + ')';
      ctx.stroke();
    }
    if (o.pulses && time && prog >= 1) drawPulses(time, fade);
  }
  /* impulsions : de petits paquets de lumière filent vers le logo */
  function drawPulses(time, fade) {
    if (time > nextPulse && pulses.length < o.pulses) {
      const L = lines[(Math.random() * lines.length) | 0];
      pulses.push({ L, t0: time, dur: 1500 + Math.random() * 1300, v: L.v || Math.random() < .35 });
      nextPulse = time + 90 + Math.random() * 260;
    }
    ctx.lineCap = 'round';
    for (let i = pulses.length - 1; i >= 0; i--) {
      const P = pulses[i], s = (time - P.t0) / P.dur;
      if (s >= 1) { pulses.splice(i, 1); rings.push({ t0: time, x: P.L.px[SEG], y: P.L.py[SEG], v: P.v }); continue; }
      const head = s * s * (3 - 2 * s) * 1.0, tail = Math.max(0, head - .07 - .05 * s);
      const env = Math.min(1, s * 6) * fade;
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) { const [x, y] = at(P.L, lerp(tail, head, k / 8)); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.strokeStyle = P.v ? 'rgba(179,92,255,' + (.22 * env).toFixed(3) + ')' : 'rgba(230,220,255,' + (.14 * env).toFixed(3) + ')';
      ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = P.v ? 'rgba(225,190,255,' + (.95 * env).toFixed(3) + ')' : 'rgba(255,255,255,' + (.8 * env).toFixed(3) + ')';
      ctx.lineWidth = 1.4; ctx.stroke();
    }
    /* petite onde à l'arrivée sur le logo */
    for (let i = rings.length - 1; i >= 0; i--) {
      const R = rings[i], s = (time - R.t0) / 700;
      if (s >= 1) { rings.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(R.x, R.y, 2 + eo(s) * 16, 0, 6.283);
      ctx.strokeStyle = (R.v ? 'rgba(199,130,255,' : 'rgba(240,235,255,') + ((1 - s) * .5 * fade).toFixed(3) + ')';
      ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  size();
  return { size, draw };
}

/* ---------- HERO : piste épinglée ---------- */
const H = {
  runway: $('#heroRunway'), stage: $('#stage'), board: $('#board'), cross: $('#cross'), hub: $('#hub'),
  logo: $('#logoTravel'), full: $('#logoFull'), mark: $('#logoMark'), copy: $('#heroCopy'), cue: $('#heroCue'), ticker: $('#ticker'),
};
const qboxes = $$('.qtitle', H.board);
const qtitles = $$('.qtitle .t', H.board), texes = $$('.tex', H.board), qbtns = $$('.qbtn', H.board);
const lines4 = ['#cN', '#cS', '#cW', '#cE'].map(s => $(s, H.cross));
const TITLE_AT = [.38, .405, .43, .455];
let heroP = 0, heroPS = 0, live = false, texOn = false, restY = 0, endY = 0;
const isMob = () => vw <= 760;
const threads = Threads($('#threads'), {
  n: COARSE ? 80 : 130, alpha: [.08, .24], vEvery: 13, seed: 2311, spread: 5, pull: .1, reach: 190, pulses: COARSE ? 6 : 12,
  focal: () => {
    const lw = H.logo.offsetWidth, lh = H.logo.offsetHeight;
    return { x: vw / 2 - lw / 2 + lw * (30 / 380), y: restY + lh * (154 / 160) };
  }
});

function heroLayout() {
  const lh = H.logo.offsetHeight;
  restY = isMob() ? vh * .30 - lh / 2 : vh * .5 - lh / 2 - 34;
  endY = vh * .5 - lh / 2;
  threads.size();
  const r = H.board.getBoundingClientRect(), w = r.width, h = r.height, cx = w / 2, cy = h / 2, R = isMob() ? 52 : 74;
  H.cross.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  const L = (el, x1, y1, x2, y2) => {
    el.setAttribute('x1', x1); el.setAttribute('y1', y1); el.setAttribute('x2', x2); el.setAttribute('y2', y2);
    el.setAttribute('pathLength', '1'); el.setAttribute('stroke-dasharray', '1');
    el.setAttribute('stroke-dashoffset', RM ? '0' : '1');
  };
  L(lines4[0], cx, cy - R, cx, 0); L(lines4[1], cx, cy + R, cx, h);
  L(lines4[2], cx - R, cy, 0, cy); L(lines4[3], cx + R, cy, w, cy);
}

/* Lede : mots qui se posent un par un */
const lede = $('#lede');
function splitWords(el) {
  const out = [];
  const walk = node => Array.from(node.childNodes).forEach(n => {
    if (n.nodeType === 3) {
      const frag = d.createDocumentFragment();
      n.textContent.split(/( +)/).forEach(p => {
        if (!p) return;
        if (/^ +$/.test(p)) { frag.appendChild(d.createTextNode(' ')); return; }
        const s = d.createElement('span'); s.className = 'w'; s.textContent = p; frag.appendChild(s); out.push(s);
      });
      n.replaceWith(frag);
    } else if (n.nodeType === 1) walk(n);
  });
  walk(el);
  return out;
}
const ledeWords = RM ? [] : splitWords(lede);

function heroRender(ts) {
  const p = heroPS;
  const intro = RM ? 1 : clamp((ts - t0 - LEAD) / 1500, 0, 1);
  const aL = eio(seg(intro, .05, .5)), aC = eio(seg(intro, .35, 1));
  const out = seg(p, .10, .30);
  H.copy.style.opacity = ((1 - out) * aC).toFixed(3);
  H.copy.style.transform = (isMob() ? 'translate3d(0,' : 'translate3d(0,calc(-40% + ') + (-32 * out + (1 - aC) * 24).toFixed(1) + 'px' + (isMob() ? ',0)' : '),0)');
  H.cue.style.opacity = ((1 - seg(p, .01, .10)) * aC).toFixed(3);
  H.ticker.style.opacity = ((1 - out) * aC).toFixed(3);
  const m = eio(seg(p, .22, .52));
  H.logo.style.transform = 'translate3d(-50%,' + lerp(restY, endY, m).toFixed(1) + 'px,0) scale(' + lerp(1, .285, m).toFixed(4) + ')';
  H.full.style.opacity = ((1 - seg(p, .26, .38)) * aL).toFixed(3);
  H.mark.style.opacity = seg(p, .32, .46).toFixed(3);
  threads.draw(paused ? 1 : intro, paused ? 0 : ts, 1 - seg(p, .20, .42));
  for (let i = 0; i < 4; i++) lines4[i].setAttribute('stroke-dashoffset', (1 - eo(seg(p, .30 + i * .02, .54 + i * .02))).toFixed(4));
  const hb = seg(p, .38, .52);
  H.hub.style.opacity = hb.toFixed(3);
  H.hub.style.transform = 'scale(' + lerp(.55, 1, eo(hb)).toFixed(3) + ')';
  for (let i = 0; i < 4; i++) {
    if (p >= TITLE_AT[i]) print(qtitles[i], 0);
    qboxes[i].style.opacity = seg(p, TITLE_AT[i] - .08, TITLE_AT[i]).toFixed(3);
  }
  const tx = seg(p, .46, .68);
  texes.forEach(t => { t.style.opacity = tx.toFixed(3); });
  if (!texOn && tx > .3) { texOn = true; startWidgets(); }
  const lv = p > .5;
  if (lv !== live) {
    live = lv;
    H.board.classList.toggle('live', lv);
    qbtns.forEach(b => b.setAttribute('tabindex', lv ? '0' : '-1'));
  }
  if (aC > .2 && ledeWords.length && !ledeWords.__go) {
    ledeWords.__go = true;
    ledeWords.forEach((w, i) => setTimeout(() => w.classList.add('on'), 200 + i * 70));
  }
}
function runwayProgress(rw, st) {
  const travel = rw.offsetHeight - st.offsetHeight;
  if (travel <= 0) return 0;
  return clamp(-rw.getBoundingClientRect().top / travel, 0, 1);
}

/* ---------- Widgets des quadrants ---------- */
const term = $('#termB');
const SCRIPT = [
  ['show ip ospf neighbor', 'voisin 10.0.12.2 · état FULL/DR'],
  ['sudo ufw status', 'Status: active · refus par défaut'],
  ['docker compose ps', 'nextcloud · vaultwarden · caddy : up'],
  ['wg show', 'interface wg0 · handshake récent'],
  ['python3 decode.py', 'mqtt → influxdb : flux décodé ✓'],
];
let termLines = [], termI = 0, termTyping = null;
function termStep() {
  if (paused) { setTimeout(termStep, 400); return; }
  const [cmd, outp] = SCRIPT[termI % SCRIPT.length]; termI++;
  const line = { cmd: '', out: '' };
  termLines.push(line);
  if (termLines.length > 4) termLines.shift();
  let k = 0;
  (function type() {
    if (k <= cmd.length) { line.cmd = cmd.slice(0, k++); renderTerm(true); termTyping = setTimeout(type, 38 + Math.random() * 40); }
    else { setTimeout(() => { line.out = outp; renderTerm(false); setTimeout(termStep, 1100); }, 260); }
  })();
}
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function renderTerm(caret) {
  term.innerHTML = termLines.map((l, i) => '<div><span class="p">$</span> ' + esc(l.cmd) + (caret && i === termLines.length - 1 ? '<span class="c"></span>' : '') + '</div>' + (l.out ? '<div class="' + (l.out.includes('✓') || l.out.includes('up') || l.out.includes('FULL') ? 'k' : 'o') + '">  ' + esc(l.out) + '</div>' : '')).join('');
}

const feedL = $('#feedL'), feedA = $('#feedA'), feedH = $('#feedH');
const feed = []; let feedT = 0, fv = .5;
for (let i = 0; i < 48; i++) { fv = clamp(fv + (Math.random() - .5) * .18, .12, .9); feed.push(fv); }
function drawFeed(ts) {
  if (!paused && ts - feedT > 140) {
    feedT = ts;
    fv = clamp(fv + (Math.random() - .5) * .2 + (Math.random() < .04 ? -.35 : 0), .1, .92);
    feed.push(fv); feed.shift();
  }
  const n = feed.length, Wd = 560, Hd = 120;
  let dd = '';
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * Wd, y = Hd - feed[i] * Hd;
    if (i === 0) dd = 'M' + x.toFixed(1) + ' ' + y.toFixed(1);
    else {
      const px = ((i - 1) / (n - 1)) * Wd, py = Hd - feed[i - 1] * Hd, mx = (px + x) / 2;
      dd += ' C' + mx.toFixed(1) + ' ' + py.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + y.toFixed(1) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1);
    }
  }
  feedL.setAttribute('d', dd);
  feedA.setAttribute('d', dd + ' L' + Wd + ' ' + Hd + ' L0 ' + Hd + ' Z');
  feedH.setAttribute('cx', Wd); feedH.setAttribute('cy', (Hd - feed[n - 1] * Hd).toFixed(1));
}

const scan = $('#scan'); let sctx = null, sw = 1, sh = 1, parts = [];
function sizeScan() {
  if (!scan) return;
  const r = scan.getBoundingClientRect();
  sw = Math.max(1, r.width); sh = Math.max(1, r.height);
  scan.width = sw * DPR; scan.height = sh * DPR;
  sctx = scan.getContext('2d'); sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  let x = 7; const R = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  parts = [];
  for (let i = 0; i < 90; i++) {
    const a = R() * Math.PI * 2, rr = Math.pow(R(), .62);
    parts.push({ a, rr, r: 1.4 + R() * 5.4, al: .06 + R() * .3, v: R() < .22, sp: (R() - .5) * .0004, ph: R() * 6.28 });
  }
}
function drawScan(ts) {
  if (!sctx) return;
  sctx.clearRect(0, 0, sw, sh);
  const cx = sw * .52, cy = sh * .52, rx = sw * .42, ry = sh * .4;
  const sweep = ((ts * .00045) % 1);
  for (const p of parts) {
    const a = p.a + (paused ? 0 : ts * p.sp);
    const x = cx + Math.cos(a) * p.rr * rx, y = cy + Math.sin(a) * p.rr * ry;
    const near = 1 - Math.min(1, Math.abs(((x / sw) - sweep)) * 6);
    const al = p.al * (.7 + .3 * Math.sin(ts * .002 + p.ph)) + near * .25;
    sctx.beginPath(); sctx.arc(x, y, p.r, 0, 6.283);
    sctx.fillStyle = p.v ? 'rgba(179,92,255,' + Math.min(1, al * 1.8).toFixed(3) + ')' : 'rgba(240,238,248,' + al.toFixed(3) + ')';
    sctx.fill();
  }
  sctx.fillStyle = 'rgba(179,92,255,.5)';
  sctx.fillRect(sweep * sw, sh * .1, 1, sh * .8);
}

function startWidgets() {
  if (term) termStep();
  $$('.tex .odo', H.board).forEach((o, i) => roll(o, 150 + i * 200));
  $$('#certFeed .row').forEach((r, i) => setTimeout(() => r.classList.add('on'), 250 + i * 320));
}

/* Inclinaison du terminal + halo des quadrants */
$$('.quad', H.board).forEach(q => {
  q.addEventListener('pointermove', e => {
    const r = q.getBoundingClientRect();
    q.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    q.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    const t = $('.term', q);
    if (t) {
      const nx = (e.clientX - r.left) / r.width - .5, ny = (e.clientY - r.top) / r.height - .5;
      t.style.setProperty('--ry', (nx * 22 - 6).toFixed(2) + 'deg');
      t.style.setProperty('--rx', (-ny * 16 + 6).toFixed(2) + 'deg');
    }
  });
});

/* ---------- Bandeau de technologies ---------- */
const tk = $('#tkTrack'); let tkX = 0, tkSpans = tk ? $$('span', tk) : [], tkLast = 0;
function tickerFrame(ts, vis) {
  if (!tk || !vis) return;
  if (!paused) {
    tkX -= COARSE ? .45 : .6;
    const half = tk.scrollWidth / 2;
    if (half > 0 && -tkX >= half) tkX += half;
    tk.style.transform = 'translate3d(' + tkX.toFixed(2) + 'px,0,0)';
  }
  if (ts - tkLast > 120) {
    tkLast = ts;
    const c = vw / 2;
    let best = null, bd = 1e9;
    tkSpans.forEach(s => { const r = s.getBoundingClientRect(); const dd = Math.abs(r.left + r.width / 2 - c); if (dd < bd) { bd = dd; best = s; } });
    tkSpans.forEach(s => s.classList.toggle('focus', s === best));
  }
}

/* ---------- Profil : matrice de points + halo ---------- */
/* Une trame de points discrète ; sous la souris, les points grossissent,
   s'allument en violet et sont légèrement aspirés vers le curseur. */
const hexes = $$('.card').map(card => {
  const cv = $('canvas.dots', card); const ctx = cv.getContext('2d');
  const dark = card.classList.contains('c2') || card.classList.contains('c5');
  const st = { card, cv, ctx, dark, w: 1, h: 1, mx: -999, my: -999, sx: -999, sy: -999, hover: 0, lvl: 0, dirty: true };
  card.addEventListener('pointermove', e => {
    const r = card.getBoundingClientRect();
    st.mx = e.clientX - r.left; st.my = e.clientY - r.top; st.hover = 1;
    if (st.sx < -900) { st.sx = st.mx; st.sy = st.my; }
    card.style.setProperty('--mx', st.mx.toFixed(0) + 'px');
    card.style.setProperty('--my', st.my.toFixed(0) + 'px');
  });
  card.addEventListener('pointerleave', () => { st.hover = 0; });
  return st;
});
function sizeHex() {
  hexes.forEach(s => {
    const r = s.cv.getBoundingClientRect();
    s.w = Math.max(1, r.width); s.h = Math.max(1, r.height);
    s.cv.width = s.w * DPR; s.cv.height = s.h * DPR; s.ctx.setTransform(DPR, 0, 0, DPR, 0, 0); s.dirty = true;
  });
}
function drawHex(s) {
  s.lvl += ((s.hover ? 1 : 0) - s.lvl) * .08;
  s.sx += (s.mx - s.sx) * .2; s.sy += (s.my - s.sy) * .2;
  if (!s.dirty && s.lvl < .004 && !s.hover) return;
  s.dirty = false;
  const c = s.ctx, G = 22, RAD = 150;
  c.clearRect(0, 0, s.w, s.h);
  const base = s.dark ? 'rgba(255,255,255,.10)' : 'rgba(11,10,16,.10)';
  for (let y = G / 2; y < s.h; y += G) {
    for (let x = G / 2; x < s.w; x += G) {
      const ex = s.sx - x, ey = s.sy - y, dist = Math.hypot(ex, ey);
      const k = s.lvl * Math.max(0, 1 - dist / RAD);
      if (k < .01) { c.fillStyle = base; c.fillRect(x - .75, y - .75, 1.5, 1.5); continue; }
      const kk = k * k, px = x + ex * kk * .22, py = y + ey * kk * .22, r = .75 + kk * 1.6;
      c.fillStyle = 'rgba(' + (s.dark ? '199,140,255,' : '123,44,240,') + (.12 + k * .78).toFixed(3) + ')';
      c.beginPath(); c.arc(px, py, r, 0, 6.283); c.fill();
    }
  }
}

/* ---------- Couloir de questions (3D) ---------- */
const C = { runway: $('#corRunway'), stage: $('#corStage'), room: $('#room'), head: $('#corHead') };
const qcards = $$('.qcard', C.room), cframes = $$('.cframe', C.room), cbars = $$('#corBar b');
const STEP = 1150;
let corP = 0, corPS = 0, cardDims = [];
function corLayout() {
  cardDims = qcards.map(c => [c.offsetWidth, c.offsetHeight]);
  const fw = vw * (isMob() ? .9 : .82), fh = vh * (isMob() ? .7 : .74);
  cframes.forEach(f => { f.style.width = fw + 'px'; f.style.height = fh + 'px'; f.__w = fw; f.__h = fh; });
}
function corRender() {
  const p = corPS, N = qcards.length;
  const cam = p * ((N + .2) * STEP);
  const ox = isMob() ? vw * .02 : Math.min(vw * .19, 320);
  qcards.forEach((c, i) => {
    const z = -(i + 1) * STEP + cam;
    const o = seg(z, -3800, -2100) * (1 - seg(z, 0, 340));
    const [w, h] = cardDims[i];
    const x = (i % 2 ? 1 : -1) * ox - w / 2, y = ((i % 3) - 1) * vh * .05 - h / 2;
    c.style.opacity = o.toFixed(3);
    c.style.visibility = o > .002 ? 'visible' : 'hidden';
    c.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,' + z.toFixed(1) + 'px) rotateY(' + ((i % 2 ? -1 : 1) * 6 * (1 - seg(z, -2000, 0))).toFixed(2) + 'deg)';
    const ans = c.querySelector('p');
    if (ans) ans.style.opacity = seg(z, -1500, -800).toFixed(3);
  });
  const span = cframes.length * 700;
  cframes.forEach((f, k) => {
    const z = ((-k * 700 + cam) % span + span) % span - span + 450;
    const o = seg(z, -span + 450, -span + 1800) * (1 - seg(z, 100, 450));
    f.style.opacity = (o * .9).toFixed(3);
    f.style.transform = 'translate3d(' + (-f.__w / 2) + 'px,' + (-f.__h / 2) + 'px,' + z.toFixed(1) + 'px)';
  });
  C.head.style.opacity = (1 - seg(p, .03, .13)).toFixed(3);
  C.head.style.transform = 'translate3d(0,' + (-40 * seg(p, .03, .13)).toFixed(1) + 'px,0)';
  cbars.forEach((b, i) => { b.style.transform = 'scaleX(' + seg(p, i / N * .96, (i + 1) / N * .96).toFixed(3) + ')'; });
}

/* ---------- Finale : flux ---------- */
const flowCv = $('#flow'), finale = $('#contact');
const flow = Threads(flowCv, {
  n: COARSE ? 70 : 110, alpha: [.05, .16], vEvery: 11, seed: 991, spread: 30, mirror: true, pull: .4, reach: 200,
  focal: () => { const r = flowCv.getBoundingClientRect(); return { x: r.width / 2, y: Math.min(r.height * .3, 520) }; }
});
let flowIntro = -1;

/* ---------- Boutons à ressort ---------- */
const springs = FINE && !RM ? $$('.spring').map(el => ({ el, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 })) : [];
let px = -1e4, py = -1e4;
if (springs.length) d.addEventListener('pointermove', e => {
  px = e.clientX; py = e.clientY;
  springs.forEach(s => {
    const r = s.el.getBoundingClientRect();
    const cx = r.left - s.x + r.width / 2, cy = r.top - s.y + r.height / 2;
    const dx = px - cx, dy = py - cy;
    const inside = Math.abs(dx) < r.width / 2 + 50 && Math.abs(dy) < r.height / 2 + 40;
    s.tx = inside ? clamp(dx * .22, -16, 16) : 0; s.ty = inside ? clamp(dy * .32, -10, 10) : 0;
  });
}, { passive: true });
function springFrame() {
  springs.forEach(s => {
    for (let k = 0; k < 2; k++) {
      const dt = .008, K = 420, Cd = 16, M = .55;
      s.vx += ((s.tx - s.x) * K - s.vx * Cd) / M * dt; s.x += s.vx * dt;
      s.vy += ((s.ty - s.y) * K - s.vy * Cd) / M * dt; s.y += s.vy * dt;
    }
    if (Math.abs(s.x) < .01 && Math.abs(s.vx) < .01 && !s.tx) { if (s.el.style.transform) s.el.style.transform = ''; return; }
    s.el.style.transform = 'translate3d(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px,0)';
  });
}

/* ---------- En-tête ---------- */
const hd = $('#hd'); let lastY = 0;
/* La barre réapparaît quand la souris s'approche du haut de l'écran,
   et reste visible tant que la souris est dessus. */
let peek = false;
if (!COARSE) {
  d.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const zone = peek ? hd.offsetHeight + 24 : 64;
    peek = e.clientY <= zone;
  }, { passive: true });
  d.documentElement.addEventListener('pointerleave', e => { if (e.clientY > 0) peek = false; });
}
function headerFrame(y) {
  hd.classList.toggle('solid', y > 40);
  const goingDown = y > lastY + 2, goingUp = y < lastY - 2;
  if (peek) hd.classList.remove('up');
  else if (goingDown && y > 160 && !menuOpen) hd.classList.add('up');
  else if (goingUp) hd.classList.remove('up');
  lastY = y;
  spyFrame();
}

/* Barre de navigation : surligne la partie affichée (ou la fiche ouverte) */
const spyLinks = $$('.hd nav a.nl');
const spySecs = ['top', 'profil', 'questions', 'contact'].map(id => [id, d.getElementById(id)]).filter(s => s[1]);
let spyOn = '';
function spyFrame() {
  let id = 'top';
  if (current) id = current.id;
  else for (const [k, el] of spySecs) if (el.getBoundingClientRect().top <= vh * .45) id = k;
  if (id === spyOn) return;
  spyOn = id;
  spyLinks.forEach(a => {
    const on = a.getAttribute('href') === '#' + id;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });
}

/* ---------- Panneaux ---------- */
let current = null, opener = null;
function openPanel(id, from) {
  const p = d.getElementById(id);
  if (!p) return;
  const r = from ? from.getBoundingClientRect() : { top: vh / 2, left: vw / 2, right: vw / 2, bottom: vh / 2 };
  p.style.setProperty('--ct', Math.max(0, r.top) + 'px');
  p.style.setProperty('--cl', Math.max(0, r.left) + 'px');
  p.style.setProperty('--cr', Math.max(0, vw - r.right) + 'px');
  p.style.setProperty('--cb', Math.max(0, vh - r.bottom) + 'px');
  void p.offsetWidth;
  current = p; opener = d.activeElement; p.__from = from;
  p.classList.add('open');
  $('.panel-in', p).scrollTop = 0;
  if (lenis) lenis.stop();
  setTimeout(() => { const x = $('[data-close]', p); if (x) x.focus({ preventScroll: true }); }, 60);
  const items = $$('.rv', p);
  items.forEach(i => i.classList.remove('in'));
  const pio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); pio.unobserve(e.target); } }), { root: $('.panel-in', p), rootMargin: '0px 0px -6% 0px' });
  setTimeout(() => { items.forEach(i => pio.observe(i)); $$('.pr', p).forEach(n => { n.__printed = false; n.classList.remove('ppd'); n.classList.add('ppa'); print(n, 0); }); $$('.odo', p).forEach((o, i) => { o.__rolled = false; o.__cells.forEach(st => { st.style.transition = 'none'; st.style.transform = ''; }); roll(o, 300 + i * 120); }); }, 520);
  p.__pio = pio;
}
function closePanel() {
  if (!current) return;
  const p = current; current = null;
  /* recadrer la fermeture sur la fiche d'origine (ou le centre) */
  const from = p.__from;
  if (from) {
    const r = from.getBoundingClientRect();
    p.style.setProperty('--ct', Math.max(0, r.top) + 'px');
    p.style.setProperty('--cl', Math.max(0, r.left) + 'px');
    p.style.setProperty('--cr', Math.max(0, vw - r.right) + 'px');
    p.style.setProperty('--cb', Math.max(0, vh - r.bottom) + 'px');
    /* le titre de la fiche se ré-imprime quand le panneau s'est replié dessus */
    const qt = $('.qtitle .t', from);
    if (qt && !RM) setTimeout(() => { qt.__printed = false; qt.classList.remove('ppd'); qt.classList.add('ppa'); print(qt, 0); }, 850);
  }
  p.classList.remove('open');
  if (p.__pio) p.__pio.disconnect();
  if (lenis) lenis.start();
  if (opener && opener.focus) opener.focus({ preventScroll: true });
}
$$('[data-close]').forEach(b => b.addEventListener('click', closePanel));
d.addEventListener('keydown', e => { if (e.key === 'Escape') { if (current) closePanel(); else if (menuOpen) toggleMenu(false); } });

/* Liens internes */
d.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  if (!id) return;
  const t = d.getElementById(id);
  if (!t) return;
  e.preventDefault();
  if (menuOpen) toggleMenu(false);
  if (t.hasAttribute('data-panel')) {
    if (current && current !== t) { closePanel(); setTimeout(() => openPanel(id, null), 400); }
    else {
      /* depuis la barre : si les quadrants sont à l'écran, la fiche s'ouvre depuis le sien */
      let from = a.closest('.quad');
      if (!from && live && vis.hero) { const q = $('.qbtn[href="#' + id + '"]', H.board); from = q && q.closest('.quad'); }
      openPanel(id, from || null);
    }
  } else {
    if (current) closePanel();
    scrollToEl(t);
  }
});

/* Menu mobile */
const mnav = $('#mnav'), menuBtn = $('#menuBtn');
let menuOpen = false;
function toggleMenu(on) {
  menuOpen = on;
  mnav.classList.toggle('open', on);
  menuBtn.setAttribute('aria-expanded', String(on));
  if (lenis) on ? lenis.stop() : lenis.start();
  if (on) setTimeout(() => $('#mnavX').focus(), 100);
}
menuBtn.addEventListener('click', () => toggleMenu(true));
$('#mnavX').addEventListener('click', () => toggleMenu(false));

/* Pause des animations */
const pauseBtn = $('#pauseBtn');
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  root.classList.toggle('paused', paused);
  pauseBtn.setAttribute('aria-pressed', String(paused));
  $('span', pauseBtn).textContent = paused ? 'Reprendre les animations' : 'Mettre en pause les animations';
});

/* ---------- Visibilité des zones coûteuses ---------- */
const vis = { hero: true, cor: false, fin: false, prof: false, scan: false };
const vio = new IntersectionObserver(es => es.forEach(e => {
  const k = e.target.__vk; vis[k] = e.isIntersecting;
  if (k === 'fin' && e.isIntersecting && flowIntro < 0) flowIntro = performance.now();
}), { rootMargin: '150px 0px' });
[[H.runway, 'hero'], [C.runway, 'cor'], [finale, 'fin'], [$('#profil'), 'prof']].forEach(([el, k]) => { el.__vk = k; vio.observe(el); });

/* ---------- Redimensionnement ---------- */
function layoutAll() {
  vw = W.innerWidth; vh = W.innerHeight;
  heroLayout(); sizeScan(); sizeHex(); corLayout(); flow.size();
}
let rT; let lastW = vw;
W.addEventListener('resize', () => {
  clearTimeout(rT);
  rT = setTimeout(() => { if (W.innerWidth !== lastW) { lastW = W.innerWidth; setSvh(); } layoutAll(); if (lenis) lenis.resize(); }, 150);
});

/* ---------- Boucle principale ---------- */
let t0 = performance.now();
layoutAll();
qbtns.forEach(b => b.setAttribute('tabindex', RM ? '0' : '-1'));
if (RM) {
  qtitles.forEach(t => t.classList.remove('ppa'));
  live = true; H.board.classList.add('live');
  texOn = true; startWidgets();
}
heroP = heroPS = RM ? 0 : runwayProgress(H.runway, H.stage);

function frame(ts) {
  if (lenis) lenis.raf(ts);
  const y = W.scrollY;
  headerFrame(y);
  if (vis.hero) {
    if (!RM) {
      heroP = runwayProgress(H.runway, H.stage);
      heroPS += (heroP - heroPS) * EASE;
      heroRender(ts);
    } else threads.draw(1, 0, 1);
    tickerFrame(ts, true);
    if (texOn) { drawFeed(ts); drawScan(ts); }
  }
  if (vis.cor && !RM) {
    corP = runwayProgress(C.runway, C.stage);
    corPS += (corP - corPS) * EASE;
    corRender();
  }
  if (vis.fin && flowIntro >= 0) flow.draw(RM ? 1 : clamp((ts - flowIntro) / 1800, 0, 1), paused || RM ? 0 : ts, 1);
  if (vis.prof) hexes.forEach(drawHex);
  springFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
