/* Tesser Atomics · scene: M4 fuel cycle · extracted unchanged from handoff-site-v11 heavy/site-t4m-v11.html (script 8). */
window.__TZ_LAZY('tsr-m4', 1800, function () {

(function () {
'use strict';
/* ============================================================================
   M4 core · runtime for the C-fuel WebGL moment                         -t4m
   ----------------------------------------------------------------------------
   A scoped copy of C-salt-graphite/src/core.js (the M2/M3 runtime), so M4
   behaves exactly like its neighbours on one page: WebGL2, one full-screen
   triangle, scene pass -> RGBA8 (alpha = signed CoC) -> DOF + vignette + grain
   post, scroll progress of the root's track, beats -> HTML overlay, reduced
   motion stills, adaptive render scale, pause off-screen, poster fallback,
   ?knobs panel, params read from both ?search and #hash.

   Differences from core.js, all additive:
     - no global: build.py inlines this INSIDE the moment's IIFE as M4CORE
     - classes are m4-* (m4-track, m4-stage, m4-gl, m4-knobs), not t4m-*
     - mat3 uniforms (U.m3)
     - picking: def.pick() may return [x, y] in canvas pixels; the scene is
       redrawn into that one pixel with uPick = 1 and def.onPick(rgba) gets it
     - api.kick() redraws once when idle (reduced motion, hover changes)
     - def.onKnob(key) after a knob changes (M4 uses it for the track height)

   v2 (light theme, ../THEME-light.md), additive again; theme=dark runs the
   v1 code path with the same values:
     - m4.<key> URL keys win over bare <key> (the in-situ page's P1 merge,
       now built in; the page adding it again is harmless)
     - st.theme ('dark' | 'light') and st.paper (6-digit hex, light only),
       each resolved m4.<key>, then <key>, then data-<key> on the root, then
       the default; written back to the root as data-theme / data-paper, and
       --paper / --paper-rgb for the overlay CSS
     - def.frag, def.vignette and def.grain may be functions of st

   drive (CHAPTERS.md section 2), additive; drive=scroll runs as before:
     - st.drive 'scroll' | 'host', resolved like theme (m4.drive, drive,
       data-drive on the root, default scroll); written back as data-drive
     - host: progress comes from set(p), not page scroll; no easing; no
       scroll listeners; a ResizeObserver redraws when the box changes size
       while idle; the loop runs until stop()
     - host exposes root.t4mDrive = { set(p), beats, highlight, start(),
       stop() } (beats and highlight from def.drive), then dispatches
       't4m:drive-ready' on the root
   ========================================================================= */
var M4CORE = (function () {
  'use strict';

  function params() {
    var s = (location.search || '').slice(1) + '&' + (location.hash || '').slice(1), o = {};
    s.split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      o[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
    });
    return o;
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  /* theme and paper: the m4.<key> URL key, then the bare URL key, then data-<key> on the root, then the default.
     raw is an unmerged params() read, so an invalid namespaced value falls through to the bare key. */
  var HEX6 = /^#?([0-9a-fA-F]{6})$/;
  function themeOf(root, raw) {
    function pick(key, ok) {
      var c = [raw['m4.' + key], raw[key], root.getAttribute('data-' + key)];
      for (var i = 0; i < c.length; i++) if (c[i] != null && ok(c[i])) return c[i];
      return null;
    }
    var th = pick('theme', function (v) { return v === 'dark' || v === 'light'; }) || 'dark';
    var pa = pick('paper', function (v) { return HEX6.test(v); });
    pa = (pa ? HEX6.exec(pa)[1] : 'f2f2f0').toLowerCase();
    var n = parseInt(pa, 16);
    var dr = pick('drive', function (v) { return v === 'scroll' || v === 'host'; }) || 'scroll';
    return { theme: th, paper: pa, rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], drive: dr };
  }

  var VERT = '#version 300 es\nin vec2 aPos;\nvoid main(){ gl_Position = vec4(aPos, 0.0, 1.0); }\n';

  /* Post: identical to core.js (scatter-as-gather bokeh from the signed CoC). */
  var POST = [
    '#version 300 es',
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform vec2 uRes;',
    'uniform float uMaxCoc, uTime, uGrain, uVig;',
    'out vec4 oCol;',
    'float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    '  vec4 c0 = texture(uTex, uv);',
    '  float k0 = c0.a * 2.0 - 1.0;',
    '  float r0 = abs(k0) * uMaxCoc;',
    '  vec3 acc = c0.rgb; float ws = 1.0;',
    '  if (uMaxCoc > 0.5) {',
    '    for (int i = 1; i < 44; i++) {',
    '      float fi = float(i);',
    '      float rr = sqrt(fi / 44.0) * uMaxCoc;',
    '      float an = fi * 2.39996323;',
    '      vec4 s = texture(uTex, uv + vec2(cos(an), sin(an)) * rr / uRes);',
    '      float ks = s.a * 2.0 - 1.0;',
    '      float rs = abs(ks) * uMaxCoc;',
    '      float re = ks > k0 ? min(rs, r0) : rs;',
    '      float w = smoothstep(rr - 1.0, rr + 1.0, re);',
    '      acc += s.rgb * w; ws += w;',
    '    }',
    '  }',
    '  vec3 col = acc / ws;',
    '  vec2 q = uv - 0.5; q.x *= uRes.x / uRes.y;',
    '  col *= 1.0 - uVig * smoothstep(0.3, 1.05, length(q));',
    '  col += (h12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5) * uGrain;',
    '  col += (h12(gl_FragCoord.yx + 3.7) - 0.5) / 255.0;',
    '  oCol = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function shader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      setTimeout(function () { throw new Error('m4 shader compile: ' + log); });
      return null;
    }
    return s;
  }
  function program(gl, vs, fs) {
    var v = shader(gl, gl.VERTEX_SHADER, vs), f = shader(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(p);
      setTimeout(function () { throw new Error('m4 program link: ' + log); });
      return null;
    }
    return p;
  }
  function uniforms(gl, prog) {
    var cache = {};
    function loc(n) { if (!(n in cache)) cache[n] = gl.getUniformLocation(prog, n); return cache[n]; }
    return {
      f: function (n, v) { var l = loc(n); if (l) gl.uniform1f(l, v); },
      fv: function (n, v) { var l = loc(n); if (l) gl.uniform1fv(l, v); },
      v2: function (n, v) { var l = loc(n); if (l) gl.uniform2fv(l, v); },
      v3: function (n, v) { var l = loc(n); if (l) gl.uniform3fv(l, v); },
      v4: function (n, v) { var l = loc(n); if (l) gl.uniform4fv(l, v); },
      m3: function (n, v) { var l = loc(n); if (l) gl.uniformMatrix3fv(l, false, v); },
      i: function (n, v) { var l = loc(n); if (l) gl.uniform1i(l, v); }
    };
  }

  function lookAt(pos, tgt) {
    var f = norm([tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]]);
    var r = norm(cross(f, [0, 1, 0]));
    var u = cross(r, f);
    return { pos: pos, f: f, r: r, u: u };
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function mix(a, b, t) { return a + (b - a) * t; }
  function mixv(a, b, t) { return a.map(function (x, i) { return x + (b[i] - x) * t; }); }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

  function mount(root, def) {
    var api = { kick: function () {}, st: null };
    if (!root) return api;
    var P = params();
    /* insitu P1 for M4: m4.<key> wins over a bare <key> */
    Object.keys(P).forEach(function (k) { if (k.indexOf('m4.') === 0) P[k.slice(3)] = P[k]; });
    /* m4.<key> wins over a bare <key>, so moments sharing one page URL keep their own switches */
    Object.keys(P).forEach(function (k) { if (k.indexOf('m4.') === 0) P[k.slice(3)] = P[k]; });
    var TH = themeOf(root, params());
    var st = {
      P: P,
      theme: TH.theme, paper: TH.paper, paperRGB: TH.rgb.map(function (c) { return c / 255; }),
      drive: TH.drive, host: TH.drive === 'host', hostSet: false,
      hp: def.drive && def.drive.highlight ? def.drive.highlight.from : 0,
      look: P.look === 'p' ? 'p' : 's',
      reduced: ('still' in P) || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
      loop: 'loop' in P,
      poster: 'poster' in P,
      K: {}, S: {},
      t: 0, dt: 0, p: 0, ps: 0, beat: -1, w: 2, h: 2, aspect: 1, cssW: 0, cssH: 0,
      scale: def.startScale || 0.9, maxScale: 1, fps: 0
    };
    api.st = st;
    def.knobs.forEach(function (k) {
      st.K[k.key] = (P[k.key] != null && P[k.key] !== '' && isFinite(+P[k.key])) ? parseFloat(P[k.key]) : k.value;
    });
    (def.selects || []).forEach(function (k) {
      st.S[k.key] = (P[k.key] && k.options.indexOf(P[k.key]) >= 0) ? P[k.key] : k.value;
    });
    if ('theme' in st.S) st.S.theme = st.theme;
    if ('paper' in st.S) st.S.paper = st.paper;
    root.setAttribute('data-theme', st.theme);
    root.setAttribute('data-drive', st.drive);
    if (st.theme === 'light') {
      root.setAttribute('data-paper', st.paper);
      root.style.setProperty('--paper', '#' + st.paper);
      root.style.setProperty('--paper-rgb', TH.rgb.join(','));
    }
    root.setAttribute('data-look', st.look);
    if (st.poster) root.classList.add('is-poster');
    if (st.reduced) root.classList.add('is-still');

    var track = root.querySelector('.m4-track'), stage = root.querySelector('.m4-stage');
    var canvas = root.querySelector('canvas.m4-gl');
    var beatEls = root.querySelectorAll('[data-beat]'), pipEls = root.querySelectorAll('[data-pip]');
    if (def.init) def.init(st);

    function progress() {
      if (st.host) return st.hp;
      var r = track.getBoundingClientRect(), vh = window.innerHeight || 1, span = r.height - vh;
      return span > 0 ? clamp(-r.top / span, 0, 1) : 0;
    }
    function setBeat(i) {
      if (i === st.beat) return false;
      st.beat = i;
      root.setAttribute('data-beat', String(i + 1));
      Array.prototype.forEach.call(beatEls, function (el) { el.classList.toggle('on', +el.getAttribute('data-beat') === i + 1); });
      Array.prototype.forEach.call(pipEls, function (el) {
        var n = +el.getAttribute('data-pip');
        el.classList.toggle('on', n <= i + 1); el.classList.toggle('is-cur', n === i + 1);
      });
      if (def.onBeat) def.onBeat(st, i);
      return true;
    }
    function beatOf(p) { return Math.min(4, Math.floor(p * 5)); }

    /* drive=host: the page's clock calls set(p); start() and stop() switch the render loop */
    function expose(set, start, stop) {
      var d = def.drive || {};
      root.t4mDrive = { set: set, beats: d.beats || [], highlight: d.highlight || null, start: start, stop: stop };
      root.dispatchEvent(new CustomEvent('t4m:drive-ready'));
    }
    function hp(p) { st.hostSet = true; st.hp = clamp(+p || 0, 0, 1); }

    var gl = null;
    if (!('nogl' in P)) {
      try {
        gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false,
          premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      } catch (e) { gl = null; }
    }
    var progScene = gl && program(gl, VERT, typeof def.frag === 'function' ? def.frag(st) : def.frag);
    var progPost = gl && progScene && program(gl, VERT, POST);

    if (!gl || !progScene || !progPost) {
      root.classList.add('is-nogl');
      canvas.style.display = 'none';
      var onScrollNoGl = function () {
        st.p = st.ps = progress();
        if (def.overlay) def.overlay(st);
        setBeat(def.beatOf ? def.beatOf(st) : beatOf(st.p));
      };
      if (!st.host) window.addEventListener('scroll', onScrollNoGl, { passive: true });
      onScrollNoGl();
      if (st.host) expose(function (p) { hp(p); onScrollNoGl(); }, function () {}, function () {});
      return api;
    }

    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var tex = gl.createTexture(), fbo = gl.createFramebuffer();
    function allocTarget(W, H) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    var Us = uniforms(gl, progScene), Up = uniforms(gl, progPost);

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var cw = stage.clientWidth || 1, ch = stage.clientHeight || 1;
      var W = Math.max(2, Math.round(cw * dpr * st.scale)), H = Math.max(2, Math.round(ch * dpr * st.scale));
      if (W !== canvas.width || H !== canvas.height) { canvas.width = W; canvas.height = H; allocTarget(W, H); }
      st.w = W; st.h = H; st.aspect = W / H; st.cssW = cw; st.cssH = ch;
    }

    var live = false, pickBuf = new Uint8Array(4);
    function render() {
      resize();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, st.w, st.h);
      gl.useProgram(progScene);
      Us.v2('uRes', [st.w, st.h]);
      Us.f('uTime', st.t);
      Us.f('uLook', st.look === 'p' ? 0 : 1);
      Us.f('uPick', 0);
      def.uniforms(st, Us);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, st.w, st.h);
      gl.useProgram(progPost);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      Up.i('uTex', 0);
      Up.v2('uRes', [st.w, st.h]);
      Up.f('uTime', st.reduced ? 0 : st.t);
      Up.f('uMaxCoc', (st.K.blur == null ? 1 : st.K.blur) * (def.maxCoc || 12) * st.h / 900);
      var grain = typeof def.grain === 'function' ? def.grain(st) : def.grain;
      var vig = typeof def.vignette === 'function' ? def.vignette(st) : def.vignette;
      Up.f('uGrain', grain == null ? 0.03 : grain);
      Up.f('uVig', vig == null ? 0.35 : vig);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      /* picking: the scene shader again, into one pixel of the scene target */
      var pk = def.pick && def.pick(st);
      if (pk) {
        var px = clamp(Math.round(pk[0] * st.scale * Math.min(window.devicePixelRatio || 1, 1.5)), 0, st.w - 1);
        var py = clamp(st.h - 1 - Math.round(pk[1] * st.scale * Math.min(window.devicePixelRatio || 1, 1.5)), 0, st.h - 1);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.useProgram(progScene);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(px, py, 1, 1);
        Us.f('uPick', 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pickBuf);
        Us.f('uPick', 0);
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (def.onPick) def.onPick(st, pickBuf);
      }
      if (!live) {
        live = true;
        requestAnimationFrame(function () { root.classList.add('is-live'); });
      }
    }

    function step(dt) {
      st.p = progress();
      if (st.reduced || st.host) st.ps = st.p;
      else st.ps += (st.p - st.ps) * (1 - Math.exp(-dt * 4));
      if (def.step) def.step(st, dt);
      if (def.overlay) def.overlay(st);
      return setBeat(def.beatOf ? def.beatOf(st) : beatOf(st.ps));
    }

    var accT = 0, accN = 0, cool = 2, fpsEl = null, scaleEl = null;
    function measure(dt) {
      accT += dt; accN++;
      if (accN < 30) return;
      var avg = accT / accN * 1000; accT = 0; accN = 0;
      st.fps = 1000 / avg;
      if (fpsEl) { fpsEl.textContent = st.fps.toFixed(0); scaleEl.textContent = st.scale.toFixed(2); }
      root.setAttribute('data-fps', st.fps.toFixed(1));
      root.setAttribute('data-scale', st.scale.toFixed(2));
      if (cool > 0) { cool--; return; }
      if (avg > 24 && st.scale > 0.5) { st.scale = Math.max(0.5, st.scale * 0.85); cool = 2; }
      else if (avg < 17.8 && st.scale < st.maxScale) { st.scale = Math.min(st.maxScale, st.scale * 1.07); cool = 4; }
    }

    var raf = 0, last = 0, visible = true, running = true;
    function tick(now) {
      raf = 0;
      var dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 1 / 60;
      last = now;
      st.dt = dt; st.t += dt;
      step(dt);
      render();
      measure(dt);
      schedule();
    }
    function schedule() {
      if (!raf && visible && running && !document.hidden && !st.reduced) raf = requestAnimationFrame(tick);
      if (!visible || !running || document.hidden) last = 0;
    }

    var redraw = function (force) { if (step(0) || force) render(); };
    api.kick = function () { if (st.reduced) redraw(true); };

    if (st.reduced) {
      st.t = def.stillTime || 6;
      if (!st.host) window.addEventListener('scroll', function () { redraw(false); }, { passive: true });
      window.addEventListener('resize', function () { redraw(true); });
      redraw(true);
    } else {
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) { visible = es[0].isIntersecting; schedule(); }, { rootMargin: '100px' }).observe(track);
      }
      document.addEventListener('visibilitychange', schedule);
      step(0);
      render();
      schedule();
    }

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      if (raf) cancelAnimationFrame(raf);
      raf = 0; visible = false;
      root.classList.remove('is-live');
      root.classList.add('is-nogl');
    });

    if ('knobs' in P) panel();

    if (st.host) {
      // the box can change size (or go from hidden to shown) while no frame is coming: redraw then
      if ('ResizeObserver' in window) new ResizeObserver(function () { if (!raf && stage.clientWidth > 0) redraw(true); }).observe(stage);
      expose(function (p) {
        hp(p);
        if (!raf) { if (stage.clientWidth > 0) redraw(true); else step(0); }
      }, function () {
        running = true; schedule();
      }, function () {
        running = false;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        last = 0;
      });
    }

    function panel() {
      var el = document.createElement('div');
      el.className = 'm4-knobs';
      var h = '<div class="m4-knobs__h">' + def.name + ' · knobs</div>';
      h += '<div class="m4-knobs__row m4-knobs__look"><span>Look</span><span>' +
        '<button type="button" data-look="s">S stylised</button><button type="button" data-look="p">P photographic</button></span></div>';
      (def.selects || []).forEach(function (k) {
        h += '<label class="m4-knobs__row"><span>' + k.label + '</span><select data-s="' + k.key + '">' +
          k.options.map(function (o) { return '<option' + (o === st.S[k.key] ? ' selected' : '') + '>' + o + '</option>'; }).join('') +
          '</select></label>';
        if (k.hint) h += '<div class="m4-knobs__hint">' + k.hint + '</div>';
      });
      def.knobs.forEach(function (k) {
        h += '<label class="m4-knobs__row"><span>' + k.label + '<b data-v="' + k.key + '"></b></span>' +
          '<input type="range" min="' + k.min + '" max="' + k.max + '" step="' + k.step + '" value="' + st.K[k.key] + '" data-k="' + k.key + '"></label>';
        if (k.hint) h += '<div class="m4-knobs__hint">' + k.hint + '</div>';
      });
      h += '<div class="m4-knobs__row"><span>fps <b data-fps>-</b> · render scale <b data-scale>-</b></span></div>';
      h += '<button type="button" class="m4-knobs__copy" data-copy>Copy JSON</button>';
      el.innerHTML = h;
      root.appendChild(el);
      fpsEl = el.querySelector('[data-fps]'); scaleEl = el.querySelector('[data-scale]');
      function label(key) { var b = el.querySelector('[data-v="' + key + '"]'); if (b) b.textContent = ' ' + (+st.K[key]).toFixed(2); }
      function looks() {
        Array.prototype.forEach.call(el.querySelectorAll('[data-look]'), function (b) { b.classList.toggle('on', b.getAttribute('data-look') === st.look); });
      }
      def.knobs.forEach(function (k) { label(k.key); });
      looks();
      el.addEventListener('input', function (e) {
        var k = e.target.getAttribute('data-k'), s = e.target.getAttribute('data-s');
        if (k) { st.K[k] = parseFloat(e.target.value); label(k); if (def.onKnob) def.onKnob(st, k); }
        if (s) { st.S[s] = e.target.value; if (def.onKnob) def.onKnob(st, s); }
        if (st.reduced) render();
      });
      el.addEventListener('click', function (e) {
        var lk = e.target.getAttribute('data-look');
        if (lk) { st.look = lk; root.setAttribute('data-look', lk); looks(); if (st.reduced) render(); }
        if (e.target.hasAttribute('data-copy')) {
          var out = JSON.stringify({ look: st.look, knobs: st.K, selects: st.S }, null, 2);
          if (navigator.clipboard) navigator.clipboard.writeText(out);
          e.target.textContent = 'Copied';
          setTimeout(function () { e.target.textContent = 'Copy JSON'; }, 1200);
        }
      });
    }
    return api;
  }

  return { mount: mount, lookAt: lookAt, clamp: clamp, mix: mix, mixv: mixv, smooth: smooth, norm: norm, cross: cross };
})();

/* ============================================================================
   M4 · How the fuel moves · v5                                         -t4m
   ----------------------------------------------------------------------------
   Two clay dioramas on one navy table; the camera glides between them.

     Plinth A, metres (true to the canister):
       beat 1  an abstract frosted body (no vessel, no internals; v5: a flat-
               headed cylinder, like a battery) full of
               packed pebbles rising; a solid ecru ribbon loop carries them
               back to the bottom. A pebble steps one shade from gold to slate
               each time it leaves the top
       beat 2  a branch grows off the top of the loop; slate pebbles ride it
               and drop into a cut-open canister (0.30 x 1.82 m) that fills.
               The core keeps glowing and circulating
     Plinth B, toy units (one model, cask and cell drawn about 3x the hull):
       beat 3  a membrane LNG carrier at the pier, hull cut away at a shielded
               cell: a slate canister lowers into a cut-open cask, the 14th;
               a fresh cask (v4: the same cask, gold canisters) stands beside
               it; the used cask's lid comes down
       beat 4  the deck hatch opens; a shore crane lifts the slate cask out,
               slews and lays it on a truck, then lifts the gold cask from the
               pier and lowers it in. One continuous clockwise slew
       beat 5  the truck drives the slate cask along the road to a larger land
               plant; the receiving door glows

   Everything is one SDF (raw WebGL2, M4CORE = the M2/M3 runtime). Drag orbits
   with a spring back; hovering fuel lights every fresh or used item at once
   (exact, by reading back one pixel). Knobs: ?knobs, or any key in ?/#.

   v2 (Oct 5): a light theme, and no fresh/used key.
     theme=dark   the v1 shader string, unchanged (fragFor returns FRAG)
     theme=light  FRAG with the LIGHT patches below: a white architectural
                  model on a pale table on the page's paper; the paper sweep
                  is set in display space so open paper is exactly the hex
     knobs        table (pale | sweep | stone), clay (white | grey), shadow
     the legend (copy v3) is gone; the hover tags carry fresh and used
     drive=host   (CHAPTERS.md) the page's clock sets story progress; BEATS and
                  HIGHLIGHT below are what root.t4mDrive exposes

   v3 (Oct 21, client review of Oct 20): one canister design everywhere.
     The port canister (rack, cask, the 14th, the swap) is plinth A's canister
     at port scale: the same cut-open shell, window and top flange, sealed, and
     packed with pebbles (gold fresh, slate used) instead of a solid gold or
     slate cylinder. Port canisters are 1.2x v2's, pebbles in them are a
     symbolic size (bpeb), and the cell and swap holds are framed closer (pnear)

   v4 (Oct 21, Andrew): the cell's rack of loose fresh canisters is gone. In its
     place stands a second whole cask, built exactly like the used one (shell,
     window, bands, trunnions, lid) and holding 14 fresh port canisters. It is
     cask 2 of the same cask() SDF, so the used cask, the cell's fresh cask, the
     fresh cask the crane brings aboard and the used cask on the truck are one
     object, colour-coded only by contents: gold fresh, slate used

   v5 (Oct 24, Per's notes): the reactor's stand-in has flat top and bottom
     heads, not dished ones ("our reactors operate at low internal pressure,
     they have flat top and bottom heads, and look more like batteries than
     pressure vessels"). capSD is now a straight cylinder over the capsule's
     old extent (y 0.40 to 2.30, radius 0.40) with only its rims eased (CRIM);
     the packed bed inside fills that cylinder to the flat lids. Everything
     else is v4's. The copy says "at the pier" where it said "at the dock"
   ========================================================================= */
var root = document.getElementById('tsr-m4');
if (root && !root.__m4) {
  root.__m4 = true;
  (function () {
    var C = M4CORE, clamp = C.clamp, mix = C.mix, mixv = C.mixv, sm = C.smooth;
    var D2R = Math.PI / 180;
    function seg(x, a, b) { return clamp((x - a) / (b - a), 0, 1); }
    function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

    /* ---------------------------------------------------------------- world */
    // Plinth A (metres). Core axis x = CX, segment CY0..CY1, radius CR (v5: a flat-headed cylinder from CY0 - CR to CY1 + CR)
    var A = { CX: -0.75, CY0: 0.80, CY1: 1.90, CR: 0.40, LCX: -0.15, LCY: 1.35, LH: 0.55, LR: 0.60,
              RW: 0.05, RT: 0.018, KX: 1.35, KR: 0.15, KW: 0.012, KH: 1.82 };
    var OA = [0, 0.18, 0];
    var LOOPL = 2 * Math.PI * A.LR + 4 * A.LH;
    var THJ = 88 * D2R;                                  // branch junction on the top arc
    var SJ = A.LR * (Math.PI - THJ);
    var BZ = [[A.LCX + A.LR * Math.cos(THJ), A.LCY + A.LH + A.LR * Math.sin(THJ)], [A.KX, 2.48], [A.KX, 2.02]];
    // the canister's window faces roughly toward the camera
    var KWIN = -6 * D2R, KHALF = 54 * D2R;
    // Plinth B (toy units), placed in the world at OB, scale SB
    var SB = 0.42, OB = [7.2, 0.42, -2.2];
    var PC = [-3.35, -0.65];                             // crane slew axis (x, z)
    var HATCH = [-3.75, 1.6], CELLBASE = 0.08;
    var TRUCK0 = [-1.25, -1.9], GOLDPAD = [-5.0, -1.9], PADY = 0.58;
    var CKR = 0.22, HOOK = 1.47, LB = 2.75, PIVR = 0.25, PIVY = 2.45, LIFT = 2.0, REST = 4.0;
    // v3: port canisters are 1.2x v2's (R 0.0275, H 0.1665, ring 0.073, layer pitch 0.343) and keep plinth A's
    // 1:6 proportion; two layers of seven still fit the cask
    var CAN = { R: 0.033, H: 0.2, RING: 0.078, PITCH: 0.41 };
    // v4: the cell's fresh cask, where v3's rack stood (a little left of it, so its trunnions clear the cell wall).
    // Its window faces local +z, toward the beat 3 camera, as the used cask's does
    var FCELL = [-2.95, CELLBASE, 1.6];
    function wA(v) { return [v[0] + OA[0], v[1] + OA[1], v[2] + OA[2]]; }
    function wB(v) { return [OB[0] + v[0] * SB, OB[1] + v[1] * SB, OB[2] + v[2] * SB]; }

    // road: Catmull-Rom through the control points, sampled fine for the truck, coarse for the SDF
    var RCTL = [[-2.6, -1.9], [-1.25, -1.9], [1.0, -1.9], [2.7, -1.92], [3.9, -2.15], [4.75, -2.75], [5.35, -3.22], [6.4, -3.32]];
    var RFINE = (function () {
      var pts = [], P = [RCTL[0]].concat(RCTL, [RCTL[RCTL.length - 1]]);
      for (var i = 1; i < P.length - 2; i++) {
        for (var k = 0; k < 16; k++) {
          var t = k / 16, t2 = t * t, t3 = t2 * t, p = [0, 0];
          for (var c = 0; c < 2; c++) {
            p[c] = 0.5 * (2 * P[i][c] + (-P[i - 1][c] + P[i + 1][c]) * t + (2 * P[i - 1][c] - 5 * P[i][c] + 4 * P[i + 1][c] - P[i + 2][c]) * t2 +
                          (-P[i - 1][c] + 3 * P[i][c] - 3 * P[i + 1][c] + P[i + 2][c]) * t3);
          }
          pts.push(p);
        }
      }
      pts.push(RCTL[RCTL.length - 1]);
      var acc = [0];
      for (var j = 1; j < pts.length; j++) acc.push(acc[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
      return { pts: pts, acc: acc, len: acc[acc.length - 1] };
    })();
    function roadAt(s) {
      var a = RFINE.acc, p = RFINE.pts, i = 1;
      s = clamp(s, 0, RFINE.len - 1e-4);
      while (i < a.length - 1 && a[i] < s) i++;
      var f = (s - a[i - 1]) / Math.max(1e-6, a[i] - a[i - 1]);
      var x = mix(p[i - 1][0], p[i][0], f), z = mix(p[i - 1][1], p[i][1], f);
      return { x: x, z: z, h: Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]) };
    }
    var ROAD12 = [];
    for (var ri = 0; ri < 12; ri++) { var rp = roadAt(RFINE.len * ri / 11); ROAD12.push(rp.x, rp.z); }
    var S_T0 = (function () { var best = 0, bd = 1e9; for (var s = 0; s < RFINE.len; s += 0.01) { var r = roadAt(s), d = Math.hypot(r.x - TRUCK0[0], r.z - TRUCK0[1]); if (d < bd) { bd = d; best = s; } } return best; })();
    var S_T1 = RFINE.len - 1.5;

    /* ---------------------------------------------------------------- colour */
    function lin(hex) {
      var n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) { return Math.pow(c / 255, 2.2); });
    }
    function v3(a) { return 'vec3(' + a.map(function (x) { return x.toFixed(5); }).join(',') + ')'; }
    var COL = { NAVY: '#022434', DEEP: '#0A1626', DEEPEST: '#050D18', LIFT: '#142A44', GOLD: '#E1AB25', ECRU: '#F5F1E8',
                ROCK: '#E8E0CC', FIORD: '#4D5A6E', BALI: '#8A99AD', GRAPH: '#3A3D42' };
    var colDefs = Object.keys(COL).map(function (k) { return 'const vec3 ' + k + ' = ' + v3(lin(COL[k])) + ';'; }).join('\n');
    function f(x) { return (+x).toFixed(5); }
    function rot2(v, a) { var c = Math.cos(a), s = Math.sin(a); return [c * v[0] - s * v[1], s * v[0] + c * v[1]]; }
    // window wedge normals (xz) for the canister: centre direction (sin, cos) of KWIN
    var kdir = [Math.sin(KWIN), Math.cos(KWIN)];
    var KM1 = rot2(kdir, KHALF - Math.PI / 2), KM2 = rot2(kdir, Math.PI / 2 - KHALF);
    // and for the casks: local +z, half angle 50 deg (v3: 58, so more of the canisters inside show)
    var CM1 = rot2([0, 1], 58 * D2R - Math.PI / 2), CM2 = rot2([0, 1], Math.PI / 2 - 58 * D2R);
    // v3: and for the port canisters: local +z, the same half angle as plinth A's canister
    var KN1 = rot2([0, 1], KHALF - Math.PI / 2), KN2 = rot2([0, 1], Math.PI / 2 - KHALF);

    var DEFS = [
      '#define PI 3.14159265',
      '#define CX ' + f(A.CX), '#define CY0 ' + f(A.CY0), '#define CY1 ' + f(A.CY1), '#define CR ' + f(A.CR),
      '#define LCX ' + f(A.LCX), '#define LCY ' + f(A.LCY), '#define LH ' + f(A.LH), '#define LR ' + f(A.LR),
      '#define RW ' + f(A.RW), '#define RT ' + f(A.RT), '#define LOOPL ' + f(LOOPL), '#define SJ ' + f(SJ),
      '#define KX ' + f(A.KX), '#define KR ' + f(A.KR), '#define KW ' + f(A.KW),
      '#define BZA vec2(' + f(BZ[0][0]) + ',' + f(BZ[0][1]) + ')', '#define BZB vec2(' + f(BZ[1][0]) + ',' + f(BZ[1][1]) + ')',
      '#define BZC vec2(' + f(BZ[2][0]) + ',' + f(BZ[2][1]) + ')',
      '#define KM1 vec2(' + f(KM1[0]) + ',' + f(KM1[1]) + ')', '#define KM2 vec2(' + f(KM2[0]) + ',' + f(KM2[1]) + ')',
      '#define CM1 vec2(' + f(CM1[0]) + ',' + f(CM1[1]) + ')', '#define CM2 vec2(' + f(CM2[0]) + ',' + f(CM2[1]) + ')',
      '#define CKR ' + f(CKR), '#define CANR ' + f(CAN.R), '#define CANH ' + f(CAN.H), '#define RING ' + f(CAN.RING),
      '#define CPITCH ' + f(CAN.PITCH),
      '#define KN1 vec2(' + f(KN1[0]) + ',' + f(KN1[1]) + ')', '#define KN2 vec2(' + f(KN2[0]) + ',' + f(KN2[1]) + ')',
      '#define HX ' + f(HATCH[0]), '#define HZ ' + f(HATCH[1]),
      '#define PCX ' + f(PC[0]), '#define PCZ ' + f(PC[1]),
      '#define GPX ' + f(GOLDPAD[0]), '#define GPZ ' + f(GOLDPAD[1]),
      colDefs
    ].join('\n');

    /* ---------------------------------------------------------------- shader */
    var FRAG = '#version 300 es\nprecision highp float;\nprecision highp int;\n' + DEFS + '\n' + `
out vec4 oCol;
uniform vec2 uRes;
uniform float uTime, uLook, uPick;
uniform vec3 uCamPos, uCamF, uCamR, uCamU;
uniform float uFocal, uOrtho, uOrthoH, uPixAng;
uniform vec2 uShift;
uniform float uFocus, uAperture, uExposure;
uniform vec3 uKeyDir, uKeyCol;
uniform vec4 uSpot;
uniform float uCode, uRound, uHover, uHoverK, uGlow;
uniform vec3 uOA;
uniform float uPebR, uFlowT, uFlowN, uCoreT, uGrow, uFill;
uniform vec4 uArr[3];
uniform vec4 uFall[6];
uniform vec3 uOB; uniform float uSB;
uniform vec3 uCaskP[3]; uniform mat3 uCaskM[3]; uniform vec4 uCaskS[3];
uniform vec4 uLow;
uniform float uHatch;
uniform vec3 uCrPiv, uCrTip, uHook; uniform float uCrYaw;
uniform vec4 uTruck;
uniform vec2 uRoad[12];
uniform float uDoor, uDbg, uShowA, uShowB;
uniform float uBPeb;

#define M_PLINTH 1.0
#define M_ECRU 2.0
#define M_PEB 3.0
#define M_FROST 4.0
#define M_CANSH 5.0
#define M_CAN 6.0
#define M_CASK 7.0
#define M_CASKB 8.0
#define M_WATER 9.0
#define M_WCUT 10.0
#define M_LAND 11.0
#define M_ROAD 12.0
#define M_HULL 13.0
#define M_DECK 14.0
#define M_DARK 15.0
#define M_WHITE 16.0
#define M_ROOF 17.0
#define M_CONC 18.0
#define M_GLOW 19.0
#define M_TREE 20.0
#define M_CRANE 21.0
#define M_TYRE 22.0

/* gD steps the march (bounding boxes included); gDR is real geometry only, and is what the shadow
   penumbra and the AO read, so a bounding box never casts a false soft shadow */
float gD, gDR, gM, gA;
bool gSh;
void U(float d, float m, float a){ gDR = min(gDR, d); if (d < gD){ gD = d; gM = m; gA = a; } }
void UB(float d, float m, float a){ U(d * uSB, m, a); }
void UE(float d, float m){ if (d < gD){ gD = d; gM = m; gA = -1.0; } }
void UBE(float d, float m){ UE(d * uSB, m); }

/* ---------------- helpers */
float hash3(vec3 p){
  uvec3 u = uvec3(ivec3(floor(p)) + 32768);
  uint h = u.x * 1597334677u ^ u.y * 3812015801u ^ u.z * 2798796415u;
  h = (h ^ (h >> 15u)) * 2246822519u; h ^= h >> 13u;
  return float(h) * (1.0 / 4294967295.0);
}
float vn(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdRB(vec3 p, vec3 b, float r){ r = min(r, min(b.x, min(b.y, b.z))); return sdBox(p, b - r) - r; }
float sdBox2(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdCylY(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float sdRCylY(vec3 p, float r, float h, float rr){ rr = min(rr, min(r, h)); vec2 d = vec2(length(p.xz) - r + rr, abs(p.y) - h + rr); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - rr; }
float sdSeg(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0); return length(pa - ba * h) - r; }
float extr(float d2, float py, float h, float r){ vec2 w = vec2(d2 + r, abs(py) - h + r); return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - r; }
vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
float sdTriI(vec2 p, vec2 q){
  p.x = abs(p.x);
  vec2 a = p - q * clamp(dot(p, q) / dot(q, q), 0.0, 1.0);
  vec2 b = p - q * vec2(clamp(p.x / q.x, 0.0, 1.0), 1.0);
  float s = -sign(q.y);
  vec2 d = min(vec2(dot(a, a), s * (p.x * q.y - p.y * q.x)), vec2(dot(b, b), s * (p.y - q.y)));
  return -sqrt(d.x) * sign(d.y);
}
vec2 sdBez(vec2 pos, vec2 A, vec2 B, vec2 Cc){
  vec2 a = B - A, b = A - 2.0 * B + Cc, c = a * 2.0, d = A - pos;
  float kk = 1.0 / dot(b, b), kx = kk * dot(a, b), ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0, kz = kk * dot(d, a);
  float res, tt;
  float p = ky - kx * kx, p3 = p * p * p, q = kx * (2.0 * kx * kx - 3.0 * ky) + kz, h = q * q + 4.0 * p3;
  if (h >= 0.0){
    h = sqrt(h); vec2 x = (vec2(h, -h) - q) / 2.0; vec2 uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
    tt = clamp(uv.x + uv.y - kx, 0.0, 1.0); vec2 qq = d + (c + b * tt) * tt; res = dot(qq, qq);
  } else {
    float z = sqrt(-p), v = acos(q / (p * z * 2.0)) / 3.0, m = cos(v), n = sin(v) * 1.732050808;
    vec3 t3 = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
    vec2 qx = d + (c + b * t3.x) * t3.x, qy = d + (c + b * t3.y) * t3.y;
    float dx = dot(qx, qx), dy = dot(qy, qy);
    if (dx < dy){ res = dx; tt = t3.x; } else { res = dy; tt = t3.y; }
  }
  return vec2(sqrt(res), tt);
}
vec2 bezAt(float t){ return BZA + 2.0 * (BZB - BZA) * t + (BZA - 2.0 * BZB + BZC) * t * t; }

/* ================================================================ plinth A */
/* v5 (Per, Oct 24): flat top and bottom heads, like a battery. A straight cylinder over the v4 capsule's extent
   (y CY0 - CR to CY1 + CR), its two rims eased by CRIM so they catch a highlight */
#define CYM (0.5 * (CY0 + CY1))
#define CHH (0.5 * (CY1 - CY0) + CR)
#define CRIM 0.045
float capSD(vec3 q){ return sdRCylY(q - vec3(CX, CYM, 0.0), CR, CHH, CRIM); }
float ribbon(float dl, float z){ float rr = min(0.012 * uRound + 0.003, RT); vec2 w = vec2(dl + rr, abs(z) - RT + rr); return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - rr; }
float sOf(vec2 q){
  if (q.y > LH) return LR * (PI - atan(q.y - LH, q.x));
  if (q.y < -LH) return PI * LR + 2.0 * LH - LR * atan(q.y + LH, q.x);
  if (q.x > 0.0) return PI * LR + (LH - q.y);
  return 2.0 * PI * LR + 2.0 * LH + (q.y + LH);
}
vec2 posOf(float s){
  float a1 = PI * LR;
  if (s < a1){ float th = PI - s / LR; return vec2(LR * cos(th), LH + LR * sin(th)); }
  s -= a1;
  if (s < 2.0 * LH) return vec2(LR, LH - s);
  s -= 2.0 * LH;
  if (s < a1){ float th = -s / LR; return vec2(LR * cos(th), -LH + LR * sin(th)); }
  s -= a1;
  return vec2(-LR, -LH + s);
}
float stageOf(float id, float lap){ return mod(floor(hash3(vec3(id, 7.0, 3.0)) * 6.0) + lap, 6.0) / 5.0; }
void beadsLoop(vec3 q, vec2 lq){
  float r = uPebR, N = uFlowN, ds = LOOPL / N;
  float fT = uFlowT, n = floor(fT / ds), fr = fT - n * ds;
  float s = sOf(lq);
  float k0 = floor((s - fr) / ds);
  for (int j = -1; j <= 1; j++){
    float k = k0 + float(j);
    float sc = (k + 0.5) * ds + fr;
    float sw = mod(sc, LOOPL);
    vec2 c2 = posOf(sw) + vec2(LCX, LCY);
    vec3 c = vec3(c2, RT + r * 0.72);
    if (capSD(c) < r * 0.6) continue;
    float id = mod(k - n, N);
    float S = (id + 0.5) * ds + fT;
    float st = stageOf(id, floor(S / LOOPL));
    if (uGrow > 0.98 && st > 0.99 && sw > SJ) continue;
    U(length(q - c) - r, M_PEB, st);
  }
}
void branch(vec3 q){
  vec2 bz = sdBez(q.xy, BZA, BZB, BZC);
  float d2 = bz.x;
  if (bz.y > uGrow) d2 = length(q.xy - bezAt(uGrow));
  float dl = d2 - RW * 0.85;
  if (dl > 0.3) { U(dl, M_ECRU, -1.0); return; }
  U(ribbon(dl, q.z), M_ECRU, -1.0);
  if (gSh || dl > uPebR * 3.0) return;
  float r = uPebR, Lb = 1.78, ds = 2.6 * r, fr = mod(uFlowT, ds);
  float k0 = floor((bz.y * Lb - fr) / ds);
  for (int j = -1; j <= 1; j++){
    float tc = ((k0 + float(j) + 0.5) * ds + fr) / Lb;
    if (tc < 0.04 || tc > min(uGrow, 0.995)) continue;
    vec3 c = vec3(bezAt(tc), RT + r * 0.72);
    U(length(q - c) - r, M_PEB, 1.0);
  }
}
void arrow(vec3 q, vec4 ar, float sc){
  if (dot(ar.zw, ar.zw) < 0.25) return;
  vec2 a = q.xy - ar.xy;
  vec2 lp = vec2(dot(a, ar.zw), dot(a, vec2(-ar.w, ar.z)));
  float d2 = sdTriI(vec2(lp.y, 0.075 * sc - lp.x), vec2(0.085, 0.13) * sc);
  U(extr(d2, q.z, RT * 1.35, 0.008), M_ECRU, -1.0);
}
/* packed pebbles: square layers, alternate layers offset half a pitch (fcc) */
float latCan(vec3 cq){
  float r = uPebR, a = 2.0 * r, hl = a * 0.70710678, rin = KR - KW - r * 1.02, y0 = 0.03 + r;
  float best = 1e9;
  float j0 = floor((cq.y - y0) / hl + 0.5);
  for (int dj = -1; dj <= 1; dj++){
    float j = j0 + float(dj);
    float yc = y0 + j * hl;
    if (j < 0.0 || yc > uFill) continue;
    vec2 off = mod(j, 2.0) > 0.5 ? vec2(r) : vec2(0.0);
    vec2 c2 = floor((cq.xz - off) / a + 0.5) * a + off;
    if (length(c2) > rin) continue;
    best = min(best, length(cq - vec3(c2.x, yc, c2.y)) - r);
  }
  return min(best, r * 0.9);
}
float latCore(vec3 q, out vec3 cen, out float stg){
  float r = uPebR, a = 2.0 * r, hl = a * 0.70710678;
  vec3 c = q - vec3(CX, 0.0, 0.0);
  float j0 = floor((c.y - uCoreT) / hl + 0.5);
  float best = 1e9; cen = vec3(0.0); stg = 0.0;
  for (int dj = -1; dj <= 1; dj++){
    float j = j0 + float(dj);
    vec2 off = mod(j, 2.0) > 0.5 ? vec2(r) : vec2(0.0);
    vec2 g = floor((c.xz - off) / a + 0.5);
    vec3 cc = vec3(g.x * a + off.x, j * hl + uCoreT, g.y * a + off.y);
    float din = max(length(cc.xz) - (CR - 0.014 - r), abs(cc.y - CYM) - (CHH - 0.014 - r));   // v5: the flat-headed cylinder
    if (din > 0.0) continue;
    float d = length(c - cc) - r;
    if (d < best){ best = d; cen = cc + vec3(CX, 0.0, 0.0); stg = floor(hash3(vec3(g, j)) * 6.0) / 5.0; }
  }
  return min(best, r * 0.9);
}
void canister(vec3 cq){
  float outer = sdRCylY(cq - vec3(0.0, 0.91, 0.0), KR, 0.91, 0.01);
  float inner = sdCylY(cq - vec3(0.0, 0.98, 0.0), KR - KW, 0.95);
  float sh = max(outer, -inner);
  float fl = max(sdRCylY(cq - vec3(0.0, 1.80, 0.0), KR + 0.016, 0.022, 0.008), -inner);
  sh = min(sh, fl);
  float w = max(-dot(cq.xz, KM1), -dot(cq.xz, KM2));
  float win = max(w, abs(cq.y - 0.935) - 0.80);
  U(max(sh, -win), -win > sh ? M_ECRU : M_CANSH, -1.0);
  if (cq.y < uFill + uPebR * 2.0 && length(cq.xz) < KR){
    if (gSh) U(max(length(cq.xz) - KR + KW, abs(cq.y - uFill * 0.5) - uFill * 0.5), M_PEB, 1.0);
    else U(latCan(cq), M_PEB, 1.0);
  }
}
void mapA(vec3 q){
  U(sdRB(q - vec3(0.15, -0.09, 0.0), vec3(1.62, 0.09, 0.82), 0.045 * uRound + 0.008), M_PLINTH, -1.0);
  float dc = capSD(q);
  U(gSh ? dc + 0.12 : dc, M_FROST, -1.0);
  vec2 lq = q.xy - vec2(LCX, LCY);
  float dl = abs(length(vec2(lq.x, max(abs(lq.y) - LH, 0.0))) - LR) - RW;
  if (dl < 0.25){
    U(max(ribbon(dl, q.z), -(dc - 0.003)), M_ECRU, -1.0);
    if (!gSh && dl < uPebR * 3.0 && q.z > 0.0) beadsLoop(q, lq);
  } else UE(dl, M_ECRU);
  if (uGrow > 0.001){
    float bbr = sdBox(q - vec3(0.62, 2.25, 0.0), vec3(0.86, 0.38, 0.09));
    if (bbr < 0.05) branch(q); else UE(bbr, M_ECRU);
  }
  arrow(q, uArr[0], 1.0); arrow(q, uArr[1], 1.0); arrow(q, uArr[2], 0.85);
  vec3 cq = q - vec3(KX, 0.0, 0.0);
  float bc = sdBox(cq - vec3(0.0, 0.93, 0.0), vec3(0.2, 0.95, 0.2));
  if (bc < 0.08) canister(cq); else UE(bc, M_CANSH);
  if (!gSh) for (int i = 0; i < 6; i++) if (uFall[i].w > 0.5) U(length(q - uFall[i].xyz) - uPebR, M_PEB, 1.0);
}

/* ================================================================ plinth B */
const vec3 CAVC = vec3(-3.45, 0.79, 1.6), CAVH = vec3(1.0, 0.71, 0.75);
const vec3 CUTC = vec3(-3.45, 1.09, 3.1), CUTH = vec3(1.15, 1.11, 0.9);
/* v3 · the port canister: plinth A's canister() at port scale (cut-open shell, window, top flange), sealed, and
   packed with pebbles at a symbolic size (uBPeb x its radius) so they read at this scale. p is from the canister's
   centre (y -CANH..CANH) and its window faces local +z. aux is the fuel code: 0 fresh gold, 1 used slate. The shell
   carries the code too, so hovering anywhere on a canister shows its tag */
#define CWALL (CANR * 0.13)
float latMini(vec3 p){
  float r = CANR * uBPeb, a = 2.0 * r, hl = a * 0.70710678, rin = CANR - CWALL - r * 1.02;
  float y0 = -CANH + CWALL * 1.2 + r, y1 = CANH - CWALL * 1.2 - r;
  float best = 1e9, j0 = floor((p.y - y0) / hl + 0.5);
  for (int dj = -1; dj <= 1; dj++){
    float j = j0 + float(dj), yc = y0 + j * hl;
    if (j < 0.0 || yc > y1) continue;
    vec2 off = mod(j, 2.0) > 0.5 ? vec2(r) : vec2(0.0);
    vec2 c2 = floor((p.xz - off) / a + 0.5) * a + off;
    if (length(c2) > rin) continue;
    best = min(best, length(p - vec3(c2.x, yc, c2.y)) - r);
  }
  return min(best, r * 0.9);
}
void canMini(vec3 p, float aux){
  float bb = sdCylY(p, CANR * 1.12, CANH + 0.004);
  if (bb > 0.03){ UBE(bb, M_CANSH); return; }
  float outer = sdRCylY(p, CANR, CANH, CANR * 0.3);
  float inner = sdCylY(p, CANR - CWALL, CANH - CWALL * 1.2);
  float sh = max(outer, -inner);
  float fl = max(sdRCylY(p - vec3(0.0, CANH - CANR * 0.2, 0.0), CANR * 1.107, CANR * 0.147, CANR * 0.053), -inner);
  sh = min(sh, fl);
  float w = max(-dot(p.xz, KN1), -dot(p.xz, KN2));
  float win = max(w, abs(p.y + CANH * 0.03) - CANH * 0.84);
  UB(max(sh, -win), -win > sh ? M_ECRU : M_CANSH, aux);
  if (length(p.xz) < CANR - CWALL * 0.5 && abs(p.y) < CANH){
    if (gSh) UB(max(length(p.xz) - CANR + CWALL, abs(p.y) - CANH + CWALL * 1.2), M_PEB, aux);
    else UB(latMini(p), M_PEB, aux);
  }
}
void cask(int i, vec3 q){
  vec3 lq = (q - uCaskP[i]) * uCaskM[i];
  vec4 S = uCaskS[i];
  float bb = sdBox(lq - vec3(0.0, 0.78 + max(S.w, 0.0) * 0.5, 0.0), vec3(0.36, 0.8 + max(S.w, 0.0) * 0.5, 0.33));
  if (bb > 0.15){ UBE(bb, M_CASK); return; }
  float body = sdRCylY(lq - vec3(0.0, 0.53, 0.0), CKR, 0.53, 0.045 * uRound + 0.01);
  float cav = sdCylY(lq - vec3(0.0, 0.84, 0.0), CKR * 0.735, 0.66);
  body = max(body, -cav);
  float bands = sdRCylY(vec3(lq.x, abs(lq.y - 0.53) - 0.24, lq.z), CKR + 0.011, 0.035, 0.008);
  float w = max(-dot(lq.xz, CM1), -dot(lq.xz, CM2));
  float win = max(w, abs(lq.y - 0.575) - 0.44);
  float db = max(body, -win);
  UB(db, -win > body ? M_ECRU : M_CASK, S.y);
  UB(max(bands, -win), M_CASKB, S.y);
  vec3 tq = vec3(abs(lq.x) - CKR - 0.02, abs(lq.y - 0.55) - 0.40, lq.z);
  UB(sdRCylY(tq.yxz, 0.042, 0.035, 0.012), M_DARK, -1.0);
  if (S.w > -0.5) UB(sdRCylY(lq - vec3(0.0, 1.13 + S.w, 0.0), CKR, 0.07, 0.03 * uRound + 0.008), M_CASK, S.y);
  // canisters: centre plus a ring of six, two high; slot 13 (top layer, front) is the last in.
  // v3: each is the port canister, its window facing the cask's own window (local +z)
  float creg = max(length(lq.xz) - RING - CANR * 1.2, abs(lq.y - (0.19 + CPITCH * 0.5 + CANH)) - CPITCH * 0.5 - CANH - 0.01);
  if (creg > 0.02) UBE(creg, M_CAN);
  else {
    float L = clamp(floor((lq.y - 0.18) / CPITCH), 0.0, 1.0);
    float yc = 0.19 + CANH + L * CPITCH;
    float an = atan(lq.x, lq.z), sec = floor(an / (PI / 3.0) + 0.5);
    float ang = sec * PI / 3.0;
    vec2 rc = RING * vec2(sin(ang), cos(ang));
    float idx = L * 7.0 + 1.0 + mod(mod(sec, 6.0) + 5.0, 6.0);
    if (idx < S.x - 0.5) canMini(lq - vec3(rc.x, yc, rc.y), S.y);
    if (L * 7.0 < S.x - 0.5) canMini(lq - vec3(0.0, yc, 0.0), S.y);
  }
  if (S.z > 0.5){
    float yw = max(S.w, 0.0);
    UB(sdRB(lq - vec3(0.0, 1.38 + yw, 0.0), vec3(CKR + 0.07, 0.03, 0.03), 0.012), M_CRANE, -1.0);
    UB(sdRB(vec3(abs(lq.x) - CKR - 0.06, lq.y - 1.17 - yw, lq.z), vec3(0.016, 0.22, 0.026), 0.008), M_CRANE, -1.0);
  }
}
void ship(vec3 q, float cb){
  vec3 s = q - vec3(-1.5, 0.0, 1.6);
  float stern = sdBox2(s.xz - vec2(-1.75, 0.0), vec2(3.75, 1.1) - 0.45) - 0.45;
  float bow = (length((s.xz - vec2(2.0, 0.0)) / vec2(3.5, 1.1)) - 1.0) * 1.0;
  float hull = extr(min(stern, bow), s.y - 0.575, 1.175, 0.12 * uRound + 0.02);
  float cav = sdBox(q - CAVC, CAVH);
  float hh = sdBox(q - vec3(HX, 1.7, HZ), vec3(0.31, 0.3, 0.31));
  float cp = sdCylY(q - vec3(HX, 1.7, HZ + RING), 0.05, 0.3);
  float holes = min(cav, min(hh, cp));
  float d = max(hull, -holes); float m = -holes > hull ? M_CONC : M_HULL;
  float dc = max(d, -cb); if (-cb > d) m = M_ECRU;
  UB(dc, m, -1.0);
  // trunk deck (membrane LNG carrier), small domes
  UB(sdRB(q - vec3(0.4, 1.85, 1.6), vec3(2.6, 0.12, 0.72), 0.05 * uRound + 0.01), M_DECK, -1.0);
  vec3 dq = vec3(q.x - 0.4 - clamp(floor((q.x - 0.4) / 1.6 + 0.5), -1.0, 1.0) * 1.6, q.y - 2.02, q.z - 1.6);
  UB(sdRCylY(dq, 0.14, 0.06, 0.03), M_DECK, -1.0);
  // accommodation, bridge, mast
  UB(sdRB(q - vec3(-6.0, 2.25, 1.6), vec3(0.66, 0.52, 0.86), 0.07 * uRound + 0.015), M_WHITE, -1.0);
  UB(sdRB(q - vec3(-5.7, 2.87, 1.6), vec3(0.36, 0.11, 1.06), 0.04 * uRound + 0.01), M_WHITE, -1.0);
  UB(sdSeg(q, vec3(-5.95, 2.95, 1.6), vec3(-5.95, 3.5, 1.6), 0.025), M_DARK, -1.0);
  // hatch coaming and its sliding cover
  float co = max(sdBox(q - vec3(HX, 1.79, HZ), vec3(0.39, 0.05, 0.39)), -sdBox(q - vec3(HX, 1.79, HZ), vec3(0.31, 0.3, 0.31)));
  UB(co, M_ECRU, -1.0);
  UB(sdRB(q - vec3(HX + 0.82 * uHatch, 1.87, HZ), vec3(0.37, 0.035, 0.37), 0.02), M_DECK, -1.0);
}
void cell(vec3 q){
  // v4: no rack; the cell's fresh cask is cask 2, drawn by cask() in mapB with the other two.
  // the canister being lowered, on its cable from the roof port
  if (uLow.w > 0.5){
    canMini(q - uLow.xyz, 1.0);
    UB(sdSeg(q, vec3(uLow.x, 1.5, uLow.z), uLow.xyz + vec3(0.0, CANH, 0.0), 0.006), M_DARK, -1.0);
  }
}
void crane(vec3 q){
  vec3 c = q - vec3(PCX, 0.5, PCZ);
  UB(sdRCylY(c - vec3(0.0, 0.07, 0.0), 0.36, 0.07, 0.03), M_CRANE, -1.0);
  UB(sdRCylY(c - vec3(0.0, 0.85, 0.0), 0.2, 0.81, 0.04), M_CRANE, -1.0);
  vec2 hx = rot(c.xz, -uCrYaw);
  vec3 hq = vec3(hx.x, c.y, hx.y);
  UB(sdRB(hq - vec3(-0.06, 1.92, 0.0), vec3(0.46, 0.21, 0.28), 0.08 * uRound + 0.02), M_CRANE, -1.0);
  UB(sdRB(hq - vec3(0.22, 1.96, 0.21), vec3(0.14, 0.1, 0.075), 0.03), M_WHITE, -1.0);
  vec3 apex = vec3(PCX, 0.5, PCZ) + vec3(cos(uCrYaw) * -0.32, 2.6, sin(uCrYaw) * -0.32);
  UB(sdSeg(q, vec3(PCX, 0.5, PCZ) + vec3(cos(uCrYaw) * -0.32, 2.1, sin(uCrYaw) * -0.32), apex, 0.045), M_CRANE, -1.0);
  UB(sdSeg(q, apex, uCrTip, 0.014), M_DARK, -1.0);
  vec3 ba = uCrTip - uCrPiv; float L = length(ba); vec3 ax = ba / L;
  vec3 sd = vec3(-sin(uCrYaw), 0.0, cos(uCrYaw)), up = normalize(cross(sd, ax));
  vec3 pq = q - uCrPiv; float along = dot(pq, ax);
  float hb = mix(0.1, 0.055, clamp(along / L, 0.0, 1.0));
  UB(sdRB(vec3(along - L * 0.5, dot(pq, up), dot(pq, sd)), vec3(L * 0.5, hb, 0.07), 0.03 * uRound + 0.012), M_CRANE, -1.0);
  UB(length(q - uCrTip) - 0.075, M_ECRU, -1.0);
  UB(sdSeg(q, uCrTip, uHook, 0.011), M_DARK, -1.0);
  UB(sdRB(q - uHook - vec3(0.0, 0.07, 0.0), vec3(0.05, 0.07, 0.05), 0.02), M_ECRU, -1.0);
}
void truck(vec3 q){
  vec2 rel = q.xz - uTruck.xy; float hd = uTruck.z;
  vec2 fw = vec2(cos(hd), sin(hd));
  vec3 tq = vec3(dot(rel, fw), q.y - 0.5, dot(rel, vec2(-fw.y, fw.x)));
  float bb = sdBox(tq - vec3(0.2, 0.34, 0.0), vec3(1.4, 0.4, 0.34));
  if (bb > 0.15){ UBE(bb, M_DARK); return; }
  UB(sdRB(tq - vec3(-0.08, 0.14, 0.0), vec3(1.02, 0.035, 0.25), 0.015), M_DARK, -1.0);
  UB(sdRB(vec3(abs(tq.x + 0.15) - 0.42, tq.y - 0.205, tq.z), vec3(0.055, 0.045, 0.2), 0.015), M_ECRU, -1.0);
  UB(sdRB(tq - vec3(1.13, 0.31, 0.0), vec3(0.23, 0.25, 0.26), 0.08 * uRound + 0.02), M_WHITE, -1.0);
  UB(sdRB(tq - vec3(1.345, 0.39, 0.0), vec3(0.03, 0.085, 0.2), 0.02), M_DARK, -1.0);
  float wx = clamp(floor((tq.x + 0.82) / 0.24 + 0.5), 0.0, 1.0) * 0.24 - 0.82;
  vec3 wq = vec3(tq.x - wx, tq.y - 0.085, abs(tq.z) - 0.21);
  UB(sdRCylY(wq.xzy, 0.085, 0.045, 0.02), M_TYRE, -1.0);
  wq.x = tq.x - 1.13;
  UB(sdRCylY(wq.xzy, 0.085, 0.045, 0.02), M_TYRE, -1.0);
}
const vec2 TREES[8] = vec2[8](vec2(2.9, -3.2), vec2(3.5, -3.95), vec2(2.1, -4.3), vec2(0.8, -3.55), vec2(-0.3, -4.2),
                              vec2(1.6, -2.9), vec2(-1.6, -3.4), vec2(4.6, -1.6));
void plant(vec3 q){
  UB(sdRB(q - vec3(8.0, 1.6, -3.25), vec3(1.05, 1.1, 1.25), 0.12 * uRound + 0.02), M_WHITE, -1.0);
  UB(sdRB(q - vec3(8.0, 2.74, -3.25), vec3(0.93, 0.07, 1.12), 0.05 * uRound + 0.01), M_ROOF, -1.0);
  UB(sdRB(q - vec3(5.85, 1.0, -4.38), vec3(1.25, 0.5, 0.42), 0.08 * uRound + 0.02), M_WHITE, -1.0);
  UB(sdRB(q - vec3(5.85, 1.52, -4.38), vec3(1.18, 0.05, 0.36), 0.04), M_ROOF, -1.0);
  float rc = sdRB(q - vec3(6.62, 0.86, -3.3), vec3(0.42, 0.36, 0.5), 0.06 * uRound + 0.015);
  float door = sdBox(q - vec3(6.2, 0.8, -3.3), vec3(0.08, 0.3, 0.36));
  UB(max(rc, -door), -door > rc ? M_GLOW : M_WHITE, -1.0);
}
void trees(vec3 q){
  float best = 1e9; vec2 bp = vec2(0.0);
  for (int i = 0; i < 8; i++){ float d = length(q.xz - TREES[i]); if (d < best){ best = d; bp = TREES[i]; } }
  vec3 tq = vec3(q.x - bp.x, q.y - 0.5, q.z - bp.y);
  UB(length(tq - vec3(0.0, 0.34, 0.0)) - 0.17, M_TREE, -1.0);
  UB(sdSeg(tq, vec3(0.0), vec3(0.0, 0.2, 0.0), 0.04), M_DARK, -1.0);
}
float roadD(vec2 xz){
  float d = 1e9;
  for (int i = 0; i < 11; i++){ vec2 a = uRoad[i], b = uRoad[i + 1], pa = xz - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); d = min(d, length(pa - ba * h)); }
  return d;
}
void mapB(vec3 q){
  UB(sdRB(q - vec3(1.0, -0.25, -2.5), vec3(8.5, 0.75, 2.5), 0.1 * uRound + 0.02), M_LAND, -1.0);
  float brd = sdBox(q - vec3(1.95, 0.5, -2.6), vec3(4.75, 0.04, 1.05));
  if (brd < 0.05) UB(extr(roadD(q.xz) - 0.3, q.y - 0.5, 0.016, 0.008), M_ROAD, -1.0); else UBE(brd, M_ROAD);
  // fenders on the pier wall, bollards on its edge (each centred in its own repeat cell)
  float bfd = sdBox(q - vec3(-1.5, 0.35, -0.07), vec3(5.6, 0.3, 0.2));
  if (bfd < 0.05){
    float fx = q.x - (clamp(floor((q.x + 0.35) / 1.4 + 0.5), -4.0, 3.0) * 1.4 - 0.35);
    float bx = q.x - (clamp(floor(q.x / 1.4 + 0.5), -4.0, 3.0) * 1.4);
    UB(sdRB(vec3(fx, q.y - 0.24, q.z - 0.02), vec3(0.08, 0.13, 0.05), 0.03), M_DARK, -1.0);
    UB(sdRCylY(vec3(bx, q.y - 0.56, q.z + 0.16), 0.045, 0.06, 0.02), M_DARK, -1.0);
  } else UBE(bfd, M_DARK);
  float cb = sdBox(q - CUTC, CUTH);
  float dw = sdRB(q - vec3(1.0, -0.5, 1.7), vec3(8.5, 0.5, 1.7), 0.06 * uRound + 0.01);
  UB(max(dw, -cb), -cb > dw ? M_WCUT : M_WATER, -1.0);
  float bs = sdBox(q - vec3(-1.5, 1.4, 1.6), vec3(5.65, 2.15, 1.25));
  if (bs < 0.25) ship(q, cb); else UBE(bs, M_HULL);
  float bcell = sdBox(q - CAVC, CAVH);
  if (bcell < 0.1) cell(q); else UBE(bcell, M_CONC);
  cask(0, q); cask(1, q); cask(2, q);
  UB(sdRB(q - vec3(GPX, 0.54, GPZ), vec3(0.42, 0.04, 0.32), 0.02), M_DARK, -1.0);
  float bcr = sdCylY(q - vec3(PCX, 2.1, PCZ), 2.8, 2.65);
  if (bcr < 0.2) crane(q); else UBE(bcr, M_CRANE);
  truck(q);
  float bp = sdBox(q - vec3(6.9, 1.6, -3.3), vec3(2.45, 1.3, 1.65));
  if (bp < 0.2) plant(q); else UBE(bp, M_WHITE);
  float bt = sdBox(q - vec3(1.5, 0.85, -3.0), vec3(3.4, 0.4, 1.65));
  if (bt < 0.2) trees(q); else UBE(bt, M_TREE);
}

float map(vec3 p){
  gD = 1e9; gDR = 1e9; gM = 0.0; gA = -1.0;
  vec3 qa = p - uOA;
  float bA = sdBox(qa - vec3(0.15, 1.27, 0.0), vec3(1.7, 1.48, 0.88));
  if (uShowA < 0.5) UE(max(bA, 0.5), M_PLINTH); else if (bA < 0.2) mapA(qa); else UE(bA, M_PLINTH);
  vec3 qb = (p - uOB) / uSB;
  float bB = sdBox(qb - vec3(1.0, 1.8, -0.8), vec3(8.6, 2.9, 4.3)) * uSB;
  if (uShowB < 0.5) UE(max(bB, 0.5), M_LAND); else if (bB < 0.2) mapB(qb); else UE(bB, M_LAND);
  return gD;
}

vec3 calcN(vec3 p, float e){
  vec3 n = vec3(0.0);
  int Z = int(min(uTime, 0.0));
  for (int i = Z; i < 4; i++){
    vec3 k = 0.5773 * (2.0 * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.0);
    n += k * map(p + k * e);
  }
  return normalize(n);
}
float softSh(vec3 ro, vec3 rd){
  gSh = true;
  float res = 1.0, t = 0.012;
  for (int i = 0; i < 64; i++){
    float h = map(ro + rd * t);
    res = min(res, 6.0 * gDR / t);
    t += clamp(h, 0.006, 0.22);
    if (res < 0.004 || t > 7.0) break;
  }
  gSh = false;
  return clamp(res, 0.0, 1.0);
}
float calcAO(vec3 p, vec3 n){
  gSh = true;
  float occ = 0.0, w = 1.0;
  int Z = int(min(uTime, 0.0));
  for (int i = Z; i < 5; i++){
    float h = 0.012 + 0.11 * float(i) / 4.0;
    map(p + n * h);
    occ += (h - gDR) * w; w *= 0.72;
  }
  gSh = false;
  return clamp(1.0 - 3.2 * occ, 0.0, 1.0);
}

/* ================================================================ shading */
vec3 codeCol(float a, vec3 neutral){ return mix(neutral, mix(GOLD, BALI, a), uCode); }
float classOf(float a){ return a < -0.5 ? 0.0 : (a < 0.15 ? 1.0 : (a > 0.85 ? 3.0 : 2.0)); }
const vec3 FILL = vec3(0.30, 0.42, 0.62);
vec3 glowP(){ return uOA + vec3(CX, 1.35, 0.0); }
vec3 lightUp(vec3 p, vec3 n, vec3 rd, vec3 alb, float rough, float spec, float wrap, float sh, float ao){
  vec3 L = uKeyDir;
  float spot = mix(0.3, 1.0, smoothstep(uSpot.w * 2.0, uSpot.w * 0.5, length(p - uSpot.xyz)));
  float kd = max((dot(n, L) + wrap) / (1.0 + wrap), 0.0) * sh * spot;
  vec3 Lf = normalize(vec3(0.8, 0.25, 0.55));
  float fd = clamp(dot(n, Lf) * 0.6 + 0.4, 0.0, 1.0);
  vec3 amb = mix(NAVY * 1.6, LIFT * 2.6, n.y * 0.5 + 0.5);
  vec3 col = alb * (uKeyCol * kd * 2.95 + FILL * fd * 0.36 * ao + amb * ao * 0.82);
  vec3 h = normalize(L - rd);
  float shin = exp2(10.0 * (1.0 - rough) + 1.0);
  col += uKeyCol * pow(max(dot(n, h), 0.0), shin) * (shin + 8.0) / 25.0 * spec * sh * spot * 0.5;
  float fr = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
  col += mix(LIFT * 2.0, uKeyCol * 0.6, 0.25) * fr * ao * (0.35 + spec);
  vec3 qb = (p - uOB) / uSB;
  if (sdBox(qb - vec3(-3.45, 0.79, 1.6), vec3(1.05, 0.76, 0.8)) < 0.0){
    vec3 wl = vec3(-3.2, 1.42, 2.25) - qb; float wd = dot(wl, wl);
    col += alb * mix(ECRU, GOLD, 0.35) * 1.5 * max(dot(n, normalize(wl)) * 0.7 + 0.3, 0.0) / (1.0 + wd * 1.6) * ao;
  }
  vec3 gp = glowP() - p; float gd = dot(gp, gp);
  col += alb * GOLD * uGlow * 0.55 * max(dot(n, normalize(gp)) * 0.5 + 0.5, 0.0) / (1.0 + gd * 7.0) * ao;
  return col;
}
vec3 bumpN(vec3 n, vec3 p, float f, float a){
  if (a <= 0.0) return n;
  vec3 x = p * f; float e = 0.35;
  float v0 = vn(x) + 0.5 * vn(x * 2.3 + 11.0);
  vec3 g = vec3(vn(x + vec3(e, 0, 0)) + 0.5 * vn((x + vec3(e, 0, 0)) * 2.3 + 11.0),
                vn(x + vec3(0, e, 0)) + 0.5 * vn((x + vec3(0, e, 0)) * 2.3 + 11.0),
                vn(x + vec3(0, 0, e)) + 0.5 * vn((x + vec3(0, 0, e)) * 2.3 + 11.0)) - v0;
  g /= e;
  return normalize(n - (g - n * dot(g, n)) * a);
}

vec3 surf(vec3 p, vec3 n0, vec3 rd, float t, float mat, float aux){
  vec3 alb = ROCK, emis = vec3(0.0); float rough = 0.78, spec = 0.12;
  float wrap = mix(0.06, 0.32, uLook);
  float bA = mix(0.03, 0.07, uLook), bF = mix(90.0, 26.0, uLook);
  vec3 qa = p - uOA, qb = (p - uOB) / uSB;
  bool inA = p.x < 3.0;
  vec3 n = n0;
  float S = uLook;
  if (abs(mat - M_PLINTH) < 0.5 || abs(mat - M_LAND) < 0.5){
    bool top = n0.y > 0.6;
    float ytop = inA ? qa.y : (qb.y - 0.5) * uSB;
    alb = top ? mix(LIFT, FIORD, 0.42) : mix(DEEP, LIFT, 0.75);
    if (!top && ytop > -0.022) alb = ECRU * 0.85;
    if (!inA && top && qb.z > -1.25) alb = mix(ROCK, FIORD, 0.62) * 0.85;
    if (!inA && top && qb.z > -0.1) alb = ECRU * 0.7;
    if (!inA && !top && qb.z > -0.2 && n0.z > 0.6 && qb.y > 0.0) alb = mix(ROCK, FIORD, 0.62);
    rough = 0.85; bA *= 0.6;
  } else if (abs(mat - M_ECRU) < 0.5){ alb = ECRU * 0.88; rough = 0.7;
  } else if (abs(mat - M_CANSH) < 0.5){ alb = ROCK * 0.9; rough = mix(0.45, 0.6, S); spec = mix(0.45, 0.2, S);
  } else if (abs(mat - M_PEB) < 0.5){
    alb = codeCol(aux, GRAPH * 1.3); rough = mix(0.62, 0.5, S); spec = mix(0.22, 0.25, S); bA = mix(0.12, 0.05, S); bF = mix(260.0, 80.0, S);
    emis = GOLD * 0.05 * (1.0 - aux) * uCode * S;
  } else if (abs(mat - M_CAN) < 0.5){
    alb = codeCol(aux, ROCK * 0.75); rough = mix(0.4, 0.55, S); spec = mix(0.5, 0.25, S); bA *= 0.5;
  } else if (abs(mat - M_CASK) < 0.5){
    alb = mix(mix(GRAPH, FIORD, 0.25) * 1.15, mix(GRAPH, FIORD, 0.35), S); rough = mix(0.42, 0.7, S); spec = mix(0.5, 0.18, S);
  } else if (abs(mat - M_CASKB) < 0.5){
    alb = codeCol(aux, ROCK * 0.7); rough = 0.55; spec = 0.25;
  } else if (abs(mat - M_WATER) < 0.5){
    alb = mix(LIFT, NAVY, 0.35) * 1.2; rough = mix(0.12, 0.28, S); spec = mix(1.2, 0.9, S); bA = mix(0.06, 0.03, S); bF = 7.0;
  } else if (abs(mat - M_WCUT) < 0.5){ alb = mix(NAVY, LIFT, 0.5) * 0.95; rough = 0.5; spec = 0.25;
  } else if (abs(mat - M_ROAD) < 0.5){ alb = ROCK * 0.72; rough = 0.9;
  } else if (abs(mat - M_HULL) < 0.5){
    alb = mix(mix(GRAPH, FIORD, 0.2), mix(GRAPH, FIORD, 0.38), S); rough = mix(0.5, 0.75, S); spec = mix(0.35, 0.14, S);
    if (qb.y > 1.6) alb = ECRU * 0.8;
    else if (qb.y < 0.12) alb = mix(LIFT, DEEP, 0.3);
    if (n0.y > 0.8) alb = mix(FIORD, DEEP, 0.35);
  } else if (abs(mat - M_DECK) < 0.5){ alb = mix(FIORD, LIFT, 0.3) * 1.1; rough = 0.8;
  } else if (abs(mat - M_DARK) < 0.5){ alb = mix(GRAPH, DEEP, 0.35); rough = 0.6; spec = 0.25;
  } else if (abs(mat - M_TYRE) < 0.5){ alb = DEEPEST * 1.6; rough = 0.9;
  } else if (abs(mat - M_CRANE) < 0.5){ alb = mix(mix(GRAPH, FIORD, 0.3), mix(GRAPH, FIORD, 0.55), S); rough = mix(0.45, 0.72, S); spec = mix(0.4, 0.15, S);
  } else if (abs(mat - M_WHITE) < 0.5){
    alb = ROCK * 0.88; rough = 0.8;
    // window bands on the accommodation and the plant, dark with a faint warm light
    float wb = 0.0;
    if (!inA && qb.x < -5.3 && qb.x > -6.7 && abs(qb.y - 2.5) < 0.06 && n0.y < 0.5) wb = 1.0;
    if (!inA && qb.x > 6.9 && abs(qb.y - 2.2) < 0.06 && abs(n0.y) < 0.5) wb = 1.0;
    if (wb > 0.5){ alb = DEEP; emis = mix(ECRU, vec3(1.0, 0.62, 0.3), 0.3) * 0.45; rough = 0.3; spec = 0.4; }
  } else if (abs(mat - M_ROOF) < 0.5){ alb = mix(GRAPH, FIORD, 0.45); rough = 0.85;
  } else if (abs(mat - M_CONC) < 0.5){ alb = mix(ROCK, FIORD, 0.32); rough = 0.9; bA *= 0.6;
  } else if (abs(mat - M_GLOW) < 0.5){ alb = DEEP; emis = mix(ECRU, vec3(1.0, 0.62, 0.3), 0.32) * (0.3 + 0.85 * uDoor) * (0.75 + 0.25 * smoothstep(1.1, 0.55, qb.y));
  } else if (abs(mat - M_TREE) < 0.5){ alb = mix(FIORD, ROCK, 0.3); rough = 0.95; bA = 0.12; bF = 14.0;
  }
  n = bumpN(n0, inA ? qa : qb * 0.42, bF, bA);
  float sh = softSh(p + n0 * 0.004, uKeyDir);
  float ao = calcAO(p + n0 * 0.001, n0);
  vec3 col = lightUp(p, n, rd, alb, rough, spec, wrap, sh, ao);
  if (abs(mat - M_WATER) < 0.5){
    vec3 rf = reflect(rd, n);
    col += mix(DEEP, LIFT * 2.2, smoothstep(-0.1, 0.6, rf.y)) * 0.25;
  }
  col += emis;
  float cls = classOf(aux);
  if (cls > 0.5 && abs(cls - uHover) < 0.5){
    vec3 cc = mix(GOLD, BALI, clamp(aux, 0.0, 1.0));
    col = col * (1.0 + 0.55 * uHoverK) + cc * 0.10 * uHoverK;
  }
  return col;
}

/* the frosted core (v5: flat-headed): a milky shell over the rising packed bed, glowing softly from inside */
vec3 frost(vec3 p, vec3 n, vec3 rd, out float cls){
  vec3 q = p - uOA;
  float t = 0.002; bool hit = false; vec3 cen = vec3(0.0); float stg = 0.0;
  for (int i = 0; i < 72; i++){
    vec3 x = q + rd * t;
    float d = latCore(x, cen, stg);
    if (d < 0.0005){ hit = true; break; }
    t += d;
    if (t > 0.03 && capSD(x) > 0.004) break;
  }
  float nv = max(dot(n, -rd), 0.0), fr = pow(1.0 - nv, 2.2);
  vec3 glowC = mix(GOLD, vec3(1.0, 0.5, 0.18), 0.4);
  float sh = softSh(p + n * 0.01, uKeyDir);
  // light reaching the bed through the frost: the shell's own facing to the key, softened
  float thru = (max(dot(n, uKeyDir), 0.0) * 0.75 + 0.25) * mix(0.55, 1.0, sh);
  vec3 inside;
  cls = 0.0;
  if (hit){
    vec3 x = q + rd * t, pn = normalize(x - cen);
    vec3 alb = codeCol(stg, GRAPH * 1.3);
    float deep = exp(-t * 9.0);
    float kd = max(dot(pn, uKeyDir), 0.0) * 0.6 + 0.4;
    float axis = exp(-dot(x.xz - vec2(CX, 0.0), x.xz - vec2(CX, 0.0)) / (CR * CR * 0.5));
    inside = alb * (uKeyCol * kd * thru * 1.6 + LIFT * 0.7 + glowC * uGlow * 0.35 * axis) * (0.4 + 0.6 * deep);
    inside += glowC * uGlow * (0.08 + 0.34 * axis) * (1.0 - deep);
    inside += uKeyCol * pow(max(dot(reflect(rd, pn), uKeyDir), 0.0), 20.0) * 0.2 * thru;
    cls = classOf(stg);
    if (cls > 0.5 && abs(cls - uHover) < 0.5) inside *= 1.0 + 0.55 * uHoverK;
  } else inside = glowC * uGlow * 0.3;
  // milky shell: bright at grazing angles, a soft sheen from the key
  vec3 milk = mix(ECRU, ROCK, 0.5);
  vec3 shell = milk * (uKeyCol * thru * 0.85 + LIFT * 1.6) ;
  shell += uKeyCol * pow(max(dot(n, normalize(uKeyDir - rd)), 0.0), 40.0) * 0.55 * sh;
  float veil = mix(0.18, 0.24, uLook) + 0.55 * fr;
  vec3 col = mix(inside, shell, veil);
  col += glowC * uGlow * 0.11 * nv;
  return col;
}

vec3 sky(vec3 rd){ return mix(DEEPEST, DEEP * 1.1, smoothstep(-0.3, 0.4, rd.y)); }

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y + uShift;
  vec3 ro, rd;
  if (uOrtho > 0.5){ ro = uCamPos + (uCamR * uv.x + uCamU * uv.y) * uOrthoH * 2.0; rd = uCamF; }
  else { ro = uCamPos; rd = normalize(uCamF * uFocal + uCamR * uv.x + uCamU * uv.y); }
  gSh = false;
  float tT = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float tMax = min(tT, 90.0);
  float t = 0.0; bool hit = false;
  for (int i = 0; i < 160; i++){
    float d = map(ro + rd * t);
    float eps = uOrtho > 0.5 ? uPixAng * 0.4 : max(0.00025, t * uPixAng * 0.4);
    if (d < eps){ hit = true; break; }
    t += d * 0.92;
    if (t > tMax) break;
  }
  float mat = gM, aux = gA;
  vec3 col; float tt; float cls = 0.0;
  if (hit){
    vec3 p = ro + rd * t;
    float e = uOrtho > 0.5 ? uPixAng * 0.5 : max(0.0003, t * uPixAng * 0.5);
    vec3 n = calcN(p, e);
    if (abs(mat - M_FROST) < 0.5) col = frost(p, n, rd, cls);
    else { col = surf(p, n, rd, t, mat, aux); cls = classOf(aux); }
    tt = t;
  } else if (tT < 1e4){
    vec3 p = ro + rd * tT; tt = tT;
    vec3 n = vec3(0.0, 1.0, 0.0);
    float sh = softSh(p + n * 0.002, uKeyDir);
    float ao = calcAO(p, n);
    vec3 alb = mix(NAVY, LIFT, 0.55) * 1.25 * mix(1.0, 0.92, vn(p * 3.0));
    col = lightUp(p, n, rd, alb, 0.9, 0.05, 0.0, sh, ao);
  } else { col = sky(rd); tt = 90.0; }
  float fogT = uOrtho > 0.5 ? max(tt - (uFocus - 6.0), 0.0) : tt;
  col = mix(col, sky(rd) * 0.9, 1.0 - exp(-max(fogT - 9.0, 0.0) * 0.07));
  if (uPick > 0.5){ oCol = vec4(cls / 255.0, 0.0, 0.0, 1.0); return; }
  if (uDbg > 0.5 && hit){ vec3 p = ro + rd * t; vec3 n = calcN(p, 0.001); float s1 = softSh(p + n * 0.004, uKeyDir); float a1 = calcAO(p + n * 0.001, n);
    oCol = vec4(uDbg > 1.5 ? vec3(a1) : vec3(s1, max(dot(n, uKeyDir), 0.0), 0.0), 1.0); return; }
  col *= uExposure;
  col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
  col = pow(col, vec3(1.0 / 2.2));
  float coc = clamp(uAperture * (1.0 - uFocus / tt), -1.0, 1.0);
  oCol = vec4(col, coc * 0.5 + 0.5);
}
`;

    /* ---------------------------------------------------------------- light theme */
    // theme=dark compiles FRAG exactly as v1 built it. theme=light compiles FRAG with these patches: each one
    // replaces one exact, unique piece of the v1 source (a missing or doubled match throws, so a v1 edit can't
    // silently drop a patch). Colours are sRGB hex, linearised like COL.
    //   FRESH  fresh gold, a step deeper than brand gold #E1AB25, which sits at about 1.9:1 on paper
    //   USED   used slate, a step deeper than Bali Hai #8A99AD, so it stays slate, not pale grey
    var COLL = { FRESH: '#D69A12', USED: '#7F8FA5' };
    var LIGHT_HEAD = [
      'uniform vec3 uPaper;',
      'uniform float uShadow, uTable, uClay;',
      '#define SOFTK 3.6',
      'const vec3 FRESH = ' + v3(lin(COLL.FRESH)) + ';',
      'const vec3 USED = ' + v3(lin(COLL.USED)) + ';',
      'const vec3 SKYL = vec3(0.80, 0.84, 0.90);',
      'const vec3 NAVYS = vec3(0.00784, 0.14118, 0.20392);',
      'const vec3 WCLAY = vec3(0.78, 0.775, 0.76);',
      'vec3 PAPL(){ return pow(uPaper, vec3(2.2)); }',
      ''
    ].join('\n');
    var LIGHT_UP = `vec3 lightUp(vec3 p, vec3 n, vec3 rd, vec3 alb, float rough, float spec, float wrap, float sh, float ao){
  // light: one soft studio key over a gentle sky dome and paper bounce; no navy ambient or rim
  vec3 L = uKeyDir;
  float spot = mix(0.82, 1.0, smoothstep(uSpot.w * 2.0, uSpot.w * 0.5, length(p - uSpot.xyz)));
  // the shadow knob trades sky for key, so lit faces hold their tone and only the shade deepens
  float aos = mix(1.0, ao, mix(0.5, 1.0, uShadow));
  float kd = max((dot(n, L) + wrap) / (1.0 + wrap), 0.0) * sh * spot;
  vec3 Lf = normalize(vec3(0.8, 0.25, 0.55));
  float fd = clamp(dot(n, Lf) * 0.6 + 0.4, 0.0, 1.0);
  vec3 amb = mix(PAPL() * vec3(1.0, 0.96, 0.9) * 0.6, SKYL, n.y * 0.5 + 0.5);
  vec3 col = alb * (uKeyCol * kd * mix(0.42, 0.9, uShadow) + vec3(0.85, 0.9, 1.0) * fd * 0.18 * aos + amb * aos * mix(0.95, 0.55, uShadow));
  vec3 h = normalize(L - rd);
  float shin = exp2(10.0 * (1.0 - rough) + 1.0);
  col += uKeyCol * pow(max(dot(n, h), 0.0), shin) * (shin + 8.0) / 25.0 * spec * sh * spot * 0.5;
  float fr = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
  col += SKYL * fr * aos * (0.06 + 0.25 * spec);
  vec3 qb = (p - uOB) / uSB;
  if (sdBox(qb - vec3(-3.45, 0.79, 1.6), vec3(1.05, 0.76, 0.8)) < 0.0){
    // the cell's work light: on paper an additive warm white vanishes, so the cell is dimmed a little
    // and the light is a saturated warm pool
    vec3 wl = vec3(-3.2, 1.42, 2.25) - qb; float wd = dot(wl, wl);
    float wk = max(dot(n, normalize(wl)) * 0.7 + 0.3, 0.0) / (1.0 + wd * 1.6) * ao;
    col *= 0.8;
    col += alb * vec3(1.0, 0.6, 0.22) * 1.0 * wk;
  }
  // the core's glow: a warm cast (multiplied, so it shows on white clay) plus a little saturated light
  vec3 gp = glowP() - p; float gd = dot(gp, gp);
  float gk = uGlow * max(dot(n, normalize(gp)) * 0.5 + 0.5, 0.0) / (1.0 + gd * 7.0) * ao;
  col = mix(col, col * vec3(1.0, 0.68, 0.34), clamp(gk * 1.1, 0.0, 0.8));
  col += alb * vec3(1.0, 0.5, 0.12) * gk * 0.3;
  // the land plant's receiving door spills warm light onto the road as the truck arrives
  vec3 dq = qb - vec3(5.9, 0.55, -3.3); float dd = dot(dq, dq);
  col += alb * vec3(1.0, 0.66, 0.36) * uDoor * 0.8 / (1.0 + dd * 4.0) * step(qb.x, 6.15);
  return col;
}
`;
    var LIGHT_ALB = `  // ---- light: a white architectural model on a pale table (uTable 0 pale, 1 sweep, 2 stone; uClay 0 white, 1 grey)
  {
    vec3 tab = uTable < 0.5 ? WCLAY * vec3(0.86, 0.865, 0.88) : (uTable < 1.5 ? PAPL() * 0.86 : vec3(0.36, 0.365, 0.37));
    float gc = uClay;
    if (abs(mat - M_PLINTH) < 0.5 || abs(mat - M_LAND) < 0.5){
      bool top = n0.y > 0.6;
      alb = tab;
      if (!inA && top && qb.z > -1.25) alb = tab * vec3(0.88, 0.885, 0.9);
      if (!inA && top && qb.z > -0.1) alb = WCLAY;
      if (!inA && !top && qb.z > -0.2 && n0.z > 0.6 && qb.y > 0.0) alb = tab * 0.78;
    } else if (abs(mat - M_ECRU) < 0.5){ alb = WCLAY;
    } else if (abs(mat - M_CANSH) < 0.5){ alb = WCLAY * 0.96;
    } else if (abs(mat - M_CASK) < 0.5){ alb = mix(vec3(0.55, 0.555, 0.56), vec3(0.07, 0.075, 0.08), gc);
    } else if (abs(mat - M_WATER) < 0.5){ alb = vec3(0.42, 0.5, 0.56);
    } else if (abs(mat - M_WCUT) < 0.5){ alb = vec3(0.3, 0.37, 0.43);
    } else if (abs(mat - M_ROAD) < 0.5){ alb = mix(vec3(0.30), vec3(0.20), gc);
    } else if (abs(mat - M_HULL) < 0.5){
      alb = mix(vec3(0.6, 0.605, 0.61), vec3(0.085, 0.09, 0.1), gc);
      if (qb.y > 1.6) alb = WCLAY;
      else if (qb.y < 0.12) alb *= 0.82;
      if (n0.y > 0.8) alb = mix(vec3(0.62), vec3(0.2), gc);
    } else if (abs(mat - M_DECK) < 0.5){ alb = mix(vec3(0.66, 0.665, 0.67), vec3(0.22, 0.23, 0.25), gc);
    } else if (abs(mat - M_DARK) < 0.5){ alb = vec3(0.07, 0.075, 0.085);
    } else if (abs(mat - M_TYRE) < 0.5){ alb = vec3(0.03);
    } else if (abs(mat - M_CRANE) < 0.5){ alb = mix(vec3(0.62, 0.625, 0.63), vec3(0.1, 0.105, 0.115), gc);
    } else if (abs(mat - M_WHITE) < 0.5){ if (dot(emis, emis) < 1e-6) alb = WCLAY; else { alb = vec3(0.01, 0.03, 0.05); emis *= 0.6; }
    } else if (abs(mat - M_ROOF) < 0.5){ alb = mix(vec3(0.5, 0.505, 0.51), vec3(0.16, 0.165, 0.175), gc);
    } else if (abs(mat - M_CONC) < 0.5){ alb = mix(vec3(0.5, 0.49, 0.47), vec3(0.3), gc);
    } else if (abs(mat - M_GLOW) < 0.5){ alb = vec3(0.01, 0.03, 0.05); emis = vec3(1.0, 0.66, 0.36) * (0.05 + 1.8 * uDoor) * (0.75 + 0.25 * smoothstep(1.1, 0.55, qb.y));
    } else if (abs(mat - M_TREE) < 0.5){ alb = mix(WCLAY * 0.94, vec3(0.3), gc);
    }
  }
`;
    var LIGHT_FROST = `vec3 frost(vec3 p, vec3 n, vec3 rd, out float cls){
  vec3 q = p - uOA;
  float t = 0.002; bool hit = false; vec3 cen = vec3(0.0); float stg = 0.0;
  for (int i = 0; i < 72; i++){
    vec3 x = q + rd * t;
    float d = latCore(x, cen, stg);
    if (d < 0.0005){ hit = true; break; }
    t += d;
    if (t > 0.03 && capSD(x) > 0.004) break;
  }
  float nv = max(dot(n, -rd), 0.0), fr = pow(1.0 - nv, 2.2);
  // light: a pale glow is invisible on paper, so the core reads as a saturated amber heart seen through milky frost
  vec3 glowC = vec3(1.0, 0.6, 0.16);
  vec3 warm = vec3(1.0, 0.8, 0.52);
  float sh = softSh(p + n * 0.01, uKeyDir);
  float thru = (max(dot(n, uKeyDir), 0.0) * 0.75 + 0.25) * mix(0.55, 1.0, sh);
  vec3 inside;
  cls = 0.0;
  float axis = 0.0;
  if (hit){
    vec3 x = q + rd * t, pn = normalize(x - cen);
    vec3 alb = codeCol(stg, GRAPH * 1.3);
    float deep = exp(-t * 9.0);
    float kd = max(dot(pn, uKeyDir), 0.0) * 0.6 + 0.4;
    axis = exp(-dot(x.xz - vec2(CX, 0.0), x.xz - vec2(CX, 0.0)) / (CR * CR * 0.5));
    inside = alb * (uKeyCol * kd * thru * 1.1 + SKYL * 0.55) * (0.5 + 0.5 * deep);
    inside = mix(inside, inside * warm, clamp(uGlow * (0.2 + 0.5 * axis), 0.0, 0.9));
    inside += glowC * uGlow * (0.12 + 0.55 * axis) * (1.0 - 0.6 * deep);
    inside += uKeyCol * pow(max(dot(reflect(rd, pn), uKeyDir), 0.0), 20.0) * 0.2 * thru;
    cls = classOf(stg);
    if (cls > 0.5 && abs(cls - uHover) < 0.5) inside = inside * (1.0 + 0.3 * uHoverK) + mix(FRESH, USED, stg) * 0.25 * uHoverK;
  } else inside = glowC * uGlow * 0.2;
  vec3 shell = WCLAY * (uKeyCol * thru * 0.75 + SKYL * 0.62);
  shell += uKeyCol * pow(max(dot(n, normalize(uKeyDir - rd)), 0.0), 40.0) * 0.55 * sh;
  float veil = mix(0.3, 0.36, uLook) + 0.5 * fr;
  vec3 col = mix(inside, shell, veil);
  col += glowC * uGlow * 0.1 * nv * nv;
  return col;
}

`;
    var LIGHT_MAIN = `  } else if (tT < 1e4){
    vec3 p = ro + rd * tT; tt = tT;
    vec3 n = vec3(0.0, 1.0, 0.0);
    float sh = softSh(p + n * 0.002, uKeyDir);
    float ao = calcAO(p, n);
    // the paper sweep, in display space: open paper is exactly the page's paper; shadows tint it toward navy
    float occ = clamp((1.0 - sh) * mix(0.12, 0.3, uShadow) + (1.0 - ao) * mix(0.22, 0.46, uShadow), 0.0, 0.6);
    paperCol = mix(uPaper, NAVYS, occ);
    onPaper = true;
  } else { onPaper = true; tt = 90.0; }
  float fogT = uOrtho > 0.5 ? max(tt - (uFocus - 6.0), 0.0) : tt;
  float fog = 1.0 - exp(-max(fogT - 9.0, 0.0) * 0.07);
  if (uPick > 0.5){ oCol = vec4(cls / 255.0, 0.0, 0.0, 1.0); return; }
  if (uDbg > 0.5 && hit){ vec3 p = ro + rd * t; vec3 n = calcN(p, 0.001); float s1 = softSh(p + n * 0.004, uKeyDir); float a1 = calcAO(p + n * 0.001, n);
    oCol = vec4(uDbg > 1.5 ? vec3(a1) : vec3(s1, max(dot(n, uKeyDir), 0.0), 0.0), 1.0); return; }
  if (onPaper) col = paperCol;
  else {
    // light: near-linear with a soft shoulder above 0.8, so the white clay keeps its tonal steps
    col *= uExposure;
    col = mix(col, 0.8 + 0.2 * (1.0 - exp(-(col - 0.8) / 0.2)), step(0.8, col));
    col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  }
  col = mix(col, uPaper, fog);
`;
    function once(s, a) {
      var i = s.indexOf(a);
      if (i < 0 || s.indexOf(a, i + 1) >= 0) throw new Error('m4 light patch did not match exactly once: ' + a.slice(0, 48));
      return i;
    }
    function rep(s, a, b) { var i = once(s, a); return s.slice(0, i) + b + s.slice(i + a.length); }
    function repTo(s, a, z, b) { var i = once(s, a), j = s.indexOf(z, i); if (j < 0) throw new Error('m4 light patch end: ' + z); return s.slice(0, i) + b + s.slice(j); }
    function fragFor(st) {
      if (st.theme !== 'light') return FRAG;
      var s = FRAG;
      s = rep(s, 'uniform float uDoor, uDbg, uShowA, uShowB;\n', 'uniform float uDoor, uDbg, uShowA, uShowB;\n' + LIGHT_HEAD);
      s = rep(s, 'res = min(res, 6.0 * gDR / t);', 'res = min(res, SOFTK * gDR / t);');
      s = rep(s, 'return mix(neutral, mix(GOLD, BALI, a), uCode);', 'return mix(neutral, mix(FRESH, USED, a), uCode);');
      s = repTo(s, 'vec3 lightUp(', 'vec3 bumpN(', LIGHT_UP);
      s = rep(s, '  n = bumpN(n0, inA ? qa : qb * 0.42, bF, bA);', LIGHT_ALB + '  n = bumpN(n0, inA ? qa : qb * 0.42, bF, bA);');
      s = rep(s, '    col += mix(DEEP, LIFT * 2.2, smoothstep(-0.1, 0.6, rf.y)) * 0.25;', '    col += mix(PAPL() * 0.5, SKYL, smoothstep(-0.1, 0.6, rf.y)) * 0.14;');
      s = rep(s, '    vec3 cc = mix(GOLD, BALI, clamp(aux, 0.0, 1.0));\n    col = col * (1.0 + 0.55 * uHoverK) + cc * 0.10 * uHoverK;',
                 '    vec3 cc = mix(FRESH, USED, clamp(aux, 0.0, 1.0));\n    col = col * (1.0 + 0.3 * uHoverK) + cc * 0.3 * uHoverK;');
      s = repTo(s, 'vec3 frost(', 'vec3 sky(', LIGHT_FROST);
      s = rep(s, 'vec3 sky(vec3 rd){ return mix(DEEPEST, DEEP * 1.1, smoothstep(-0.3, 0.4, rd.y)); }', 'vec3 sky(vec3 rd){ return PAPL(); }');
      s = rep(s, '  vec3 col; float tt; float cls = 0.0;\n', '  vec3 col = vec3(0.0); float tt; float cls = 0.0; bool onPaper = false; vec3 paperCol = uPaper;\n');
      s = repTo(s, '  } else if (tT < 1e4){', '  float coc = ', LIGHT_MAIN);
      return s;
    }
    // light knob values as the shader reads them
    var TABLES = ['pale', 'sweep', 'stone'];

    /* ---------------------------------------------------------------- story */
    // beat holds (u) and the reduced-motion stills
    var BEST = [0.07, 0.33, 0.505, 0.755, 0.905];
    // drive=host: beats in story progress (the same 0.2-wide spans beatOf uses, holding at BEST), and the
    // highlight: the whole cycle, from the loop circulating to the truck at the plant with its door lit
    var BEATS = BEST.map(function (h, i) { return { n: i + 1, from: Math.round(i * 20) / 100, hold: h, to: Math.round((i + 1) * 20) / 100 }; });
    var HIGHLIGHT = { from: 0.04, to: 0.98, seconds: 13 };
    // drive=host framing: in a box there is no headline card bottom-left, but the beat column takes a larger
    // share of the width, so the camera pulls back a little and the subject sits further left. In a narrow
    // box (the container query's 600 px) the beat line is on top, so the subject is centred and a little low
    var HOSTDIST = 1.07, HOSTSHIFT = 0.07, HOSTNARROW = 600;
    var KEYS = [
      { tgt: wA([-0.1, 1.15, 0.0]), az: 24, el: 14, dist: 8.2, fov: 30, azP: 16, distP: 1.6 },
      { tgt: wA([0.32, 1.05, 0.0]), az: 20, el: 17, dist: 8.4, fov: 30, azP: 12, distP: 1.7 },
      { tgt: wB([-3.45, 0.85, 1.9]), az: 12, el: 12, dist: 2.45, fov: 30, azP: 4, distP: 1.7 },
      { tgt: wB([-3.0, 1.05, -0.9]), az: 150, el: 33, dist: 7.6, fov: 30, azP: 150, distP: 1.7 },
      { tgt: null, az: 242, el: 30, dist: 6.6, fov: 30, azP: 236, distP: 1.6 }
    ];
    // v3: the cell (beat 3) and the swap (beat 4) framed closer, so the port canisters' windows and pebbles read.
    // pnear blends from v2's framing (0) to this (1)
    var NEAR = { 2: { tgt: wB([-3.35, 0.72, 1.9]), dist: 1.95 }, 3: { tgt: wB([-2.9, 1.0, -0.85]), dist: 6.2 } };
    // camera schedule: [u, key]; consecutive different keys = an eased move
    var CAMU = [[0.00, 0], [0.12, 0], [0.235, 1], [0.355, 1], [0.47, 2], [0.56, 2], [0.645, 3], [0.80, 3], [0.88, 4], [1.0, 4]];

    function phiTo(v) { return Math.atan2(v[1], v[0]); }
    var PH_H = phiTo([HATCH[0] - PC[0], HATCH[1] - PC[1]]), RH_H = Math.hypot(HATCH[0] - PC[0], HATCH[1] - PC[1]);
    var PH_T = phiTo([TRUCK0[0] - PC[0], TRUCK0[1] - PC[1]]), RH_T = Math.hypot(TRUCK0[0] - PC[0], TRUCK0[1] - PC[1]);
    var PH_G = phiTo([GOLDPAD[0] - PC[0], GOLDPAD[1] - PC[1]]), RH_G = Math.hypot(GOLDPAD[0] - PC[0], GOLDPAD[1] - PC[1]);
    // one clockwise slew: hatch -> truck -> gold pad -> hatch
    while (PH_T > PH_H) PH_T -= 2 * Math.PI;
    while (PH_G > PH_T) PH_G -= 2 * Math.PI;
    var PH_H2 = PH_H; while (PH_H2 > PH_G) PH_H2 -= 2 * Math.PI;

    function tipOf(phi, rho) {
      var d = [Math.cos(phi), Math.sin(phi)];
      var hor = rho - PIVR, ver = Math.sqrt(Math.max(0.01, LB * LB - hor * hor));
      return { piv: [PC[0] + d[0] * PIVR, PIVY, PC[1] + d[1] * PIVR], tip: [PC[0] + d[0] * rho, PIVY + ver, PC[1] + d[1] * rho] };
    }
    function axesUp() { return { ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] }; }
    function spinAx(ax, a) {
      var c = Math.cos(a), s = Math.sin(a);
      return { ex: ax.ex.map(function (x, i) { return x * c - ax.ez[i] * s; }), ey: ax.ey,
               ez: ax.ex.map(function (x, i) { return x * s + ax.ez[i] * c; }) };
    }
    // slate cask laid down on the truck: rigid turn about a pivot so it lands on the saddles
    function layDown(alpha, tx, tz, hd) {
      var fw = [Math.cos(hd), 0, Math.sin(hd)], side = [-Math.sin(hd), 0, Math.cos(hd)];
      var ca = Math.cos(alpha), sa = Math.sin(alpha);
      var bx = -0.23 + (0.23 * ca + -0.37 * sa), by = 1.17 + (-0.23 * sa + -0.37 * ca);
      var base = [tx + fw[0] * bx, by, tz + fw[2] * bx];
      var ey = [sa * fw[0], ca, sa * fw[2]], ex = [ca * fw[0], -sa, ca * fw[2]];
      return { base: base, ax: { ex: ex, ey: ey, ez: side } };
    }

    var story = { u: 0, init: false, cam: null, spot: [0, 0, 0, 2] };
    var Ufill = 0, Ugrow = 0, fall = new Float32Array(24), arr = new Float32Array(12), low = [0, 0, 0, 0];
    var hatch = 0, crane = null, casks = null, truckP = [TRUCK0[0], TRUCK0[1], 0, 1], door = 0;

    function storyAt(u, t, K) {
      // ---- plinth A
      Ugrow = sm(0.165, 0.245, u);
      Ufill = mix(0.2, 1.5, seg(u, 0.2, 0.42));
      fall.fill(0);
      if (Ugrow > 0.98) {
        var y0 = 1.93, H = Math.max(0.05, y0 - Ufill - 0.02), Tf = Math.sqrt(2 * H / 9.81) * 1.7;
        for (var i = 0; i < 6; i++) {
          var ph = ((t * (0.9 * (K.flow || 0.0001)) / Tf + i / 6) % 1 + 1) % 1;
          if (K.flow < 0.01) ph = i / 6;
          var y = y0 - H * ph * ph;
          fall.set([A.KX + 0.03 * Math.sin(i * 2.3), y, 0.02 * Math.cos(i * 1.7), 1], i * 4);
        }
      }
      // arrows: right straight (down), bottom arc into the core inlet, branch end (down into the canister)
      var thA = -115 * D2R;
      arr.set([A.LCX + A.LR, A.LCY - 0.12, 0, -1,
               A.LCX + A.LR * Math.cos(thA), A.LCY - A.LH + A.LR * Math.sin(thA), Math.sin(thA), -Math.cos(thA),
               BZ[2][0], BZ[2][1] - 0.02, 0, Ugrow > 0.985 ? -1 : 0]);
      // ---- plinth B, beat 3: the 14th canister, then the lid
      var lw = sm(0.445, 0.535, u);
      var seated = lw > 0.999;
      low = [HATCH[0], mix(1.7, CELLBASE + 0.19 + CAN.H + CAN.PITCH, lw), HATCH[1] + CAN.RING, (u > 0.43 && !seated) ? 1 : 0];
      // ---- beat 4: the crane. It brings the cask lid down on its yoke, lifts the slate cask out,
      // lays it on the truck, then carries the gold cask in. One clockwise slew throughout.
      var v = seg(u, 0.6, 0.8);
      hatch = sm(0, 0.06, v);
      var phi = PH_H, rho = RH_H, hookY = REST;
      var slate = { base: [HATCH[0], CELLBASE, HATCH[1]], ax: axesUp(), yoke: 1, lid: REST - CELLBASE - HOOK };
      var gold = { base: [GOLDPAD[0], PADY, GOLDPAD[1]], ax: axesUp(), yoke: 0, lid: 0 };
      var hookAt = null;
      if (v < 0.13) {
        hookY = mix(REST, CELLBASE + HOOK, sm(0.04, 0.13, v));
        slate.lid = hookY - CELLBASE - HOOK;
      } else if (v < 0.3) {
        slate.lid = 0; slate.base[1] = mix(CELLBASE, LIFT, sm(0.13, 0.3, v));
      } else if (v < 0.44) {
        slate.lid = 0; var w1 = sm(0.3, 0.44, v);
        phi = mix(PH_H, PH_T, w1); rho = mix(RH_H, RH_T, w1);
        slate.base = [PC[0] + Math.cos(phi) * rho, LIFT, PC[1] + Math.sin(phi) * rho];
      } else if (v < 0.55) {
        slate.lid = 0; phi = PH_T; rho = RH_T;
        var dn = sm(0.44, 0.49, v), al = sm(0.49, 0.55, v) * Math.PI / 2;
        if (al <= 0) slate.base = [TRUCK0[0], mix(LIFT, 0.80, dn), TRUCK0[1]];
        else { var ld = layDown(al, TRUCK0[0], TRUCK0[1], 0); slate.base = ld.base; slate.ax = ld.ax; }
      } else {
        var ld2 = layDown(Math.PI / 2, TRUCK0[0], TRUCK0[1], 0); slate.base = ld2.base; slate.ax = ld2.ax;
        slate.lid = 0; slate.yoke = 0;
        if (v < 0.6) {
          phi = PH_T; rho = RH_T;
          var top = [slate.base[0] + slate.ax.ey[0] * HOOK, slate.base[1] + slate.ax.ey[1] * HOOK, slate.base[2] + slate.ax.ey[2] * HOOK];
          var tp0 = tipOf(phi, rho).tip, r1 = sm(0.55, 0.6, v);
          hookAt = [mix(top[0], tp0[0], r1), mix(top[1], 3.3, r1), mix(top[2], tp0[2], r1)];
        } else if (v < 0.68) {
          var w2 = sm(0.6, 0.68, v); phi = mix(PH_T, PH_G, w2); rho = mix(RH_T, RH_G, w2); hookY = 3.3;
        } else if (v < 0.72) {
          phi = PH_G; rho = RH_G; hookY = mix(3.3, PADY + HOOK, sm(0.68, 0.72, v)); if (v > 0.715) gold.yoke = 1;
        } else if (v < 0.78) {
          phi = PH_G; rho = RH_G; gold.yoke = 1; gold.base[1] = mix(PADY, LIFT, sm(0.72, 0.78, v));
        } else if (v < 0.89) {
          gold.yoke = 1; var w3 = sm(0.78, 0.89, v); phi = mix(PH_G, PH_H2, w3); rho = mix(RH_G, RH_H, w3);
          gold.base = [PC[0] + Math.cos(phi) * rho, LIFT, PC[1] + Math.sin(phi) * rho];
        } else {
          gold.yoke = 1; phi = PH_H2; rho = RH_H;
          gold.base = [HATCH[0], mix(LIFT, CELLBASE, sm(0.89, 0.985, v)), HATCH[1]];
        }
      }
      // before the crane comes in, the lid waits on the yoke above the closed hatch; the cask is open
      slate.ax = spinAx(slate.ax, Math.PI * sm(0.15, 0.32, v));
      gold.ax = spinAx(gold.ax, Math.PI);
      var tp = tipOf(phi, rho);
      var att = slate.yoke ? slate : (gold.yoke ? gold : null);
      if (att) hookAt = [att.base[0] + att.ax.ey[0] * (HOOK + Math.max(att.lid, 0)), att.base[1] + att.ax.ey[1] * (HOOK + Math.max(att.lid, 0)), att.base[2] + att.ax.ey[2] * (HOOK + Math.max(att.lid, 0))];
      if (!hookAt) hookAt = [tp.tip[0], hookY, tp.tip[2]];
      crane = { yaw: phi, piv: tp.piv, tip: tp.tip, hook: hookAt };
      // ---- beat 5: the truck takes the slate cask to the plant
      var w5 = ease(seg(u, 0.805, 0.975));
      var rp = roadAt(mix(S_T0, S_T1, w5));
      truckP = [rp.x, rp.z, w5 > 0 ? rp.h : 0, 1];
      if (w5 > 0) { var ld3 = layDown(Math.PI / 2, rp.x, rp.z, rp.h); slate.base = ld3.base; slate.ax = spinAx(ld3.ax, Math.PI); slate.yoke = 0; }
      door = sm(0.86, 0.98, u);
      casks = [
        { base: slate.base, ax: slate.ax, n: seated ? 14 : 13, code: 1, yoke: slate.yoke, lid: slate.lid },
        { base: gold.base, ax: gold.ax, n: 14, code: 0, yoke: gold.yoke, lid: gold.lid },
        // v4: the cell's fresh cask, full and lidded, exactly the cask the crane brings aboard at the pier
        { base: FCELL, ax: axesUp(), n: 14, code: 0, yoke: 0, lid: 0 }
      ];
    }

    function camKey(k, st) {
      var K = KEYS[k], c = { tgt: K.tgt, az: K.az, el: K.el, dist: K.dist, fov: K.fov };
      var N = NEAR[k], nr = clamp(+st.K.pnear, 0, 1);
      if (N) { c.tgt = mixv(K.tgt, N.tgt, nr); c.dist = mix(K.dist, N.dist, nr); }
      if (k === 4) {
        var tx = mix(truckP[0], 6.4, 0.45), tz = mix(truckP[1], -3.3, 0.45);
        c.tgt = wB([tx, 0.85, tz]);
      }
      var port = clamp((1.25 - st.aspect) / 0.8, 0, 1);
      c.az = mix(c.az, K.azP, port); c.dist *= mix(1, K.distP, port);
      if (st.S.cam === 'iso') { c.az = 45 + 90 * Math.round((c.az - 45) / 90); c.el = 35.26; }
      return c;
    }
    function camAt(u, st) {
      for (var i = 0; i < CAMU.length - 1; i++) {
        var a = CAMU[i], b = CAMU[i + 1];
        if (u <= b[0] || i === CAMU.length - 2) {
          var ka = camKey(a[1], st), kb = camKey(b[1], st);
          if (a[1] === b[1]) return ka;
          var w = ease((u - a[0]) / (b[0] - a[0]));
          var big = (a[1] === 1 && b[1] === 2) ? 1 : (a[1] === 2 && b[1] === 3) ? 0.85 : 0.35, arc = Math.sin(Math.PI * w);
          return { tgt: mixv(ka.tgt, kb.tgt, w), az: mix(ka.az, kb.az, w), el: mix(ka.el, kb.el, w) + 9 * big * arc,
                   dist: mix(ka.dist, kb.dist, w) + 2.2 * big * arc, fov: mix(ka.fov, kb.fov, w) };
        }
      }
      return camKey(0, st);
    }

    /* ---------------------------------------------------------------- interaction */
    var stage = root.querySelector('.m4-stage');
    var tip = root.querySelector('.m4-tip'), tipTxt = tip && tip.querySelector('span');
    var orbit = { az: 0, el: 0, vaz: 0, vel: 0, drag: false, px: 0, py: 0, used: false };
    var hover = { cls: 0, k: 0, mx: -1, my: -1, inside: false, dirty: false, last: 0 };
    var api = null;
    var TIPS = { 1: 'Fresh fuel', 2: 'Partly used fuel', 3: 'Used fuel' };

    function setHover(cls) {
      if (cls === hover.cls) return;
      hover.cls = cls;
      if (tip) {
        tip.classList.toggle('on', cls > 0);
        tip.setAttribute('data-cls', String(cls));
        if (tipTxt && cls > 0) tipTxt.textContent = TIPS[cls];
      }
    }

    function bindInput(st) {
      if (!stage) return;
      stage.addEventListener('pointerdown', function (e) {
        if (!st.K.drag || st.reduced || e.button > 0) return;
        if (e.target.closest && e.target.closest('button')) return;
        orbit.drag = true; orbit.px = e.clientX; orbit.py = e.clientY; orbit.used = true;
        stage.classList.add('is-drag'); root.classList.add('was-dragged');
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or finished pointer */ }
      });
      stage.addEventListener('pointermove', function (e) {
        var r = stage.getBoundingClientRect();
        hover.mx = e.clientX - r.left; hover.my = e.clientY - r.top; hover.inside = true;
        if (orbit.drag) {
          var dx = e.clientX - orbit.px, dy = e.clientY - orbit.py;
          orbit.px = e.clientX; orbit.py = e.clientY;
          orbit.az = clamp(orbit.az - dx * 0.22, -70, 70);
          if (e.pointerType === 'mouse' || e.pointerType === 'pen') orbit.el = clamp(orbit.el + dy * 0.14, -10, 28);
          orbit.vaz = orbit.vel = 0;
        } else if (e.pointerType === 'mouse') {
          hover.dirty = true;
          if (tip) tip.style.transform = 'translate(' + (hover.mx + 16).toFixed(0) + 'px,' + (hover.my + 14).toFixed(0) + 'px)';
          if (st.reduced && api) api.kick();
        }
      });
      var end = function () { orbit.drag = false; stage.classList.remove('is-drag'); };
      stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
      stage.addEventListener('pointerleave', function () { hover.inside = false; setHover(0); });
      Array.prototype.forEach.call(root.querySelectorAll('[data-pip]'), function (b) {
        b.addEventListener('click', function () {
          var i = +b.getAttribute('data-pip') - 1, track = root.querySelector('.m4-track');
          var r = track.getBoundingClientRect(), span = r.height - window.innerHeight;
          var y = window.scrollY + r.top + BEST[i] * span + 2;
          window.scrollTo({ top: y, behavior: st.reduced ? 'auto' : 'smooth' });
        });
      });
    }
    // theme and paper change the compiled shader, so the knob panel reloads with the new value
    function reloadWith(k, v) {
      var h = (location.hash || '').slice(1).split('&').filter(function (kv) {
        var n = decodeURIComponent(kv.split('=')[0]); return kv && n !== k && n !== 'm4.' + k;
      });
      h.push('m4.' + k + '=' + encodeURIComponent(v));
      location.hash = h.join('&');
      location.reload();
    }
    function setPace(st) {
      var tr = root.querySelector('.m4-track');
      if (tr) tr.style.height = ((5 * st.K.pacing + 1) * 100).toFixed(0) + 'vh';
    }

    /* ---------------------------------------------------------------- mount */
    api = C.mount(root, {
      name: 'M4 fuel v4',
      frag: fragFor,
      startScale: 0.8,
      maxCoc: 9,
      grain: function (st) { return st.theme === 'light' ? 0.016 : 0.024; },
      vignette: function (st) { return st.theme === 'light' ? 0 : 0.45; },
      stillTime: 3.0,
      knobs: [
        { key: 'code', label: 'Colour coding', min: 0, max: 1, step: 0.01, value: 1, hint: '1 = fresh gold and used slate; 0 = neutral graphite and white rock' },
        { key: 'warmth', label: 'Key light warmth', min: 0, max: 1, step: 0.01, value: 0.7, hint: 'neutral warm white to brand gold' },
        { key: 'pacing', label: 'Pacing', min: 0.5, max: 2.5, step: 0.05, value: 1.1, hint: 'viewports of scroll per beat' },
        { key: 'peb', label: 'Pebble size', min: 1, max: 2, step: 0.05, value: 1, hint: '1 = true to the canister: 40 mm pebbles in a 300 mm canister' },
        { key: 'flow', label: 'Circulation speed', min: 0, max: 3, step: 0.05, value: 1 },
        { key: 'glow', label: 'Core glow', min: 0, max: 2, step: 0.05, value: 1 },
        { key: 'drag', label: 'Drag to orbit (0 off)', min: 0, max: 1, step: 1, value: 1 },
        { key: 'blur', label: 'Depth of field', min: 0, max: 2, step: 0.05, value: 1 },
        { key: 'exposure', label: 'Exposure', min: 0.5, max: 2, step: 0.01, value: 1 },
        { key: 'bpeb', label: 'Port pebble size', min: 0.18, max: 0.36, step: 0.01, value: 0.27, hint: 'pebbles in the port canisters, as a share of the canister radius: symbolic, about 3 across at 0.27' },
        { key: 'pnear', label: 'Port framing', min: 0, max: 1, step: 0.05, value: 1, hint: 'the cell and swap holds: 0 = v2 framing, 1 = v3, closer, so the canisters read' },
        { key: 'shadow', label: 'Shadow strength (light)', min: 0, max: 1, step: 0.01, value: 0.5, hint: 'light only: 0 airy, the model barely shades the paper; 1 deep key and contact shadows' }
      ],
      selects: [
        { key: 'cam', label: 'Camera', options: ['q', 'iso'], value: 'q', hint: 'q = three-quarter perspective, iso = isometric (orthographic)' },
        { key: 'theme', label: 'Theme', options: ['dark', 'light'], value: 'dark', hint: 'reloads. Also m4.theme, or data-theme on the root' },
        { key: 'paper', label: 'Paper (light)', options: ['f2f2f0', 'ffffff'], value: 'f2f2f0', hint: 'reloads. Any 6-digit hex works in the URL, or data-paper on the root' },
        { key: 'table', label: 'Table tone (light)', options: ['pale', 'sweep', 'stone'], value: 'pale', hint: 'pale = a white table on the paper, sweep = the table takes the paper tone, stone = a light grey board' },
        { key: 'clay', label: 'Clay tone (light)', options: ['white', 'grey'], value: 'white', hint: 'white = an all-white model, only the fuel in colour; grey = hull, crane and casks in graphite' }
      ],
      drive: { beats: BEATS, highlight: HIGHLIGHT },
      init: function (st) {
        if (!st.host) setPace(st);
        bindInput(st); root.setAttribute('data-cam', st.S.cam);
        var po = root.querySelector('.m4-poster');
        if (st.theme === 'light' && po && po.getAttribute('data-alt-light')) po.setAttribute('aria-label', po.getAttribute('data-alt-light'));
      },
      onKnob: function (st, k) {
        if (k === 'pacing' && !st.host) setPace(st);
        if (k === 'cam') root.setAttribute('data-cam', st.S.cam);
        if (k === 'theme' || k === 'paper') reloadWith(k, st.S[k]);
      },
      beatOf: function (st) {
        if (root.classList.contains('is-nogl')) return Math.min(4, Math.floor(st.p * 5));
        if (st.reduced || story.lock) return story.rbeat;
        var u = story.u;
        return u < 0.2 ? 0 : u < 0.4 ? 1 : u < 0.6 ? 2 : u < 0.8 ? 3 : 4;
      },
      step: function (st, dt) {
        var P = st.P;
        if (st.host) {
          // drive=host: draw exactly the progress the page's clock set (st.p is set(p)); no easing, no scroll.
          // The beat and u locks still work; #loop with no host clock plays the highlight on its own
          story.lock = false;
          var hu = st.p;
          if (P.beat && +P.beat >= 1 && +P.beat <= 5) { hu = BEST[+P.beat - 1]; story.lock = true; }
          else if (P.u != null && P.u !== '' && isFinite(+P.u)) { hu = clamp(+P.u, 0, 1); story.lock = true; }
          else if (st.loop && !st.hostSet) {
            var cyc = HIGHLIGHT.seconds + 1.5;
            hu = HIGHLIGHT.from + (HIGHLIGHT.to - HIGHLIGHT.from) * Math.min(1, (st.t % cyc) / HIGHLIGHT.seconds);
          }
          story.u = hu; story.init = true;
          story.rbeat = Math.min(4, Math.floor(hu * 5));
        } else {
        story.rbeat = Math.min(4, Math.floor(st.p * 5));
        story.lock = false;
        var target = st.p;
        if (P.beat && +P.beat >= 1 && +P.beat <= 5) { story.rbeat = +P.beat - 1; target = BEST[story.rbeat]; story.lock = true; }
        else if (P.u != null && P.u !== '' && isFinite(+P.u)) { target = clamp(+P.u, 0, 1); story.lock = true; story.rbeat = Math.min(4, Math.floor(target * 5)); }
        else if (st.loop) target = (st.t * 0.055) % 1;
        if (st.reduced && !story.lock) target = BEST[story.rbeat];
        if (!story.init || st.reduced || story.lock) { story.u = target; story.init = true; }
        else if (st.loop && target < story.u - 0.5) story.u = target;
        else story.u += (target - story.u) * (1 - Math.exp(-dt * 5));
        if (st.loop && !story.lock) story.rbeat = Math.min(4, Math.floor(story.u * 5));
        }

        var K = st.K, t = st.t;
        storyAt(story.u, t, K);
        // orbit spring back (slightly underdamped, like a toy on a turntable)
        if (!orbit.drag) {
          var w0 = 7.0, z = 0.62;
          orbit.vaz += (-w0 * w0 * orbit.az - 2 * z * w0 * orbit.vaz) * dt; orbit.az += orbit.vaz * dt;
          orbit.vel += (-w0 * w0 * orbit.el - 2 * z * w0 * orbit.vel) * dt; orbit.el += orbit.vel * dt;
        }
        var c = camAt(story.u, st);
        if (P.zoom && isFinite(+P.zoom)) c.dist /= +P.zoom;
        if (st.host) c.dist *= st.cssW < HOSTNARROW ? HOSTDIST * 1.14 : HOSTDIST;
        var drift = st.reduced ? 0 : 1.1 * Math.sin(t * 0.23);
        var az = (c.az + orbit.az + drift) * D2R, el = clamp(c.el + orbit.el, 2, 60) * D2R;
        var dir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
        story.cam = { tgt: c.tgt, dir: dir, dist: c.dist, fov: c.fov };
        var ka = (c.az - 52) * D2R, ke = 50 * D2R;
        story.key = [Math.sin(ka) * Math.cos(ke), Math.sin(ke), Math.cos(ka) * Math.cos(ke)];
        story.spot = [c.tgt[0], c.tgt[1] * 0.3, c.tgt[2], c.dist * 0.42];
        // hover highlight fades in and out
        var want = hover.cls;
        if (want) story.hcls = want;
        hover.k += ((want ? 1 : 0) - hover.k) * (st.reduced ? 1 : 1 - Math.exp(-dt * 10));
      },
      pick: function (st) {
        if (!hover.inside || orbit.drag) return null;
        var now = performance.now();
        if (!hover.dirty && now - hover.last < 260) return null;
        if (now - hover.last < 45) return null;
        hover.dirty = false; hover.last = now;
        return [hover.mx, hover.my];
      },
      onPick: function (st, px) { setHover(px[0] > 3 ? 0 : px[0]); },
      uniforms: function (st, U) {
        var K = st.K, cam = story.cam, iso = st.S.cam === 'iso';
        var dist = cam.dist, pos = [cam.tgt[0] + cam.dir[0] * dist, cam.tgt[1] + cam.dir[1] * dist, cam.tgt[2] + cam.dir[2] * dist];
        var orthoH = dist * Math.tan(cam.fov * D2R / 2);
        if (iso) pos = [cam.tgt[0] + cam.dir[0] * 30, cam.tgt[1] + cam.dir[1] * 30, cam.tgt[2] + cam.dir[2] * 30];
        var cb = C.lookAt(pos, cam.tgt);
        U.v3('uCamPos', cb.pos); U.v3('uCamF', cb.f); U.v3('uCamR', cb.r); U.v3('uCamU', cb.u);
        var foc = 0.5 / Math.tan(cam.fov * D2R / 2);
        U.f('uFocal', foc); U.f('uOrtho', iso ? 1 : 0); U.f('uOrthoH', orthoH);
        U.f('uPixAng', iso ? 2 * orthoH / st.h : 1 / (foc * st.h));
        // keep the subject clear of the copy: left of the caption column on desktop, between caption and card on phones
        var port = st.aspect < 1.0;
        if (st.host && st.cssW < HOSTNARROW) U.v2('uShift', [0, 0.085]);
        else if (st.host && !port) U.v2('uShift', [0.115 * Math.min(1, st.aspect / 1.6) + HOSTSHIFT, -0.045]);
        else U.v2('uShift', port ? [0, -0.035] : [(root.classList.contains('tz-textleft') && window.innerWidth >= 820 && !/(^|[?&#])m4\.frame=own/.test(location.search + location.hash) ? -0.2 : 0.115) * Math.min(1, st.aspect / 1.6), -0.045]);   /* site v7 P16 */
        U.f('uFocus', iso ? 30 : dist);
        U.f('uAperture', 0.55);
        var light = st.theme === 'light';
        U.f('uExposure', K.exposure * (light ? 1.0 : 1.05));
        U.v3('uKeyDir', story.key);
        // light: the same warmth knob, over a whiter range, so the paper and the white clay stay white
        U.v3('uKeyCol', light ? mixv([1.0, 0.98, 0.95], [1.0, 0.88, 0.68], K.warmth) : mixv([1.0, 0.9, 0.76], [1.0, 0.7, 0.32], K.warmth));
        if (light) {
          U.v3('uPaper', st.paperRGB);
          U.f('uShadow', K.shadow);
          U.f('uTable', Math.max(0, TABLES.indexOf(st.S.table)));
          U.f('uClay', st.S.clay === 'grey' ? 1 : 0);
        }
        U.v4('uSpot', story.spot);
        U.f('uCode', K.code);
        U.f('uRound', st.look === 'p' ? 0.3 : 1.0);
        U.f('uHover', story.hcls || 0); U.f('uHoverK', hover.k);
        U.f('uGlow', K.glow);
        // plinth A
        U.v3('uOA', OA);
        var r = 0.02 * K.peb;
        U.f('uPebR', r);
        var nb = Math.max(12, Math.floor(LOOPL / (2.7 * r)));
        U.f('uFlowN', nb);
        var flowSpeed = 0.07 * K.flow;
        var fT = (st.t * flowSpeed) % (LOOPL * 6);
        U.f('uFlowT', fT);
        U.f('uCoreT', (st.t * flowSpeed * 0.35) % (2 * r * 0.70710678 * 2));
        U.f('uGrow', Ugrow); U.f('uFill', Ufill);
        U.f('uBPeb', K.bpeb);
        U.v4('uArr', arr); U.v4('uFall', fall);
        // plinth B
        U.v3('uOB', OB); U.f('uSB', SB);
        var P3 = [], M3 = [], S4 = [];
        casks.forEach(function (ck) {
          P3.push(ck.base[0], ck.base[1], ck.base[2]);
          M3.push(ck.ax.ex[0], ck.ax.ex[1], ck.ax.ex[2], ck.ax.ey[0], ck.ax.ey[1], ck.ax.ey[2], ck.ax.ez[0], ck.ax.ez[1], ck.ax.ez[2]);
          S4.push(ck.n, ck.code, ck.yoke, ck.lid);
        });
        U.v3('uCaskP', P3); U.m3('uCaskM', M3); U.v4('uCaskS', S4);
        U.v4('uLow', low); U.f('uHatch', hatch);
        U.v3('uCrPiv', crane.piv); U.v3('uCrTip', crane.tip); U.v3('uHook', crane.hook); U.f('uCrYaw', crane.yaw);
        U.v4('uTruck', truckP);
        U.v2('uRoad', ROAD12);
        U.f('uDoor', door); U.f('uShowA', story.u < 0.5 ? 1 : 0); U.f('uShowB', story.u > 0.35 ? 1 : 0); U.f('uDbg', +(st.P.dbg || 0));
      }
    });
  })();
}

})();

});