/* Tesser Atomics · scene: ships module · extracted unchanged from handoff-site-v11 heavy/site-t4m-v11.html (script 11). */
window.__TZ_LAZY('tsr-ships', 0, function () {

(function () {
'use strict';
/* ============================================================================
   Ships core · runtime for the C-ships WebGL moment ("One reactor, many ships")
   ----------------------------------------------------------------------------
   A copy of C-fuel/src/core-m4-v2.js (M4 v2's runtime), taken Oct 5. C-fuel is
   not edited. What is different from that copy:
     - root #tsr-ships, classes sh-*, global name SHCORE (inlined inside the
       moment's IIFE, so nothing leaks), URL namespace ships.<key>
     - no page scroll: story progress is st.hp, written by the moment's own
       clock (standalone) or by t4mDrive.set(p) (drive=host); the root is
       observed for pause-off-screen
     - def.themeDefault(raw) picks the theme default (ships: light, but dark
       for look=blueprint)
     - the drive hook (CHAPTERS.md section 2) is exposed in drive=host

   v2 (Oct 5), for smooth transitions:
     - render scale never reallocates: the scene draws into a sub-viewport of
       a full-size target and the post pass upsamples it (no canvas resize, no
       texture realloc when the adaptive scale moves)
     - adaptive scale with hysteresis: down fast when frames run long, up only
       after about two seconds of headroom, and never up while def.busy(st)
       (a transition); capped at 0.86 on screens with a pixel ratio above 1.2
     - uFrame (a frame counter) for the scene's temporal dither

   v3 (Oct 6): no-WebGL fix only. api.redraw called a render path that does
   not exist without WebGL (a TypeError on a ship-name click); it now updates
   the overlay (names and cards) instead.

   v4 (Oct 6): a copy of v3's, unchanged.
   ========================================================================= */
var SHCORE = (function () {
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

  /* theme, paper and drive: the ships.<key> URL key, then the bare URL key, then data-<key> on the root, then the default.
     raw is an unmerged params() read, so an invalid namespaced value falls through to the bare key. */
  var HEX6 = /^#?([0-9a-fA-F]{6})$/;
  function themeOf(root, raw, def) {
    function pick(key, ok) {
      var c = [raw['ships.' + key], raw[key], root.getAttribute('data-' + key)];
      for (var i = 0; i < c.length; i++) if (c[i] != null && ok(c[i])) return c[i];
      return null;
    }
    var th = pick('theme', function (v) { return v === 'dark' || v === 'light'; }) || (def.themeDefault ? def.themeDefault(raw) : 'dark');
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
    'uniform vec2 uRes, uFull, uSub;',
    'uniform float uMaxCoc, uTime, uGrain, uVig;',
    'out vec4 oCol;',
    'float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uFull;',
    '  vec2 hi = uSub - 0.5 / uFull;',
    '  vec4 c0 = texture(uTex, min(uv * uSub, hi));',
    '  float k0 = c0.a * 2.0 - 1.0;',
    '  float r0 = abs(k0) * uMaxCoc;',
    '  vec3 acc = c0.rgb; float ws = 1.0;',
    '  if (uMaxCoc > 0.5) {',
    '    for (int i = 1; i < 44; i++) {',
    '      float fi = float(i);',
    '      float rr = sqrt(fi / 44.0) * uMaxCoc;',
    '      float an = fi * 2.39996323;',
    '      vec4 s = texture(uTex, clamp(uv * uSub + vec2(cos(an), sin(an)) * rr / uFull, vec2(0.0), hi));',
    '      float ks = s.a * 2.0 - 1.0;',
    '      float rs = abs(ks) * uMaxCoc;',
    '      float re = ks > k0 ? min(rs, r0) : rs;',
    '      float w = smoothstep(rr - 1.0, rr + 1.0, re);',
    '      acc += s.rgb * w; ws += w;',
    '    }',
    '  }',
    '  vec3 col = acc / ws;',
    '  vec2 q = uv - 0.5; q.x *= uFull.x / uFull.y;',
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
      setTimeout(function () { throw new Error('ships shader compile: ' + log); });
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
      setTimeout(function () { throw new Error('ships program link: ' + log); });
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
    /* ships.<key> wins over a bare <key>, so moments sharing one page URL keep their own switches */
    Object.keys(P).forEach(function (k) { if (k.indexOf('ships.') === 0) P[k.slice(6)] = P[k]; });
    var TH = themeOf(root, params(), def);
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
      scale: def.startScale || 0.9, maxScale: (window.devicePixelRatio || 1) > 1.2 ? 0.86 : 1, fps: 0
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

    var track = root, stage = root.querySelector('.sh-stage');
    var canvas = root.querySelector('canvas.sh-gl');
    var beatEls = root.querySelectorAll('[data-beat]'), pipEls = root.querySelectorAll('[data-pip]');
    if (def.init) def.init(st);

    function progress() { return st.hp; }
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
    function beatOf(p) { return 0; }

    /* drive=host: the page's clock calls set(p); start() and stop() switch the render loop */
    function expose(set, start, stop) {
      var d = def.drive || {};
      root.t4mDrive = { set: set, beats: d.beats || [], highlight: d.highlight || null, start: start, stop: stop };
      root.dispatchEvent(new CustomEvent('t4m:drive-ready'));
    }
    function hp(p) { st.hostSet = true; st.hp = clamp(+p || 0, 0, 1); }
    api.redraw = function () { if (!raf) { if (stage.clientWidth > 0) redraw(true); else step(0); } };

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
      onScrollNoGl();
      api.redraw = onScrollNoGl;
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
      var FW = Math.max(2, Math.round(cw * dpr)), FH = Math.max(2, Math.round(ch * dpr));
      if (FW !== canvas.width || FH !== canvas.height) { canvas.width = FW; canvas.height = FH; allocTarget(FW, FH); }
      var W = Math.max(2, Math.round(FW * st.scale)), H = Math.max(2, Math.round(FH * st.scale));
      st.w = W; st.h = H; st.fw = FW; st.fh = FH; st.aspect = W / H; st.cssW = cw; st.cssH = ch;
    }

    var live = false, pickBuf = new Uint8Array(4), frameN = 0, vRes = new Float32Array(2), vFull = new Float32Array(2), vSub = new Float32Array(2);
    function render() {
      resize();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, st.w, st.h);
      gl.useProgram(progScene);
      vRes[0] = st.w; vRes[1] = st.h; vFull[0] = st.fw; vFull[1] = st.fh; vSub[0] = st.w / st.fw; vSub[1] = st.h / st.fh;
      Us.v2('uRes', vRes);
      Us.f('uTime', st.t);
      Us.f('uFrame', (frameN = (frameN + 1) % 4096));
      Us.f('uLook', st.look === 'p' ? 0 : 1);
      Us.f('uPick', 0);
      def.uniforms(st, Us);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, st.fw, st.fh);
      gl.useProgram(progPost);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      Up.i('uTex', 0);
      Up.v2('uRes', vRes); Up.v2('uFull', vFull); Up.v2('uSub', vSub);
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
      st.ps = st.p;
      if (def.step) def.step(st, dt);
      st.p = st.ps = progress();
      if (def.overlay) def.overlay(st);
      return setBeat(def.beatOf ? def.beatOf(st) : beatOf(st.ps));
    }

    var accT = 0, accN = 0, cool = 2, good = 0, fpsEl = null, scaleEl = null;
    function measure(dt) {
      accT += dt; accN++;
      if (accN < 30) return;
      var avg = accT / accN * 1000; accT = 0; accN = 0;
      st.fps = 1000 / avg;
      if (fpsEl) { fpsEl.textContent = st.fps.toFixed(0); scaleEl.textContent = st.scale.toFixed(2); }
      root.setAttribute('data-fps', st.fps.toFixed(1));
      root.setAttribute('data-scale', st.scale.toFixed(2));
      if (cool > 0) { cool--; return; }
      if (avg > 18.6 && st.scale > 0.5) { st.scale = Math.max(0.5, st.scale * 0.9); cool = 2; good = 0; }
      else if (avg < 16.95) { good++; if (good >= 4 && st.scale < st.maxScale && !(def.busy && def.busy(st))) { st.scale = Math.min(st.maxScale, st.scale * 1.04); good = 0; cool = 2; } }
      else good = 0;
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
      el.className = 'sh-knobs';
      var h = '<div class="sh-knobs__h">' + def.name + ' · knobs</div>';
      (def.selects || []).forEach(function (k) {
        h += '<label class="sh-knobs__row"><span>' + k.label + '</span><select data-s="' + k.key + '">' +
          k.options.map(function (o) { return '<option' + (o === st.S[k.key] ? ' selected' : '') + '>' + o + '</option>'; }).join('') +
          '</select></label>';
        if (k.hint) h += '<div class="sh-knobs__hint">' + k.hint + '</div>';
      });
      def.knobs.forEach(function (k) {
        h += '<label class="sh-knobs__row"><span>' + k.label + '<b data-v="' + k.key + '"></b></span>' +
          '<input type="range" min="' + k.min + '" max="' + k.max + '" step="' + k.step + '" value="' + st.K[k.key] + '" data-k="' + k.key + '"></label>';
        if (k.hint) h += '<div class="sh-knobs__hint">' + k.hint + '</div>';
      });
      h += '<div class="sh-knobs__row"><span>fps <b data-fps>-</b> · render scale <b data-scale>-</b></span></div>';
      h += '<button type="button" class="sh-knobs__copy" data-copy>Copy JSON</button>';
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
   Ships · "One reactor. Many use cases." · v2                          -t4m
   ----------------------------------------------------------------------------
   One gold reactor module stays put on its stand; seven clay ships take turns
   around it. v2 (Andrew's notes, Oct 5):
     - transitions: the next ship assembles while the current one comes apart,
       overlapping, so the module is never left bare. Every part fades as it
       moves: a dithered dissolve (temporal interleaved-gradient noise against
       the part's alpha, inside the SDF), so it feathers in and out instead of
       popping, and its shadow fades with it. Moves are short and eased in and
       out. Parts no longer come from outside the frame
     - models: a real ship's hull (raked stem, bulbous bow, flare forward,
       sheer, a counter stern over the propeller), bridge window bands, masts;
       the power ship and the data-centre ship are rebuilt on ship hulls
     - performance: every part group sits in its own bounding box (the power
       ship's cable was unbounded), and the core no longer reallocates when
       the render scale moves
   v3 (Oct 6, Andrew: the build plan's Section 5 cards move into this module):
     - each ship carries its plan card (eyebrow, headline, body, CTA, and the
       government ship's three tags). The cards cross-fade in step with the
       ships' dissolve, as a pure function of the clock, so a host's set(p)
       moves them too: the outgoing card fades while its ship comes apart, the
       text swaps at tau = SW, and the next card rises in while its ship
       assembles. The active ship name moves with the card (at once on a click)
     - card=stage|side|off (default stage): across the foot of the stage, with
       the ship's framing raised above it; under the names in the rail; or none
     - CTAs: data-contact on the root (default contact-t4m-v3.html) plus
       #interest=partnerships or #interest=government
     - the power ship's quay, substation and pylon are pulled in so they stay
       in frame at 1440 and on phones
   v4 (Oct 6, Andrew: "a cleaner switch between these ... on a scroll", and the
   heading "really narrow"):
     - the heading is "The reactor has many maritime applications." across the
       full width; the rail under it holds the names and then the card; the
       module is exactly one box tall (one viewport standalone), so a host can
       pin it (layout in ships-v4.css)
     - drive=host is scroll-driven: the page calls t4mDrive.set(p), p 0..1
       across the fleet. Each ship owns an equal slice: a hold (ship built,
       power on, card in) for the first `hold` of it (knob, default 0.55), then
       the dissolve to the next. The last ship's slice is all hold. Ship, card,
       name, bar and camera are all pure functions of p, so it scrubs backwards
       as cleanly as forwards. No auto-advance under drive=host. beats[i].hold
       is each hold's centre; a name click emits t4m:pick {n, id, p} with it
     - standalone keeps v3's auto-advance
     - framing blends between the landscape and portrait cameras by the
       stage's aspect, so any stage shape gets a continuous framing
   v5 (Oct 6, Andrew: "the combo of A and B ... the thumbnails, but tabs at
   the top, so that the other information can be below", and the heading
   "One reactor. Countless maritime applications."): layout A's script (the
   notes marked A-tabs below), with the tab bar now layout B's thumbnail
   tiles (markup and styles only: the tiles keep the .sh-name buttons, so
   the wiring is A's). v5 adds --n on the root (the tile count, four with
   fleet=plan) and drops A's tabs=line|fill knob.
   Layout A, tabs (Oct 6, Andrew: "better organized ... better balanced"; a
   copy of v4's ships-v4.js, everything below the shader unchanged unless
   marked A-tabs):
     - the names are a tab bar (role=tab, aria-selected, roving tabindex,
       arrow keys and Home/End move focus, Enter/Space picks); the cards are
       its tabpanels. Keyboard focus entering the tabs stops the auto-advance
       too, so the selection never moves under a keyboard user
     - the gold bar under the active tab is a timer while auto-advancing and
       full otherwise (v4 left it empty after a pick)
     - framing: the stage is a wide band between the tabs and the card, so
       each ship is fitted, not placed: its extents (EXT) are projected
       through its camera, the camera distance is solved so the ship fills
       FIT_H of the stage's height (or FIT_W of the column's width, whichever
       binds), and the frame is shifted so the ship's bounds, ground shadow
       included, sit on the stage's centre. The camera angles stay v4's.
       v3's card=stage zone is gone (the card never covers the stage)
     - knobs: card=under|off (v5: A's tabs=line|fill is gone)
   v6 (Oct 20 client review, Chris: "bring the ship up so that there's actually
   a gap in between the reactor and the hull of the ship ... make the ships
   taller, the reactor smaller"; Andrew: four ships, the Figma section):
     - the module is scaled by mod (knob, default MOD0) about its base and sits
       on a seat at MBOT, inside the hull: headroom under every deck, clearance
       either side inside the engine room and under it. It is the same module,
       at the same size, in every ship. The engine room (roomSD) is sized to
       the module plus RX either side and RZ behind it
     - hull depths raised where the deck sat too low (RAISE, in units): the
       deck-relative parts ride up with the deck; the surface patterns that
       were set in absolute heights (window bands, hall strips, container
       joints) read the raise so they keep their place
     - fleet=plan (the client four) is the default; fleet=wide still works
     - the layout follows the designers' Figma: heading, tiles, then the ship
       (664 x 298 at 1440) beside its card (ships-v6.css). The fit reads the
       stage's own width
     - thumb mode (layout B's, ported): data-thumbmaker on the root or #thumb,
       one near-orthographic broadside camera, for src/thumbs-v6/
   Units are 10 m; the module is the same size in every ship.
   v8 (Oct 26, Per Peterson's notes of Oct 24; the module designed once in
   C-plant/src/plant-v4.js and copied here):
     - the module: the two reactor vessels port and starboard (z), flat-headed
       and shorter (rxh, default 0.75 of v6's height), a steam header across
       their tops and a line out through the aft wall, in a closed enclosure
       with a curved cutaway (cutaway=scoop|corner|open, scoopw, scoopd,
       scoopz); the cut faces are a lighter gold. In every ship
     - the steam line leaves the module's aft wall on the centre line at the
       header's height (every ship); on the LNG carrier it now ends at steam
       (default x 3.65), just forward of the deckhouse, as in the plant. The
       other ships keep v6's length (Per: "the schematics are great")
     - the LNG carrier (lngdeck=vents, default): the membrane trunk's port and
       starboard sides slope at 45 degrees (the trunk is a little taller, 5 m,
       so the slope reads), and four slender vent stacks with bulging caps
       replace the four hatches; lngdeck=hatches is v6's deck

   Story progress p runs across the fleet: ship i owns [i/N, (i+1)/N). Within
   it, s in [0, H) holds the ship with its power on; s in [H, 1) is the
   transition to the next ship. Standalone, the moment runs its own clock (with
   a short intro that builds the first ship); drive=host, the page's clock
   calls t4mDrive.set(p).
   ========================================================================= */
var root = document.getElementById('tsr-ships');
if (root && !root.__ships) {
  root.__ships = true;
  (function () {
    var C = SHCORE, clamp = C.clamp, mix = C.mix, mixv = C.mixv;
    var D2R = Math.PI / 180;
    function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

    /* ------------------------------------------------------------- the fleet */
    // copy is verbatim in the markup; here only ids and framing: cam [dist, az, el], camP for portrait stages,
    // sxP an extra sideways nudge of the frame on portrait stages (in stage heights; + moves the ship left)
    var SHIPS = [
      { id: 'lng',    plan: true,  cam: [64, 36, 18], camP: [56, 62, 27] },
      { id: 'box',    plan: true,  cam: [70, 36, 18], camP: [60, 62, 27] },
      { id: 'bulk',   plan: true,  cam: [60, 36, 18], camP: [52, 62, 27] },
      { id: 'gov',    plan: true,  cam: [50, 36, 18], camP: [44, 60, 27] },
      { id: 'power',  plan: false, cam: [54, 34, 22], camP: [55, 56, 29], sxP: 0.06 },   // v3: camP 52 -> 55 and the frame nudged left (sxP), so the quay and pylon stay in on phones
      { id: 'cruise', plan: false, cam: [74, 36, 17], camP: [64, 62, 25] },
      { id: 'data',   plan: false, cam: [50, 36, 19], camP: [44, 58, 27] }
    ];
    var IDX = {}; SHIPS.forEach(function (s, i) { IDX[s.id] = i; });
    // A-tabs: each ship's shape for the fit, read off the SDFs below. hull: [LF, LA, hb, D, bowL, sheer] as hull() takes
    // them (the parallel body is a box; the bow is its stem line and two flare points, so its empty corners do not
    // count); parts: boxes [x0, x1, y0, y1, z0, z1] for the decks, houses, masts and funnels (and the power ship's quay,
    // substation and pylon)
    var EXT = {
      lng:    { hull: [20, 8, 2.3, 2.6, 5.4, 0.4], parts: [[-18, -1.4, 2.95, 3.45, -1.85, 1.85],   // v8: the trunk 1.85 either side at its base [3.4, 7.0, 2.95, 5.35, -2.25, 2.25], [6.0, 6.9, 5.0, 6.2, -0.5, 0.5],
              [5.1, 5.3, 5.3, 6.45, -0.13, 0.13], [-18.7, -18.5, 3.3, 5.15, -0.13, 0.13]] },
      box:    { hull: [22, 8, 2.4, 2.4, 6.0, 0.35], parts: [[-19.6, 6.9, 2.75, 4.31, -2.2, 2.2], [1.6, 4.0, 2.75, 5.95, -2.45, 2.45], [2.9, 3.7, 6.0, 6.7, -0.36, 0.36],
              [2.3, 2.5, 5.9, 7.0, -0.13, 0.13], [-21, -20.8, 3.1, 4.75, -0.13, 0.13]] },
      bulk:   { hull: [18.5, 6.5, 2.2, 2.3, 4.8, 0.4], parts: [[-16.6, -2.6, 2.65, 3.1, -1.6, 1.6], [-16.8, -14.6, 2.65, 4.95, -0.3, 0.3], [-4.2, -1.9, 2.65, 4.95, -0.3, 0.3],
              [2.1, 4.5, 2.65, 4.8, -2.15, 2.15], [4.3, 5.3, 4.5, 5.5, -0.46, 0.46], [-17.4, -17.2, 3.05, 4.6, -0.13, 0.13]] },
      gov:    { hull: [13, 7, 1.55, 2.1, 4.6, 0.5], parts: [[-10.0, -6.8, 2.45, 4.65, -1.55, 1.55], [-9.0, -8.8, 4.8, 6.5, -0.13, 0.13], [-5.7, -1.3, 2.45, 5.1, -1.65, 1.65],
              [2.0, 4.6, 2.45, 4.0, -1.35, 1.35], [2.1, 3.1, 4.0, 4.75, -0.38, 0.38]] },
      power:  { hull: [10, 6.5, 2.0, 2.1, 4.2, 0.4], parts: [[-8.9, 3.05, 2.45, 3.8, -1.8, 1.8], [3.5, 5.7, 2.45, 4.6, -1.95, 1.95], [5.0, 5.8, 4.6, 5.1, -0.36, 0.36],
              [-9.3, -9.1, 2.85, 4.45, -0.13, 0.13], [-7.0, 7.4, 0, 1.5, -6.0, -2.3], [5.65, 7.15, 1.5, 2.6, -4.3, -2.8], [3.55, 5.05, 1.5, 4.6, -5.4, -5.2]] },
      cruise: { hull: [21, 9, 2.0, 1.4, 6.5, 0.3], parts: [[-17.6, 8.8, 1.75, 3.85, -1.94, 1.94], [-15.6, 8.0, 3.85, 6.0, -1.84, 1.84], [-12.55, -11.45, 5.55, 6.05, -2.18, 2.18],
              [2.6, 4.4, 6.0, 7.1, -0.6, 0.6], [-11.7, -11.5, 6.0, 7.15, -0.13, 0.13]] },
      data:   { hull: [10, 6, 1.9, 2.0, 4.2, 0.45], parts: [[-6.3, 4.7, 2.35, 4.0, -1.68, 1.68], [-8.45, -6.75, 2.35, 4.3, -1.7, 1.7], [-7.9, -7.7, 4.3, 5.6, -0.13, 0.13]] }
    };
    /* v6: the module's scale (the mod knob's default; 1 = v1-v5's module) and each hull's depth raise, in units (10 m).
       The shader's shipRaise() and the D values in each shipX() carry the same numbers. EXT above is v5's, as read off
       v5's models; the raise is applied here (hull depth, and every part on the ship; the power ship's last three parts,
       its quay, substation and pylon, stand on the ground and stay) */
    var MOD0 = 0.58;
    var RAISE = { lng: 0, box: 0.2, bulk: 0.25, gov: 0.4, power: 0.4, cruise: 1.0, data: 0.45 };
    var GROUNDED = { power: 3 };
    Object.keys(EXT).forEach(function (id) {
      var e = EXT[id], r = RAISE[id] || 0, keep = e.parts.length - (GROUNDED[id] || 0);
      e.hull[3] += r;
      e.parts.forEach(function (b, i) { if (i < keep) { b[2] += r; b[3] += r; } });
    });
    // the hull as points: the parallel body's corners, the stem (deck and forefoot) and the flare at mid-bow
    function hullPts(h) {
      var LF = h[0], LA = h[1], hb = h[2], deck = 0.35 + h[3], bowL = h[4], sh = h[5], x0 = -LF + bowL, pts = [];
      [x0, LA].forEach(function (x) { [0, deck].forEach(function (y) { [-hb, hb].forEach(function (z) { pts.push([x, y, z]); }); }); });
      pts.push([-LF, deck + sh, 0], [-LF + 0.2 * bowL, 0.35, 0], [-LF + bowL * 0.45, deck + sh * 0.6, -hb * 0.8], [-LF + bowL * 0.45, deck + sh * 0.6, hb * 0.8]);
      return pts;
    }
    // the share of the stage's height, and of the column's width, a ship may fill; how far its cast shadow counts
    // (SHADOW_K and SHADOW_X were measured against renders of all seven ships: the ship's body sits a little left of
    // centre and its visible shadow a little right, so the pair reads as centred)
    var FIT_H = 0.8, FIT_W = 0.94, FIT_WN = 0.88, SHADOW_K = 0.9, SHADOW_X = 0.12;
    // the clock, in seconds: hold with the power on, then the overlapped transition to the next ship
    var T_HOLD = 5.0, T_TR = 2.4, T_SPAN = T_HOLD + T_TR, T_INTRO = 1.8;
    // H: where a span's hold ends and its transition starts. Standalone it is the clock's (5 s of 7.4 s); under
    // drive=host it is the hold knob (setTiming)
    var H = T_HOLD / T_SPAN;
    var S_HOLD = 0.62 * H;            // standalone: where a beat holds (power fully on)
    // the cards: inside a transition (tau 0..1) the outgoing card fades over 0..CA_OUT while its ship comes apart,
    // the text swaps at SW, and the incoming card rises in over CB_IN..CB_IN+CB_LEN while its ship assembles
    var CA_OUT = 0.36, SW = 0.4, CB_IN = 0.44, CB_LEN = 0.4;
    var SW_S = H + SW * (1 - H);      // the swap, in span units

    /* ------------------------------------------------------------- colour */
    function lin(hex) {
      var n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) { return Math.pow(c / 255, 2.2); });
    }
    function v3(a) { return 'vec3(' + a.map(function (x) { return x.toFixed(5); }).join(',') + ')'; }
    var COL = { NAVY: '#022434', DEEP: '#0A1626', DEEPEST: '#050D18', LIFT: '#142A44', GOLD: '#E1AB25', ECRU: '#F5F1E8',
                ROCK: '#E8E0CC', FIORD: '#4D5A6E', BALI: '#8A99AD', GRAPH: '#3A3D42', GOLDL: '#D69A12', SLATEL: '#7F8FA5' };
    var colDefs = Object.keys(COL).map(function (k) { return 'const vec3 ' + k + ' = ' + v3(lin(COL[k])) + ';'; }).join('\n');

    /* ------------------------------------------------------------- shader */
    var FRAG = '#version 300 es\nprecision highp float;\nprecision highp int;\n' + colDefs + '\n' + `
out vec4 oCol;
uniform vec2 uRes;
uniform float uTime, uFrame;
uniform vec3 uCamPos, uCamF, uCamR, uCamU;
uniform float uFocal, uPixAng;
uniform vec2 uShift;
uniform float uFocus, uAperture, uExposure;
uniform vec3 uKeyDir, uKeyCol;
uniform float uLight, uBlue, uShadow;
uniform vec3 uPaper;
// two ship slots: A comes apart, B assembles (outside a transition, A is empty and B is the current ship)
uniform float uShipA, uAsmA, uPowA, uShipB, uAsmB, uPowB;
uniform float uBuild, uSpin, uPulse;
uniform float uMod;                  // v6: the module's scale about its base (the mod knob)
// v8: the cutaway's shape (0 scoop, 1 corner, 2 open) and its semi-axes (modelled units); the vessels' height (x v6's);
// the LNG carrier's steam line end (x); the LNG deck (1 vents and a 45-degree trunk, 0 v6's hatches)
uniform float uCutK, uRxH, uSteam, uVent;
uniform vec3 uScoop;

#define PI 3.14159265
#define KEEL 0.35
#define MY 1.9
const vec3 MH = vec3(1.0, 1.45, 0.9);
// v6: the module as modelled (MY, MH: v1-v5's, base at MB0, frame top at MT0) is scaled by uMod about its base and set
// on a seat at MBOT. The engine room's floor is the tank top, TANK; the room is the module plus RX either side and RZ
// behind it, open to the viewer and the sky
#define MB0 0.45
#define MT0 3.37
#define MBOT 0.64
#define TANK 0.43
#define RX 0.42
#define RZ 0.34
float modTop(){ return MBOT + (MT0 - MB0) * uMod; }
// v6: each hull's depth raise (units), as RAISE in the script: the surface patterns set in absolute heights read it
float shipRaise(float id){
  return id < 0.5 ? 0.0 : id < 1.5 ? 0.2 : id < 2.5 ? 0.25 : id < 3.5 ? 0.4 : id < 4.5 ? 0.4 : id < 5.5 ? 1.0 : 0.45;
}

#define M_HULL 1.0
#define M_SECT 2.0
#define M_SUP 3.0
#define M_SLATE 4.0
#define M_DARK 5.0
#define M_GOLD 6.0
#define M_CONT 7.0
#define M_STAND 8.0
#define M_HATCH 9.0
#define M_QUAY 10.0
#define M_HALL 11.0
#define M_WIN 12.0
#define M_POWER 13.0
#define M_DECK 14.0
#define M_BRIDGE 15.0
#define M_PLANT 16.0

float gD, gDR, gM, gA, gS;
bool gSh;
// the dissolve: gN is this pixel's dither threshold; gAl is the alpha of the part being evaluated; gSlot is its ship.
// gOC is that part's current displacement; the hit part's is kept in gO, so its surface patterns move with it
float gN, gAl, gAsm, gSlot;
vec3 gOC, gO;
void U(float d, float m, float a){
  if (gAl <= gN) return;
  gDR = min(gDR, d);
  if (d < gD){ gD = d; gM = m; gA = a; gS = gSlot; gO = gOC; }
}
void UE(float d, float m){ if (d < gD){ gD = d; gM = m; gA = -1.0; gS = gSlot; } }

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
float sdCylY(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float sdRCylY(vec3 p, float r, float h, float rr){ rr = min(rr, min(r, h)); vec2 d = vec2(length(p.xz) - r + rr, abs(p.y) - h + rr); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - rr; }
float sdSeg(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0); return length(pa - ba * h) - r; }
vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
float rmax(float a, float b, float r){ vec2 u = max(vec2(r + a, r + b), 0.0); return min(-r, max(a, b)) + length(u); }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float sdBoxFrame(vec3 p, vec3 b, float e){
  p = abs(p) - b; vec3 q = abs(p + e) - e;
  return min(min(length(max(vec3(p.x, q.y, q.z), 0.0)) + min(max(p.x, max(q.y, q.z)), 0.0),
                 length(max(vec3(q.x, p.y, q.z), 0.0)) + min(max(q.x, max(p.y, q.z)), 0.0)),
                 length(max(vec3(q.x, q.y, p.z), 0.0)) + min(max(q.x, max(q.y, p.z)), 0.0));
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

/* ---------------- assembly. Each part group has an arrival window inside its ship's 0..1 assembly (gAsm):
   it moves a short eased distance and fades in over the first half of its move (and the reverse as the ship
   comes apart). fly() sets gAl for the U() calls that follow */
float asmE(float k0, float k1){ return smoothstep(0.0, 1.0, clamp((gAsm - k0) / (k1 - k0), 0.0, 1.0)); }
vec3 fly(vec3 q, float k0, float k1, vec3 from){
  float e = asmE(k0, k1);
  gAl = smoothstep(0.0, 0.6, e);
  gOC = from * (1.0 - e) * (1.0 - e);
  return q - gOC;
}
vec3 drop(vec3 q, float k0, float k1, float h){ return fly(q, k0, k1, vec3(0.0, h, 0.0)); }
bool on(){ return gAl > gN; }

/* ---------------- the module: two reactor vessels in a gold enclosure, on a stand. v8 (Per): plant v4's module (the
   vessels port and starboard, flat-headed, shorter; a steam header and a line out of the aft wall; a closed enclosure with
   a curved cutaway, its cut faces lighter, aux 2) */
#define RXR 0.32
#define RXZ 0.47
#define RXX -0.26
#define FLOORY -1.27
float rxTop(){ return FLOORY + 2.1 * uRxH; }          // v3's vessels were 2.1 tall (modelled)
float hdrY(){ return rxTop() + 0.26; }                // the header over them, and the line out of the aft wall
float steamY(){ return MBOT + (hdrY() - (MB0 - MY)) * uMod; }   // that height in the ship
float sdEll(vec3 p, vec3 r){ float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float cutSD(vec3 m){
  if (uCutK < 0.5) return sdEll(m - vec3(0.0, MH.y, MH.z), uScoop);                          // scoop: the near top edge
  if (uCutK < 1.5) return sdEll(m - vec3(MH.x, MH.y, MH.z), uScoop * vec3(1.6, 1.0, 1.0));   // corner: near top aft
  return MH.z - 0.1 - m.z;                                                                   // open: v3's near face
}
void module(vec3 p){
  gAl = 1.0; gSlot = 2.0; gOC = vec3(0.0);
  float s = uMod;
  // v6: the seat, a low slate plinth from the ground (inside a hull it shows only above the tank top) to the module's base
  U(sdRB(p - vec3(0.0, 0.5 * MBOT, 0.0), vec3(0.82 * s, 0.5 * MBOT, 0.72 * s), 0.04), M_STAND, -1.0);
  // v6: the module as modelled, scaled by s about its base; every distance below is scaled back by s
  vec3 m = (p - vec3(0.0, MBOT, 0.0)) / s + vec3(0.0, MB0 - MY, 0.0);
  float bb = sdBox(m, MH + 0.1) * s;
  if (bb > 0.25){ UE(bb, M_GOLD); return; }
  // the enclosure: a closed shell (walls 0.07, the floor up to FLOORY), less the cutaway
  float y1 = MH.y - 0.09;
  float shell = max(sdRB(m, MH - 0.02, 0.06), -sdBox(m - vec3(0.0, 0.5 * (FLOORY + y1), 0.0), vec3(MH.x - 0.09, 0.5 * (y1 - FLOORY), MH.z - 0.09)));
  float c = cutSD(m);
  U(s * max(shell, -c), M_GOLD, -c > shell ? 2.0 : 0.0);
  // the two vessels, port and starboard, flat-headed, standing on the floor
  float rh = 1.05 * uRxH, hy = hdrY(), top = rxTop();
  U(s * sdRCylY(vec3(m.x - RXX, m.y - FLOORY - rh, abs(m.z) - RXZ), RXR, rh, 0.04), M_GOLD, 0.0);
  // a nozzle up from each, the header across both (along z), and the line aft through the aft wall (along x)
  U(s * sdCylY(vec3(m.x - RXX, m.y - 0.5 * (top + hy), abs(m.z) - RXZ), 0.1, 0.5 * (hy - top) + 0.02), M_GOLD, 0.0);
  U(s * sdRCylY((m - vec3(RXX, hy, 0.0)).xzy, 0.13, RXZ + 0.12, 0.06), M_GOLD, 0.0);
  U(s * sdCylY((m - vec3(0.5 * (RXX + MH.x), hy, 0.0)).yxz, 0.12, 0.5 * (MH.x - RXX)), M_GOLD, 0.0);
}

/* ---------------- a ship's hull: stem at x=-LF, transom at x=LA, half-beam hb, depth D amidships */
float hullSD(vec3 q, float LF, float LA, float hb, float D, float bowL, float sheer, float cut){
  float y01 = clamp((q.y - KEEL) / D, 0.0, 1.0);
  float stem = -LF + bowL * 0.2 * (1.0 - y01) * (1.0 - y01);           // a raked, curved stem
  float x0 = -LF + bowL;
  float t = clamp((x0 - q.x) / max(x0 - stem, 0.01), 0.0, 1.0);
  float w = hb * (1.0 - pow(t, mix(1.3, 2.7, y01)));                    // fine at the forefoot, flared at the deck
  w *= mix(0.7, 1.0, smoothstep(0.0, 0.3, y01));                         // the bilge
  float ts = clamp((q.x - (LA - 1.4)) / 1.4, 0.0, 1.0);
  w *= 1.0 - 0.16 * ts * ts;                                             // the run narrows a little to the transom
  float deckY = KEEL + D + sheer * smoothstep(x0 + 1.5, -LF, q.x);       // sheer: the deck rises forward
  float keelY = KEEL + cut * smoothstep(LA - 3.0, LA - 0.7, q.x);        // the counter lifts over the propeller
  float dz = abs(q.z) - w;
  float dy = max(q.y - deckY, keelY - q.y);
  float dx = max(q.x - LA, stem - q.x);
  float d = rmax(rmax(dz, dy, 0.1), dx, 0.07) * 0.62;
  // a bulbous bow at the forefoot
  float bulb = (length((q - vec3(-LF + bowL * 0.22, KEEL + D * 0.26, 0.0)) / vec3(0.95, 0.3, 0.3)) - 1.0) * 0.3;
  return smin(d, bulb, 0.12);
}
// the engine room around the module, open to the viewer and the sky
// v6: the engine room is sized to the module (RX either side, RZ behind it; v5's was a fixed 1.22 either side and 1.0
// behind, open to the sky). It is two boxes: the room itself, from the tank top to the underside of the deck (gDeck, set
// by each ship, less DECKT), across the whole beam from RZ behind the module; and the cut that opens it to the viewer,
// the near side from ZC forward, up through the deck and open to the sky. So the far half of the deck stays as a ceiling
// over the module, and the headroom reads as the gap between the module's top and that ceiling. The opening runs RAFT
// further aft than the room's forward bulkhead is forward of the module: the camera looks in from aft, and the aft hull
// would otherwise hide the module's lower half
#define DECKT 0.12
#define ZC -0.15
#define RAFT 0.95
float gDeck = 9.0;
float roomSD(vec3 q){
  float hx = MH.x * uMod + RX, z0 = -(MH.z * uMod + RZ), x0 = -hx, x1 = hx + RAFT;
  float y1 = gDeck - DECKT;
  float a = sdBox(q - vec3(0.5 * (x0 + x1), 0.5 * (TANK + y1), 0.5 * (z0 + 9.0)), vec3(0.5 * (x1 - x0), 0.5 * (y1 - TANK), 0.5 * (9.0 - z0)));
  float b = sdBox(q - vec3(0.5 * (x0 + x1), TANK + 3.0, 0.5 * (ZC + 9.0)), vec3(0.5 * (x1 - x0), 3.0, 0.5 * (9.0 - ZC)));
  return min(a, b);
}
// the shaft tunnel along the aft hull, to just short of the counter
// v8: it ends at x1 (the steam line's end)
float slotSD(vec3 q, float LA, float D, float x1){
  float x0 = 1.0, y0 = KEEL + D * 0.3, y1 = KEEL + D * 0.64;
  return sdBox(q - vec3(0.5 * (x0 + x1), 0.5 * (y0 + y1), 4.4), vec3(0.5 * (x1 - x0), 0.5 * (y1 - y0), 5.0));
}
float propSD(vec3 q, float R){
  float hub = sdRCylY(q.yxz, 0.13, 0.17, 0.07);
  float a = atan(q.z, q.y) + uSpin, sec = PI * 0.5;
  a = mod(a + sec * 0.5, sec) - sec * 0.5;
  float rr = length(q.yz);
  vec3 bq = vec3(q.x, rr * cos(a) - R * 0.55, rr * sin(a));
  bq.xz = rot(bq.xz, 0.6);
  return min(hub, sdRB(bq, vec3(0.045, R * 0.47, R * 0.22), 0.04) * 0.8);
}
// hull halves slide in from fore and aft (build=slide) or the hull drops on (build=drop); the engine-room cut,
// the shaft tunnel, the cradles, the shaft, the propeller and the rudder all come with it
// v8: x1 is where the steam line (and its tunnel) ends
// and gZs how far toward the open side it runs (of the half-beam; v3/v6: 0.42; the LNG carrier 0.62, so its shorter run
// still shows in the tunnel from the ships' higher camera)
float gZs = 0.42;
void hull(vec3 q, float LF, float LA, float hb, float D, float bowL, float sheer, float cut, bool shaft, float x1){
  float hb2 = hb + 0.3;
  vec3 qf = uBuild < 0.5 ? fly(q, 0.0, 0.42, vec3(-3.5, 0.0, 0.0)) : drop(q, 0.0, 0.4, 3.0);
  if (on()){
    float bf = sdBox(qf - vec3(0.5 * (-LF - 1.22), KEEL + D * 0.6, 0.0), vec3(0.5 * (LF - 1.22) + 0.3, D * 0.6 + sheer + 0.3, hb2));
    if (bf < 0.3){
      float h = max(hullSD(qf, LF, LA, hb, D, bowL, sheer, cut), qf.x + 1.22);
      float c = roomSD(qf);
      U(max(h, -c), -c > h ? M_SECT : M_HULL, -1.0);
    } else UE(bf, M_HULL);
  }
  vec3 qa = uBuild < 0.5 ? fly(q, 0.0, 0.42, vec3(3.5, 0.0, 0.0)) : drop(q, 0.0, 0.4, 3.0);
  if (on()){
    float ba = sdBox(qa - vec3(0.5 * (LA - 1.22), KEEL + D * 0.55, 0.0), vec3(0.5 * (LA + 1.22) + 0.3, D * 0.55 + 0.3, hb2));
    if (ba < 0.3){
      float h = max(hullSD(qa, LF, LA, hb, D, bowL, sheer, cut), -(qa.x + 1.22));
      float c = roomSD(qa);
      if (shaft) c = min(c, slotSD(qa, LA, D, x1));
      U(max(h, -c), -c > h ? M_SECT : M_HULL, -1.0);
    } else UE(ba, M_HULL);
  }
  vec3 qc = fly(q, 0.0, 0.2, vec3(0.0, -0.5, 0.0));
  if (on()){
    U(sdRB(vec3(qc.x + LF * 0.55, qc.y - KEEL * 0.5, qc.z), vec3(0.32, KEEL * 0.5, hb * 0.6), 0.05), M_STAND, -1.0);
    U(sdRB(vec3(qc.x - LA * 0.15, qc.y - KEEL * 0.5, qc.z), vec3(0.32, KEEL * 0.5, hb * 0.6), 0.05), M_STAND, -1.0);
  }
  if (shaft){
    vec3 qs = fly(q, 0.56, 0.9, vec3(2.0, 0.0, 0.0));
    if (on()){
      float bs = sdBox(qs - vec3(0.5 * (LA + 1.0), KEEL + D * 0.4, 0.0), vec3(0.5 * (LA - 1.0) + 0.4, D * 0.5, hb));
      if (bs < 0.3){
        float ys = KEEL + D * 0.46, yp = KEEL + cut * 0.52, xp = LA - 1.05, zs = hb * gZs;
        // v8: the steam line leaves the module's aft wall on the centre line, at its header's height, swings out and down
        // to v3's run (mid-height, toward the open side, where the camera sees it in the tunnel) and runs aft into the
        // tunnel's end wall at x1 (the power conversion is beyond it, under the deckhouse); the propeller shaft runs from
        // there, inside the hull, down to the propeller under the counter
        float xm = MH.x * uMod - 0.02, yh = steamY();
        vec3 A = vec3(xm, yh, 0.0), B = vec3(xm + 0.22, yh, 0.0), Cc = vec3(xm + 0.72, ys, zs);
        U(min(min(sdSeg(qs, A, B, 0.13), sdSeg(qs, B, Cc, 0.13)), sdSeg(qs, Cc, vec3(x1 + 0.06, ys, zs), 0.13)), M_POWER, -1.0);
        U(sdRCylY((qs - vec3(xm + 0.04, yh, 0.0)).yxz, 0.17, 0.04, 0.015), M_POWER, -1.0);
        U(sdSeg(qs, vec3(max(x1 + 0.3, LA - 2.7), ys, zs), vec3(xp - 0.2, yp, 0.0), 0.12), M_POWER, -1.0);
        U(propSD(qs - vec3(xp, yp, 0.0), min(0.62, cut * 0.62)), M_SLATE, -1.0);
        U(sdRB(qs - vec3(LA - 0.42, KEEL + cut * 0.55, 0.0), vec3(0.22, cut * 0.45, 0.05), 0.04), M_SLATE, -1.0);
      } else UE(bs, M_SLATE);
    }
  }
}
// a deckhouse (window bands on its sides), cut where it crosses the engine room
void house(vec3 q, vec3 c, vec3 h, float r, float m){
  float d = sdRB(q - c, h, r);
  float cut = roomSD(q);
  U(max(d, -cut), -cut > d ? M_SECT : m, c.y + h.y);
}
// a bridge: the top deck of a house, wider, with a band of windows wrapping its front and sides
void bridge(vec3 q, vec3 c, vec3 h){ house(q, c, h, 0.07, M_BRIDGE); }
// a mast: a pole with a small radar dome on top (no crossbar, which read as a cross)
void mast(vec3 q, vec3 base, float h, float yard){
  U(sdSeg(q, base, base + vec3(0.0, h, 0.0), 0.055), M_DARK, -1.0);
  U(sdRCylY(q - base - vec3(0.0, h + 0.05, 0.0), 0.13, 0.06, 0.05), M_SLATE, -1.0);
}
// a funnel: slate, raked aft, with a dark cap
void funnel(vec3 q, vec3 c, vec3 h){
  vec3 f = q - c; f.x -= f.y * 0.18;
  U(sdRB(f, h, min(h.x, h.z) * 0.6), M_SLATE, -1.0);
  U(sdRB(f - vec3(0.0, h.y, 0.0), vec3(h.x * 0.9, 0.05, h.z * 0.9), 0.04), M_DARK, -1.0);
}

// v8: the LNG trunk: half length hx, half-width wb at its base, height h, its sides at 45 degrees (a trapezoid in z-y,
// extruded along x), with a small rounding; p is from the centre of its base
#define TRW 1.85
#define TRH 0.5
#define VNH 1.15
float sdTrunk(vec3 p, float hx, float wb, float h){
  float r = 0.04;
  float d2 = max(max(p.y - h + r, r - p.y), (abs(p.z) + p.y - wb + r * 1.4142) * 0.70710678);
  vec2 w = vec2(d2, abs(p.x) - hx + r);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - r;
}
/* ---------------- 1 · LNG carrier (membrane: flat trunk deck, small domes, never spherical tanks) */
void shipLNG(vec3 q){
  float LF = 20.0, LA = 8.0, hb = 2.3, D = 2.6, deck = KEEL + D;
  gDeck = deck;
  hull(q, LF, LA, hb, D, 5.4, 0.4, 0.9, true, uSteam);
  vec3 qd = drop(q, 0.3, 0.68, 2.4);
  if (on()){
    float dx = qd.x - (-15.2 + clamp(floor((qd.x + 15.2) / 4.0 + 0.5), 0.0, 3.0) * 4.0);
    if (uVent > 0.5){
      // v8 (Per): the membrane trunk, its port and starboard sides sloping at 45 degrees, and four slender vent stacks
      // with bulging caps on its centre line (where v3 had hatches)
      float d = sdTrunk(qd - vec3(-9.7, deck - 0.02, 0.0), 8.3, TRW, TRH);
      float cut = roomSD(qd);
      U(max(d, -cut), -cut > d ? M_SECT : M_DECK, -1.0);
      float y0 = deck - 0.02 + TRH;
      U(sdCylY(vec3(dx, qd.y - y0 - 0.5 * VNH, qd.z), 0.055, 0.5 * VNH), M_SLATE, -1.0);
      U(sdRCylY(vec3(dx, qd.y - y0 - VNH - 0.07, qd.z), 0.14, 0.1, 0.045), M_SLATE, -1.0);
    } else {
      house(qd, vec3(-9.7, deck + 0.17, 0.0), vec3(8.3, 0.19, 1.7), 0.12, M_DECK);
      U(sdRCylY(vec3(dx, qd.y - deck - 0.4, qd.z), 0.34, 0.08, 0.06), M_DECK, -1.0);
    }
  }
  vec3 qh = drop(q, 0.42, 0.8, 3.0);
  if (on()){
    house(qh, vec3(5.3, deck + 0.95, 0.0), vec3(1.5, 0.95, 1.9), 0.14, M_SUP);
    bridge(qh, vec3(4.95, deck + 2.12, 0.0), vec3(1.0, 0.22, 2.25));
  }
  vec3 qt = drop(q, 0.6, 0.95, 2.0);
  if (on()){
    funnel(qt, vec3(6.45, deck + 2.6, 0.0), vec3(0.42, 0.55, 0.5));
    mast(qt, vec3(-18.6, deck + 0.4, 0.0), 1.7, 0.5);
    mast(qt, vec3(5.2, deck + 2.34, 0.0), 1.0, 0.6);
  }
}

/* ---------------- 2 · container ship */
void stack(vec3 q, float x0, float x1, float hb, float y0, float tiers, float k0){
  vec3 qq = drop(q, k0, k0 + 0.36, 2.2);
  if (!on()) return;
  float nb = floor((x1 - x0) / 1.3 + 0.5);
  float bb = sdBox(qq - vec3(0.5 * (x0 + x1), y0 + tiers * 0.13, 0.0), vec3(0.5 * (x1 - x0), tiers * 0.13, hb));
  if (bb > 0.3){ UE(bb, M_CONT); return; }
  float b0 = floor((qq.x - x0) / 1.3);
  for (int j = -1; j <= 1; j++){
    float b = clamp(b0 + float(j), 0.0, nb - 1.0);
    float t = tiers - floor(hash3(vec3(b, 3.0, 7.0 + x0)) * 3.0);
    float h = t * 0.13;
    float d = sdRB(qq - vec3(x0 + (b + 0.5) * 1.3, y0 + h, 0.0), vec3(0.62, h, hb), 0.025);
    U(max(d, -roomSD(qq)), M_CONT, b);
  }
}
void shipBox(vec3 q){
  float LF = 22.0, LA = 8.0, hb = 2.4, D = 2.6, deck = KEEL + D;
  gDeck = deck;
  hull(q, LF, LA, hb, D, 6.0, 0.35, 0.9, true, LA - 2.6);   // v8: v6's length
  stack(q, -19.6, -1.4, 2.2, deck, 6.0, 0.3);
  stack(q, 4.3, 6.9, 2.2, deck, 5.0, 0.38);
  vec3 qh = drop(q, 0.42, 0.8, 3.0);
  if (on()){
    house(qh, vec3(2.75, deck + 1.35, 0.0), vec3(0.95, 1.35, 1.6), 0.14, M_SUP);
    bridge(qh, vec3(2.55, deck + 2.95, 0.0), vec3(0.62, 0.24, 2.45));
  }
  vec3 qt = drop(q, 0.6, 0.95, 2.0);
  if (on()){
    funnel(qt, vec3(3.25, deck + 3.55, 0.0), vec3(0.3, 0.32, 0.36));
    mast(qt, vec3(-20.9, deck + 0.35, 0.0), 1.5, 0.45);
    mast(qt, vec3(2.4, deck + 3.2, 0.0), 0.9, 0.6);
  }
}

/* ---------------- 3 · bulk carrier */
void crane(vec3 q, float x, float deck){
  U(sdRCylY(q - vec3(x, deck + 0.5, 0.0), 0.2, 0.5, 0.05), M_SLATE, -1.0);
  U(sdRB(q - vec3(x, deck + 1.12, 0.0), vec3(0.3, 0.18, 0.28), 0.06), M_SLATE, -1.0);
  U(sdSeg(q, vec3(x - 0.1, deck + 1.15, 0.0), vec3(x - 1.9, deck + 2.25, 0.0), 0.07), M_SLATE, -1.0);
}
void shipBulk(vec3 q){
  float LF = 18.5, LA = 6.5, hb = 2.2, D = 2.55, deck = KEEL + D;
  gDeck = deck;
  hull(q, LF, LA, hb, D, 4.8, 0.4, 0.85, true, LA - 2.6);   // v8: v6's length
  vec3 qd = drop(q, 0.3, 0.7, 2.4);
  if (on()){
    float bh = sdBox(qd - vec3(-9.6, deck + 0.15, 0.0), vec3(7.2, 0.3, 1.6));
    if (bh < 0.3){
      float hx = qd.x - (-15.9 + clamp(floor((qd.x + 15.9) / 2.1 + 0.5), 0.0, 6.0) * 2.1);
      U(sdRB(vec3(hx, qd.y - deck - 0.15, qd.z), vec3(0.82, 0.15, 1.5), 0.08), M_HATCH, -1.0);
    } else UE(bh, M_HATCH);
  }
  vec3 qt = drop(q, 0.56, 0.92, 2.0);
  if (on()){
    float bc = sdBox(qt - vec3(-9.7, deck + 1.3, 0.0), vec3(7.6, 1.3, 0.6));
    if (bc < 0.3){ for (int i = 0; i < 4; i++) crane(qt, -14.85 + float(i) * 4.2, deck); } else UE(bc, M_SLATE);
    funnel(qt, vec3(4.75, deck + 2.3, 0.0), vec3(0.38, 0.5, 0.46));
    mast(qt, vec3(-17.3, deck + 0.4, 0.0), 1.4, 0.45);
  }
  vec3 qh = drop(q, 0.42, 0.8, 3.0);
  if (on()){
    house(qh, vec3(3.3, deck + 0.85, 0.0), vec3(1.2, 0.85, 1.75), 0.14, M_SUP);
    bridge(qh, vec3(3.0, deck + 1.92, 0.0), vec3(0.8, 0.22, 2.15));
  }
}

/* ---------------- 4 · government and defense: a replenishment / support ship, no weapons */
void gantry(vec3 q, float x, float deck, float hb){
  vec3 g = vec3(q.x - x, q.y, abs(q.z) - hb * 0.72);
  U(sdRB(g - vec3(0.0, deck + 1.3, 0.0), vec3(0.11, 1.3, 0.11), 0.04), M_SLATE, -1.0);
  U(sdRB(vec3(q.x - x, q.y - deck - 2.55, q.z), vec3(0.12, 0.1, hb * 0.82), 0.04), M_SLATE, -1.0);
  U(sdSeg(vec3(q.x, q.y, abs(q.z)), vec3(x, deck + 2.4, hb * 0.72), vec3(x + 0.9, deck + 1.2, hb * 1.05), 0.045), M_SLATE, -1.0);
}
void shipGov(vec3 q){
  float LF = 13.0, LA = 7.0, hb = 1.55, D = 2.5, deck = KEEL + D;
  gDeck = deck;
  hull(q, LF, LA, hb, D, 4.6, 0.5, 0.7, true, LA - 2.6);   // v8: v6's length
  vec3 qh = drop(q, 0.42, 0.8, 3.0);
  if (on()){
    house(qh, vec3(-8.4, deck + 0.95, 0.0), vec3(1.6, 0.95, 1.4), 0.14, M_SUP);
    bridge(qh, vec3(-8.7, deck + 2.15, 0.0), vec3(1.0, 0.25, 1.55));
    house(qh, vec3(3.3, deck + 0.75, 0.0), vec3(1.25, 0.75, 1.35), 0.14, M_SUP);
  }
  vec3 qt = drop(q, 0.58, 0.94, 2.0);
  if (on()){
    float bg = sdBox(qt - vec3(-3.4, deck + 1.4, 0.0), vec3(1.6, 1.5, hb + 0.6));
    if (bg < 0.3){ gantry(qt, -4.6, deck, hb); gantry(qt, -2.2, deck, hb); } else UE(bg, M_SLATE);
    funnel(qt, vec3(2.45, deck + 1.85, 0.0), vec3(0.32, 0.36, 0.38));
    mast(qt, vec3(-8.9, deck + 2.4, 0.0), 1.5, 0.7);
  }
}

/* ---------------- 5 · power ship: a converted bulk hull with its generating plant on deck, moored alongside a quay
   and cabled ashore */
float cableSD(vec3 p, vec3 A, vec3 B, float sag, out float tt){
  vec2 d2 = B.xz - A.xz; float L = length(d2); vec2 dir = d2 / L, pr = vec2(-dir.y, dir.x);
  vec2 rel = p.xz - A.xz;
  float u = dot(rel, dir), w = dot(rel, pr);
  vec2 bz = sdBez(vec2(u, p.y), vec2(0.0, A.y), vec2(0.5 * L, 0.5 * (A.y + B.y) - sag), vec2(L, B.y));
  tt = bz.y;
  return length(vec2(bz.x, w)) - 0.09;
}
void shipPower(vec3 q){
  float LF = 10.0, LA = 6.5, hb = 2.0, D = 2.5, deck = KEEL + D;
  gDeck = deck;
  hull(q, LF, LA, hb, D, 4.2, 0.4, 0.8, false, LA - 2.6);   // v8: v6's length
  // the generating plant: three turbine-generator halls forward, transformers and a switchyard aft of the module
  vec3 qd = drop(q, 0.3, 0.7, 2.4);
  if (on()){
    float bp = sdBox(qd - vec3(-5.0, deck + 0.8, 0.0), vec3(3.9, 1.0, 1.8));
    if (bp < 0.3){
      float gx = qd.x - (-7.6 + clamp(floor((qd.x + 7.6) / 2.4 + 0.5), 0.0, 2.0) * 2.4);
      U(sdRB(vec3(gx, qd.y - deck - 0.62, qd.z), vec3(0.95, 0.62, 1.45), 0.1), M_PLANT, deck + 1.24);
      vec2 fq = vec2(gx, abs(qd.z) - 0.6);
      U(sdRCylY(vec3(fq.x, qd.y - deck - 1.32, fq.y), 0.3, 0.08, 0.05), M_SLATE, -1.0);
    } else UE(bp, M_PLANT);
    float bt = sdBox(qd - vec3(2.1, deck + 0.6, 0.0), vec3(0.95, 0.8, 1.6));
    if (bt < 0.3){
      vec3 tq = vec3(qd.x - 2.1, qd.y, abs(qd.z) - 0.85);
      U(sdRB(tq - vec3(0.0, deck + 0.42, 0.0), vec3(0.6, 0.42, 0.5), 0.08), M_SLATE, -1.0);
      float fz = tq.z - clamp(floor(tq.z / 0.16 + 0.5), -2.0, 2.0) * 0.16;
      U(sdRB(vec3(tq.x - 0.7, tq.y - deck - 0.36, fz), vec3(0.1, 0.3, 0.035), 0.02), M_SLATE, -1.0);
      U(sdRB(qd - vec3(2.1, deck + 1.05, -0.3), vec3(0.08, 0.32, 0.08), 0.03), M_SLATE, -1.0);
    } else UE(bt, M_SLATE);
  }
  vec3 qh = drop(q, 0.42, 0.8, 3.0);
  if (on()){
    house(qh, vec3(4.6, deck + 0.85, 0.0), vec3(1.1, 0.85, 1.6), 0.14, M_SUP);
    bridge(qh, vec3(4.35, deck + 1.92, 0.0), vec3(0.75, 0.22, 1.95));
  }
  vec3 qt = drop(q, 0.58, 0.94, 2.0);
  if (on()){
    funnel(qt, vec3(5.35, deck + 2.25, 0.0), vec3(0.3, 0.4, 0.36));
    mast(qt, vec3(-9.2, deck + 0.4, 0.0), 1.5, 0.45);
  }
  // the quay alongside (behind the ship), with a substation and a pylon. v3: pulled in (it ended 2.8 units further
  // aft and 0.9 deeper, so it ran off the right of the stage at 1440 and cut the pylon on phones)
  vec3 qq = fly(q, 0.1, 0.5, vec3(0.0, 0.0, -2.5));
  if (on()){
    float bq = sdBox(qq - vec3(0.2, 1.8, -4.15), vec3(7.7, 2.6, 2.35));
    if (bq < 0.3){
      U(sdRB(qq - vec3(0.2, 0.75, -4.15), vec3(7.2, 0.75, 1.85), 0.1), M_QUAY, -1.0);
      U(sdRB(qq - vec3(6.4, 1.95, -3.55), vec3(0.75, 0.45, 0.72), 0.1), M_SUP, -1.0);
      U(sdRB(qq - vec3(6.4, 2.48, -3.55), vec3(0.42, 0.1, 0.42), 0.05), M_SLATE, -1.0);
      vec3 pq = qq - vec3(4.3, 1.5, -5.3);
      float tw = mix(0.3, 0.08, clamp(pq.y / 3.4, 0.0, 1.0));
      U(sdRB(vec3(pq.x, pq.y - 1.7, pq.z), vec3(tw, 1.7, tw), 0.03), M_SLATE, -1.0);
      U(sdRB(pq - vec3(0.0, 3.0, 0.0), vec3(0.75, 0.06, 0.08), 0.03), M_SLATE, -1.0);
    } else UE(bq, M_QUAY);
  }
  // the cable: from the switchyard over the far rail to the substation, gold, arrives last
  vec3 qk = drop(q, 0.62, 0.95, 1.2);
  if (on()){
    vec3 A = vec3(2.1, deck + 1.37, -0.3), B = vec3(6.4, 2.6, -3.55);
    float bk = sdBox(qk - 0.5 * (A + B) - vec3(0.0, -0.3, 0.0), abs(B - A) * 0.5 + vec3(0.4, 0.9, 0.4));
    if (bk < 0.3){ float tt; float dk = cableSD(qk, A, B, 1.1, tt); U(dk, M_POWER, tt); } else UE(bk, M_POWER);
  }
}

/* ---------------- 6 · cruise ship: a small city on a hull */
void shipCruise(vec3 q){
  float LF = 21.0, LA = 9.0, hb = 2.0, D = 2.4, deck = KEEL + D;
  gDeck = deck;
  hull(q, LF, LA, hb, D, 6.5, 0.3, 0.6, true, LA - 2.6);   // v8: v6's length
  vec3 qa = drop(q, 0.32, 0.7, 2.6);
  if (on()) house(qa, vec3(-4.4, deck + 1.05, 0.0), vec3(13.2, 1.05, hb - 0.06), 0.16, M_WIN);
  vec3 qb = drop(q, 0.4, 0.78, 3.0);
  if (on()) house(qb, vec3(-3.8, deck + 2.7, 0.0), vec3(11.8, 0.6, hb - 0.16), 0.16, M_WIN);
  vec3 qc = drop(q, 0.48, 0.86, 3.4);
  if (on()){
    house(qc, vec3(-3.0, deck + 3.75, 0.0), vec3(9.4, 0.45, hb - 0.3), 0.14, M_WIN);
    bridge(qc, vec3(-12.0, deck + 4.05, 0.0), vec3(0.55, 0.24, hb + 0.18));
  }
  vec3 qt = drop(q, 0.6, 0.95, 2.0);
  if (on()){
    funnel(qt, vec3(3.4, deck + 4.75, 0.0), vec3(0.8, 0.55, 0.6));
    mast(qt, vec3(-11.6, deck + 4.3, 0.0), 1.0, 0.7);
    float bl = sdBox(qt - vec3(-6.6, deck + 0.3, 0.0), vec3(5.0, 0.3, hb + 0.25));
    if (bl < 0.3){
      float lx = qt.x - (-11.0 + clamp(floor((qt.x + 11.0) / 2.2 + 0.5), 0.0, 4.0) * 2.2);
      U(sdRB(vec3(lx, qt.y - deck - 0.3, abs(qt.z) - hb - 0.08), vec3(0.45, 0.13, 0.13), 0.1), M_SLATE, -1.0);
    } else UE(bl, M_SLATE);
  }
}

/* ---------------- 7 · data-centre ship: a ship's hull carrying long enclosed data halls, fed by a gold busbar */
void shipData(vec3 q){
  float LF = 10.0, LA = 6.0, hb = 1.9, D = 2.45, deck = KEEL + D;
  gDeck = deck;
  hull(q, LF, LA, hb, D, 4.2, 0.45, 0.75, false, LA - 2.6);   // v8: v6's length
  vec3 qd = drop(q, 0.3, 0.7, 2.4);
  if (on()){
    house(qd, vec3(-3.95, deck + 0.68, 0.0), vec3(2.35, 0.68, 1.55), 0.1, M_HALL);
    house(qd, vec3(3.1, deck + 0.68, 0.0), vec3(1.6, 0.68, 1.55), 0.1, M_HALL);
  }
  vec3 qh = drop(q, 0.42, 0.8, 3.0);
  if (on()){
    house(qh, vec3(-7.6, deck + 0.75, 0.0), vec3(0.85, 0.75, 1.45), 0.14, M_SUP);
    bridge(qh, vec3(-7.75, deck + 1.72, 0.0), vec3(0.6, 0.22, 1.7));
  }
  vec3 qt = drop(q, 0.58, 0.94, 2.0);
  if (on()){
    float bu = sdBox(qt - vec3(-0.6, deck + 1.6, 0.0), vec3(5.4, 0.3, 1.3));
    if (bu < 0.3){
      vec2 cu = vec2(qt.x - (-5.6 + clamp(floor((qt.x + 5.6) / 1.2 + 0.5), 0.0, 3.0) * 1.2), abs(qt.z) - 0.75);
      U(sdRCylY(vec3(cu.x, qt.y - deck - 1.5, cu.y), 0.3, 0.14, 0.05), M_SLATE, -1.0);
      vec2 cv = vec2(qt.x - (2.2 + clamp(floor((qt.x - 2.2) / 1.2 + 0.5), 0.0, 1.0) * 1.2), abs(qt.z) - 0.75);
      U(sdRCylY(vec3(cv.x, qt.y - deck - 1.5, cv.y), 0.3, 0.14, 0.05), M_SLATE, -1.0);
    } else UE(bu, M_SLATE);
    mast(qt, vec3(-7.8, deck + 1.94, 0.0), 1.2, 0.6);
    // the busbar along the near deck edge, from the module to both halls
    U(sdCylY((qt - vec3(-0.9, deck + 0.1, 1.68)).yxz, 0.075, 5.6), M_POWER, -1.0);
    // v6: the riser leaves the module's front top edge (the module now sits under the deck) and climbs to the deck edge
    U(sdSeg(qt, vec3(0.0, modTop() - 0.12, MH.z * uMod * 0.7), vec3(0.0, deck + 0.1, 1.68), 0.075), M_POWER, -1.0);
  }
}

void ship(vec3 p, float id){
  gZs = id < 0.5 ? 0.62 : 0.42;   // v8: the LNG carrier's steam line runs nearer the open side
  if (id < 0.5) shipLNG(p);
  else if (id < 1.5) shipBox(p);
  else if (id < 2.5) shipBulk(p);
  else if (id < 3.5) shipGov(p);
  else if (id < 4.5) shipPower(p);
  else if (id < 5.5) shipCruise(p);
  else shipData(p);
}

float map(vec3 p){
  gD = 1e9; gDR = 1e9; gM = 0.0; gA = -1.0; gS = 2.0; gO = vec3(0.0); gOC = vec3(0.0);
  module(p);
  if (uAsmA > 0.002){ gAsm = uAsmA; gSlot = 0.0; ship(p, uShipA); }
  if (uAsmB > 0.002){ gAsm = uAsmB; gSlot = 1.0; ship(p, uShipB); }
  gAl = 1.0;
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
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 48; i++){
    float h = map(ro + rd * t);
    res = min(res, mix(6.0, 3.6, uLight) * gDR / t);
    t += clamp(h, 0.02, 0.8);
    if (res < 0.004 || t > 26.0) break;
  }
  gSh = false;
  return clamp(res, 0.0, 1.0);
}
float calcAO(vec3 p, vec3 n){
  gSh = true;
  float occ = 0.0, w = 1.0;
  int Z = int(min(uTime, 0.0));
  for (int i = Z; i < 4; i++){
    float h = 0.03 + 0.3 * float(i) / 3.0;
    map(p + n * h);
    occ += (h - gDR) * w; w *= 0.7;
  }
  gSh = false;
  return clamp(1.0 - 2.6 * occ, 0.0, 1.0);
}
vec3 bumpN(vec3 n, vec3 p, float f, float a){
  vec3 x = p * f; float e = 0.35;
  float v0 = vn(x);
  vec3 g = vec3(vn(x + vec3(e, 0, 0)), vn(x + vec3(0, e, 0)), vn(x + vec3(0, 0, e))) - v0;
  g /= e;
  return normalize(n - (g - n * dot(g, n)) * a);
}

/* ---------------- shading: M4 v2's light (studio key, sky dome, paper bounce) and dark (navy ambient) */
const vec3 SKYL = vec3(0.80, 0.84, 0.90);
vec3 PAPL(){ return pow(uPaper, vec3(2.2)); }
vec3 lightUp(vec3 p, vec3 n, vec3 rd, vec3 alb, float rough, float spec, float sh, float ao){
  vec3 L = uKeyDir;
  vec3 h = normalize(L - rd);
  float shin = exp2(10.0 * (1.0 - rough) + 1.0);
  float fr = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
  vec3 Lf = normalize(vec3(0.8, 0.25, 0.55));
  float fd = clamp(dot(n, Lf) * 0.6 + 0.4, 0.0, 1.0);
  float kd = max((dot(n, L) + 0.25) / 1.25, 0.0) * sh;
  vec3 col;
  if (uLight > 0.5){
    float aos = mix(1.0, ao, mix(0.5, 1.0, uShadow));
    vec3 amb = mix(PAPL() * vec3(1.0, 0.96, 0.9) * 0.6, SKYL, n.y * 0.5 + 0.5);
    col = alb * (uKeyCol * kd * mix(0.42, 0.9, uShadow) + vec3(0.85, 0.9, 1.0) * fd * 0.18 * aos + amb * aos * mix(0.95, 0.55, uShadow));
    col += uKeyCol * pow(max(dot(n, h), 0.0), shin) * (shin + 8.0) / 25.0 * spec * sh * 0.3;
    col += SKYL * fr * aos * (0.06 + 0.25 * spec);
  } else {
    vec3 amb = mix(NAVY * 1.6, LIFT * 2.6, n.y * 0.5 + 0.5);
    col = alb * (uKeyCol * kd * 2.95 + vec3(0.30, 0.42, 0.62) * fd * 0.36 * ao + amb * ao * 0.82);
    col += uKeyCol * pow(max(dot(n, h), 0.0), shin) * (shin + 8.0) / 25.0 * spec * sh * 0.5;
    col += mix(LIFT * 2.0, uKeyCol * 0.6, 0.25) * fr * ao * (0.35 + spec);
  }
  return col;
}

vec3 surf(vec3 pw0, vec3 n0, vec3 rd, float mat, float aux, float slot, vec3 off, out vec3 emis){
  vec3 p = pw0 - off;                // patterns in the part's own frame, so they travel with it
  bool L = uLight > 0.5;
  vec3 CREAM = L ? vec3(0.80, 0.765, 0.69) : ECRU * 0.86;
  vec3 SLATE = L ? SLATEL * 0.78 : mix(FIORD, BALI, 0.45);
  vec3 WIN = L ? SLATEL * 0.5 : DEEP * 3.0;
  vec3 alb = CREAM; float rough = 0.78, spec = 0.12, bA = 0.05, bF = 3.2;
  emis = vec3(0.0);
  float pw = slot < 0.5 ? uPowA : (slot < 1.5 ? uPowB : 0.0);
  bool side = abs(n0.y) < 0.5;
  // v6: py is the height as v5's hull had it (less this ship's depth raise), for the patterns set in absolute heights
  float py = p.y - (slot < 0.5 ? shipRaise(uShipA) : (slot < 1.5 ? shipRaise(uShipB) : 0.0));
  if (abs(mat - M_HULL) < 0.5){
    alb = CREAM;
    if (n0.y > 0.8) alb = L ? vec3(0.62, 0.62, 0.6) : mix(FIORD, ROCK, 0.45);
    else if (p.y < KEEL + 0.62) alb = SLATE * 1.05;                     // the boot-top, below the waterline
  } else if (abs(mat - M_SECT) < 0.5){ alb = CREAM * vec3(0.86, 0.84, 0.8);
  } else if (abs(mat - M_DECK) < 0.5){ alb = L ? vec3(0.66, 0.66, 0.64) : mix(FIORD, ROCK, 0.5);
  } else if (abs(mat - M_BRIDGE) < 0.5){
    alb = CREAM * 1.03;
    // a band of windows wrapping the bridge front and sides, near the top
    if (side){ float b = smoothstep(aux - 0.33, aux - 0.29, p.y) * (1.0 - smoothstep(aux - 0.15, aux - 0.11, p.y)); alb = mix(alb, WIN, b); }
  } else if (abs(mat - M_PLANT) < 0.5){
    alb = CREAM * 0.97;
    if (side){
      // the generator halls: vertical panel joints and a band of louvres
      float j = smoothstep(0.0, 0.05, abs(fract(p.x * 1.6) - 0.5) - 0.42);
      float lv = smoothstep(aux - 0.5, aux - 0.46, p.y) * (1.0 - smoothstep(aux - 0.3, aux - 0.26, p.y));
      alb = mix(alb, SLATE, max(j * 0.6, lv * 0.85));
    }
  } else if (abs(mat - M_SUP) < 0.5 || abs(mat - M_WIN) < 0.5 || abs(mat - M_HALL) < 0.5){
    alb = CREAM * 1.03;
    if (side){
      float yy = (py - KEEL) / 0.3;
      if (abs(mat - M_HALL) < 0.5){
        // data halls: ribbed like containerised halls, two light strips along each side, lit hall by hall
        float yh = py - (KEEL + 2.0);
        float band = smoothstep(0.3, 0.34, yh) * (1.0 - smoothstep(0.42, 0.46, yh)) + smoothstep(0.78, 0.82, yh) * (1.0 - smoothstep(0.9, 0.94, yh));
        float rib = smoothstep(0.0, 0.05, abs(fract(p.x * 1.25) - 0.5) - 0.43);
        float onl = smoothstep(0.0, 0.25, pw * 1.4 - (p.x < 0.0 ? 0.0 : 0.35));
        vec3 cool = L ? vec3(0.06, 0.42, 1.0) : vec3(0.55, 0.85, 1.0);
        alb = mix(alb, SLATE * 0.85, rib * 0.5);
        alb = mix(alb, L ? vec3(0.08, 0.1, 0.14) : DEEP * 2.0, band);
        emis = cool * band * onl * (L ? 0.9 : 1.6);
      } else if (abs(mat - M_WIN) < 0.5){
        float band = smoothstep(0.22, 0.28, fract(yy)) * (1.0 - smoothstep(0.7, 0.76, fract(yy)));
        float dk = floor((py - KEEL - 1.4) / 0.3);
        float lit = smoothstep(0.0, 0.08, pw * 15.0 - dk - 0.6 - abs(p.x) * 0.03);
        alb = mix(alb, WIN, band);
        emis = (L ? vec3(1.0, 0.56, 0.16) * 1.1 : vec3(1.0, 0.58, 0.2) * 1.05) * band * lit;
      } else {
        float band = smoothstep(0.38, 0.43, fract(yy)) * (1.0 - smoothstep(0.6, 0.65, fract(yy)));
        alb = mix(alb, WIN, band * 0.75);
      }
    }
  } else if (abs(mat - M_SLATE) < 0.5){ alb = SLATE; rough = 0.6; spec = 0.25;
  } else if (abs(mat - M_HATCH) < 0.5){ alb = SLATE * 1.1; rough = 0.7;
  } else if (abs(mat - M_DARK) < 0.5){ alb = L ? vec3(0.07, 0.075, 0.085) : mix(GRAPH, DEEP, 0.35); rough = 0.6; spec = 0.25;
  } else if (abs(mat - M_STAND) < 0.5){ alb = SLATE * 0.95; rough = 0.8;
  } else if (abs(mat - M_QUAY) < 0.5){ alb = L ? vec3(0.5, 0.5, 0.48) : mix(FIORD, ROCK, 0.3); rough = 0.9;
  } else if (abs(mat - M_CONT) < 0.5){
    float y0 = KEEL + 2.4;
    vec3 cell = vec3(floor((p.x + 40.0) / 0.65), floor((py - y0) / 0.26), floor((p.z + 4.0) / 0.37));
    float hsh = hash3(cell + vec3(aux * 13.0, 0.0, 0.0));
    vec3 t1 = L ? vec3(0.55, 0.56, 0.57) : mix(FIORD, ROCK, 0.6), t3 = L ? vec3(0.4, 0.52, 0.62) : mix(BALI, ROCK, 0.3);
    alb = hsh < 0.3 ? CREAM : (hsh < 0.55 ? t1 : (hsh < 0.8 ? SLATE : t3));
    vec3 f = fract(vec3((p.x + 40.0) / 0.65, (py - y0) / 0.26, (p.z + 4.0) / 0.37));
    vec3 g = smoothstep(0.0, 0.06, f) * smoothstep(0.0, 0.06, 1.0 - f);
    float joint = abs(n0.z) > 0.5 ? g.x * g.y : (abs(n0.x) > 0.5 ? g.y * g.z : g.x * g.z);
    alb *= mix(0.45, 1.0, joint);
  } else if (abs(mat - M_GOLD) < 0.5 || abs(mat - M_POWER) < 0.5){
    alb = L ? GOLDL : GOLD; rough = 0.45; spec = 0.45; bA = 0.02;
    if (abs(mat - M_GOLD) < 0.5 && aux > 1.5) alb = mix(alb, L ? vec3(0.95, 0.86, 0.62) : ECRU * 0.9, 0.55);   // v8: the cutaway's cut faces
    if (abs(mat - M_POWER) < 0.5){
      float along = aux >= 0.0 ? aux * 6.0 : (p.x > 0.5 ? p.x : -p.x);
      float pulse = smoothstep(0.75, 1.0, sin((along - uPulse * 6.0) * 1.4) * 0.5 + 0.5);
      emis = (L ? vec3(1.0, 0.62, 0.08) : vec3(1.0, 0.8, 0.4)) * (0.22 + pulse) * pw * (L ? 0.9 : 1.4);
      alb = mix(alb, alb * 0.8, 1.0 - pw);
    }
  }
  vec3 n = bumpN(n0, p, bF, bA);
  float sh = softSh(pw0 + n0 * 0.01, uKeyDir);
  float ao = calcAO(pw0 + n0 * 0.005, n0);
  return lightUp(pw0, n, rd, alb, rough, spec, sh, ao);
}

vec3 sky(vec3 rd){ return mix(DEEPEST, DEEP * 1.1, smoothstep(-0.3, 0.4, rd.y)); }

void main(){
  // this pixel's dissolve threshold: interleaved gradient noise, stepped every frame so the dissolve reads as a fade
  vec2 fc = gl_FragCoord.xy + 5.588238 * mod(uFrame, 64.0);
  gN = fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715))));
  gN = 0.02 + 0.96 * gN;
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y + uShift;
  vec3 ro = uCamPos, rd = normalize(uCamF * uFocal + uCamR * uv.x + uCamU * uv.y);
  gSh = false; gAl = 1.0;
  float tT = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float tMax = min(tT, 400.0);
  float t = 0.0; bool hit = false;
  float dP = 1e9, dPP = 1e9, tP = 0.0, sil = 1e9;
  for (int i = 0; i < 200; i++){
    float d = map(ro + rd * t);
    if (dP < dPP && dP < d) sil = min(sil, dP / max(tP * uPixAng, 1e-5));
    dPP = dP; dP = d; tP = t;
    float eps = max(0.0004, t * uPixAng * 0.4);
    if (d < eps){ hit = true; break; }
    t += d * 0.9;
    if (t > tMax) break;
  }
  float mat = gM, aux = gA, slot = gS; vec3 off = gO;
  vec3 col = vec3(0.0); float tt = 90.0;
  bool L = uLight > 0.5, BP = uBlue > 0.5;
  bool disp = false;
  if (hit){
    vec3 p = ro + rd * t; tt = t;
    float e = max(0.0005, t * uPixAng * 0.5);
    vec3 n = calcN(p, e);
    bool gold = abs(mat - M_GOLD) < 0.5;
    if (BP && !gold){
      vec3 n2 = calcN(p, e * 9.0);
      float crease = smoothstep(0.02, 0.07, 1.0 - dot(n, n2));
      float s1 = 1.0 - smoothstep(0.7, 1.7, sil);
      float ln = max(crease, s1);
      vec3 fill = L ? mix(uPaper, vec3(1.0), 0.6) : vec3(0.03, 0.17, 0.25);
      vec3 ink = L ? vec3(0.008, 0.141, 0.204) : vec3(0.91, 0.88, 0.8);
      col = mix(fill + 0.04 * (n.y * 0.5 + 0.5), ink, ln * 0.92);
      if (abs(mat - M_POWER) < 0.5){ vec3 em; surf(p, n, rd, mat, aux, slot, off, em); col = mix(col, L ? vec3(0.84, 0.6, 0.07) : vec3(0.88, 0.67, 0.15), 0.85); col += em * 0.25; }
      disp = true;
    } else {
      vec3 em;
      col = surf(p, n, rd, mat, aux, slot, off, em) + em;
    }
  } else if (tT < 1e4){
    vec3 p = ro + rd * tT; tt = tT;
    vec3 n = vec3(0.0, 1.0, 0.0);
    if (BP){
      vec2 gq = abs(fract(p.xz + 0.5) - 0.5) / (tT * uPixAng);
      float grid = 1.0 - smoothstep(0.5, 1.4, min(gq.x, gq.y));
      vec3 bg = L ? uPaper : vec3(0.008, 0.141, 0.204);
      vec3 ink = L ? vec3(0.008, 0.141, 0.204) : vec3(0.91, 0.88, 0.8);
      col = mix(bg, ink, grid * 0.1 * exp(-tT * 0.012));
      col = mix(col, ink, (1.0 - smoothstep(0.7, 1.7, sil)) * 0.92);
      disp = true;
    } else {
      float sh = softSh(p + n * 0.01, uKeyDir);
      float ao = calcAO(p, n);
      if (L){
        float occ = clamp((1.0 - sh) * mix(0.12, 0.3, uShadow) + (1.0 - ao) * mix(0.22, 0.46, uShadow), 0.0, 0.6);
        col = mix(uPaper, vec3(0.00784, 0.14118, 0.20392), occ);
        disp = true;
      } else {
        vec3 alb = mix(NAVY, LIFT, 0.55) * 1.25 * mix(1.0, 0.92, vn(p * 0.8));
        col = lightUp(p, n, rd, alb, 0.9, 0.05, sh, ao);
      }
    }
  } else {
    tt = 400.0;
    if (BP){ col = L ? uPaper : vec3(0.008, 0.141, 0.204); col = mix(col, L ? vec3(0.008, 0.141, 0.204) : vec3(0.91, 0.88, 0.8), (1.0 - smoothstep(0.7, 1.7, sil)) * 0.92); disp = true; }
    else if (L){ col = uPaper; disp = true; }
    else col = sky(rd);
  }
  float fog = 1.0 - exp(-max(tt - 120.0, 0.0) * 0.012);
  if (!disp){
    col *= uExposure;
    if (L){
      col = mix(col, 0.8 + 0.2 * (1.0 - exp(-(col - 0.8) / 0.2)), step(0.8, col));
      col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
    } else {
      col = mix(col, sky(rd) * 0.9, fog);
      col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
      col = pow(col, vec3(1.0 / 2.2));
    }
  }
  if (L && !BP) col = mix(col, uPaper, fog);
  float coc = clamp(uAperture * (1.0 - uFocus / tt), -1.0, 1.0);
  oCol = vec4(col, coc * 0.5 + 0.5);
}
`;

    /* ------------------------------------------------------------- state */
    var fleet = [], N = 1;
    // s in [0, H) holds ship i (built, power on, card in); [H, 1) is the transition to the next ship. s < 0 is the
    // standalone intro. Under drive=host the last ship's span is all hold
    var clock = { i: 0, s: 0, auto: true, pending: -1, started: false, looped: false };
    var view = { shipA: 0, asmA: 0, powA: 0, shipB: 0, asmB: 1, powB: 1, cam: { dist: 60, az: 36, el: 18, sx: 0, t: 1 }, spin: 0, pulse: 0, busy: false };
    var nameEls = [], barEls = [], cardEls = [], cardsEl = null, stageEl = root.querySelector('.sh-stage');
    var HOST = false;                  // drive=host: p comes from the page, no auto-advance
    var STILL = S_HOLD;                // where a ship rests when nothing moves it
    // A-tabs: the stage's css size and the width a ship may fill (the column on a wide box, the stage on a narrow one),
    // measured on resize, for the fit
    var geo = { sw: 0, sh: 0, fw: 0, narrow: false }, listEl = root.querySelector('.sh-list');

    function setTiming(st) {
      HOST = !!st.host;
      if (HOST) { H = clamp(+st.K.hold || 0.55, 0.2, 0.85); STILL = H / 2; }
      else { H = T_HOLD / T_SPAN; STILL = S_HOLD; }
      SW_S = H + SW * (1 - H);
    }
    function lastHold() { return HOST && clock.i === N - 1; }        // the last ship holds to the end of the scroll
    // each ship's hold centre in p (the last ship's hold is its whole slice)
    function holdP(i) { return HOST && i === N - 1 ? (i + 0.5) / N : (i + STILL) / N; }
    function beats() {
      var out = [];
      for (var i = 0; i < N; i++) out.push({ n: i + 1, id: SHIPS[fleet[i]].id, from: i / N, hold: holdP(i),
        holdFrom: i / N, holdTo: HOST && i === N - 1 ? 1 : (i + H) / N, to: (i + 1) / N });
      return out;
    }
    // drive=host, once the page has called set(p): the clock is p
    function syncHost(st) {
      if (!(st.host && st.hostSet)) return;
      var pp = clamp(st.hp, 0, 0.999999) * N;
      clock.i = Math.min(N - 1, Math.floor(pp)); clock.s = pp - clock.i; clock.pending = -1; clock.looped = false;
    }
    // the ship a still frame shows (reduced motion, no WebGL): under drive=host, the next one once the text would swap
    function stillIdx() { return HOST && !lastHold() && clock.pending < 0 && clock.s >= SW_S ? clock.i + 1 : clock.i; }
    /* v6: layout B's thumb mode, ported: one camera for every ship, near-orthographic (a long lens from far off) and
       nearly broadside, so the ships are to one scale and the module is at the same place in every frame. The frame spans
       tx0..tx1 in x (the module at x 0) and ty0 up from the ground; URL keys tx0, tx1, ty0, taz, tel, tfov tune it */
    var THUMB = false;
    function thumbCam(st) {
      var P = st.P, num = function (k, v) { return P[k] != null && isFinite(+P[k]) ? +P[k] : v; };
      var x0 = num('tx0', -23.4), x1 = num('tx1', 10.6), y0 = num('ty0', -0.5), az = num('taz', 3), el = num('tel', 7), fov = num('tfov', 9);
      var asp = geo.sh > 0 ? geo.sw / geo.sh : st.aspect, foc = 0.5 / Math.tan(fov * D2R / 2), w = x1 - x0, d = foc * w / asp;
      var hgt = w / asp;
      return { dist: d, az: az, el: el, sx: -((0 - x0) / w - 0.5) * asp, sy: 0.5 - (1.9 - y0) / hgt, fov: fov, t: 1 };
    }
    function camFor(k, st) {
      if (THUMB) return thumbCam(st);
      var c = SHIPS[k], side = st.S.cam === 'side';
      // v4: the landscape and portrait framings blend by the stage's aspect (0.85 to 1.15), so a stage of any shape (a
      // phone stage changes height with the browser bars) gets a continuous framing. t = 1 is landscape
      // A-tabs: the stage's aspect from the measured stage (st.aspect is only set once a frame renders, so the first
      // frame, and the only frame under reduced motion, used to frame for an aspect of 1). The blend is v4's, 0.85 to
      // 1.15: a more bow-on camera on phones made the ships bigger but hid the LNG carrier's module behind its aft
      // house, so it was tried and dropped. The wide band (2.5 to 3.5) is all landscape
      var t = ease(((geo.sh > 0 ? geo.sw / geo.sh : st.aspect) - 0.85) / 0.3);
      var o = { dist: mix(c.camP[0], c.cam[0], t) * (side ? 1.05 : 1), az: side ? 2 : mix(c.camP[1], c.cam[1], t),
               el: side ? 8 : mix(c.camP[2], c.cam[2], t), sx: (1 - t) * (c.sxP || 0), sy: 0.05, t: t };
      return fit(k, o);
    }
    /* A-tabs: fit and centre a ship. Its extents box (and its hull's ground shadow, cast along the key light) is
       projected through the camera at o.az / o.el; the distance is solved (three passes, for the perspective) so the
       box fills FIT_H of the stage's height or FIT_W of the allowed width, whichever binds; the frame shift (uShift, in
       stage heights) then puts the box's centre on the stage's centre */
    var FOC = 0.5 / Math.tan(13 * D2R);
    function bounds(e, az, el, dist) {
      var ce = Math.cos(el), pos = [Math.sin(az) * ce * dist, 1.9 + Math.sin(el) * dist, Math.cos(az) * ce * dist];
      var cb = C.lookAt(pos, [0, 1.9, 0]), f = cb.f, r = cb.r, u = cb.u;
      var ka = az - 48 * D2R, ke = 52 * D2R, L = [Math.sin(ka) * Math.cos(ke), Math.sin(ke), Math.cos(ka) * Math.cos(ke)];
      var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      function put(x, y, z) {
        var dx = x - pos[0], dy = y - pos[1], dz = z - pos[2];
        var df = dx * f[0] + dy * f[1] + dz * f[2], ux = FOC * (dx * r[0] + dy * r[1] + dz * r[2]) / df, uy = FOC * (dx * u[0] + dy * u[1] + dz * u[2]) / df;
        if (ux < b.x0) b.x0 = ux; if (ux > b.x1) b.x1 = ux; if (uy < b.y0) b.y0 = uy; if (uy > b.y1) b.y1 = uy;
      }
      // every point also casts onto the ground along the key light, SHADOW_K of the way (a shadow softens and fades the
      // further it falls from what casts it, so the visible part ends short of the geometric one)
      function cast(x, y, z) { put(x, y, z); if (y > 0.5) { var k = SHADOW_K * y / L[1]; put(x - L[0] * k, 0, z - L[2] * k); } }
      var hp = e.pts || (e.pts = hullPts(e.hull));
      hp.forEach(function (q) { cast(q[0], q[1], q[2]); });
      e.parts.forEach(function (bx) {
        for (var i = 0; i < 8; i++) cast(i & 1 ? bx[1] : bx[0], i & 2 ? bx[3] : bx[2], i & 4 ? bx[5] : bx[4]);
      });
      return b;
    }
    function fit(k, o) {
      var e = EXT[SHIPS[k].id];
      if (!e || !(geo.sh > 0)) return o;
      var az = o.az * D2R, el = o.el * D2R, maxW = geo.fw * (geo.narrow ? FIT_WN : FIT_W) / geo.sh, dist = o.dist, b;
      // the visible shadow runs past its geometric outline to the right (the soft penumbra; the key light is fixed to
      // the camera, so it is always to the right): SHADOW_X of the ship's height. It counts in full for the size (so a
      // width-bound phone frame never clips it) and by half for the centre (the pale shadow weighs less than the ship)
      var ex;
      for (var it = 0; it < 3; it++) {
        b = bounds(e, az, el, dist); ex = SHADOW_X * (b.y1 - b.y0);
        dist /= Math.min(maxW / Math.max(1e-3, b.x1 + ex - b.x0), FIT_H / Math.max(1e-3, b.y1 - b.y0));
      }
      b = bounds(e, az, el, dist); ex = SHADOW_X * (b.y1 - b.y0);
      o.dist = dist; o.sx = (b.x0 + b.x1 + ex / 2) / 2; o.sy = (b.y0 + b.y1) / 2;
      return o;
    }
    // the transition's own timing (tau 0..1): the current ship comes apart over 0..0.62, the next assembles over
    // 0.3..1, the power goes off first, and the camera moves over 0.12..0.88. Every curve is eased inside the shader
    function trans(tau) {
      return { asmA: clamp(1 - tau / 0.62, 0, 1), asmB: clamp((tau - 0.3) / 0.7, 0, 1), powA: 1 - ease(tau / 0.14), cam: ease((tau - 0.12) / 0.76) };
    }
    function stillMode(st) { return st.reduced || root.classList.contains('is-nogl'); }

    function goTo(j, st) {
      clock.auto = false;
      root.classList.add('was-picked');
      if (cardsEl) cardsEl.setAttribute('aria-live', 'polite');                         // announce cards only once someone picks
      if (stillMode(st)) { clock.i = j; clock.s = STILL; clock.pending = -1; return; }   // no motion (or no WebGL): straight there
      if (j === clock.i && clock.s < H) { clock.pending = j; clock.s = H; return; }    // replay: take it apart and rebuild it
      clock.pending = j;
      if (clock.s < H) clock.s = H;                                                       // start the transition now
    }

    /* the cards, as a pure function of the clock (standalone or a host's set(p) alike): which card is shown, and the
       outgoing (a) and incoming (b) cards' opacity and rise in px */
    var CS = { shown: 0, a: 0, oa: 1, ya: 0, b: -1, ob: 0, yb: 0 };
    function cardsAt(st) {
      var s = clock.s, cur = clock.i, nxt = clock.pending >= 0 ? clock.pending : (cur + 1) % N;
      CS.shown = cur; CS.a = cur; CS.oa = 1; CS.ya = 0; CS.b = -1; CS.ob = 0; CS.yb = 0;
      if (stillMode(st)) { CS.shown = CS.a = stillIdx(); return CS; }
      if (s < 0) {                                                  // the intro: the first card rises in as its ship builds
        var tin = clamp(1 + s / (T_INTRO / T_SPAN), 0, 1);
        CS.oa = ease((tin - 0.42) / 0.5); CS.ya = (1 - CS.oa) * 10;
        return CS;
      }
      if (s < H || nxt === cur || lastHold()) return CS;
      var tau = (s - H) / (1 - H);
      CS.oa = 1 - ease(tau / CA_OUT); CS.ya = -(1 - CS.oa) * 6;
      CS.b = nxt; CS.ob = ease((tau - CB_IN) / CB_LEN); CS.yb = (1 - CS.ob) * 10;
      if (tau >= SW) CS.shown = nxt;
      return CS;
    }

    var lastBarName = -1;              // A-tabs: the bar is redrawn when the name moves, too (it can stay full across a pick)
    var lastName = -1, lastShown = -1, lastShip = '', lastBar = -1, lastO = [], lastY = [];
    function ui(st) {
      var c = cardsAt(st);
      // the name follows the card, or the reader's pick at once
      var nm = clock.pending >= 0 ? clock.pending : c.shown;
      if (nm !== lastName) {
        lastName = nm;
        // A-tabs: tab semantics (aria-selected, and the roving tabindex follows the selection)
        nameEls.forEach(function (b, k) { b.classList.toggle('on', k === nm); b.setAttribute('aria-selected', k === nm ? 'true' : 'false'); b.tabIndex = k === nm ? 0 : -1; });
        var list = nameEls[nm] && nameEls[nm].closest('.sh-list');
        if (list && list.scrollWidth > list.clientWidth + 2) {
          var li = nameEls[nm].parentNode, left = li.offsetLeft - (list.clientWidth - li.offsetWidth) * 0.5;
          if (list.scrollTo) list.scrollTo({ left: Math.max(0, left), behavior: st.reduced ? 'auto' : 'smooth' }); else list.scrollLeft = left;
        }
      }
      if (c.shown !== lastShown) {
        lastShown = c.shown;
        cardEls.forEach(function (el, k) {
          var on = k === c.shown;
          el.classList.toggle('on', on);
          if (on) { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
          else { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
        });
        var id = SHIPS[fleet[c.shown]].id;
        if (id !== lastShip) { root.setAttribute('data-ship', id); lastShip = id; }
      }
      // opacity and rise: written only when they change (two cards at most move, and only inside a transition)
      for (var k = 0; k < cardEls.length; k++) {
        var o = k === c.a ? c.oa : (k === c.b ? c.ob : 0), y = k === c.a ? c.ya : (k === c.b ? c.yb : 0);
        o = Math.round(o * 1000) / 1000; y = Math.round(y * 10) / 10;
        if (o !== lastO[k] || y !== lastY[k]) {
          lastO[k] = o; lastY[k] = y;
          var es = cardEls[k].style;
          es.opacity = o; es.visibility = o > 0 ? 'visible' : 'hidden'; es.transform = y ? 'translateY(' + y + 'px)' : '';
        }
      }
      // the gold bar under the active name. Standalone: time from one text swap to the next. Under drive=host: how far
      // the page's p is through the stretch this name is shown for (from the swap in to the swap out), so it scrubs
      var prog = 0;
      if (HOST && st.hostSet) {
        var sh = c.shown, f0 = sh === 0 ? 0 : (sh - 1 + SW_S) / N, f1 = sh === N - 1 ? 1 : (sh + SW_S) / N;
        prog = clamp(((clock.i + clock.s) / N - f0) / Math.max(1e-4, f1 - f0), 0, 1);
      } else if (clock.auto && !stillMode(st) && clock.pending < 0) prog = clamp(c.shown === clock.i ? clock.s + 1 - SW_S : clock.s - SW_S, 0, 1);
      else prog = 1;                    // A-tabs: not auto-advancing (picked, advance=off, still): the underline is full
      var q = Math.round(prog * 400) / 400;
      if (q !== lastBar || nm !== lastBarName) { lastBar = q; lastBarName = nm; barEls.forEach(function (el, k) { el.style.transform = 'scaleX(' + (k === nm ? q : 0) + ')'; }); }
    }

    // A-tabs: the card sits under the stage (card=under) or not at all (card=off). measure() keeps the stage's size and
    // the width a ship may fill (the card column on a wide box, the stage itself on a narrow one) for the fit
    function placeCards(st) {
      root.setAttribute('data-card', st.S.card);
      measure();
    }
    function measure() {
      if (!stageEl) return;
      var sw = stageEl.clientWidth, sh = stageEl.clientHeight, narrow = root.clientWidth <= 760;
      var cw = sw;                     // v6: the ship has its own box (beside the card, or over it on narrow boxes)
      if (sw !== geo.sw || sh !== geo.sh || cw !== geo.fw || narrow !== geo.narrow) {
        geo.sw = sw; geo.sh = sh; geo.fw = cw; geo.narrow = narrow;
        if (api && api.redraw) api.redraw();
      }
    }

    /* ------------------------------------------------------------- mount */
    var api = C.mount(root, {
      name: 'Ships v8',
      frag: FRAG,
      startScale: root.hasAttribute('data-thumbmaker') ? 1 : 0.8,      // v6: thumb mode renders at full scale
      maxCoc: 7,
      grain: function (st) { return THUMB ? 0 : st.S.look === 'blueprint' ? 0.008 : (st.theme === 'light' ? 0.014 : 0.022); },
      vignette: function (st) { return st.theme === 'light' || st.S.look === 'blueprint' ? 0 : 0.4; },
      stillTime: 3.0,
      busy: function () { return view.busy; },
      themeDefault: function (raw) {
        var lk = raw['ships.look'] || raw.look || root.getAttribute('data-look');
        return lk === 'blueprint' ? 'dark' : 'light';
      },
      knobs: [
        { key: 'speed', label: 'Clock speed', min: 0.4, max: 2.5, step: 0.05, value: 1, hint: 'standalone: how fast the ships hold and change' },
        { key: 'hold', label: 'Hold share (drive=host)', min: 0.2, max: 0.85, step: 0.01, value: 0.55, hint: 'of each ship\'s slice of p: the ship holds, then dissolves to the next (reloads)' },
        { key: 'shadow', label: 'Shadow strength (light)', min: 0, max: 1, step: 0.01, value: 0.5 },
        { key: 'warmth', label: 'Key light warmth', min: 0, max: 1, step: 0.01, value: 0.6 },
        { key: 'blur', label: 'Depth of field', min: 0, max: 2, step: 0.05, value: 0.6 },
        { key: 'exposure', label: 'Exposure', min: 0.5, max: 2, step: 0.01, value: 1 },
        { key: 'mod', label: 'Module scale', min: 0.4, max: 1, step: 0.01, value: MOD0, hint: 'v6: the module\'s size in every ship, about its seat (1 = v5\'s module, which rose above the decks; it meets the cruise ship\'s ceiling at about 0.68, the government ship\'s at 0.72)' },
        { key: 'rxh', label: 'Reactor height (x v6\'s)', min: 0.45, max: 1, step: 0.01, value: 0.75, hint: 'v8: the two vessels, port and starboard, flat-headed (as plant v4)' },
        { key: 'steam', label: 'LNG steam line ends at (x, x 10 m)', min: 1.6, max: 5.3, step: 0.05, value: 3.65, hint: 'v8: 3.65 = 1.5 m forward of the deckhouse; v6 ran to 5.3, under it. The other ships keep v6\'s length' },
        { key: 'scoopw', label: 'Cutaway half-width (x module)', min: 0.4, max: 1.2, step: 0.01, value: 0.9, hint: 'v8: cutaway=scoop|corner, as plant v4' },
        { key: 'scoopd', label: 'Cutaway depth (down the near face)', min: 0.8, max: 2.9, step: 0.05, value: 2.25 },
        { key: 'scoopz', label: 'Cutaway reach (into the top)', min: 0.4, max: 1.8, step: 0.05, value: 1.35 }
      ],
      selects: [
        { key: 'cutaway', label: 'Enclosure cutaway', options: ['scoop', 'corner', 'open'], value: 'scoop', hint: 'v8: scoop = a curved bite out of the near top edge; corner = the same on the near top aft corner; open = an open near face' },
        { key: 'lngdeck', label: 'LNG deck', options: ['vents', 'hatches'], value: 'vents', hint: 'v8: vents = the membrane trunk (45-degree sides) and four vent stacks; hatches = v6\'s' },
        { key: 'fleet', label: 'Fleet', options: ['plan', 'wide'], value: 'plan', hint: 'v6: plan (the default) = the client four, in build-plan order; wide = all seven (reloads)' },
        { key: 'tiles', label: 'Tiles', options: ['fit', 'fill'], value: 'fit', hint: 'v6: fit = Figma\'s tile size (a seventh of the column), the row centred; fill = the tiles share the whole column' },
        { key: 'look', label: 'Look', options: ['clay', 'blueprint'], value: 'clay', hint: 'clay = white clay on paper; blueprint = light lines on navy, the module solid' },
        { key: 'card', label: 'Card', options: ['under', 'off'], value: 'under', hint: 'the plan card under the ship, or none' },
        { key: 'heading', label: 'Heading', options: ['on', 'off'], value: 'on', hint: 'off for a page that sets its own' },
        { key: 'build', label: 'Assembly', options: ['slide', 'drop'], value: 'slide', hint: 'slide = hull halves slide in fore and aft, decks drop on; drop = everything drops on' },
        { key: 'cam', label: 'Camera', options: ['q', 'side'], value: 'q', hint: 'q = three-quarter; side = broadside, like the client drawing' },
        { key: 'advance', label: 'Advance', options: ['auto', 'off'], value: 'auto', hint: 'standalone: auto = through the ships until the first click; off = only on click' },
        { key: 'theme', label: 'Theme', options: ['light', 'dark'], value: 'light', hint: 'reloads' },
        { key: 'paper', label: 'Paper (light)', options: ['f2f2f0', 'ffffff'], value: 'f2f2f0', hint: 'reloads' }
      ],
      drive: { beats: [], highlight: null },
      init: function (st) {
        fleet = SHIPS.map(function (s, i) { return i; }).filter(function (i) { return st.S.fleet === 'plan' ? SHIPS[i].plan : true; });
        N = fleet.length;
        // the hold share: the URL key, then data-hold on the root, then 0.55
        if (st.P.hold == null || !isFinite(+st.P.hold)) { var dh = parseFloat(root.getAttribute('data-hold')); if (isFinite(dh)) st.K.hold = dh; }
        setTiming(st);
        clock.auto = !st.host && st.S.advance !== 'off';
        clock.s = st.reduced || st.host ? STILL : -T_INTRO / T_SPAN;
        if (st.S.look === 'blueprint' && st.P.blur == null) st.K.blur = 0;
        root.setAttribute('data-look', st.S.look);
        root.setAttribute('data-fleet', st.S.fleet);
        root.setAttribute('data-tiles', st.S.tiles);
        // v6: thumb mode (the thumbnail maker): one camera for every ship, no depth of field
        THUMB = root.hasAttribute('data-thumbmaker') || 'thumb' in st.P;
        if (THUMB) st.K.blur = 0;
        st.K.mod = clamp(st.K.mod, 0.4, 1);
        // card and heading: the URL key, then the root's data-card / data-heading, then the default. lines=off (v2)
        // still means no card
        var ck = st.P.card, ca = root.getAttribute('data-card'), okc = ['under', 'off'];
        st.S.card = okc.indexOf(ck) >= 0 ? ck : (st.P.lines === 'off' ? 'off' : (okc.indexOf(ca) >= 0 ? ca : 'under'));
        root.style.setProperty('--n', String(N));          // v5: the tile row's column count (four with fleet=plan)
        var hk = st.P.heading, ha = root.getAttribute('data-heading');
        st.S.heading = hk === 'on' || hk === 'off' ? hk : (ha === 'off' ? 'off' : 'on');
        root.setAttribute('data-heading', st.S.heading);
        this.drive.beats = beats();
        this.drive.highlight = { from: 0, to: holdP(Math.min(2, N - 1)), seconds: 13 };
        Array.prototype.forEach.call(root.querySelectorAll('[data-ship-item]'), function (li) {
          if (fleet.indexOf(IDX[li.getAttribute('data-ship-item')]) < 0) li.parentNode.removeChild(li);
        });
        Array.prototype.forEach.call(root.querySelectorAll('[data-card]:not(#tsr-ships)'), function (el) {
          if (fleet.indexOf(IDX[el.getAttribute('data-card')]) < 0) el.parentNode.removeChild(el);
        });
        nameEls = fleet.map(function (k) { return root.querySelector('[data-ship-item="' + SHIPS[k].id + '"] button'); });
        barEls = nameEls.map(function (b) { return b.querySelector('.sh-bar'); });
        cardsEl = root.querySelector('.sh-cards');
        cardEls = fleet.map(function (k) { return root.querySelector('.sh-tcard[data-card="' + SHIPS[k].id + '"]'); });
        // the CTAs: the page's contact link (data-contact, default contact-t4m-v3.html) with the area of interest
        var contact = (root.getAttribute('data-contact') || 'contact-t4m-v3.html').split('#')[0];
        Array.prototype.forEach.call(root.querySelectorAll('.sh-cta[data-interest]'), function (a) {
          a.setAttribute('href', contact + '#interest=' + a.getAttribute('data-interest'));
        });
        placeCards(st);
        if ('ResizeObserver' in window) { var ro = new ResizeObserver(measure); ro.observe(root); if (stageEl) ro.observe(stageEl); }
        window.addEventListener('resize', measure);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
        // A-tabs: the tab bar's keys (manual activation: arrows, Home and End move focus; Enter or Space picks, as the
        // buttons' own click). Focus entering the tabs stops the auto-advance, so the selection never moves under it
        if (listEl) {
          listEl.addEventListener('keydown', function (e) {
            var i = nameEls.indexOf(document.activeElement), n = nameEls.length, j = -1;
            if (i < 0) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
            else if (e.key === 'Home') j = 0;
            else if (e.key === 'End') j = n - 1;
            if (j < 0) return;
            e.preventDefault();
            nameEls[j].focus();
          });
          listEl.addEventListener('focusin', function () {
            if (clock.auto && !st.host && root.querySelector('.sh-name:focus-visible')) { clock.auto = false; if (api && api.redraw) api.redraw(); }
          });
        }
        nameEls.forEach(function (b, j) {
          b.addEventListener('click', function () {
            // drive=host: tell the page, which scrolls to that ship's hold; its set(p) then moves the moment. Until the
            // page has called set() at all, the moment also goes there by itself, so a click is never dead
            if (st.host) {
              root.dispatchEvent(new CustomEvent('t4m:pick', { detail: { n: j + 1, id: SHIPS[fleet[j]].id, p: holdP(j) } }));
              if (st.hostSet) return;
            }
            goTo(j, st);
            if (api && api.redraw) api.redraw();
          });
        });
        if ('IntersectionObserver' in window) {
          new IntersectionObserver(function (es) { if (es[0].isIntersecting) clock.started = true; }, { threshold: 0.25 }).observe(root);
        } else clock.started = true;
        ui(st);
      },
      onKnob: function (st, k) {
        if (k === 'look') root.setAttribute('data-look', st.S.look);
        if (k === 'card') placeCards(st);
        if (k === 'heading') root.setAttribute('data-heading', st.S.heading);
        if (k === 'tiles') { root.setAttribute('data-tiles', st.S.tiles); measure(); }
        if (k === 'theme' || k === 'paper' || k === 'fleet' || k === 'hold') {
          var v = k === 'hold' ? st.K.hold.toFixed(2) : st.S[k];
          var h = (location.hash || '').slice(1).split('&').filter(function (kv) { var n = decodeURIComponent(kv.split('=')[0]); return kv && n !== k && n !== 'ships.' + k; });
          h.push('ships.' + k + '=' + encodeURIComponent(v));
          location.hash = h.join('&'); location.reload();
        }
        if (k === 'advance') clock.auto = !st.host && st.S.advance !== 'off';
      },
      beatOf: function () { return clock.i; },
      overlay: function (st) { syncHost(st); ui(st); },
      step: function (st, dt) {
        var P = st.P;
        if (st.host && st.hostSet) {
          syncHost(st);
        } else if (P.ship != null && IDX[P.ship] != null && fleet.indexOf(IDX[P.ship]) >= 0) {
          // debug lock: #ship=<id>&s=<-0.24..1>
          clock.i = fleet.indexOf(IDX[P.ship]); clock.s = P.s != null && isFinite(+P.s) ? clamp(+P.s, -0.99, 0.999) : STILL;
        } else if (!st.reduced && clock.started) {
          clock.s += dt * (st.K.speed || 1) / T_SPAN;
          var holdHere = !clock.auto && clock.pending < 0;
          if (holdHere && clock.s > STILL && (clock.s < H || lastHold())) clock.s = STILL;
          if (clock.s >= 1) {
            var nx = clock.pending >= 0 ? clock.pending : (clock.i + 1) % N;
            if (nx === 0 && clock.i === N - 1) clock.looped = true;
            clock.i = nx; clock.pending = -1; clock.s = 0;
          }
        }
        if (!(st.host && st.hostSet)) st.hp = clamp((clock.i + Math.max(clock.s, 0)) / N, 0, 1);
        // the two ship slots
        var s = clock.s, cur = fleet[clock.i], last = lastHold() && clock.pending < 0;
        var nextI = clock.pending >= 0 ? clock.pending : (clock.i + 1) % N;
        var ca = camFor(cur, st);
        view.busy = s < 0 || (s >= H && !last);
        if (st.reduced) {
          var ci = fleet[stillIdx()];
          view.shipA = ci; view.asmA = 0; view.powA = 0; view.shipB = ci; view.asmB = 1; view.powB = 1; view.cam = camFor(ci, st);
        } else if (s < 0) {
          // the intro: the first ship builds around the bare module (or, after a loop, out of the last one)
          var tin = clamp(1 + s / (T_INTRO / T_SPAN), 0, 1);
          view.shipB = cur; view.asmB = tin; view.powB = 0;
          view.shipA = fleet[N - 1]; view.asmA = 0; view.powA = 0;
          view.cam = ca;
        } else if (s < H || last) {
          // the hold. Standalone the power comes on over its first moments (v3); under drive=host it is already on (it
          // came on at the end of the transition), so the whole hold is one still state, from either direction
          view.shipA = cur; view.asmA = 0; view.powA = 0;
          view.shipB = cur; view.asmB = 1; view.powB = HOST ? 1 : ease(s / 0.09);
          view.cam = ca;
        } else {
          var tau = (s - H) / (1 - H), tr = trans(tau), nxt = fleet[nextI], cb = camFor(nxt, st);
          view.shipA = cur; view.asmA = tr.asmA; view.powA = tr.powA * (HOST ? 1 : ease(s / 0.09));
          view.shipB = nxt; view.asmB = tr.asmB; view.powB = HOST ? ease((tau - 0.86) / 0.14) : 0;
          if (nxt === cur) { view.shipB = cur; }
          view.cam = { dist: mix(ca.dist, cb.dist, tr.cam), az: mix(ca.az, cb.az, tr.cam), el: mix(ca.el, cb.el, tr.cam), sx: mix(ca.sx, cb.sx, tr.cam), sy: mix(ca.sy, cb.sy, tr.cam), t: mix(ca.t, cb.t, tr.cam) };
        }
        var pw = Math.max(view.powA, view.powB);
        view.spin += dt * 7.0 * pw; view.pulse += dt * (0.25 + 0.75 * pw);
      },
      uniforms: (function () {
        var vPos = new Float32Array(3), vF = new Float32Array(3), vR = new Float32Array(3), vU = new Float32Array(3), vKey = new Float32Array(3), vKC = new Float32Array(3), vSh = new Float32Array(2), vPa = new Float32Array(3), vSc = new Float32Array(3);
        function put(a, b) { a[0] = b[0]; a[1] = b[1]; a[2] = b[2]; return a; }
        return function (st, U) {
          var light = st.theme === 'light', bp = st.S.look === 'blueprint', K = st.K, cam = view.cam;
          var drift = st.reduced || THUMB ? 0 : 1.2 * Math.sin(st.t * 0.21);
          var az = (cam.az + drift) * D2R, el = cam.el * D2R;
          // A-tabs: the distance and the frame shift come from the fit (camFor), blended through a transition
          var dist = cam.dist;
          var ce = Math.cos(el), tgt = [0, 1.9, 0];
          var pos = [Math.sin(az) * ce * dist, 1.9 + Math.sin(el) * dist, Math.cos(az) * ce * dist];
          var cb = C.lookAt(pos, tgt), fov = cam.fov || 26;
          U.v3('uCamPos', put(vPos, cb.pos)); U.v3('uCamF', put(vF, cb.f)); U.v3('uCamR', put(vR, cb.r)); U.v3('uCamU', put(vU, cb.u));
          var foc = 0.5 / Math.tan(fov * D2R / 2);
          U.f('uFocal', foc); U.f('uPixAng', 1 / (foc * st.h));
          vSh[0] = cam.sx || 0; vSh[1] = cam.sy == null ? 0.05 : cam.sy;
          U.v2('uShift', vSh);
          U.f('uFocus', dist); U.f('uAperture', 0.35);
          U.f('uExposure', K.exposure * (light ? 1.0 : 1.05));
          var ka = ((THUMB ? 27 : cam.az) - 48) * D2R, ke = 52 * D2R;
          vKey[0] = Math.sin(ka) * Math.cos(ke); vKey[1] = Math.sin(ke); vKey[2] = Math.cos(ka) * Math.cos(ke);
          U.v3('uKeyDir', vKey);
          U.v3('uKeyCol', put(vKC, light ? mixv([1.0, 0.98, 0.95], [1.0, 0.88, 0.68], K.warmth) : mixv([1.0, 0.9, 0.76], [1.0, 0.7, 0.32], K.warmth)));
          U.f('uLight', light ? 1 : 0); U.f('uBlue', bp ? 1 : 0); U.f('uShadow', K.shadow);
          U.v3('uPaper', put(vPa, st.paperRGB));
          U.f('uShipA', view.shipA); U.f('uAsmA', view.asmA); U.f('uPowA', view.powA);
          U.f('uShipB', view.shipB); U.f('uAsmB', view.asmB); U.f('uPowB', view.powB);
          U.f('uBuild', st.S.build === 'drop' ? 1 : 0);
          U.f('uSpin', view.spin); U.f('uPulse', view.pulse);
          U.f('uMod', K.mod);
          // v8: the module's cutaway and vessels, the LNG carrier's steam line and deck
          U.f('uCutK', st.S.cutaway === 'corner' ? 1 : (st.S.cutaway === 'open' ? 2 : 0));
          U.f('uRxH', clamp(+K.rxh, 0.45, 1)); U.f('uSteam', clamp(+K.steam, 1.6, 5.3)); U.f('uVent', st.S.lngdeck === 'hatches' ? 0 : 1);
          vSc[0] = K.scoopw; vSc[1] = K.scoopd; vSc[2] = K.scoopz; U.v3('uScoop', vSc);
        };
      })()
    });
  })();
}

})();

});