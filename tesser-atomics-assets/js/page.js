/* Tesser Atomics · page script · extracted unchanged from handoff-site-v11 heavy/site-t4m-v11.html (script 15). */

/* ==========================================================================
   Tesser Atomics · the one-page site · page script (t4m · site v9; v8's, with section 3 unstaged)
   Started from insitu/src/v4/page.js. Owns: the nav (which steps away while
   a moment is pinned in the scroll page), anchor jumps, the hero video, the
   chapters module's clock (section 4 under s4=chapters), the signup line and
   the switches behind k. It never touches a moment's internals beyond the
   drive hook (root.t4mDrive) each moment exposes.
   ========================================================================== */
(function () {
  'use strict';
  var Q = window.__TZ_Q || {};
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------------- scroll restore (after a switch reload) */
  var SAVE = 'tz-site-scroll';
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(SAVE) || 'null'); sessionStorage.removeItem(SAVE); } catch (e) { saved = null; }
  if (saved && saved.path === location.pathname) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    var restore = function () { window.scrollTo(0, saved.y); };
    restore();
    window.addEventListener('load', function () { restore(); setTimeout(restore, 60); });
  }

  /* ---------------------------------------------------------------- nav: transparent over the hero, then solid.
     s4=scroll: it steps away from the first pin to the last unpin, so it never sits on a stage's top-left copy */
  var CL = document.documentElement.classList;
  var CHAPTERS_ON = CL.contains('tz-s4-chapters'), PLAN_ON = CL.contains('tz-s4-plan');
  var nav = $('[data-nav]'), ticking = false;
  var tracks = CHAPTERS_ON || PLAN_ON ? [] : $$('#tsr-m1 .m1-track, #t4m-m2 .t4m-track, #t4m-m3 .t4m-track, [data-tz-track]');
  // v4: the ships module's track, while it is pinned (ships=scroll)
  var shipsTrack = $('html.tz-apps-ships.tz-ships-scroll [data-ships-track]');
  // section 4 is named by the eyebrow of whichever mode shows
  var sec4el = document.getElementById('why-this-reactor');
  if (sec4el) sec4el.setAttribute('aria-labelledby', PLAN_ON ? 'wtr-h-plan' : CHAPTERS_ON ? 'wtr-h-ch' : 'wtr-h');
  function navState() {
    ticking = false;
    var vh = window.innerHeight;
    nav.classList.toggle('is-solid', window.pageYOffset > 40);
    var away = false;
    if (tracks.length) {
      var a = tracks[0].getBoundingClientRect(), b = tracks[tracks.length - 1].getBoundingClientRect();
      away = a.top <= 2 && b.bottom >= vh - 2;
    }
    if (!away && shipsTrack) { var t = shipsTrack.getBoundingClientRect(); away = t.top <= 2 && t.bottom >= vh - 2; }
    nav.classList.toggle('is-away', away);
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(navState); } }, { passive: true });
  window.addEventListener('resize', navState);
  navState();

  /* ---------------------------------------------------------------- v7 · section nav: the menu (phones), the active link
     The active section is the last one whose top has passed a line a third of the way down the screen. */
  var menuBtn = $('[data-navmenu]'), panel = $('#tz-navpanel');
  function setMenu(open) {
    if (!menuBtn || !panel) return;
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.hidden = !open;
    nav.classList.toggle('is-menu', open);
    if (open) { var f = panel.querySelector('a'); if (f) f.focus(); }
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') { setMenu(false); menuBtn.focus(); } });
    if (panel) panel.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    window.addEventListener('resize', function () { if (window.innerWidth > 1023) setMenu(false); });
  }
  var navLinks = $$('[data-navlink]');
  // v10 · Andrew, Oct 21: Figma's nav style, v9's sections (Technology, Why this reactor, Applications, Team, News)
  var navSecs = ['technology', 'why-this-reactor', 'applications', 'team', 'news'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
  var navTick = false;
  function markActive() {
    navTick = false;
    var line = window.innerHeight / 3, cur = null;
    navSecs.forEach(function (sec) { var r = sec.getBoundingClientRect(); if (r.top <= line && r.bottom > 0 && sec.offsetParent !== null) cur = sec.id; });
    navLinks.forEach(function (a) {
      var on = a.getAttribute('href') === '#' + cur;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', function () { if (!navTick) { navTick = true; requestAnimationFrame(markActive); } }, { passive: true });
  window.addEventListener('resize', markActive);
  markActive();

  /* ---------------------------------------------------------------- v10 · a ship picked from a link: Government in the nav and
     the footer is #ships&tz-ship=gov (the subpages' footers too, as site#ships&tz-ship=gov). The page selects
     that ship by clicking its tab in the ships module, once the module has mounted (it mounts lazily, as the jump nears it).
     Only the module's own tab is touched, the way a visitor would. */
  function pickShip(id) {
    if (!id || !/^[a-z]+$/.test(id)) return;
    var root = document.getElementById('tsr-ships'), tries = 0;
    if (!root) return;
    var go = function () {
      var tab = document.getElementById('tsr-sh-tab-' + id) || root.querySelector('[data-ship-item="' + id + '"] button');
      if (tab && (root.t4mDrive || root.hasAttribute('data-ship'))) { tab.click(); return; }   // mounted: its script owns the tabs
      if (++tries < 60) setTimeout(go, 150);   // up to 9 s: the smooth scroll, then the module's lazy mount
    };
    go();
  }
  function shipOf(href) { var m = /(?:^|[#&])tz-ship=([a-z]+)/.exec(href || ''); return m ? m[1] : null; }

  /* ---------------------------------------------------------------- anchor jumps (the hash is left alone: moments read switches from it) */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var href = a.getAttribute('href'), id = href.split('&')[0], ship = a.getAttribute('data-ship') || shipOf(href);
    if (id === '#') { e.preventDefault(); return; }
    var t = id === '#top' ? document.body : document.getElementById(id.slice(1));
    if (!t) return;
    e.preventDefault();
    if (ship) pickShip(ship);
    var isMoment = /^(tsr-m|t4m-m)/.test(t.id) || t.hasAttribute('data-tz-moment');
    var off = isMoment || t === document.body ? 0 : (window.innerWidth <= 760 ? 64 : 72);
    var top = t === document.body ? 0 : t.getBoundingClientRect().top + window.pageYOffset - off;
    if (t.id === 'why-this-reactor' && CHAPTERS_ON) top += off;   // the module is about a viewport tall: land on its top edge
    window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
    if (t.focus && !isMoment) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
  });

  if (Q['tz-ship'] && !saved) {
    var shipSec = document.getElementById('ships') || document.getElementById('applications');
    if (shipSec) window.addEventListener('load', function () {
      window.scrollTo({ top: shipSec.getBoundingClientRect().top + window.pageYOffset - (window.innerWidth <= 760 ? 64 : 72), behavior: 'auto' });
      pickShip(Q['tz-ship']);
    });
  }

  /* ---------------------------------------------------------------- hero video */
  var vid = $('video.tz-hero__media'), pauseBtn = $('[data-pause]'), hero = $('.tz-hero');
  if (vid) {
    var heroOn = true, userPaused = reduce;
    var sync = function () {
      if (!userPaused && heroOn && !document.hidden) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); }
      else vid.pause();
      if (pauseBtn) {
        pauseBtn.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
        pauseBtn.setAttribute('aria-label', userPaused ? 'Play the background video' : 'Pause the background video');
      }
    };
    var b64id = vid.getAttribute('data-b64');
    if (b64id) {
      // standalone build: the mp4 travels as base64 and becomes a blob URL (more robust than a multi-MB data: src)
      var holder = document.getElementById(b64id);
      if (holder) {
        var b64 = holder.textContent.trim();
        var toBlob = function () {
          var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
          for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
          return new Blob([u], { type: 'video/mp4' });
        };
        var setSrc = function (blob) { vid.src = URL.createObjectURL(blob); holder.textContent = ''; b64 = null; sync(); };
        if (window.fetch) fetch('data:video/mp4;base64,' + b64).then(function (r) { return r.blob(); }).then(setSrc, function () { setSrc(toBlob()); });
        else setSrc(toBlob());
      }
    }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { heroOn = es[0].isIntersecting; sync(); }).observe(hero);
    document.addEventListener('visibilitychange', sync);
    if (pauseBtn) pauseBtn.addEventListener('click', function () { userPaused = !userPaused; sync(); });
    sync();
  }

  /* ---------------------------------------------------------------- 4 · the chapters module (../CHAPTERS.md §3)
     The page owns the clock. A chapter whose moment exposes the drive hook (root.t4mDrive, announced by a
     't4m:drive-ready' event on the root once the moment has mounted) is played by calling set(p) every frame across
     the moment's own highlight; until then (or if it never mounts) the chapter shows that moment's poster and steps
     its beat lines on the same clock. Auto-advance moves on after a 1.6 s hold; the first click stops it for good,
     and from then on a chapter plays once and holds on its last frame. Clicking the active chapter replays it. Only
     the active chapter's moment renders; the others are stopped. */
  var CHM = CHAPTERS_ON && $('[data-tz-chapters]');
  if (CHM) (function (mod) {
    var GROUND = { m1: 'light', m2: 'dark', m3: 'dark', m4: 'light' };   // the mixed theme
    var sec4 = mod.closest('.tz-wtr');
    var tabs = $$('.tz-ch__tab', mod), items = $$('.tz-ch__item', mod), panels = $$('.tz-ch__panel', mod), copies = $$('.tz-ch__cp', mod);
    var list = $('.tz-ch__list', mod), pauseBtn = $('[data-ch-pause]', mod);
    var HOLD = 1.6;
    var auto = true;
    var cur = -1, t = 0, visible = false, paused = false, raf = 0, last = 0;
    function posterOf(root, ground) {
      if (!root) return '';
      var img = root.querySelector(ground === 'light' ? 'img.m1-poster-light' : 'img.m1-poster:not(.m1-poster-light)');
      if (img && img.getAttribute('src')) return 'url("' + img.getAttribute('src') + '")';
      var el = root.querySelector('.t4m-poster, .m4-poster');
      if (!el) return '';
      var get = function (n) { return (el.style.getPropertyValue(n) || '').trim(); };
      var v = ground === 'light' ? (get('--poster-light') || get('--m4-poster-light')) : '';
      if (v && v !== 'none') return v;
      v = get('--poster') || get('--m4-poster');
      return v && v !== 'none' ? v : el.style.backgroundImage || '';
    }
    var ch = panels.map(function (panel, i) {
      var m = panel.getAttribute('data-m'), id = { m1: 'tsr-m1', m2: 't4m-m2', m3: 't4m-m3', m4: 'tsr-m4' }[m];
      var root = document.getElementById(id);
      var c = { i: i, panel: panel, root: root, lines: $$('.tz-ch__line', panel), sec: +panel.getAttribute('data-sec') || 10,
                ground: GROUND[m] || 'light', drive: null, inModule: !!(root && panel.contains(root)), ease: m === 'm4' };
      var po = $('.tz-ch__poster', panel), url = posterOf(root, c.ground);
      if (po && url) po.style.backgroundImage = url;
      if (root) root.addEventListener('t4m:drive-ready', function () { hook(c); });
      return c;
    });
    function hook(c) {
      var d = c.root && c.root.t4mDrive;
      if (!c.inModule || !d || typeof d.set !== 'function') return;
      c.drive = d;
      c.panel.classList.add('is-live');
      if (c.i === cur) { if (d.start && !paused) d.start(); loop(); render(); } else if (d.stop) d.stop();
    }
    // M4's clock eases in and out within each beat, so its camera swings settle into each beat instead of cutting
    function easeBeats(bs, p) {
      for (var j = 0; bs && j < bs.length; j++) {
        var f = +bs[j].from, to = +bs[j].to;
        if (to > f && p >= f && p <= to) { var u = (p - f) / (to - f); return f + (to - f) * u * u * (3 - 2 * u); }
      }
      return p;
    }
    function span(c) {
      var d = c.drive, h = d && d.highlight, b = d && d.beats;
      if (h && isFinite(h.from) && isFinite(h.to)) return { from: +h.from, to: +h.to, sec: +h.seconds || c.sec };
      if (b && b.length) return { from: +b[0].from, to: +b[b.length - 1].to, sec: c.sec };
      return { from: 0, to: 1, sec: c.sec };
    }
    function render() {
      var c = ch[cur]; if (!c) return;
      var h = span(c), k = Math.min(1, t / h.sec);
      var bar = $('.tz-ch__bar i', items[cur]);
      if (bar) bar.style.transform = 'scaleX(' + k.toFixed(4) + ')';
      if (c.drive) {
        var p;
        if (reduce) {
          // reduced motion: step through the beats' hold points inside the highlight
          var holds = (c.drive.beats || []).map(function (b) { return +b.hold; }).filter(function (x) { return x >= h.from - 1e-6 && x <= h.to + 1e-6; });
          if (!holds.length) holds = [h.to];
          p = holds[Math.min(holds.length - 1, Math.floor(k * holds.length))];
        } else {
          p = h.from + (h.to - h.from) * k;
          if (c.ease) p = easeBeats(c.drive.beats, p);
        }
        try { c.drive.set(p); } catch (e) {}
      } else if (c.lines.length) {
        var li = Math.min(c.lines.length - 1, Math.floor(k * c.lines.length));
        c.lines.forEach(function (el, j) { el.classList.toggle('is-on', j === li); });
      }
    }
    function activate(i, user) {
      if (user && auto) { auto = false; mod.classList.add('is-manual'); }
      var prev = ch[cur];
      if (prev && prev !== ch[i] && prev.drive && prev.drive.stop) prev.drive.stop();
      cur = i; t = 0; last = 0;
      var c = ch[i];
      tabs.forEach(function (b, j) { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); b.tabIndex = j === i ? 0 : -1; });
      items.forEach(function (el, j) { el.classList.toggle('is-on', j === i); });
      panels.forEach(function (el, j) { el.classList.toggle('is-on', j === i); });
      copies.forEach(function (el, j) { el.classList.toggle('is-on', j === i); });
      if (sec4) sec4.setAttribute('data-ground', c.ground);
      if (c.drive && c.drive.start && !paused) c.drive.start();
      if (list && list.scrollWidth > list.clientWidth + 2) {   // phones: bring the active heading into the row
        var it = items[i], l = it.offsetLeft - list.offsetLeft;
        if (l < list.scrollLeft || l + it.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollTo({ left: Math.max(0, l - 20), behavior: reduce ? 'auto' : 'smooth' });
      }
      render();
      loop();
    }
    function frame(now) {
      raf = 0;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (!visible || paused || document.hidden) { last = 0; return; }
      var c = ch[cur], dur = span(c).sec;
      t += dt;
      if (t >= dur) {
        if (auto) { if (t >= dur + HOLD) { activate((cur + 1) % ch.length); return; } }
        else { t = dur; render(); return; }   // played once: hold on the last frame
      }
      render();
      raf = requestAnimationFrame(frame);
    }
    function loop() { if (!raf && visible && !paused) raf = requestAnimationFrame(frame); }
    mod.addEventListener('click', function (e) {
      var b = e.target.closest('.tz-ch__tab');
      if (b) { activate(+b.getAttribute('data-ch'), true); return; }
      if (e.target.closest('[data-ch-pause]')) {
        paused = !paused;
        pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
        pauseBtn.setAttribute('aria-label', paused ? 'Play the animation' : 'Pause the animation');
        var d = ch[cur].drive;
        if (d) { if (paused && d.stop) d.stop(); if (!paused && d.start) d.start(); }
        last = 0; loop();
      }
    });
    list.addEventListener('keydown', function (e) {
      var k = e.key, n = ch.length, i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var j = k === 'ArrowRight' || k === 'ArrowDown' ? (i + 1) % n : k === 'ArrowLeft' || k === 'ArrowUp' ? (i + n - 1) % n : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
      if (j < 0) return;
      e.preventDefault(); tabs[j].focus(); activate(j, true);
    });
    // the clock runs only while the module is at least 35% on screen and the tab is visible
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        var was = visible;
        visible = es[0].intersectionRatio >= 0.35; last = 0;
        // the moment's own render loop follows the clock: stopped while the module is mostly off screen
        var d = ch[cur] && ch[cur].drive;
        if (d && was !== visible) { if (!visible && d.stop) d.stop(); else if (visible && !paused && d.start) d.start(); }
        loop();
      }, { threshold: [0, 0.35, 0.6] }).observe(mod);
    } else visible = true;
    document.addEventListener('visibilitychange', function () { last = 0; loop(); });
    ch.forEach(function (c) { hook(c); if (c.drive && c.i !== 0 && c.drive.stop) c.drive.stop(); });
    activate(0);
    window.__TZ_CH = { state: function () { return { cur: cur, t: t, auto: auto, visible: visible, live: ch.map(function (c) { return !!c.drive; }) }; },
                       go: function (i) { activate(i, true); } };
  })(CHM);

  /* ---------------------------------------------------------------- v4 · m2=ambient: hold M2 on its flowing-salt beat
     (p 0.375, the camera settled on the salt streaming through the gaps; m2.hold in the URL moves it) and let its own
     clock run, so the salt keeps flowing while the camera stays still. The moment draws only while it is on screen (its
     own observer), at half resolution (data-tz-res, set in the head). */
  var M2 = document.getElementById('t4m-m2');
  if (M2 && M2.hasAttribute('data-tz-ambient')) {
    var m2Hold = isFinite(+Q['m2.hold']) && Q['m2.hold'] !== undefined ? Math.max(0, Math.min(1, +Q['m2.hold'])) : 0.375;
    var m2Go = function () { var d = M2.t4mDrive; if (!d) return; d.set(m2Hold); if (d.start) d.start(); };
    if (M2.t4mDrive) m2Go(); else M2.addEventListener('t4m:drive-ready', m2Go);
  }

  /* ---------------------------------------------------------------- v4 · ships=scroll: the module pinned and scrubbed
     The track is one screen tall plus shipsPace vh (default 70) per ship change. On the way in (the track's top from the
     bottom of the screen to the top) the first ship assembles (p 0 to its hold); pinned, p runs from the first ship's hold
     to the last's. A click on a ship name (t4m:pick, with that ship's hold) scrolls there. Hosted and set by the page, the
     module never advances on its own. */
  var SH = document.getElementById('tsr-ships');
  if (shipsTrack && SH && SH.getAttribute('data-drive') === 'host') (function () {
    var pace = isFinite(+Q.shipsPace) && Q.shipsPace ? Math.max(30, Math.min(200, +Q.shipsPace)) : 70;
    var drive = null, beats = null, N = Q['ships.fleet'] === 'plan' ? 4 : 7, raf = 0;
    function holds() {
      if (beats && beats.length) return [+beats[0].hold, +beats[beats.length - 1].hold];
      return [0.59 / N, (N - 1 + 0.59) / N];
    }
    function size() { shipsTrack.style.height = Math.round(window.innerHeight * (1 + (N - 1) * pace / 100)) + 'px'; }
    function pOf() {
      var r = shipsTrack.getBoundingClientRect(), vh = window.innerHeight, span = r.height - vh, h = holds();
      if (r.top > 0) return h[0] * Math.max(0, Math.min(1, 1 - r.top / vh));
      return h[0] + (h[1] - h[0]) * (span > 0 ? Math.max(0, Math.min(1, -r.top / span)) : 1);
    }
    function apply() { raf = 0; if (drive) drive.set(pOf()); }
    function onScroll() { if (!raf) raf = requestAnimationFrame(apply); }
    function hook() {
      drive = SH.t4mDrive;
      if (!drive) return;
      beats = drive.beats && drive.beats.length ? drive.beats : null;
      if (beats && beats.length !== N) { N = beats.length; size(); }
      apply();
      if (drive.start) drive.start();
    }
    size();
    window.addEventListener('resize', function () { size(); onScroll(); });
    window.addEventListener('scroll', onScroll, { passive: true });
    if (SH.t4mDrive) hook(); else SH.addEventListener('t4m:drive-ready', hook);
    SH.addEventListener('t4m:pick', function (e) {
      var p = e.detail && +e.detail.p, h = holds();
      if (!isFinite(p)) return;
      var r = shipsTrack.getBoundingClientRect(), span = r.height - window.innerHeight;
      var k = h[1] > h[0] ? Math.max(0, Math.min(1, (p - h[0]) / (h[1] - h[0]))) : 0;
      window.scrollTo({ top: Math.round(r.top + window.pageYOffset + k * span), behavior: reduce ? 'auto' : 'smooth' });
    });
    window.__TZ_SHIPS = { p: pOf, pace: pace, n: function () { return N; } };
  })();

  /* ---------------------------------------------------------------- v9 · section 3: the text shows as normal (no staging);
     the plant builds once when 40% in view and holds (its own clock). The captions: caps=static (default) shows all three
     at full strength; caps=cycle (all quiet, one at full strength in turn, every 3 s, paused on hover or focus) and
     caps=sequence (one by one, then hold) start when the caption row comes into view. Reduced motion: static. */
  var capList = $('.tz-how__cap');
  if (capList) (function () {
    var caps = $$('li', capList), mode = CL.contains('tz-caps-cycle') ? 'cycle' : CL.contains('tz-caps-sequence') ? 'sequence' : 'static';
    if (reduce || mode === 'static' || !('IntersectionObserver' in window)) return;
    capList.classList.add('caps-' + mode);
    var timer = 0, i = -1, hold = false;
    function step() { i = (i + 1) % caps.length; caps.forEach(function (li, k) { li.classList.toggle('is-hot', k === i); }); }
    function go() {
      if (mode === 'sequence') { caps.forEach(function (li, k) { setTimeout(function () { li.classList.add('is-on'); }, 150 + k * 450); }); return; }
      capList.classList.add('is-cycling');
      step();
      timer = setInterval(function () { if (!hold && !document.hidden) step(); }, 3000);
      ['mouseenter', 'focusin'].forEach(function (ev) { capList.addEventListener(ev, function () { hold = true; }); });
      ['mouseleave', 'focusout'].forEach(function (ev) { capList.addEventListener(ev, function () { hold = false; }); });
    }
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); go(); } }, { threshold: 0.6 });
    io.observe(capList);
  })();

  /* ---------------------------------------------------------------- v7 · M2's tiles fill in when they come into view */
  var viz = $('#tz-m2viz');
  if (viz) {
    if (reduce || !('IntersectionObserver' in window)) viz.classList.add('is-in');
    else new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { viz.classList.add('is-in'); o.disconnect(); } }, { threshold: 0.4 }).observe(viz);
  }

  /* ---------------------------------------------------------------- updates signup (no endpoint yet) */
  var form = $('[data-signup]');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = form.querySelector('input'), ok = form.querySelector('.tz-signup__ok');
    var v = (inp.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { ok.textContent = 'Enter an email address to get updates.'; inp.focus(); return; }
    ok.textContent = 'Thanks. Updates will go to ' + v + '.';
    inp.value = '';
  });

  /* ---------------------------------------------------------------- the two switches: k opens them, nothing shows otherwise */
  var SW = window.__TZ_SWITCHES || [];
  var box = null;
  function go(key, val, def) {
    var q = {};
    (location.search || '').slice(1).split('&').forEach(function (kv) {
      if (!kv) return; var i = kv.indexOf('=');
      q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
    });
    if (val === def) delete q[key]; else q[key] = val;
    var s = Object.keys(q).map(function (k) { return encodeURIComponent(k) + (q[k] === '' ? '' : '=' + encodeURIComponent(q[k])); }).join('&');
    try { sessionStorage.setItem(SAVE, JSON.stringify({ y: window.pageYOffset, path: location.pathname })); sessionStorage.setItem('tz-site-sw', '1'); } catch (e) {}
    location.href = location.pathname + (s ? '?' + s : '');
  }
  function build() {
    box = document.createElement('div');
    box.className = 'tz-sw';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Switches');
    var h = '<div class="tz-sw__h"><span>Switches</span><span>k</span></div>';
    SW.forEach(function (k) {
      var cur = k[1].indexOf(Q[k[0]]) >= 0 ? Q[k[0]] : k[1][0];
      h += '<div class="tz-sw__k"><span>' + k[0] + '</span><div class="tz-sw__o">' + k[1].map(function (o) {
        return '<button type="button" data-k="' + k[0] + '" data-v="' + o + '" data-d="' + k[1][0] + '"' + (o === cur ? ' class="on"' : '') + '>' + o + '</button>';
      }).join('') + '</div><p class="tz-sw__n">' + k[2] + '</p></div>';
    });
    box.innerHTML = h;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-k]');
      if (b) go(b.getAttribute('data-k'), b.getAttribute('data-v'), b.getAttribute('data-d'));
    });
    document.body.appendChild(box);
  }
  function toggle(on) {
    if (!box) build();
    box.classList.toggle('is-open', on == null ? !box.classList.contains('is-open') : on);
  }
  try { if (sessionStorage.getItem('tz-site-sw') === '1') { sessionStorage.removeItem('tz-site-sw'); toggle(true); } } catch (e) {}
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && box && box.classList.contains('is-open')) { toggle(false); return; }
    if (e.key !== 'k' && e.key !== 'K') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    toggle();
  });
})();

