/* Tesser Atomics · core: switches, __TZ_PREP, __TZ_LAZY · extracted unchanged from handoff-site-v11 heavy/site-t4m-v11.html (script 0). */

/* Switches, read before first paint (search or hash): s4, m2, m3, apps, ships, globe, strip, cards. window.__TZ_SWITCHES
   is this page's list, written by build.py with the page's defaults first (site v5: s4=scroll, m2=ambient, m3=off,
   apps=ships, ships=click, proof=logos, nupro=ntnu). The theme is fixed: mixed (M1 and M4 on paper, M2 and M3 on navy), hard edges, the moments' copy on the
   page grid in the Figma type (in-situ v4's defaults, baked in as classes).
   window.__TZ_PREP(id) runs right after each moment's markup, before any moment script:
     - s4=chapters: drive=host on a root whose build has the drive hook (data-tz-drive), moved into its chapter's slot;
     - v4, m2=ambient (s4=scroll): M2 gets drive=host in place, data-tz-ambient and data-tz-res=0.5 (its backing store
       at half resolution); the page holds it on its flowing-salt beat and lets its own clock run;
     - v4, m3=off: M3's root is removed with its seam (and its chapter, the others renumbered), so it never mounts;
     - ships=scroll (apps=ships): the ships module gets drive=host; the page pins it and drives it from scroll. Under
       v5's default ships=click it is left alone: one screen, its own clock, auto-advancing until the first click.
   window.__TZ_LAZY(id, ms, fn) runs fn once #id comes within a viewport of the screen (ms later under s4=chapters,
   where the four moments share one box; at once in the scroll page): how M4 and the ships module mount lazily (M1, M2
   and M3 do the same inside their own copies). */
window.__TZ_SWITCHES = [["s3", ["light", "dark"], "Section 3: on paper, flowing into M1, or on navy as before"], ["plant", ["3d", "drawing"], "Section 3's stage: the 3D clay plant (C-plant) or the client's drawing (the placeholder until it lands)"], ["caps", ["static", "cycle", "sequence"], "Section 3's captions: all at full strength, one highlighted in turn, or faded in one by one"], ["m4copy", ["panel", "paper", "free"], "M4's copy column: on a solid navy panel (section 2's style), on a paper card, or free over the scene (v7)"], ["s4", ["scroll", "chapters", "plan"], "Section 4: the moments as a scroll story, the one-screen chapters module, or the build plan's four cards over the T6 render and the fuel strip"], ["m2", ["ambient", "scroll"], "s4=scroll: M2 as one quiet screen (its headline over the flowing salt, no pin, no beats), or v3's pinned scroll story"], ["m3", ["off", "on"], "M3 (graphite): left out (it never mounts), or in, as in v3"], ["apps", ["ships", "cards"], "Section 5: the ships module, or the client's four image cards"], ["ships", ["click", "scroll"], "apps=ships: one screen, auto-advancing until the first click (its own clock), or pinned and scrubbed by scroll (shipsPace=70 vh per ship)"], ["globe", ["on", "off"], "Section 5's header: the globe band, or the headline alone"], ["strip", ["navy", "paper"], "s4=plan's fuel strip: the navy clay renders, or the light clay keyframes on paper"], ["cards", ["grid", "full"], "apps=cards: two by two, or each card a full-width band like the Commercial screens"], ["proof", ["logos", "names"], "Section 7: the partners' logos as one-colour marks, or their names as text (v5)"], ["nupro", ["ntnu", "pair"], "proof=logos: the NuProShip / NTNU entry as NTNU's logo, or the NuProShip mark beside it"], ["why.label", ["32", "20", "28", "40"], "Section 2's benefit labels (Speed, Capacity, Cost, Emissions): px at 1440 (Figma 20); about 20 on phones"], ["m2copy", ["original", "reframe", "off"], "M2's copy: Matt's low-pressure section as is, the Oct 21 reframe (what the salt buys the ship, with the running-vs-boiling bars), or M2 left out (s4=scroll)"], ["growth", ["off", "ships", "globe"], "Section 5's opener: ships entering an ocean (C-growth v2, Oct 21), Matt's globe with growing routes (C-growth v1), or the v9 route band"]];
(function () {
  var s = (location.search || '').slice(1) + '&' + (location.hash || '').slice(1), q = {}, opts = {};
  s.split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1)); });
  (window.__TZ_SWITCHES || []).forEach(function (k) { opts[k[0]] = k[1]; });
  var pick = function (k) { var o = opts[k] || ['']; return o.indexOf(q[k]) >= 0 ? q[k] : o[0]; };
  var s4 = pick('s4'), m2 = pick('m2'), m3 = pick('m3'), apps = pick('apps'), ships = pick('ships');
  var H = document.documentElement;
  H.className += ' tz-js tz-s4-' + s4 + ' tz-apps-' + apps + ' tz-globe-' + pick('globe') +
    ' tz-strip-' + pick('strip') + ' tz-cards-' + pick('cards') + ' tz-m2-' + m2 + ' tz-m3-' + m3 + ' tz-ships-' + ships +
    ' tz-proof-' + pick('proof') + ' tz-nupro-' + pick('nupro') + ' tz-s3-' + pick('s3') + ' tz-plant-' + pick('plant') +
    ' tz-caps-' + pick('caps') + ' tz-m4copy-' + pick('m4copy') + ' tz-whylab-' + (pick('why.label') || '32') + ' tz-growth-' + pick('growth') + ' tz-theme-mixed tz-g1-light tz-g2-dark tz-g3-dark tz-g4-light tz-edge-hard tz-align-grid tz-type-figma tz-sub-fold';
  window.__TZ_Q = q;
  // v7 · the hero mark's turn: one rotation every spin seconds (default 24; static under reduced motion)
  if (q.spin && isFinite(+q.spin) && +q.spin > 0) H.style.setProperty('--tz-spin', (+q.spin) + 's');
  /* v7 · text-left moments (s4=scroll, desktop): M1's beat lines and M4's move into their copy block, under the headline
     and subhead, so one left column swaps in place. Below 820 px the lines go back where the build put them. */
  var textLeft = function (r, beatSel, copySel, subSel) {
    if (s4 !== 'scroll' || r.getAttribute('data-drive') === 'host') return;
    var beat = r.querySelector(beatSel), copy = r.querySelector(copySel);
    if (!beat || !copy) return;
    var home = beat.parentNode, next = beat.nextSibling, mq = window.matchMedia ? matchMedia('(min-width: 820px)') : null;
    r.classList.add('tz-textleft');
    var place = function () {
      if (!mq || mq.matches) { if (beat.parentNode !== copy) copy.appendChild(beat); }
      else if (beat.parentNode !== home) home.insertBefore(beat, next && next.parentNode === home ? next : null);
    };
    place();
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', place); else if (mq.addListener) mq.addListener(place); }
  };
  window.__TZ_PREP = function (id) {
    var r = document.getElementById(id), m = 'm' + id.slice(-1);
    if (!r) return;
    if (id === 't4m-m3' && m3 === 'off') {
      var seam = document.querySelector('.tz-seam[data-to="3"]');
      if (seam) seam.parentNode.removeChild(seam);
      var mod = document.querySelector('[data-tz-chapters]');
      if (mod) {
        var gone = mod.querySelector('.tz-ch__panel[data-m="m3"]'), n = gone ? gone.getAttribute('data-ch') : null;
        if (n != null) {
          Array.prototype.forEach.call(mod.querySelectorAll('[data-ch="' + n + '"]'), function (el) {
            var it = el.closest('.tz-ch__item') || el;
            if (it.parentNode) it.parentNode.removeChild(it);
          });
          ['.tz-ch__item', '.tz-ch__tab', '.tz-ch__panel', '.tz-ch__cp'].forEach(function (sel) {
            Array.prototype.forEach.call(mod.querySelectorAll(sel), function (el, i) { el.setAttribute('data-ch', String(i)); });
          });
        }
      }
      r.parentNode.removeChild(r);
      return;
    }
    if (id === 'tsr-ships') {
      if (apps !== 'ships' || ships !== 'scroll') return;
      r.setAttribute('data-drive', 'host');
      // the module hides its own heading when hosted ("the page shows it"); if it does, the page's heading shows
      var hd = r.querySelector('.sh-card');
      if (hd && getComputedStyle(hd).display === 'none') H.classList.add('tz-ships-sitehead');
      return;
    }
    if (id === 't4m-m2' && s4 === 'scroll' && m2 === 'ambient' && r.hasAttribute('data-tz-drive')) {
      r.setAttribute('data-drive', 'host');
      r.setAttribute('data-tz-ambient', '');
      r.setAttribute('data-tz-res', '0.5');
      // v7 · the pressure tiles go into M2's overlay, right of its copy
      var viz = document.getElementById('tz-m2viz'), ui = r.querySelector('.t4m-ui');
      if (viz && ui) ui.appendChild(viz);
      return;
    }
    if (/^tsr-plant/.test(id)) {   // v7 · plant=drawing: the 3D plant's root goes before its script runs, so it never mounts
      if (pick('plant') === 'drawing') { r.parentNode.removeChild(r); return; }
      // in the site's own right column, with the site's own text (plant v2: copy=off lets the stage fill the box), themed to section 3
      r.setAttribute('data-copy', 'off');
      r.setAttribute('data-theme', pick('s3') === 'dark' ? 'dark' : 'light');
      return;
    }
    if (id === 'tsr-m1') textLeft(r, '.m1-beat', '.m1-copy');
    if (id === 'tsr-m4') textLeft(r, '.m4-call', '.m4-card');
    if (s4 !== 'chapters' || !r.hasAttribute('data-tz-drive')) return;
    var slot = document.querySelector('[data-tz-slot="' + m + '"]');
    if (!slot) return;
    r.setAttribute('data-drive', 'host');
    slot.appendChild(r);
  };
  window.__TZ_LAZY = function (id, wait, fn) {
    var host = document.getElementById(id), done = false;
    if (s4 !== 'chapters') wait = 0;
    var go = function () { if (done) return; done = true; try { fn(); } catch (e) { if (window.console) console.error(e); } };
    if (!host || !('IntersectionObserver' in window)) { go(); return; }
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); setTimeout(go, wait); } }, { rootMargin: '100% 0px 100% 0px' });
    io.observe(host);
  };
})();
