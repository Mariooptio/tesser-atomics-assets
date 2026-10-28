/* Tesser Atomics · scene: the plant · extracted unchanged from handoff-site-v11 heavy/site-t4m-v11.html (script 2). */
window.__TZ_LAZY('tsr-plant', 0, function () {

(function () {
'use strict';
/* ============================================================================
   Plant core · runtime for the C-plant WebGL moment ("How it works: the plant")
   ----------------------------------------------------------------------------
   A copy of C-ships/src/core-ships-v4.js (the ships runtime, itself a copy of
   C-fuel's), taken Oct 7. C-ships is not edited. What is different:
     - root #tsr-plant, classes pl-*, global name PLCORE (inlined inside the
       moment's IIFE, so nothing leaks), URL namespace plant.<key>
     - the moment owns its timeline and its host hook (t4mDrive, t4m:beat), so
       the core no longer exposes one in drive=host; it keeps the
       redraw-on-resize for a box that changes size while no frame is coming
     - api.setRunning(on) starts and stops the render loop (the reveal plays
       once, then the loop stops on its last frame), api.render() draws one
       frame now
     - the knob panel can carry buttons (def.buttons: replay)
   Everything else (the GL target and post pass, adaptive render scale, the
   no-WebGL path, theme and paper resolution, the knob panel) is as the ships.
   ========================================================================= */
var PLCORE = (function () {
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

  /* theme, paper and drive: the plant.<key> URL key, then the bare URL key, then data-<key> on the root, then the default.
     raw is an unmerged params() read, so an invalid namespaced value falls through to the bare key. */
  var HEX6 = /^#?([0-9a-fA-F]{6})$/;
  function themeOf(root, raw, def) {
    function pick(key, ok) {
      var c = [raw['plant.' + key], raw[key], root.getAttribute('data-' + key)];
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
      setTimeout(function () { throw new Error('plant shader compile: ' + log); });
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
      setTimeout(function () { throw new Error('plant program link: ' + log); });
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
    /* plant.<key> wins over a bare <key>, so moments sharing one page URL keep their own switches */
    Object.keys(P).forEach(function (k) { if (k.indexOf('plant.') === 0) P[k.slice(6)] = P[k]; });
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

    var track = root, stage = root.querySelector('.pl-stage');
    var canvas = root.querySelector('canvas.pl-gl');
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
      api.setRunning = function () {}; api.render = onScrollNoGl;
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
    // plant: the moment starts and stops the loop itself (it stops on the reveal's last frame)
    api.setRunning = function (on) {
      running = !!on;
      if (running) schedule();
      else { if (raf) { cancelAnimationFrame(raf); raf = 0; } last = 0; }
    };
    api.render = function () { redraw(true); };

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

    // the box can change size (or go from hidden to shown) while no frame is coming: redraw then
    if ('ResizeObserver' in window) new ResizeObserver(function () { if (!raf && stage.clientWidth > 0) redraw(true); }).observe(stage);

    function panel() {
      var el = document.createElement('div');
      el.className = 'pl-knobs';
      var h = '<div class="pl-knobs__h">' + def.name + ' · knobs</div>';
      (def.selects || []).forEach(function (k) {
        h += '<label class="pl-knobs__row"><span>' + k.label + '</span><select data-s="' + k.key + '">' +
          k.options.map(function (o) { return '<option' + (o === st.S[k.key] ? ' selected' : '') + '>' + o + '</option>'; }).join('') +
          '</select></label>';
        if (k.hint) h += '<div class="pl-knobs__hint">' + k.hint + '</div>';
      });
      def.knobs.forEach(function (k) {
        h += '<label class="pl-knobs__row"><span>' + k.label + '<b data-v="' + k.key + '"></b></span>' +
          '<input type="range" min="' + k.min + '" max="' + k.max + '" step="' + k.step + '" value="' + st.K[k.key] + '" data-k="' + k.key + '"></label>';
        if (k.hint) h += '<div class="pl-knobs__hint">' + k.hint + '</div>';
      });
      (def.buttons || []).forEach(function (b, i) { h += '<button type="button" class="pl-knobs__copy" data-btn="' + i + '">' + b.label + '</button>'; });
      h += '<div class="pl-knobs__row"><span>fps <b data-fps>-</b> · render scale <b data-scale>-</b></span></div>';
      h += '<button type="button" class="pl-knobs__copy" data-copy>Copy JSON</button>';
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
        var bi = e.target.getAttribute('data-btn');
        if (bi != null && def.buttons && def.buttons[+bi]) def.buttons[+bi].fn(st);
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
   Plant · "How it works: the plant" · v5                                -t4m
   ----------------------------------------------------------------------------
   v5 (Oct 26, Andrew on v4: approved, with one change). He reads Per's
   "curved cutaway boundary" as also meaning the cut in the ship. So the
   hull's engine-room opening (v4: roomSD's rectangular notch through the
   near side and the deck) is now one smooth curve in side view: a rounded
   bite down from the deck edge (a superellipse centred on the deck line),
   an X-ray into the hull that frames the module and the whole steam line,
   whose end now meets the curve's aft wall just under the deckhouse front.
     - hullcut=curve (default) | box (v4's notch, the shaft tunnel and cutw)
     - cutfwd, cutaft: where the curve meets the deck edge (x); cutdepth: how
       far it reaches down from the deck; cutn: its shape (2 = an ellipse;
       higher is fuller at the bottom; 4 by default, because an ellipse that
       clears the module's lower forward corner would have to start forward
       of the cargo trunk's aft end)
     - the far half of the deck stays over the module as its ceiling, inside
       the curve; the near side and the deck are cut to just above the deck
       (nothing standing on the deck is cut); the cut faces keep the section
       colour
   The module, the steam line, the camera, the label, the timing and the host
   hook are v4's.

   v4 (Oct 26, from Per Peterson's notes of Oct 24): "have the two reactors be
   in port and starboard locations, rather than forward and aft. Also ... flat
   top and bottom heads, and ... a bit shorter. ... having a different cutaway
   pattern could be good, where the cutaway of the box is an obvious cutaway
   (for example, having a curved cutaway boundary)." And the horizontal
   cylinder that projects aft from the enclosure (the gold power line in the
   shaft tunnel) "shorter so it ends just in front of the navigation deck,
   since the power conversion is under the navigation deck." So:
     - the two vessels stand port and starboard (z = +-RXZ), flat-headed, at
       rxh (knob, default 0.75) of v3's height, on the module's floor
     - a steam header across their tops runs aft through the enclosure's aft
       wall; outside it becomes the steam line, which now leaves the module's
       aft wall on the centre line and ends at steam (knob, default x 3.65,
       1.5 m forward of the deckhouse) in the tunnel's end wall
     - the enclosure is a closed gold shell (no longer an open-fronted frame),
       less a curved cutaway: cutaway=scoop (default; an ellipsoid bite out of
       its near top edge, scoopw x scoopd x scoopz), corner (the same bite
       centred on the near top aft corner) or open (v3's open near face); the
       cut faces are a lighter gold, so the cut reads as a cut
     - lngdeck=vents (default): Per's LNG notes for the ships moment, applied
       to this LNG carrier too (the same ship): the trunk's port and starboard
       sides slope at 45 degrees, and four slender vent stacks with bulging
       caps replace the four hatches; lngdeck=hatches is v3's deck
   Everything else is v3's, below.

   v3 (Oct 21, Andrew): "Need to make the nuclear module shorter. Can't be the
   full vertical space of the ship. We did that for all of the 3D models later
   in the site, but we didn't do it on this module." So the ships v6 geometry
   (C-ships/src/ships-v6.js) is ported here, and the two sections agree:
     - the module is scaled by mod (knob, default 0.58 = ships v6's MOD0)
       about its base and sits on a seat at MBOT 0.64 inside the hull, top at
       0.64 + 2.92 mod (2.33 at 0.58): 12 x 17 x 10 m against v2's 20 x 29 x 18
     - the LNG deck stays at 2.95, so there is 6.2 m of headroom to the deck
       top and 5.0 m to its underside
     - the engine room is v6's: sized to the module, the far half of the deck
       left over it as a ceiling, the near side open to the viewer and the sky
     - the arrival can no longer drop straight in (the ceiling is in the way):
       arrive=lower (default) lowers it through the open side, in front of the
       ceiling, then skids it back onto its seat; arrive=settle fades it in on
       the seat, settling the last few metres from just under the ceiling
     - push (knob, default 1 = off) eases the camera in on the module after it
       lands, for a closer hold; at 1 the camera never moves (v2's rule)
     - the label's anchor follows the module (its scale, lift and skid)
   Everything else is v2's, below.

   Andrew (Oct 7, on v1 in site v7): "I don't want to see the ship get cut
   off. Like see the full ship, sort of from a side profile, like when it was
   the drawing, but still have the 3D and see the 3D sort of like be built
   together as an animation. But I don't want it to get cut off and cropped."

   One LNG carrier, bow to stern, always whole in the frame with margin, from
   a near side profile (the client's drawing's view, turned just enough to
   read as 3D: azimuth 16 degrees, elevation 11, a long 18 degree lens). It
   builds itself with the ships moment's assembly, then the gold module drops
   into its engine-room bay last, then the label. It plays once, when the
   moment is about 40% in view, then holds on its last frame. No close-up,
   no crop: the camera never moves.
     beat 1 · hull    the hull halves have slid together (the decks, the
                      cargo trunk and domes, the aft house, the funnel and
                      masts follow, in the ships' order)
     beat 2 · module  the gold module has dropped into its bay (it falls from
                      above, fading in like every part, and warms as it lands);
                      the shaft's power comes on
     beat 3 · label   "Nuclear module" (live HTML) with a leader from the
                      module's top up past the ship's silhouette
   The engine-room bay is the ships' modest side cut (open to the viewer and
   the sky), so the module shows without cropping anything. No internals.
   Everything is a pure function of the timeline p (0 to 1), including the
   assembly's dither (its frame counter comes from p), so set(p) gives the
   same frame every time: ready for pre-rendered frames (with grain=0).

   The host hook is v1's: root.t4mDrive { set(p), start(), stop(), beats,
   duration, p, anchor() }, the events t4m:drive-ready, t4m:beat {n, id, p,
   dir} and t4m:done, data-reveal and is-b1..is-b3 on the root; play=view
   (once, at 40% in view) or off; data-drive="host" waits. The beats are now
   1 hull, 2 module, 3 label.

   A copy of v1's src/plant.js (v1 is unchanged): the SDF scene (from C-ships
   ships-v5.js), the module, the shading and the fit; what is new is marked v2.
   Units are 10 m; the module is the same size as in the ships.
   ========================================================================= */
var root = document.getElementById('tsr-plant');
if (root && !root.__plant) {
  root.__plant = true;
  (function () {
    var C = PLCORE, clamp = C.clamp, mix = C.mix, mixv = C.mixv;
    var D2R = Math.PI / 180;
    function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
    function outc(x) { x = clamp(x, 0, 1); return 1 - (1 - x) * (1 - x) * (1 - x); }
    function span(p, a, b) { return clamp((p - a) / Math.max(1e-4, b - a), 0, 1); }

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
const vec3 NAVYS = vec3(0.00784, 0.14118, 0.20392);   // plant: the navy section's colour, display (sRGB) values
// two ship slots: A comes apart, B assembles (outside a transition, A is empty and B is the current ship)
uniform float uShipA, uAsmA, uPowA, uShipB, uAsmB, uPowB;
uniform float uBuild, uSpin, uPulse;
// plant: uLift raises the module above its bay (v2: it drops in from there, last); uModA and uStandA are the module's and
// its stand's alpha for the dithered fade (as every ship part's); uCut widens the engine-room cut by up to uCutW either
// side (a section, cut faces only, nothing inside the hull); uTone fades the ship toward the background; uGlow warms the gold
uniform float uLift, uCut, uCutW, uTone, uGlow, uModA, uStandA;
// v3: the module's scale about its base (the mod knob, as ships v6's uMod), and its skid toward the viewer (z) while it
// is lowered in through the open side of the engine room
uniform float uMod, uSlide;
// v4: the cutaway's shape (0 scoop, 1 corner, 2 open) and its semi-axes (modelled units); the vessels' height (x v3's);
// the steam line's aft end (x); the LNG deck (1 vents and a 45-degree trunk, 0 v3's hatches)
uniform float uCutK, uRxH, uSteam, uVent;
uniform vec3 uScoop;
// v5: the hull's cut (0 v4's box, 1 the curve) and the curve: x where it meets the deck forward and aft, its depth below
// the deck, its superellipse exponent
uniform float uHullCut;
uniform vec4 uBite;

#define PI 3.14159265
#define KEEL 0.35
#define MY 1.9
const vec3 MH = vec3(1.0, 1.45, 0.9);
// v3 (ships v6): the module as modelled (MY, MH: v1/v2's, base at MB0, frame top at MT0) is scaled by uMod about its base
// and set on a seat at MBOT. The engine room's floor is the tank top, TANK; the room is the module plus RX either side and
// RZ behind it
#define MB0 0.45
#define MT0 3.37
#define MBOT 0.64
#define TANK 0.43
#define RX 0.42
#define RZ 0.34
float modTop(){ return MBOT + (MT0 - MB0) * uMod; }

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

/* ---------------- the module: two reactor vessels in a gold enclosure, on a seat. Abstract on purpose: no vessel
   internals and no fuel-handling machinery (client rule). plant v2: the seat comes with the hull (uStandA); the module
   arrives from uLift above it, fading in as it comes (uModA). v3: ships v6's module, scaled by uMod about its base on a
   seat at MBOT, and moved by (0, uLift, uSlide) while it arrives.
   v4 (Per): the vessels port and starboard (z), flat heads, shorter; a steam header across their tops and a line aft
   through the aft wall; the enclosure a closed shell with a curved cutaway (cutSD), its cut faces lighter (aux 2) */
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
  gSlot = 2.0; gOC = vec3(0.0);
  float s = uMod;
  gAl = uStandA;
  // v3 (ships v6): the seat, a low slate plinth from the ground (inside the hull it shows only above the tank top)
  U(sdRB(p - vec3(0.0, 0.5 * MBOT, 0.0), vec3(0.82 * s, 0.5 * MBOT, 0.72 * s), 0.04), M_STAND, -1.0);
  gAl = uModA; gOC = vec3(0.0, uLift, uSlide);
  // the module as modelled, scaled by s about its base; every distance below is scaled back by s
  vec3 m = (p - vec3(0.0, MBOT + uLift, uSlide)) / s + vec3(0.0, MB0 - MY, 0.0);
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
// v3 (ships v6): the engine room is sized to the module (RX either side, RZ behind it). It is two boxes: the room itself,
// from the tank top to the underside of the deck (gDeck, less DECKT), across the whole beam from RZ behind the module; and
// the cut that opens it to the viewer, the near side from ZC forward, up through the deck and open to the sky. So the far
// half of the deck stays as a ceiling over the module, and the headroom reads as the gap between the module's top and that
// ceiling. The opening runs RAFT further aft than the forward bulkhead is forward of the module (the camera looks in from
// aft). plant: uCut widens it fore and aft by up to uCutW (0 by default, so the room is the ships')
#define DECKT 0.12
#define ZC -0.15
#define RAFT 0.95
float gDeck = 9.0;
// v5: the curve in side view (x, y): a superellipse centred on the deck line between uBite.x and uBite.y, reaching
// uBite.z down, exponent uBite.w; negative inside. Scaled to stay a safe (under-estimating) distance
float biteSD(vec2 q){
  vec2 c = vec2(0.5 * (uBite.x + uBite.y), gDeck), a = vec2(0.5 * (uBite.y - uBite.x), uBite.z);
  vec2 u = abs(q - c) / a;
  float k = pow(pow(u.x, uBite.w) + pow(u.y, uBite.w), 1.0 / uBite.w) - 1.0;
  return k * min(a.x, a.y) * 0.75;
}
float roomSD(vec3 q){
  if (uHullCut > 0.5){
    // v5: the room is the curve's inside from the tank top to the deck's underside, from RZ behind the module to the
    // near side; the opening is the curve's inside from ZC forward, up to just above the deck. So the far half of the
    // deck stays as a ceiling, and nothing standing on the deck is cut
    float e = biteSD(q.xy), z0 = -(MH.z * uMod + RZ);
    float a = max(e, max(max(TANK - q.y, q.y - (gDeck - DECKT)), z0 - q.z));
    float b = max(e, max(q.y - (gDeck + 0.02), ZC - q.z));
    return min(a, b);
  }
  float hx = MH.x * uMod + RX, z0 = -(MH.z * uMod + RZ), x0 = -hx - uCut * uCutW, x1 = hx + RAFT + uCut * uCutW;
  float y1 = gDeck - DECKT;
  float a = sdBox(q - vec3(0.5 * (x0 + x1), 0.5 * (TANK + y1), 0.5 * (z0 + 9.0)), vec3(0.5 * (x1 - x0), 0.5 * (y1 - TANK), 0.5 * (9.0 - z0)));
  float b = sdBox(q - vec3(0.5 * (x0 + x1), TANK + 3.0, 0.5 * (ZC + 9.0)), vec3(0.5 * (x1 - x0), 3.0, 0.5 * (9.0 - ZC)));
  return min(a, b);
}
// the shaft tunnel along the aft hull, to just short of the counter
// v4: it ends at x1 (the steam line's end)
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
// v4: x1 is where the steam line (and its tunnel) ends
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
      if (shaft && uHullCut < 0.5) c = min(c, slotSD(qa, LA, D, x1));   // v5: the curve holds the whole line
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
        // v4: the steam line leaves the module's aft wall on the centre line, at its header's height, swings out and down
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

// v4: the LNG trunk: half length hx, half-width wb at its base, height h, its sides at 45 degrees (a trapezoid in z-y,
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
  gDeck = deck;                                                          // v3 (ships v6): the room's ceiling
  gZs = 0.62;                                                            // v4: the steam line's run
  hull(q, LF, LA, hb, D, 5.4, 0.4, 0.9, true, uSteam);
  vec3 qd = drop(q, 0.3, 0.68, 2.4);
  if (on()){
    float dx = qd.x - (-15.2 + clamp(floor((qd.x + 15.2) / 4.0 + 0.5), 0.0, 3.0) * 4.0);
    if (uVent > 0.5){
      // v4 (Per): the membrane trunk, its port and starboard sides sloping at 45 degrees, and four slender vent stacks
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

// plant: the LNG carrier only (the ships moment's other six are not copied)
void ship(vec3 p, float id){ shipLNG(p); }

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
      float yy = (p.y - KEEL) / 0.3;
      if (abs(mat - M_HALL) < 0.5){
        // data halls: ribbed like containerised halls, two light strips along each side, lit hall by hall
        float yh = p.y - (KEEL + 2.0);
        float band = smoothstep(0.3, 0.34, yh) * (1.0 - smoothstep(0.42, 0.46, yh)) + smoothstep(0.78, 0.82, yh) * (1.0 - smoothstep(0.9, 0.94, yh));
        float rib = smoothstep(0.0, 0.05, abs(fract(p.x * 1.25) - 0.5) - 0.43);
        float onl = smoothstep(0.0, 0.25, pw * 1.4 - (p.x < 0.0 ? 0.0 : 0.35));
        vec3 cool = L ? vec3(0.06, 0.42, 1.0) : vec3(0.55, 0.85, 1.0);
        alb = mix(alb, SLATE * 0.85, rib * 0.5);
        alb = mix(alb, L ? vec3(0.08, 0.1, 0.14) : DEEP * 2.0, band);
        emis = cool * band * onl * (L ? 0.9 : 1.6);
      } else if (abs(mat - M_WIN) < 0.5){
        float band = smoothstep(0.22, 0.28, fract(yy)) * (1.0 - smoothstep(0.7, 0.76, fract(yy)));
        float dk = floor((p.y - KEEL - 1.4) / 0.3);
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
    vec3 cell = vec3(floor((p.x + 40.0) / 0.65), floor((p.y - y0) / 0.26), floor((p.z + 4.0) / 0.37));
    float hsh = hash3(cell + vec3(aux * 13.0, 0.0, 0.0));
    vec3 t1 = L ? vec3(0.55, 0.56, 0.57) : mix(FIORD, ROCK, 0.6), t3 = L ? vec3(0.4, 0.52, 0.62) : mix(BALI, ROCK, 0.3);
    alb = hsh < 0.3 ? CREAM : (hsh < 0.55 ? t1 : (hsh < 0.8 ? SLATE : t3));
    vec3 f = fract(vec3((p.x + 40.0) / 0.65, (p.y - y0) / 0.26, (p.z + 4.0) / 0.37));
    vec3 g = smoothstep(0.0, 0.06, f) * smoothstep(0.0, 0.06, 1.0 - f);
    float joint = abs(n0.z) > 0.5 ? g.x * g.y : (abs(n0.x) > 0.5 ? g.y * g.z : g.x * g.z);
    alb *= mix(0.45, 1.0, joint);
  } else if (abs(mat - M_GOLD) < 0.5 || abs(mat - M_POWER) < 0.5){
    alb = L ? GOLDL : GOLD; rough = 0.45; spec = 0.45; bA = 0.02;
    // plant: the module warms as it lifts (a little self-light, never a neon glow)
    if (abs(mat - M_GOLD) < 0.5){ alb *= (L ? 1.0 : 0.8) * (1.0 + (L ? 0.12 : 0.04) * uGlow);   // (on navy the ships' gold ran lemon)
      if (aux > 1.5) alb = mix(alb, L ? vec3(0.95, 0.86, 0.62) : ECRU * 0.9, 0.55);   // v4: the cutaway's cut faces
      emis = (L ? vec3(1.0, 0.6, 0.06) : vec3(1.0, 0.55, 0.12)) * uGlow * (L ? 0.16 : 0.06); }
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
        occ *= 1.0 - 0.45 * uTone;                                     // plant: the ship's shadow fades with it
        col = mix(uPaper, vec3(0.00784, 0.14118, 0.20392), occ);
        disp = true;
      } else {
        // plant: on navy the ground is the section's own flat navy, darkened only by shadow and contact, so the stage
        // meets the page with no seam (the ships moment lit a navy floor instead)
        float occ = clamp((1.0 - sh) * mix(0.2, 0.45, uShadow) + (1.0 - ao) * mix(0.3, 0.55, uShadow), 0.0, 0.75);
        occ *= 1.0 - 0.45 * uTone;
        col = mix(NAVYS, NAVYS * 0.35, occ);
        disp = true;
      }
    }
  } else {
    tt = 400.0;
    if (BP){ col = L ? uPaper : vec3(0.008, 0.141, 0.204); col = mix(col, L ? vec3(0.008, 0.141, 0.204) : vec3(0.91, 0.88, 0.8), (1.0 - smoothstep(0.7, 1.7, sil)) * 0.92); disp = true; }
    else if (L){ col = uPaper; disp = true; }
    else { col = NAVYS; disp = true; }                              // plant: the flat navy of the section
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
  // plant: the ship (every part but the module and its stand) fades toward the background, so the gold module leads
  if (hit && slot < 1.5) col = mix(col, L ? uPaper : NAVYS, uTone);
  float coc = clamp(uAperture * (1.0 - uFocus / tt), -1.0, 1.0);
  oCol = vec4(col, coc * 0.5 + 0.5);
}
`;

    /* ------------------------------------------------------------- the shot, and the fit (from ships v5) */
    var MY = 1.9, MHY = 1.45;                       // the camera's aim height (the v2 module's centre, the shader's MY), MH.y
    // v3 (ships v6): the module's base on its seat, its modelled height (MT0 - MB0), its half depth (MH.z); the LNG deck,
    // its thickness and the open side's edge (the shader's MBOT, DECKT, ZC). The ceiling's underside is DECK - DECKT
    var MBOT = 0.64, MHT = 2.92, MHZ = 0.9, DECK = 2.95, DECKT = 0.12, ZC = -0.15;
    function modTop() { return MBOT + MHT * K.mod; }
    // how high the module may settle from (arrive=settle): to just under the ceiling, never into it
    function headroom() { return Math.max(0, DECK - DECKT - 0.04 - modTop()); }
    // the skid (arrive=lower): forward far enough that the module's back face clears the ceiling's edge as it is lowered
    function skid() { return Math.max(0, MHZ * K.mod - ZC + 0.03); }
    // the LNG carrier's outline for the fit, read off its SDF (as C-ships v5's EXT.lng)
    // v4: the trunk is 1.85 either side at its base (it was 1.7), and the vent stacks reach 4.82 (inside the outline as it was)
    var LNG = { hull: [20, 8, 2.3, 2.6, 5.4, 0.4], parts: [[-18, -1.4, 2.95, 3.45, -1.85, 1.85], [3.4, 7.0, 2.95, 5.35, -2.25, 2.25],
      [6.0, 6.9, 5.0, 6.2, -0.5, 0.5], [5.1, 5.3, 5.3, 6.45, -0.13, 0.13], [-18.7, -18.5, 3.3, 5.15, -0.13, 0.13]] };
    function hullPts(h) {
      var LF = h[0], LA = h[1], hb = h[2], deck = 0.35 + h[3], bowL = h[4], sh = h[5], x0 = -LF + bowL, pts = [];
      [x0, LA].forEach(function (x) { [0, deck].forEach(function (y) { [-hb, hb].forEach(function (z) { pts.push([x, y, z]); }); }); });
      pts.push([-LF, deck + sh, 0], [-LF + 0.2 * bowL, 0.35, 0], [-LF + bowL * 0.45, deck + sh * 0.6, -hb * 0.8], [-LF + bowL * 0.45, deck + sh * 0.6, hb * 0.8]);
      return pts;
    }
    function boxPts(list) {
      var out = [];
      list.forEach(function (bx) { for (var i = 0; i < 8; i++) out.push([i & 1 ? bx[1] : bx[0], i & 2 ? bx[3] : bx[2], i & 4 ? bx[5] : bx[4]]); });
      return out;
    }
    // v2: the whole ship, bow to stern (the hull halves' slide and the module's drop stay inside this frame's margin)
    var PTS_SHIP = hullPts(LNG.hull).concat(boxPts(LNG.parts));
    // FIT_H, FIT_W: the share of the region's height and width the ship may fill (the margin it never crosses);
    // SHADOW_K, SHADOW_X: the ground shadow, as ships v5
    var FIT_H = 0.8, FIT_W = 0.88, SHADOW_K = 0.9, SHADOW_X = 0.24;
    var FOC = 0.5 / Math.tan(9 * D2R);

    function basis(az, el, dist) {
      var ce = Math.cos(el), pos = [Math.sin(az) * ce * dist, MY + Math.sin(el) * dist, Math.cos(az) * ce * dist];
      var cb = C.lookAt(pos, [0, MY, 0]);
      return { pos: pos, f: cb.f, r: cb.r, u: cb.u };
    }
    function proj(B, x, y, z) {
      var dx = x - B.pos[0], dy = y - B.pos[1], dz = z - B.pos[2], df = dx * B.f[0] + dy * B.f[1] + dz * B.f[2];
      return [FOC * (dx * B.r[0] + dy * B.r[1] + dz * B.r[2]) / df, FOC * (dx * B.u[0] + dy * B.u[1] + dz * B.u[2]) / df];
    }
    function bounds(pts, az, el, dist) {
      var B = basis(az, el, dist), ka = az - K.lightaz * D2R, ke = K.lightel * D2R, L = [Math.sin(ka) * Math.cos(ke), Math.sin(ke), Math.cos(ka) * Math.cos(ke)];
      var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      function put(x, y, z) { var q = proj(B, x, y, z); if (q[0] < b.x0) b.x0 = q[0]; if (q[0] > b.x1) b.x1 = q[0]; if (q[1] < b.y0) b.y0 = q[1]; if (q[1] > b.y1) b.y1 = q[1]; }
      pts.forEach(function (q) {
        put(q[0], q[1], q[2]);
        if (q[1] > 0.5) { var k = SHADOW_K * q[1] / L[1]; put(q[0] - L[0] * k, 0, q[2] - L[2] * k); }
      });
      return b;
    }
    // v2: fit the whole ship into the region (FIT_W of its width or FIT_H of its height below the label's room, whichever
    // binds), centred; then, if its top would run into the label's room (topMin px from the stage's top), lower it
    function fit(azd, eld, reg, topMin) {
      var az = azd * D2R, el = eld * D2R, maxW = reg.rw * FIT_W / reg.h, maxH = Math.max(10, reg.rh - topMin) * FIT_H / reg.h, dist = 120, b, ex;
      for (var it = 0; it < 4; it++) {
        b = bounds(PTS_SHIP, az, el, dist); ex = SHADOW_X * (b.y1 - b.y0);
        dist /= Math.min(maxW / Math.max(1e-3, b.x1 + ex - b.x0), maxH / Math.max(1e-3, b.y1 - b.y0));
      }
      b = bounds(PTS_SHIP, az, el, dist); ex = SHADOW_X * (b.y1 - b.y0);
      var ox = (reg.x0 + reg.rw / 2 - reg.w / 2) / reg.h, oy = -(reg.y0 + reg.rh / 2 - reg.h / 2) / reg.h;
      var sx = (b.x0 + b.x1 + ex / 2) / 2 - ox, sy = (b.y0 + b.y1) / 2 - oy;
      // screen y (px from the stage's top) = h/2 - (v - sy) * h; the ship's top is v = b.y1
      var topPx = reg.h / 2 - (b.y1 - sy) * reg.h;
      if (topPx < reg.y0 + topMin) sy += (reg.y0 + topMin - topPx) / reg.h;
      var topNow = reg.h / 2 - (b.y1 - sy) * reg.h;
      return { az: azd, el: eld, dist: dist, sx: sx, sy: sy, top: topNow };
    }

    /* ------------------------------------------------------------- state */
    var K = null, T = { dur: 4.4, build: 0.55, land: 0.78, b3: 0.82, b1: 0.23 };
    var p = 0, playing = false, started = false, idle = 0, lastFired = -1, doneSent = false;
    var view = null, shot = null, geo = { w: 0, h: 0, rx: 0, ry: 0, rw: 0, rh: 0, sig: '' };
    var stageEl = root.querySelector('.pl-stage'), copyEl = root.querySelector('.pl-copy');
    var tagEl = root.querySelector('.pl-tag'), leadEl = root.querySelector('.pl-lead'), dotEl = root.querySelector('.pl-dot'), textEl = root.querySelector('.pl-tag-t');
    var api = null, ST = null;
    var IDS = ['hull', 'module', 'label'];
    var HULL_DONE = 0.42;                            // the hull halves' slide ends at 0.42 of the assembly (hull() in the shader)

    function timing() {
      T.dur = clamp(+K.dur || 4.4, 1, 12);
      T.build = clamp(+K.build, 0.1, 0.8);
      T.land = clamp(+K.land, T.build + 0.06, 0.95);
      T.b3 = clamp(+K.b3, T.land, 0.98);
      T.b1 = T.build * HULL_DONE;
    }
    function beatList() { return [{ n: 1, id: 'hull', p: T.b1 }, { n: 2, id: 'module', p: T.land }, { n: 3, id: 'label', p: T.b3 }]; }

    // the stage, and the region the ship is framed in (stage=full with the copy beside it: right of the copy)
    function measure() {
      if (!stageEl) return;
      var w = stageEl.clientWidth, h = stageEl.clientHeight, rx = 0, rw = w, wide = root.clientWidth > 760;
      if (root.getAttribute('data-stage') === 'full' && root.getAttribute('data-copy') !== 'off' && copyEl && wide) {
        var sr = stageEl.getBoundingClientRect(), cr = copyEl.getBoundingClientRect(), right = cr.right - sr.left + 16;
        if (right > 0 && right < w * 0.62) { rx = right; rw = w - right; }
      }
      // v2: the copy waits for its beats only beside the stage; stacked on a phone it shows at once (no gap above the ship)
      var stag = !!(ST && wide && ST.S.copy !== 'off' && !ST.reduced);
      if (stag !== root.classList.contains('pl-stagger')) {
        // switch without the fade (the copy must not fade out at load, or fade when a resize crosses the breakpoint)
        root.classList.add('pl-quiet'); root.classList.toggle('pl-stagger', stag);
        requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('pl-quiet'); }); });
      }
      var sig = [w, h, rx, rw].join(',');
      if (sig !== geo.sig) {
        geo = { w: w, h: h, rx: rx, ry: 0, rw: rw, rh: h, sig: sig }; shot = null; tagW = 0; tagH = 0; lastLabel = '';
        if (api && api.render && !playing) api.render();
      }
    }
    // the label's room over the ship: its height, the gap to the leader's top, and some air
    function labelRoom() {
      if (!tagH && textEl) tagH = textEl.offsetHeight || 26;
      return (ST && ST.S.label === 'off') ? 0.06 * geo.h : (tagH || 26) + Math.max(18, 0.03 * geo.h);
    }
    function getShot() {
      if (shot) return shot;
      if (!(geo.h > 0)) return null;
      shot = fit(+K.az, +K.el, { w: geo.w, h: geo.h, x0: geo.rx, y0: geo.ry, rw: geo.rw, rh: geo.rh }, labelRoom());
      return shot;
    }
    // everything at progress q (a pure function: set(q) always gives the same frame)
    function stateAt(q) {
      var dropT = span(q, T.build + 0.01, T.land), fa = clamp(dropT / 0.45, 0, 1), lift, slide;
      if (ST && ST.S.arrive === 'settle') {
        // v3: it fades in on its seat, settling the last metres from just under the ceiling (never into it)
        lift = Math.min(K.drop, headroom()) * (1 - outc(dropT)); slide = 0;
      } else {
        // v3: lowered through the open side, in front of the ceiling's edge, to its seat height; then skidded back onto
        // the seat, under the ceiling (the last quarter of the arrival)
        lift = K.drop * (1 - outc(span(dropT, 0, 0.72)));
        slide = skid() * (1 - ease(span(dropT, 0.72, 1)));
      }
      return {
        cam: getShot(),
        push: 1 + (K.push - 1) * ease(span(q, T.land - 0.08, 1)),
        asm: span(q, 0, T.build),
        stand: ease(span(q, T.build * 0.08, T.build * 0.4)),
        lift: lift,
        slide: slide,
        modA: q >= T.land ? 1 : fa * fa * (3 - 2 * fa),   // it fades in over the first half of its fall, like every part
        glow: ease(span(q, T.land - 0.05, T.land + 0.08)) * K.glow,
        pow: ease(span(q, T.land, T.land + 0.1)),
        tone: ease(span(q, T.land, T.b3)) * K.tone,
        lead: ease(span(q, T.b3, T.b3 + 0.5 * (1 - T.b3))),
        text: ease(span(q, T.b3 + 0.3 * (1 - T.b3), T.b3 + 0.85 * (1 - T.b3))),
        frame: Math.floor(q * T.dur * 60)
      };
    }

    // v3: the camera for a frame. push > 1 moves it in on the landed module (distance / push), keeping the module where it
    // sits on screen; the ship's top (for the label) is re-read at that distance. At push 1 it is the fit, unchanged
    var camMemo = { key: '', c: null };
    function camOf(v) {
      var c = v.cam;
      if (!c || !(v.push > 1.0001)) return c;
      var key = [c.dist, c.sx, c.sy, v.push.toFixed(5), geo.h].join(',');
      if (camMemo.key === key) return camMemo.c;
      var az = c.az * D2R, el = c.el * D2R, d1 = c.dist / v.push, cy = MBOT + 0.5 * MHT * K.mod;
      var q0 = proj(basis(az, el, c.dist), 0, cy, 0), q1 = proj(basis(az, el, d1), 0, cy, 0);
      var sx = c.sx + q1[0] - q0[0], sy = c.sy + q1[1] - q0[1], b = bounds(PTS_SHIP, az, el, d1);
      var out = { az: c.az, el: c.el, dist: d1, sx: sx, sy: sy, top: geo.h / 2 - (b.y1 - sy) * geo.h };
      camMemo = { key: key, c: out };
      return out;
    }

    /* ------------------------------------------------------------- the timeline and the host hook (as v1) */
    function emit(name, detail) { root.dispatchEvent(new CustomEvent(name, { detail: detail })); }
    function kick() {
      idle = 0; lastLabel = '';
      if (!api) return;
      if (ST.reduced || root.classList.contains('is-nogl')) { if (api.render) api.render(); }
      else if (api.setRunning) api.setRunning(true);
    }
    function play() {
      if (ST.reduced || root.classList.contains('is-nogl')) { reveal(); return; }
      p = 0; playing = true; started = true; doneSent = false;
      lastFired = 0;                                   // a replay starts the beats over: hull, module, label, each dir 1
      kick();
    }
    function setP(q) { p = clamp(+q || 0, 0, 1); playing = false; started = true; kick(); }
    function reveal() { p = 1; playing = false; started = true; kick(); }
    var anchor = null;
    var drive = { set: setP, start: play, stop: function () { playing = false; }, beats: [], duration: 4.4, anchor: function () { return anchor; } };
    Object.defineProperty(drive, 'p', { get: function () { return p; } });

    function ui() {
      var b = !started ? 0 : (p >= T.b3 ? 3 : (p >= T.land ? 2 : (p >= T.b1 ? 1 : 0)));
      if (b !== lastFired) {
        var from = lastFired < 0 ? 0 : lastFired, bl = beatList();
        lastFired = b;
        root.setAttribute('data-reveal', String(b));
        for (var i = 1; i <= 3; i++) root.classList.toggle('is-b' + i, b >= i);
        if (b > from) { for (var n = from + 1; n <= b; n++) emit('t4m:beat', { n: n, id: IDS[n - 1], p: bl[n - 1].p, dir: 1 }); }
        else if (b < from) emit('t4m:beat', { n: b, id: b ? IDS[b - 1] : 'none', p: b ? bl[b - 1].p : 0, dir: -1 });
      }
      if (started && p >= 1 && !doneSent) { doneSent = true; emit('t4m:done', { p: 1 }); }
      label();
    }
    var lastLabel = '', tagW = 0, tagH = 0;
    // v2: the leader runs from the landed module's top up past the ship's silhouette; the name sits just above the ship
    function label() {
      if (!tagEl || !view || !view.cam || !(geo.h > 0)) return;
      // v3: the anchor follows the module: the front of its top, at its scale, lift and skid
      // v4: on the top's far half, behind the cutaway (the top's near half is cut away)
      var c = camOf(view), B = basis(c.az * D2R, c.el * D2R, c.dist), q = proj(B, 0, modTop() + view.lift, view.slide - 0.62 * MHZ * K.mod);
      var ax = geo.w / 2 + (q[0] - c.sx) * geo.h, ay = geo.h / 2 - (q[1] - c.sy) * geo.h;
      anchor = { x: ax, y: ay, fx: ax / geo.w, fy: ay / geo.h };
      if (!tagW) tagW = textEl.offsetWidth || 140;
      // v3: the name never leaves the stage, even when push > 1 has moved the ship's top out of it
      if (!tagH) tagH = textEl.offsetHeight || 22;
      var top = Math.max(tagH + 10, c.top - Math.max(10, 0.012 * geo.h)), lh = Math.max(24, ay - top);
      var tx = clamp(ax - tagW / 2, 8, Math.max(8, geo.w - 8 - tagW)) - ax;
      var sig = [ax.toFixed(1), ay.toFixed(1), lh.toFixed(1), tx.toFixed(1), view.lead.toFixed(3), view.text.toFixed(3)].join('|');
      if (sig === lastLabel) return;
      lastLabel = sig;
      tagEl.style.transform = 'translate(' + ax.toFixed(1) + 'px,' + ay.toFixed(1) + 'px)';
      leadEl.style.height = lh.toFixed(1) + 'px';
      leadEl.style.transform = 'scaleY(' + view.lead.toFixed(3) + ')';
      dotEl.style.opacity = Math.min(1, view.lead * 4).toFixed(3);
      textEl.style.bottom = (lh + 6).toFixed(1) + 'px';
      textEl.style.opacity = view.text.toFixed(3);
      textEl.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ((1 - view.text) * 6).toFixed(1) + 'px)';
    }

    /* ------------------------------------------------------------- mount */
    api = C.mount(root, {
      name: 'Plant v5',
      frag: FRAG,
      startScale: 0.86,
      maxCoc: 7,
      grain: function (st) { return st.P.grain != null && isFinite(+st.P.grain) ? +st.P.grain : (st.theme === 'light' ? 0.014 : 0.022); },
      vignette: function () { return 0; },
      stillTime: 3.0,
      busy: function () { return playing; },
      themeDefault: function () { return 'light'; },
      knobs: [
        { key: 'dur', label: 'Duration (s)', min: 2, max: 9, step: 0.1, value: 4.4, hint: 'the whole build, once' },
        { key: 'build', label: 'Ship built by (p)', min: 0.2, max: 0.8, step: 0.01, value: 0.55, hint: 'hull, decks, trunk and domes, aft house, funnel and masts' },
        { key: 'land', label: 'Module lands at (p)', min: 0.3, max: 0.95, step: 0.01, value: 0.78, hint: 'beat 2; it starts falling as the ship completes' },
        { key: 'b3', label: 'Label at (p)', min: 0.4, max: 0.98, step: 0.01, value: 0.82, hint: 'beat 3' },
        { key: 'mod', label: 'Module scale', min: 0.4, max: 1, step: 0.01, value: 0.58, hint: 'v3: as ships.mod (0.58 = 12 x 17 x 10 m, 5 m under the ceiling; 1 = v2\'s module, through the deck; it meets the ceiling at about 0.75)' },
        { key: 'drop', label: 'Module lowered from (x 10 m above its seat)', min: 0.5, max: 5, step: 0.1, value: 3, hint: 'arrive=lower; with arrive=settle it is capped at the headroom' },
        { key: 'push', label: 'Camera push on the module after it lands', min: 1, max: 3, step: 0.05, value: 1, hint: 'v3: 1 = the camera never moves and the whole ship stays in frame; above 1 it moves in and crops the ship' },
        { key: 'rxh', label: 'Reactor height (x v3\'s)', min: 0.45, max: 1, step: 0.01, value: 0.75, hint: 'v4: the two vessels, port and starboard, flat-headed; 0.75 = 9 m at mod 0.58 (v3: 12 m)' },
        { key: 'steam', label: 'Steam line ends at (x, x 10 m)', min: 1.6, max: 5.3, step: 0.05, value: 3.65, hint: 'v4: 3.65 = 1.5 m forward of the deckhouse (the navigation deck); v3 ran to 5.3, under it' },
        { key: 'scoopw', label: 'Cutaway half-width (x module)', min: 0.4, max: 1.2, step: 0.01, value: 0.9, hint: 'v4: cutaway=scoop|corner; across the near face, in the module\'s half-length (1 = to its ends)' },
        { key: 'scoopd', label: 'Cutaway depth (down the near face)', min: 0.8, max: 2.9, step: 0.05, value: 2.25, hint: 'v4: in modelled units; the module is 2.9 tall, the vessels\' tops sit 1.17 down' },
        { key: 'scoopz', label: 'Cutaway reach (into the top)', min: 0.4, max: 1.8, step: 0.05, value: 1.35, hint: 'v4: from the near edge; the module is 1.8 deep, the far vessel\'s centre 1.37 in' },
        { key: 'cutfwd', label: 'Hull cut: forward edge at the deck (x)', min: -1.4, max: -0.6, step: 0.01, value: -1.3, hint: 'v5: hullcut=curve; the cargo trunk ends at -1.4, the module\'s front at -0.58' },
        { key: 'cutaft', label: 'Hull cut: aft edge at the deck (x)', min: 2.5, max: 3.76, step: 0.01, value: 3.74, hint: 'v5: the deckhouse front is at 3.8 (past it the cut would reach under the house)' },
        { key: 'cutdepth', label: 'Hull cut: depth below the deck', min: 1.5, max: 2.6, step: 0.01, value: 2.54, hint: 'v5: the tank top is 2.52 below the deck; 2.54 keeps the floor and makes the curve\'s foot run along it' },
        { key: 'cutn', label: 'Hull cut: shape (2 = ellipse)', min: 2, max: 8, step: 0.1, value: 4, hint: 'v5: higher is fuller at the bottom; below about 3.7 the curve cuts into the module\'s lower forward corner' },
        { key: 'glow', label: 'Module warmth on landing', min: 0, max: 2, step: 0.05, value: 1 },
        { key: 'cutw', label: 'Engine-room cut wider by (x 10 m, each side)', min: 0, max: 1.5, step: 0.05, value: 0.25 },
        { key: 'tone', label: 'Ship fade after landing', min: 0, max: 0.6, step: 0.01, value: 0 },
        { key: 'az', label: 'Camera yaw (deg; 0 = side profile)', min: 0, max: 40, step: 1, value: 16 },
        { key: 'el', label: 'Camera elevation (deg)', min: 2, max: 30, step: 1, value: 11 },
        { key: 'lightaz', label: 'Key light, degrees left of the camera', min: 0, max: 70, step: 1, value: 30 },
        { key: 'lightel', label: 'Key light elevation (deg)', min: 30, max: 80, step: 1, value: 60 },
        { key: 'shadow', label: 'Shadow strength (light)', min: 0, max: 1, step: 0.01, value: 0.5 },
        { key: 'warmth', label: 'Key light warmth', min: 0, max: 1, step: 0.01, value: 0.6 },
        { key: 'blur', label: 'Depth of field', min: 0, max: 2, step: 0.05, value: 0.3 },
        { key: 'exposure', label: 'Exposure', min: 0.5, max: 2, step: 0.01, value: 1 }
      ],
      selects: [
        { key: 'hullcut', label: 'Hull cut', options: ['curve', 'box'], value: 'curve', hint: 'v5: curve = one smooth curve down from the deck (an X-ray into the hull); box = v4\'s rectangular notch and shaft tunnel' },
        { key: 'cutaway', label: 'Enclosure cutaway', options: ['scoop', 'corner', 'open'], value: 'scoop', hint: 'v4: scoop = a curved bite out of the near top edge; corner = the same bite on the near top aft corner; open = v3\'s open near face' },
        { key: 'lngdeck', label: 'LNG deck', options: ['vents', 'hatches'], value: 'vents', hint: 'v4: vents = Per\'s membrane trunk (45-degree sides) and four vent stacks; hatches = v3\'s' },
        { key: 'arrive', label: 'Module arrives', options: ['lower', 'settle'], value: 'lower', hint: 'v3: lower = lowered in through the open side, then skidded back under the ceiling; settle = fades in on its seat, settling from just under the ceiling' },
        { key: 'stage', label: 'Stage', options: ['right', 'full'], value: 'right', hint: 'right = the copy column on the left, the stage on the right; full = the stage fills the box (the ship framed right of the copy)' },
        { key: 'copy', label: 'Copy', options: ['on', 'off'], value: 'on', hint: 'off for a page that sets its own (the stage then fills the box)' },
        { key: 'label', label: 'Label', options: ['on', 'off'], value: 'on' },
        { key: 'play', label: 'Play', options: ['view', 'off'], value: 'view', hint: 'view = once, at 40% in view; off = on start() or set()' },
        { key: 'theme', label: 'Theme', options: ['light', 'dark'], value: 'light', hint: 'reloads' },
        { key: 'paper', label: 'Paper (light)', options: ['f2f2f0', 'ffffff'], value: 'f2f2f0', hint: 'reloads' }
      ],
      buttons: [{ label: 'Replay', fn: function () { play(); } }],
      init: function (st) {
        ST = st; K = st.K; timing();
        K.mod = clamp(+K.mod, 0.4, 1); K.push = clamp(+K.push, 1, 3);
        function pick(key, ok, def) { var u = st.P[key], a = root.getAttribute('data-' + key); return ok.indexOf(u) >= 0 ? u : (ok.indexOf(a) >= 0 ? a : def); }
        st.S.stage = pick('stage', ['right', 'full'], 'right');
        st.S.copy = pick('copy', ['on', 'off'], 'on');
        st.S.label = pick('label', ['on', 'off'], 'on');
        st.S.play = st.host ? 'off' : pick('play', ['view', 'off'], 'view');
        ['stage', 'copy', 'label', 'play'].forEach(function (k) { root.setAttribute('data-' + k, st.S[k]); });
        drive.beats = beatList(); drive.duration = T.dur;
        root.t4mDrive = drive;
        measure();
        if ('ResizeObserver' in window) { var ro = new ResizeObserver(measure); ro.observe(root); if (stageEl) ro.observe(stageEl); }
        window.addEventListener('resize', measure);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { tagW = 0; tagH = 0; shot = null; measure(); lastLabel = ''; if (api && api.render && !playing) api.render(); });
        var at = st.P.at;
        if (at != null && at !== '' && isFinite(+at)) { p = clamp(+at, 0, 1); started = true; }
        else if (st.reduced) { p = 1; }
        var go = function () {
          if (started) return;
          if (st.reduced || root.classList.contains('is-nogl')) reveal(); else if (st.S.play === 'view') play();
        };
        if ('IntersectionObserver' in window) {
          new IntersectionObserver(function (es) { if (es[0].isIntersecting && es[0].intersectionRatio >= 0.4) go(); }, { threshold: [0.4, 0.6] }).observe(root);
        } else go();
        setTimeout(function () { emit('t4m:drive-ready', { beats: drive.beats, duration: T.dur }); }, 0);
        view = stateAt(p);
      },
      onKnob: function (st, k) {
        if (k === 'dur' || k === 'build' || k === 'land' || k === 'b3') { timing(); drive.beats = beatList(); drive.duration = T.dur; }
        if (k === 'az' || k === 'el' || k === 'lightaz' || k === 'lightel') shot = null;
        if (k === 'mod' || k === 'push') { K.mod = clamp(+K.mod, 0.4, 1); K.push = clamp(+K.push, 1, 3); camMemo.key = ''; lastLabel = ''; }
        if (k === 'arrive') lastLabel = '';
        if (k === 'stage' || k === 'copy' || k === 'label') { root.setAttribute('data-' + k, st.S[k]); shot = null; measure(); lastLabel = ''; }
        if (k === 'play') root.setAttribute('data-play', st.S.play);
        if (k === 'theme' || k === 'paper') {
          var h = (location.hash || '').slice(1).split('&').filter(function (kv) { var n = decodeURIComponent(kv.split('=')[0]); return kv && n !== k && n !== 'plant.' + k; });
          h.push('plant.' + k + '=' + encodeURIComponent(st.S[k]));
          location.hash = h.join('&'); location.reload();
        }
        kick();
      },
      beatOf: function () { return -1; },
      overlay: function (st) { if (!view) view = stateAt(p); ui(); },
      step: function (st, dt) {
        if (playing) {
          p += dt / T.dur;
          if (p >= 1) { p = 1; playing = false; }
          idle = 0;
        } else if (api && api.setRunning && !st.reduced) {
          if (idle === 0) st.scale = st.maxScale;
          if (++idle > 3) api.setRunning(false);
        }
        view = stateAt(p);
      },
      uniforms: (function () {
        var vPos = new Float32Array(3), vF = new Float32Array(3), vR = new Float32Array(3), vU = new Float32Array(3), vKey = new Float32Array(3), vKC = new Float32Array(3), vSh = new Float32Array(2), vPa = new Float32Array(3), vSc = new Float32Array(3), vBi = new Float32Array(4);
        function put(a, b) { a[0] = b[0]; a[1] = b[1]; a[2] = b[2]; return a; }
        return function (st, U) {
          var light = st.theme === 'light', v = view || stateAt(p), cam = camOf(v) || { az: 16, el: 11, dist: 200, sx: 0, sy: 0 };
          var B = basis(cam.az * D2R, cam.el * D2R, cam.dist);
          U.v3('uCamPos', put(vPos, B.pos)); U.v3('uCamF', put(vF, B.f)); U.v3('uCamR', put(vR, B.r)); U.v3('uCamU', put(vU, B.u));
          U.f('uFocal', FOC); U.f('uPixAng', 1 / (FOC * st.h));
          vSh[0] = cam.sx; vSh[1] = cam.sy; U.v2('uShift', vSh);
          U.f('uFocus', cam.dist); U.f('uAperture', 0.35);
          U.f('uExposure', K.exposure * (light ? 1.0 : 1.05));
          // v2: the key is higher and nearer the camera than the ships' (48 degrees off, 52 up), so in this side view the
          // shadow falls mostly behind the hull instead of running long past the stern
          var ka = (cam.az - K.lightaz) * D2R, ke = K.lightel * D2R;
          vKey[0] = Math.sin(ka) * Math.cos(ke); vKey[1] = Math.sin(ke); vKey[2] = Math.cos(ka) * Math.cos(ke);
          U.v3('uKeyDir', vKey);
          U.v3('uKeyCol', put(vKC, light ? mixv([1.0, 0.98, 0.95], [1.0, 0.88, 0.68], K.warmth) : mixv([1.0, 0.9, 0.76], [1.0, 0.7, 0.32], K.warmth)));
          U.f('uLight', light ? 1 : 0); U.f('uBlue', 0); U.f('uShadow', K.shadow);
          U.v3('uPaper', put(vPa, st.paperRGB));
          // v2: the LNG carrier assembles in slot B (slot A empty); the dither's frame counter comes from p, not the clock
          U.f('uFrame', v.frame);
          U.f('uShipA', 0); U.f('uAsmA', 0); U.f('uPowA', 0);
          U.f('uShipB', 0); U.f('uAsmB', v.asm); U.f('uPowB', v.pow);
          U.f('uBuild', 0);
          U.f('uSpin', 9 * Math.max(0, p - T.land) * T.dur); U.f('uPulse', p * T.dur * 0.8);
          U.f('uLift', v.lift); U.f('uModA', v.modA); U.f('uStandA', v.stand);
          U.f('uMod', K.mod); U.f('uSlide', v.slide);
          U.f('uCut', 1); U.f('uCutW', K.cutw); U.f('uTone', v.tone); U.f('uGlow', v.glow);
          // v4: the module's cutaway and vessels, the steam line, the LNG deck
          var ck = st.S.cutaway === 'corner' ? 1 : (st.S.cutaway === 'open' ? 2 : 0);
          U.f('uCutK', ck); U.f('uRxH', clamp(+K.rxh, 0.45, 1)); U.f('uSteam', clamp(+K.steam, 1.6, 5.3)); U.f('uVent', st.S.lngdeck === 'hatches' ? 0 : 1);
          vSc[0] = K.scoopw * 1.0; vSc[1] = K.scoopd; vSc[2] = K.scoopz; U.v3('uScoop', vSc);
          // v5: the hull's cut
          U.f('uHullCut', st.S.hullcut === 'box' ? 0 : 1);
          vBi[0] = clamp(+K.cutfwd, -1.4, -0.6); vBi[1] = clamp(+K.cutaft, 2.5, 3.76); vBi[2] = clamp(+K.cutdepth, 1.5, 2.6); vBi[3] = clamp(+K.cutn, 2, 8); U.v4('uBite', vBi);
        };
      })()
    });
  })();
}

})();

});