/* Tesser Atomics · scene: M2 molten salt (M2/M3 shared runtime) · extracted unchanged from handoff-site-v11 heavy/site-t4m-v11.html (scripts 4, 13). */

(function () {
  /* M2 reframe · m2copy=original|reframe|off, read like every other switch (search or hash, the first value the default) */
  var prep = window.__TZ_PREP, q = window.__TZ_Q || {}, opts = ['original', 'reframe', 'off'];
  (window.__TZ_SWITCHES || []).forEach(function (k) { if (k[0] === 'm2copy') opts = k[1]; });
  var v = opts.indexOf(q.m2copy) >= 0 ? q.m2copy : opts[0], s4 = 'scroll';
  (window.__TZ_SWITCHES || []).forEach(function (k) { if (k[0] === 's4') s4 = k[1].indexOf(q.s4) >= 0 ? q.s4 : k[1][0]; });
  document.documentElement.classList.add('tz-m2copy-' + v);
  window.__TZ_PREP = function (id) {
    var r = id === 't4m-m2' ? document.getElementById(id) : null, tp = document.getElementById('tz-m2-reframe');
    if (r && v === 'off' && s4 === 'scroll') {
      [r, document.getElementById('tz-m2viz'), document.querySelector('.tz-seam[data-to="2"]')].forEach(function (el) {
        if (el && el.parentNode) el.parentNode.removeChild(el); });
    } else if (r && v === 'reframe' && tp && tp.content) {
      var frag = tp.content.cloneNode(true), ui = r.querySelector('.t4m-ui'), viz = frag.querySelector('#tz-m2viz'),
          old = document.getElementById('tz-m2viz'), copy = frag.querySelector('[data-tz-copy]');
      if (ui && copy) { while (ui.firstChild) ui.removeChild(ui.firstChild); while (copy.firstChild) ui.appendChild(copy.firstChild); }
      if (tp.getAttribute('data-label')) r.setAttribute('aria-label', tp.getAttribute('data-label'));
      if (viz && old && old.parentNode) old.parentNode.replaceChild(viz, old);
    }
    return prep(id);
  };
})();

;

/* ---- shared runtime for M2 and M3 (C-salt-graphite core + bed), the two moments, one private scope ---- */
(function () {
/* ============================================================================
   t4m core · shared runtime for the C-salt-graphite WebGL moments      -t4m
   ----------------------------------------------------------------------------
   Inlined by build.py ahead of one moment file, inside ONE <script>, so a page
   is one root element plus one script and pastes into a single Webflow embed.

   What it owns, so the moments only own their scene:
     - WebGL2 context, a full-screen triangle, two passes:
         scene  (the moment's fragment shader) -> RGBA8 texture, alpha = signed CoC
         post   depth of field gather + vignette + film grain + dither -> canvas
     - scroll progress of the root's track, smoothed; beat index -> HTML overlay
     - reduced motion: no rAF loop, one still per beat, re-rendered on beat change
     - adaptive quality: DPR capped at 1.5, render scale 0.5..1 from frame time
     - pause when off-screen or the tab is hidden
     - no WebGL2 or a shader failure: the inlined poster stays, overlay still steps
     - ?knobs panel, ?look=p|s, #hash params work too (the render tool can only
       pass a hash, so every param is read from both search and hash)

   URL params:  look=p|s  knobs  still (force reduced motion)  loop (autoplay)
                nogl (force poster fallback)  poster (hide the UI for capture)
                <knob key>=<value> for any knob

   v2 (Oct 5, THEME-light.md), side by side with core.js, which is untouched:
     - theme=dark|light and paper=<6-digit hex> (light only; default f2f2f0)
       resolved per moment: namespaced URL key (m2.theme) > bare URL key
       (theme) > the root's data-theme / data-paper attribute > the default.
       T4M.theme(root) resolves early (before mount), sets data-theme and the
       --paper / --paper-rgb custom properties on the root, so the CSS is
       right before the first frame, even when mount is deferred.
     - namespaced keys built in: "m2.look=p" reaches only #t4m-m2 and wins
       over a bare "look=p" (the in-situ P1 merge, so it works without it)
     - dark: the scene and post shaders and every uniform are exactly as in
       core.js, so theme=dark renders pixel-identical to the v3 builds
     - light: the post pass fades the frame's edges into the paper instead
       of darkening them (no navy vignette), and the grain is finer
     - def.frag may be a function (st) -> source, so a moment can build a
       light shader without touching its dark one
     - knobs may carry theme: 'light' (shown in the panel only in light);
       the panel gains Theme and Paper, which reload the page with the
       new value in the hash

   drive (Oct 5, CHAPTERS.md section 2), added in place; -prev-drive copies
   keep the file as it was:
     - drive=scroll|host, resolved like theme (m2.drive > drive > the root's
       data-drive > scroll). scroll is the default and renders exactly as
       before.
     - host: page scroll is ignored; the root fills the box the page gives it
       (CSS in drive.css keys off data-drive=host), the canvas follows the box
       (ResizeObserver), and the root gets
         root.t4mDrive = { set(p), beats, highlight, start(), stop(), mode }
       then a 't4m:drive-ready' event (it bubbles). set(p) takes story
       progress 0..1; while the loop is stopped it renders that frame at once,
       while it runs the next frame draws it. The clock is the page's.
     - def.drive (or def.drive(st)) gives { beats, highlight }; a moment may
       define its own story progress (M3 warps it so the page's linear clock
       plays the neutron at its natural pace).
   ========================================================================= */
var T4M = (function () {
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

  /* namespaced switches: m2.<key> wins over a bare <key> (same merge as the in-situ P1 patch) */
  function nsMerge(P, root, def) {
    var NS = ((def && def.ns) || root.id.replace(/^t4m-/, '')) + '.';
    Object.keys(P).forEach(function (k) { if (k.indexOf(NS) === 0) P[k.slice(NS.length)] = P[k]; });
    return P;
  }

  /* ---- theme and paper -------------------------------------------------------------------
     First valid value wins: URL (namespaced, then bare; already merged into P) > root attribute > default */
  var THEMES = ['dark', 'light'], PAPER_DEFAULT = 'f2f2f0', DRIVES = ['scroll', 'host'];
  function hex6(v) { var m = /^#?([0-9a-fA-F]{6})$/.exec(String(v == null ? '' : v).trim()); return m ? m[1].toLowerCase() : null; }
  /* inverse of the scene's ACES fit, per channel: the HDR value that lands exactly on y after tone mapping */
  function acesInv(y) {
    y = clamp(y, 0, 0.99995);
    var a = 2.51 - 2.43 * y, b = 0.03 - 0.59 * y, c = -0.14 * y;
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  }
  function theme(root, def, Pin) {
    var Q = Pin || nsMerge(params(), root, def);
    var th = THEMES.indexOf(Q.theme) >= 0 ? Q.theme : THEMES.indexOf(root.getAttribute('data-theme')) >= 0 ? root.getAttribute('data-theme') : 'dark';
    var hex = hex6(Q.paper) || hex6(root.getAttribute('data-paper')) || PAPER_DEFAULT;
    var rgb = [0, 2, 4].map(function (i) { return parseInt(hex.slice(i, i + 2), 16) / 255; });
    var lin = rgb.map(function (x) { return Math.pow(x, 2.2); });   // the scene's display gamma is a plain 2.2
    var dr = DRIVES.indexOf(Q.drive) >= 0 ? Q.drive : DRIVES.indexOf(root.getAttribute('data-drive')) >= 0 ? root.getAttribute('data-drive') : 'scroll';
    var TH = { theme: th, light: th === 'light', paper: hex, rgb: rgb, lin: lin, hdr: lin.map(acesInv), drive: dr };
    root.setAttribute('data-theme', th);
    // drive: the attribute is only written when it matters (host, or overriding a host attribute), so a plain scroll page is untouched
    if (dr === 'host' || root.getAttribute('data-drive') != null) root.setAttribute('data-drive', dr);
    if (TH.light) {
      root.setAttribute('data-paper', hex);
      root.style.setProperty('--paper', '#' + hex);
      root.style.setProperty('--paper-rgb', rgb.map(function (x) { return Math.round(x * 255); }).join(','));
    }
    return TH;
  }

  var VERT = '#version 300 es\nin vec2 aPos;\nvoid main(){ gl_Position = vec4(aPos, 0.0, 1.0); }\n';

  /* Post: scatter-as-gather bokeh from the signed CoC in alpha (negative = in
     front of focus). A sample further back than the centre may only spread as
     far as the centre's own blur, so sharp foreground never smears into the
     background and blurred foreground does bleed over sharp things behind it. */
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

  /* Post, light theme: the same depth of field, then the frame's edges fade into the paper (a
     high-key falloff, never a darkening), finer grain, and the outermost pixels land exactly on
     the paper so the stage meets the page with no seam. */
  var POST_L = POST
    .replace('uniform float uMaxCoc, uTime, uGrain, uVig;', 'uniform float uMaxCoc, uTime, uGrain, uVig;\nuniform vec3 uPaper;\nuniform vec4 uEdge;')
    .replace('  col *= 1.0 - uVig * smoothstep(0.3, 1.05, length(q));\n',
      '  col += (h12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5) * uGrain;\n' +
      '  vec2 e2 = abs(uv - 0.5) * 2.0;\n' +
      '  vec2 es = vec2(smoothstep(uEdge.x, 1.0, e2.x), smoothstep(uEdge.y, 1.0, e2.y));\n' +
      '  float eb = es.x + es.y - es.x * es.y;\n' +
      '  float er = smoothstep(uEdge.z, uEdge.z + 0.75, length(q));\n' +
      '  col = mix(col, uPaper, clamp(uVig * max(eb * uEdge.w, er), 0.0, 1.0));\n')
    .replace('  col += (h12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5) * uGrain;\n  col += (h12(gl_FragCoord.yx',
      '  col += (h12(gl_FragCoord.yx');

  function shader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      // surface it as a page error (asynchronously, so the fallback still runs)
      setTimeout(function () { throw new Error('t4m shader compile: ' + log); });
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
      setTimeout(function () { throw new Error('t4m program link: ' + log); });
      return null;
    }
    return p;
  }
  function uniforms(gl, prog) {
    var cache = {};
    function loc(n) { if (!(n in cache)) cache[n] = gl.getUniformLocation(prog, n); return cache[n]; }
    return {
      f: function (n, v) { var l = loc(n); if (l) gl.uniform1f(l, v); },
      v2: function (n, v) { var l = loc(n); if (l) gl.uniform2fv(l, v); },
      v3: function (n, v) { var l = loc(n); if (l) gl.uniform3fv(l, v); },
      v4: function (n, v) { var l = loc(n); if (l) gl.uniform4fv(l, v); },
      i: function (n, v) { var l = loc(n); if (l) gl.uniform1i(l, v); }
    };
  }

  /* camera basis: returns {pos, f, r, u} with f forward, r right, u up */
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

  /* site P3 · lazy start: compile and run this moment only when section 4 comes within a viewport of the
     screen, staggered (M2 +0.6 s, M3 +1.2 s) so two ray-march compiles never land on one frame */
  function mount(root, def) {
    if (!root) return;
    var HOST = root;
    var done = false, io = null;
    var go = function () { if (done) return; done = true; if (io) io.disconnect(); mountNow(root, def); };
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); setTimeout(go, (document.documentElement.classList.contains('tz-s4-chapters') ? 600 * (+((root.id.match(/\d+$/) || ['2'])[0]) - 1) : 0)); } }, { rootMargin: '100% 0px 100% 0px' });
      io.observe(HOST);
    } else { go(); }
  }
  function mountNow(root, def) {
    var P = params();
    /* insitu P1 · namespaced switches: "m2.look=p" reaches only #t4m-m2 and wins over a bare
       "look=p", so several moments can read one page URL without crossing wires */
    var NS = (def.ns || root.id.replace(/^t4m-/, '')) + '.';
    Object.keys(P).forEach(function (k) { if (k.indexOf(NS) === 0) P[k.slice(NS.length)] = P[k]; });
    nsMerge(P, root, def);   // v2: namespaced keys built in (the in-situ P1 merge; harmless if P1 is applied too)
    var TH = theme(root, def, P);
    var st = {
      theme: TH.theme, light: TH.light, paper: TH, host: TH.drive === 'host', hostP: 0,
      look: P.look === 'p' ? 'p' : 's',
      reduced: ('still' in P) || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
      loop: 'loop' in P,
      poster: 'poster' in P,
      K: {}, S: {},
      t: 0, dt: 0, p: 0, ps: 0, beat: -1, w: 2, h: 2, aspect: 1, cssW: 0, cssH: 0,
      scale: def.startScale || 0.9, maxScale: 1, fps: 0
    };
    def.knobs.forEach(function (k) {
      st.K[k.key] = (P[k.key] != null && P[k.key] !== '') ? parseFloat(P[k.key]) : k.value;
    });
    (def.selects || []).forEach(function (k) {
      st.S[k.key] = (P[k.key] && k.options.indexOf(P[k.key]) >= 0) ? P[k.key] : k.value;
    });
    root.setAttribute('data-look', st.look);
    if (st.poster) root.classList.add('is-poster');

    var track = root.querySelector('.t4m-track'), stage = root.querySelector('.t4m-stage');
    var canvas = root.querySelector('canvas.t4m-gl');
    var beatEls = root.querySelectorAll('[data-beat]'), pipEls = root.querySelectorAll('[data-pip]');

    function progress() {
      if (st.host) return st.hostP;   // drive=host: the page's clock, never the page scroll
      var r = track.getBoundingClientRect(), vh = window.innerHeight || 1, span = r.height - vh;
      return span > 0 ? clamp(-r.top / span, 0, 1) : 0;
    }
    function setBeat(i) {
      if (i === st.beat) return false;
      st.beat = i;
      root.setAttribute('data-beat', String(i + 1));
      Array.prototype.forEach.call(beatEls, function (el) { el.classList.toggle('on', +el.getAttribute('data-beat') === i + 1); });
      Array.prototype.forEach.call(pipEls, function (el) { el.classList.toggle('on', +el.getAttribute('data-pip') <= i + 1); });
      return true;
    }
    /* default beat from progress: four equal quarters of the scroll */
    function beatOf(p) { return Math.min(3, Math.floor(p * 4)); }

    var gl = null;
    if (!('nogl' in P)) {
      try {
        gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false,
          premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      } catch (e) { gl = null; }
    }
    var progScene = gl && program(gl, VERT, typeof def.frag === 'function' ? def.frag(st) : def.frag);
    var progPost = gl && progScene && program(gl, VERT, st.light ? POST_L : POST);

    if (!gl || !progScene || !progPost) {
      root.classList.add('is-nogl');
      canvas.style.display = 'none';
      var onScrollNoGl = function () {
        st.p = st.ps = progress();
        if (def.overlay) def.overlay(st);
        setBeat(def.beatOf ? def.beatOf(st) : beatOf(st.p));
      };
      if (st.host) {
        expose(function (p) { st.hostP = clamp(+p || 0, 0, 1); st.p = st.ps = st.hostP; if (def.step) def.step(st, 0); onScrollNoGl(); },
               function () {}, function () {});
        onScrollNoGl();
        return;
      }
      window.addEventListener('scroll', onScrollNoGl, { passive: true });
      onScrollNoGl();
      return;
    }

    /* geometry: one full-screen triangle */
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
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5) * (parseFloat(root.getAttribute('data-tz-res')) || 1);   /* site v4 P14 */
      var cw = stage.clientWidth || 1, ch = stage.clientHeight || 1;
      var W = Math.max(2, Math.round(cw * dpr * st.scale)), H = Math.max(2, Math.round(ch * dpr * st.scale));
      if (W !== canvas.width || H !== canvas.height) { canvas.width = W; canvas.height = H; allocTarget(W, H); }
      st.w = W; st.h = H; st.aspect = W / H; st.cssW = cw; st.cssH = ch;
    }

    var live = false;
    function render() {
      resize();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, st.w, st.h);
      gl.useProgram(progScene);
      Us.v2('uRes', [st.w, st.h]);
      Us.f('uTime', st.t);
      Us.f('uLook', st.look === 'p' ? 0 : 1);
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
      // max blur radius in render pixels, scaled to the viewport height
      Up.f('uMaxCoc', (st.K.blur == null ? 1 : st.K.blur) * (def.maxCoc || 12) * st.h / 900);
      if (st.light) {
        // light: finer grain; the edges fade into the paper (def.edge: box start x, y, radial start, box weight)
        Up.f('uGrain', def.grainLight == null ? 0.014 : def.grainLight);
        Up.f('uVig', def.paperFade ? def.paperFade(st) : 1);
        Up.v3('uPaper', TH.rgb);   // post runs in display space
        Up.v4('uEdge', (typeof def.edge === 'function' ? def.edge(st) : def.edge) || [0.84, 0.82, 0.70, 1.0]);
      } else {
        Up.f('uGrain', def.grain == null ? 0.03 : def.grain);
        Up.f('uVig', def.vignette == null ? 0.35 : def.vignette);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!live) {
        live = true;
        // the poster fades out only once a real frame exists, so there is never a black frame
        requestAnimationFrame(function () { root.classList.add('is-live'); });
      }
    }

    function step(dt) {
      st.p = progress();
      if (st.reduced || st.host) st.ps = st.p;   // host: the page's clock is already smooth; render exactly p
      else st.ps += (st.p - st.ps) * (1 - Math.exp(-dt * 4 * (st.K.pacing || 1)));
      if (def.step) def.step(st, dt);
      if (def.overlay) def.overlay(st);
      return setBeat(def.beatOf ? def.beatOf(st) : beatOf(st.ps));
    }

    /* adaptive quality */
    var accT = 0, accN = 0, cool = 2, fpsEl = null, scaleEl = null;
    function measure(dt) {
      accT += dt; accN++;
      if (accN < 30) return;
      var avg = accT / accN * 1000; accT = 0; accN = 0;
      st.fps = 1000 / avg;
      if (fpsEl) { fpsEl.textContent = st.fps.toFixed(0); scaleEl.textContent = st.scale.toFixed(2); }
      root.setAttribute('data-fps', st.fps.toFixed(1));
      if (cool > 0) { cool--; return; }
      if (avg > 24 && st.scale > 0.5) { st.scale = Math.max(0.5, st.scale * 0.85); cool = 2; }
      else if (avg < 17.8 && st.scale < st.maxScale) { st.scale = Math.min(st.maxScale, st.scale * 1.07); cool = 4; }
    }

    var raf = 0, last = 0, visible = true, started = !st.host;   // host: the loop runs only between start() and stop()
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
      if (!raf && visible && !document.hidden && !st.reduced && started) raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) last = 0;
    }

    if (st.reduced) {
      // static stepped beats: one still per beat, re-rendered only when the beat changes
      st.t = def.stillTime || 6;
      var redraw = function (force) { if (step(0) || force) render(); };
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

    /* drive=host: the page's clock calls set(p); the moment draws what it is told */
    if (st.host) {
      var lastSet = 0;
      var looping = function () { return started && visible && !document.hidden && !st.reduced; };
      var drawNow = function () {
        var now = (window.performance && performance.now()) || Date.now();
        var dt = st.reduced ? 0 : Math.min(0.1, lastSet ? (now - lastSet) / 1000 : 0);
        lastSet = now; st.dt = dt; st.t += dt;
        step(dt); render();
      };
      expose(function (p) { st.hostP = clamp(+p || 0, 0, 1); if (!looping()) drawNow(); },
             function () { started = true; last = 0; schedule(); },
             function () { started = false; if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; lastSet = 0; });
      // the canvas follows the box, including hidden -> shown
      if ('ResizeObserver' in window) new ResizeObserver(function () { if (!looping()) { step(0); render(); } }).observe(stage);
    }

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      if (raf) cancelAnimationFrame(raf);
      raf = 0; visible = false;
      root.classList.remove('is-live');
      root.classList.add('is-nogl');
    });

    if ('knobs' in P) panel();

    function expose(set, start, stop) {
      var d = typeof def.drive === 'function' ? def.drive(st) : (def.drive || {});
      root.t4mDrive = { mode: 'host', set: set, start: start, stop: stop,
        beats: d.beats || [0, 1, 2, 3].map(function (i) { return { n: i + 1, from: i / 4, hold: (i + 0.5) / 4, to: (i + 1) / 4 }; }),
        highlight: d.highlight || { from: 0, to: 1, seconds: 10 } };
      var ev;
      try { ev = new CustomEvent('t4m:drive-ready', { bubbles: true }); } catch (e) { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('t4m:drive-ready', true, false, null); }
      // after the current task, so a listener added right after the moment's script still hears it
      setTimeout(function () { root.dispatchEvent(ev); }, 0);
    }

    function panel() {
      var el = document.createElement('div');
      el.className = 't4m-knobs';
      var h = '<div class="t4m-knobs__h">' + def.name + ' · knobs</div>';
      h += '<div class="t4m-knobs__row t4m-knobs__look"><span>Look</span><span>' +
        '<button type="button" data-look="p">P photoreal</button><button type="button" data-look="s">S stylised</button></span></div>';
      // v2: theme and paper reload the page with the new value in the hash (the scene shader is built per theme)
      h += '<label class="t4m-knobs__row"><span>Theme</span><select data-theme-sel>' +
        THEMES.map(function (o) { return '<option' + (o === st.theme ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>';
      if (st.light) {
        h += '<label class="t4m-knobs__row"><span>Paper</span><select data-paper-sel>' +
          [PAPER_DEFAULT, 'ffffff'].concat([PAPER_DEFAULT, 'ffffff'].indexOf(TH.paper) < 0 ? [TH.paper] : []).map(function (o) {
            return '<option' + (o === TH.paper ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>';
      }
      def.knobs.forEach(function (k) {
        if (k.theme && k.theme !== st.theme) return;
        h += '<label class="t4m-knobs__row"><span>' + k.label + '<b data-v="' + k.key + '"></b></span>' +
          '<input type="range" min="' + k.min + '" max="' + k.max + '" step="' + k.step + '" value="' + st.K[k.key] + '" data-k="' + k.key + '"></label>';
        if (k.hint) h += '<div class="t4m-knobs__hint">' + k.hint + '</div>';
      });
      (def.selects || []).forEach(function (k) {
        if (k.theme && k.theme !== st.theme) return;
        h += '<label class="t4m-knobs__row"><span>' + k.label + '</span><select data-s="' + k.key + '">' +
          k.options.map(function (o) { return '<option' + (o === st.S[k.key] ? ' selected' : '') + '>' + o + '</option>'; }).join('') +
          '</select></label>';
      });
      h += '<div class="t4m-knobs__row"><span>fps <b data-fps>-</b> · render scale <b data-scale>-</b></span></div>';
      h += '<button type="button" class="t4m-knobs__copy" data-copy>Copy JSON</button>';
      el.innerHTML = h;
      root.appendChild(el);
      fpsEl = el.querySelector('[data-fps]'); scaleEl = el.querySelector('[data-scale]');
      function label(key) { var b = el.querySelector('[data-v="' + key + '"]'); if (b) b.textContent = ' ' + (+st.K[key]).toFixed(2); }
      function looks() {
        Array.prototype.forEach.call(el.querySelectorAll('[data-look]'), function (b) { b.classList.toggle('on', b.getAttribute('data-look') === st.look); });
      }
      def.knobs.forEach(function (k) { label(k.key); });
      looks();
      function reload(key, val) {
        var NS = ((def && def.ns) || root.id.replace(/^t4m-/, '')) + '.';
        var kv = (location.hash || '').slice(1).split('&').filter(function (x) {
          var n = decodeURIComponent(x.split('=')[0]);
          return x && n !== key && n !== NS + key;
        });
        kv.push(key + '=' + val);
        location.hash = kv.join('&');
        location.reload();
      }
      el.addEventListener('change', function (e) {
        if (e.target.hasAttribute('data-theme-sel')) reload('theme', e.target.value);
        if (e.target.hasAttribute('data-paper-sel')) reload('paper', e.target.value);
      });
      el.addEventListener('input', function (e) {
        var k = e.target.getAttribute('data-k'), s = e.target.getAttribute('data-s');
        if (k) { st.K[k] = parseFloat(e.target.value); label(k); }
        if (s) st.S[s] = e.target.value;
        if (st.reduced) render();
      });
      el.addEventListener('change', function (e) {
        var s = e.target.getAttribute('data-s');
        if (s) { st.S[s] = e.target.value; if (st.reduced) render(); }
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
  }

  return { mount: mount, theme: theme, acesInv: acesInv, lookAt: lookAt, clamp: clamp, mix: mix, mixv: mixv, smooth: smooth, norm: norm, cross: cross };
})();

/* ============================================================================
   t4m bed · the packed pebble bed shared by M2 v3 and M3 v2           -t4m
   ----------------------------------------------------------------------------
   Round 3 (science check row 32): in the core the pebbles are PACKED and
   TOUCHING, the bed rises together slowly, and the salt streams through the
   gaps far faster. Sparse floating pebbles were wrong.

   The bed is procedural and infinite, so there are no pebble arrays and no
   wrap pops:
     - layers of pebbles (radius 1 = 20 mm) on a hexagonal lattice in x-y,
       centre spacing BA = 2.04 (a 0.8 mm gap at most, so they read touching)
     - layers stacked along +z at BDZ = 1.70, alternate layers in the hollows
     - each site jittered a little by an integer hash (identical in GLSL and JS)
     - the front layer (k = 0) has its centres exactly on z = 0, so the M3
       section plane at z = 0 cuts every front pebble through its centre and
       shows the true M1 cross-section (core 0-14, band 14-18, shell 18-20 mm)
     - packing about 68% (a hex stack, loosened); a random bed is about 60%
     - uBedY slides the whole bed upward (the slow creep)
     - uCutZ removes everything at z < uCutZ (no cut: -9)

   Ray tracing walks the layers front to back. Inside each layer's slab it
   samples the ray every 1.3 units and tests the nearest lattice site plus its
   six neighbours, which provably covers every sphere the ray can touch there.
   ========================================================================= */
var T4M_BED = (function () {
  'use strict';
  var BA = 2.04, BDZ = 1.70, BNL = 4;

  var GLSL = [
'uint hu(uint x){ x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }',
'float h3(ivec3 c){ uvec3 q = uvec3(c + 65536); return float(hu(q.x + hu(q.y + hu(q.z)))) * (1.0/4294967295.0); }',
'vec3 h33i(ivec3 c){ uvec3 q = uvec3(c + 65536); uint a = hu(q.x + hu(q.y + hu(q.z))); uint b = hu(a ^ 0x9e3779b9u); uint d = hu(b ^ 0x85ebca6bu);',
'  return vec3(float(a), float(b), float(d)) * (1.0/4294967295.0); }',
'vec2 h22(vec2 p){ uvec2 q = uvec2(ivec2(p) + 65536); uint a = hu(q.x + hu(q.y)); uint b = hu(a ^ 0x9e3779b9u); return vec2(float(a), float(b)) * (1.0/4294967295.0); }',
'float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
'float vn(vec3 p){',
'  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); ivec3 c = ivec3(i);',
'  float a = h3(c), b = h3(c+ivec3(1,0,0)), d = h3(c+ivec3(0,1,0)), e = h3(c+ivec3(1,1,0));',
'  float g = h3(c+ivec3(0,0,1)), h = h3(c+ivec3(1,0,1)), k = h3(c+ivec3(0,1,1)), l = h3(c+ivec3(1,1,1));',
'  return mix(mix(mix(a,b,f.x), mix(d,e,f.x), f.y), mix(mix(g,h,f.x), mix(k,l,f.x), f.y), f.z);',
'}',
'float vor(vec2 p, float t){',
'  vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;',
'  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){',
'    vec2 g = vec2(x, y); vec2 o = h22(i + g);',
'    o = 0.5 + 0.42 * sin(t + 6.2831853 * o);',
'    vec2 r = g + o - f; float d = dot(r, r);',
'    if (d < d1){ d2 = d1; d1 = d; } else if (d < d2){ d2 = d; }',
'  }',
'  return sqrt(d2) - sqrt(d1);',
'}',
'vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }',
'vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }',
'const vec3 DEEPEST = vec3(0.0016, 0.0042, 0.0091);',
'const vec3 NAVY    = vec3(0.0006, 0.0170, 0.0335);',
'const vec3 LIFT    = vec3(0.0070, 0.0232, 0.0567);',
'const vec3 GOLD    = vec3(0.7454, 0.4072, 0.0185);',
'',
'uniform float uBedY, uCutZ, uBedJit;',
'const float BA = ' + BA.toFixed(2) + ', BDZ = ' + BDZ.toFixed(2) + ';',
'const int BNL = ' + BNL + ';',
'const ivec2 NB[7] = ivec2[7](ivec2(0,0), ivec2(1,0), ivec2(-1,0), ivec2(0,1), ivec2(0,-1), ivec2(1,-1), ivec2(-1,1));',
'vec2 layerOff(int k){ return (k % 2 == 1) ? vec2(BA * 0.5, BA * 0.288675) : vec2(0.0); }',
'vec3 siteC(ivec3 s){',
'  vec3 h = h33i(s) - 0.5;',
'  vec2 xy = vec2(float(s.x) + 0.5 * float(s.y), float(s.y) * 0.8660254) * BA + layerOff(s.z) + h.xy * uBedJit;',
'  float z = float(s.z) * BDZ + (s.z == 0 ? 0.0 : h.z * uBedJit);',
'  return vec3(xy.x, xy.y + uBedY, z);',
'}',
'ivec2 nearestSite(vec2 xy, int k){',
'  vec2 p = (xy - vec2(0.0, uBedY) - layerOff(k)) / BA;',
'  float r = p.y / 0.8660254, q = p.x - 0.5 * r, s = -q - r;',
'  float rq = floor(q + 0.5), rr = floor(r + 0.5), rs = floor(s + 0.5);',
'  float dq = abs(rq - q), dr = abs(rr - r), ds = abs(rs - s);',
'  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;',
'  return ivec2(int(rq), int(rr));',
'}',
'/* sphere minus the half-space z < uCutZ; face = 1 when the hit is on the cut */',
'float sphCut(vec3 ro, vec3 rd, vec3 c, out float face){',
'  face = 0.0;',
'  vec3 oc = ro - c; float b = dot(oc, rd); float h = b*b - dot(oc, oc) + 1.0;',
'  if (h < 0.0) return -1.0;',
'  h = sqrt(h); float t0 = -b - h, t1 = -b + h;',
'  if (t1 < 0.0) return -1.0;',
'  if (ro.z + rd.z * t0 >= uCutZ) return t0;',
'  if (ro.z + rd.z * t1 < uCutZ) return -1.0;',
'  face = 1.0;',
'  return (uCutZ - ro.z) / rd.z;',
'}',
'float traceBed(vec3 ro, vec3 rd, float tmax, out ivec3 hid, out float face){',
'  float best = tmax; hid = ivec3(0, 0, -1); face = 0.0;',
'  if (rd.z <= 1e-4) return tmax;',
'  for (int k = 0; k < BNL; k++){',
'    float zk = float(k) * BDZ;',
'    float ta = max((zk - 1.08 - ro.z) / rd.z, 0.0), tb = min((zk + 1.08 - ro.z) / rd.z, best);',
'    if (ta > best) break;',
'    if (ta >= tb) continue;',
'    float len = (tb - ta) * length(rd.xy);',
'    int n = int(min(ceil(len / 1.3), 7.0)) + 1;',
'    for (int s = 0; s < 8; s++){',
'      if (s >= n) break;',
'      vec3 p = ro + rd * mix(ta, tb, (float(s) + 0.5) / float(n));',
'      ivec2 c0 = nearestSite(p.xy, k);',
'      for (int m = 0; m < 7; m++){',
'        ivec3 sid = ivec3(c0 + NB[m], k);',
'        float f; float t = sphCut(ro, rd, siteC(sid), f);',
'        if (t > 0.0 && t < best){ best = t; hid = sid; face = f; }',
'      }',
'    }',
'  }',
'  return best;',
'}',
'/* soft shadow from neighbouring pebbles (cut-aware), toward the key light */',
'float shadowBed(vec3 p, vec3 L, ivec3 self){',
'  float s = 1.0;',
'  for (int i = 0; i < 3; i++){',
'    float d = i == 0 ? 0.9 : (i == 1 ? 2.1 : 3.6);',
'    vec3 x = p + L * d;',
'    float kf = floor(x.z / BDZ);',
'    for (int e = 0; e < 2; e++){',
'      int k = int(kf) + e;',
'      if (k < 0 || k >= BNL) continue;',
'      ivec2 c0 = nearestSite(x.xy, k);',
'      for (int m = 0; m < 7; m++){',
'        ivec3 sid = ivec3(c0 + NB[m], k);',
'        if (sid == self) continue;',
'        vec3 c = siteC(sid);',
'        vec3 oc = c - p; float b = dot(oc, L);',
'        if (b <= 0.0) continue;',
'        vec3 cp = p + L * b;',
'        if (cp.z < uCutZ) continue;',
'        float dc = length(c - cp);',
'        s = min(s, smoothstep(-1.0, 1.0, (dc - 1.0) / (0.14 * b + 0.02)));',
'      }',
'    }',
'  }',
'  return s;',
'}',
'/* ambient occlusion from the pebbles around (same layer and the two either side) */',
'float aoBed(vec3 p, vec3 n, ivec3 self){',
'  float o = 0.0;',
'  for (int dk = -1; dk <= 1; dk++){',
'    int k = self.z + dk;',
'    if (k < 0 || k >= BNL) continue;',
'    ivec2 c0 = nearestSite(p.xy, k);',
'    for (int m = 0; m < 7; m++){',
'      ivec3 sid = ivec3(c0 + NB[m], k);',
'      if (sid == self) continue;',
'      vec3 c = siteC(sid);',
'      float keep = smoothstep(-0.6, 0.6, c.z - uCutZ);',
'      vec3 r = c - p; float l2 = dot(r, r);',
'      o += max(dot(n, r) * inversesqrt(l2), 0.0) / l2 * keep;',
'    }',
'  }',
'  return clamp(1.0 - 0.8 * o, 0.0, 1.0);',
'}'
  ].join('\n');

  /* ---- the same lattice in JS (for paths, tags and focus) ---- */
  function hu(x) {
    x = x >>> 0;
    x = (x ^ (x >>> 16)) >>> 0; x = Math.imul(x, 0x7feb352d) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0; x = Math.imul(x, 0x846ca68b) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x;
  }
  function h33i(i, j, k) {
    var qx = (i + 65536) >>> 0, qy = (j + 65536) >>> 0, qz = (k + 65536) >>> 0;
    var a = hu((qx + hu((qy + hu(qz)) >>> 0)) >>> 0);
    var b = hu((a ^ 0x9e3779b9) >>> 0), d = hu((b ^ 0x85ebca6b) >>> 0);
    return [a / 4294967295, b / 4294967295, d / 4294967295];
  }
  function siteC(i, j, k, jit, bedY) {
    var h = h33i(i, j, k), off = (k % 2 === 1) ? [BA * 0.5, BA * 0.288675] : [0, 0];
    var x = (i + 0.5 * j) * BA + off[0] + (h[0] - 0.5) * jit;
    var y = j * 0.8660254 * BA + off[1] + (h[1] - 0.5) * jit;
    var z = k * BDZ + (k === 0 ? 0 : (h[2] - 0.5) * jit);
    return [x, y + (bedY || 0), z];
  }
  function nearestSite(x, y, k, bedY) {
    var off = (k % 2 === 1) ? [BA * 0.5, BA * 0.288675] : [0, 0];
    var px = (x - off[0]) / BA, py = (y - (bedY || 0) - off[1]) / BA;
    var r = py / 0.8660254, q = px - 0.5 * r, s = -q - r;
    var rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    var dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return [rq, rr];
  }
  /* which front-layer pebble (if any) a point on the z = 0 face lies in, and where */
  function faceSite(x, y, jit) {
    var c0 = nearestSite(x, y, 0, 0), best = null;
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].forEach(function (o) {
      var c = siteC(c0[0] + o[0], c0[1] + o[1], 0, jit, 0), d = Math.hypot(x - c[0], y - c[1]);
      if (!best || d < best.r) best = { i: c0[0] + o[0], j: c0[1] + o[1], c: c, r: d };
    });
    return best;
  }

  return { GLSL: GLSL, BA: BA, BDZ: BDZ, BNL: BNL, hu: hu, h33i: h33i, siteC: siteC, nearestSite: nearestSite, faceSite: faceSite };
})();
if (typeof module !== 'undefined') module.exports = T4M_BED;

/* ============================================================================
   M2 · Molten salt · v4 · packed bed, dark and light                   -t4m
   ----------------------------------------------------------------------------
   v4 (Oct 5): side by side with m2-salt-v3.js, which is untouched.
     - theme=dark|light, paper=<hex> (core-v2.js resolves them). In dark the
       scene shader is the v3 source byte for byte (FRAG below); the light
       shader is that source with the light blocks swapped in (lightFrag), so
       theme=dark renders exactly as v3.
     - light: the charcoal bed photographed on the paper. Paper is the sweep
       and the ambient light, the bed dissolves into it with distance (the
       salt's depth), the salt pools a pale sea-glass in the gaps and the
       depths (salt=glass|clear|bali), and its flow shows as darker
       shadowgraph lines streaming up the gaps (lines). Caustics, refraction
       and the hot-surface glow are kept; they land on the dark pebbles, so
       they read on paper as they are.
     - readout=scene carries the v3 copy (insitu/COPY.md): "Near atmospheric"
       and "650 °C"; navy type in light.
     - drive=host (CHAPTERS.md): story progress p is the scroll progress as
       it was (four equal beats, each camera settled at its middle). The
       highlight is beats 2 to 4: the salt streaming through the bed, then
       both stats, about 10 s.
   ----------------------------------------------------------------------------
   Round 3 decision (science check row 32): the pebbles in the core are packed
   (~60%) and touching; the bed rises together, slowly, over weeks; the salt
   streams through the gaps far faster.

   The camera is in clear salt in front of the face of the bed (bed-v3.js).
   Two speeds on screen, on purpose:
     - the bed creeps upward almost imperceptibly (uBedY)
     - the salt races: caustic streaks stretched along the flow and advected
       fast, refraction advected fast, and light streaks moving through the
       gaps (sampled along the part of each ray that runs between pebbles)
   Kept from v1/v2: the camera-in-salt mood, gold key, caustics, shafts, DOF,
   the hot-surface glow, and v2's readout knob (default stat).
   ========================================================================= */
(function () {
  'use strict';
  var root = document.getElementById('t4m-m2');
  if (!root) return;
  var TH = T4M.theme(root), LIGHT = TH.light;   // v4: resolved before mount, so the CSS is right from the first frame

  /* x is mirrored from the first draft so the near pebbles fall on the right, away from the card */
  var BEATS = [
    { pos: [5.6, -1.2, -8.6],  tgt: [-1.4, 1.2, 0.4],  fov: 42, flow: 1.0, shim: 0.15, glow: 0.35 },
    { pos: [4.3, -0.6, -6.4],  tgt: [-1.6, 2.0, 0.4],  fov: 42, flow: 2.4, shim: 1.00, glow: 0.60 },
    { pos: [3.2, -1.8, -8.2],  tgt: [-0.6, 6.2, 0.8],  fov: 46, flow: 0.6, shim: 0.05, glow: 0.35 },
    { pos: [8.2, -2.6, -13.6], tgt: [-1.0, 1.4, 0.4],  fov: 46, flow: 1.0, shim: 0.40, glow: 1.00 }
  ];

  var FRAG = [
'#version 300 es',
'precision highp float;',
'out vec4 oCol;',
'uniform vec2 uRes;',
'uniform float uTime, uLook, uFlow;',
'uniform vec3 uCamPos, uCamF, uCamR, uCamU;',
'uniform float uFocal;',
'uniform vec3 uKeyDir, uKeyCol, uTintCol;',
'uniform float uTint, uRefract, uShimmer, uGlow, uCaustic, uShafts, uStreaks;',
'uniform float uFocus, uAperture, uSurfY, uExposure;',
'uniform sampler2D uText;',
'uniform vec4 uTxC[2], uTxR[2], uTxU[2], uTxUV[2];',
T4M_BED.GLSL,
'',
'/* caustics cast by the moving salt: cells stretched along the flow (y) and carried up fast */',
'float caustic(vec3 p){',
'  vec2 q = vec2(p.x + 0.45 * p.z, p.y) * vec2(1.6, 0.5) - vec2(0.0, uFlow * 0.5);',
'  q += 0.5 * vec2(vn(vec3(q * 0.5, uTime * 0.2)), vn(vec3(q * 0.5 + 9.1, uTime * 0.2)));',
'  float c1 = 1.0 - smoothstep(0.0, 0.09, vor(q, uTime * 0.9));',
'  float c2 = 1.0 - smoothstep(0.0, 0.12, vor(q * 1.8 + 4.3, uTime * 1.1));',
'  return c1 * 0.6 + c2 * 0.35;',
'}',
'vec2 surfProj(vec3 p){ float depth = max(uSurfY - p.y, 0.0); return p.xz - uKeyDir.xz * (depth / max(uKeyDir.y, 0.3)); }',
'vec3 env(vec3 rd){',
'  float u = rd.y;',
'  vec3 c = mix(DEEPEST, NAVY, smoothstep(-0.75, 0.1, u));',
'  c = mix(c, LIFT * 1.35, smoothstep(0.0, 0.85, u));',
'  float k = max(dot(rd, uKeyDir), 0.0);',
'  c += uKeyCol * (pow(k, 5.0) * 0.045 + pow(k, 36.0) * 0.10);',
'  float win = smoothstep(0.5, 0.86, u);',
'  vec2 rq = rd.xz / max(u, 0.2) * 2.4;',
'  float rip = vn(vec3(rq + vec2(0.0, uTime * 0.04), uTime * 0.22));',
'  c += mix(LIFT * 2.0, uKeyCol * 0.5, 0.5) * win * (0.18 + 0.22 * rip);',
'  return mix(c, c * uTintCol * 2.4 + uTintCol * 0.006, uTint);',
'}',
'vec3 shadeWhole(vec3 p, vec3 n, vec3 rd, ivec3 id, vec3 c){',
'  vec3 h = h33i(id + ivec3(0, 0, 17));',
'  float a = h.x * 6.2831853, ca = cos(a), sa = sin(a);',
'  vec3 lp = p - c; lp = vec3(ca * lp.x - sa * lp.z, lp.y, sa * lp.x + ca * lp.z) + h * 40.0;',
'  vec3 g = vec3(vn(lp * 7.0), vn(lp * 7.0 + 17.3), vn(lp * 7.0 + 41.1)) - 0.5;',
'  g += 0.55 * (vec3(vn(lp * 19.0), vn(lp * 19.0 + 7.7), vn(lp * 19.0 + 3.3)) - 0.5);',
'  vec3 nb = normalize(n + g * 0.42);',
'  float mott = vn(lp * 1.6);',
'  vec3 albP = mix(lin(vec3(0.227, 0.239, 0.259)), lin(vec3(0.333, 0.349, 0.373)), mott);',
'  vec3 albS = lin(vec3(0.227, 0.239, 0.259));',
'  vec3 alb = mix(albP, albS, uLook) * (0.92 + 0.16 * vn(lp * 11.0));',
'  vec3 L = uKeyDir;',
'  float sh = shadowBed(p + n * 0.01, L, id);',
'  float ao = aoBed(p, n, id);',
'  float cau = caustic(p) * uCaustic;',
'  float dif = max((dot(nb, L) + 0.2) / 1.2, 0.0);',
'  vec3 key = uKeyCol * dif * sh * (0.8 + 0.9 * cau) * 2.6;',
'  vec3 fill = mix(NAVY * 2.2, LIFT * 4.2, nb.y * 0.5 + 0.5) * ao;',
'  vec3 col = alb * (key + fill);',
'  vec3 hv = normalize(L - rd);',
'  col += uKeyCol * pow(max(dot(nb, hv), 0.0), 18.0) * 0.06 * sh;',
'  float fr = pow(1.0 - max(dot(nb, -rd), 0.0), 3.0);',
'  col += env(reflect(rd, nb)) * fr * 0.9 * ao;',
'  col += vec3(0.034, 0.011, 0.003) * uGlow * (0.55 + 0.45 * (1.0 - ao)) * (0.85 + 0.3 * vn(lp * 3.0 + uTime * 0.2));',
'  return col;',
'}',
'void main(){',
'  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;',
'  vec3 rd0 = normalize(uCamF * uFocal + uCamR * uv.x + uCamU * uv.y);',
'  /* refraction: an index field stretched along the flow, carried up at the salt speed */',
'  vec3 nq = vec3(uv.x * 3.4, uv.y * 1.15 - uFlow * 0.16, uTime * 0.16);',
'  vec2 g = vec2(vn(nq), vn(nq + vec3(5.2, 1.3, 7.7))) - 0.5;',
'  g += 0.5 * (vec2(vn(nq * 2.3 + 3.1), vn(nq * 2.3 + 8.4)) - 0.5);',
'  float amp = uRefract * 0.014 + uShimmer * 0.02;',
'  ivec3 id0; float f0; float t0 = traceBed(uCamPos, rd0, 80.0, id0, f0);',
'  float kd = clamp((id0.z >= 0 ? t0 : 30.0) / 16.0, 0.12, 1.0);',
'  vec3 rd = normalize(rd0 + (uCamR * g.x + uCamU * g.y) * amp * kd);',
'  ivec3 id; float fc; float t = traceBed(uCamPos, rd, 80.0, id, fc);',
'  bool hit = id.z >= 0;',
'  float tt = hit ? t : 60.0;',
'  vec3 bg = env(rd);',
'  vec3 col = bg;',
'  float dens = 0.06;',
'  if (hit){',
'    vec3 c = siteC(id); vec3 p = uCamPos + rd * t; vec3 n = normalize(p - c);',
'    col = mix(bg, shadeWhole(p, n, rd, id, c), exp(-t * dens));',
'  }',
'  /* the salt racing through the gaps: light streaks on the stretch of ray between pebbles */',
'  float tg0 = max((-1.0 - uCamPos.z) / max(rd.z, 1e-3), 0.0);',
'  float glen = clamp(tt - tg0, 0.0, 6.0);',
'  if (glen > 0.05){',
'    float acc = 0.0, jt = h12(gl_FragCoord.xy + fract(uTime) * 37.0);',
'    for (int i = 0; i < 5; i++){',
'      float ts = tg0 + (float(i) + jt) / 5.0 * glen; vec3 x = uCamPos + rd * ts;',
'      float s = vn(vec3(x.x * 2.4 + x.z, x.y * 0.42 - uFlow * 0.5, x.z * 2.0 + uTime * 0.3));',
'      acc += smoothstep(0.58, 0.95, s);',
'    }',
'    vec3 sc = mix(uKeyCol * 0.9 + LIFT * 2.0, vec3(1.0, 0.55, 0.22), uShimmer * 0.6);',
'    col += sc * acc / 5.0 * min(glen, 2.5) * 0.028 * uStreaks * exp(-tg0 * 0.05);',
'  }',
'  /* light shafts in the open salt in front of the bed */',
'  float jit = h12(gl_FragCoord.xy + fract(uTime) * 61.0);',
'  float tm = min(min(tt, tg0 + 0.5), 24.0), dt = tm / 8.0, sacc = 0.0;',
'  for (int i = 0; i < 8; i++){',
'    float ts = (float(i) + jit) * dt; vec3 x = uCamPos + rd * ts;',
'    vec2 q = surfProj(x) * 0.32;',
'    float s = smoothstep(0.5, 0.92, vn(vec3(q, uTime * 0.05)));',
'    sacc += s * exp(-ts * 0.09) * dt;',
'  }',
'  vec3 shaftCol = mix(uKeyCol * 0.5 + LIFT, uTintCol * 0.6, uTint * 0.5);',
'  col += shaftCol * sacc * 0.022 * uShafts;',
'  /* warm schlieren: heat moving up through the salt (beat 2) */',
'  float sch = vn(vec3(uv.x * 9.0 + g.x * 2.0, uv.y * 2.2 - uFlow * 0.55, uTime * 0.35));',
'  sch = smoothstep(0.55, 0.95, sch) * smoothstep(-0.6, 0.4, uv.y);',
'  col += vec3(0.016, 0.010, 0.0045) * sch * uShimmer;',
'  col *= uExposure;',
'  col = aces(col);',
'  col = pow(col, vec3(1.0 / 2.2));',
'  /* readout=scene: type on a plane in the salt, in front of the bed */',
'  float tz = tt;',
'  vec3 rdT = normalize(mix(rd0, rd, 0.22));',
'  for (int i = 0; i < 2; i++){',
'    if (uTxC[i].w <= 0.001) continue;',
'    vec3 R = uTxR[i].xyz, Uv = uTxU[i].xyz, n = normalize(cross(R, Uv));',
'    float dn = dot(rdT, n);',
'    if (abs(dn) < 1e-4) continue;',
'    float tp = dot(uTxC[i].xyz - uCamPos, n) / dn;',
'    if (tp <= 0.0 || tp > tt) continue;',
'    vec3 q = uCamPos + rdT * tp - uTxC[i].xyz;',
'    vec2 sv = vec2(dot(q, R) / dot(R, R), dot(q, Uv) / dot(Uv, Uv));',
'    if (abs(sv.x) > 1.0 || abs(sv.y) > 1.0) continue;',
'    vec4 tx = texture(uText, mix(uTxUV[i].xy, uTxUV[i].zw, sv * 0.5 + 0.5));',
'    float k = uTxC[i].w * 0.92;',
'    col = col * (1.0 - tx.a * k) + tx.rgb * k;',
'    if (tx.a * k > 0.3) tz = uFocus * 0.9;',
'  }',
'  float coc = clamp(uAperture * (1.0 - uFocus / tz), -1.0, 1.0);',
'  oCol = vec4(col, coc * 0.5 + 0.5);',
'}'
  ].join('\n');

  /* light: the same shader with the dark-ground blocks swapped for paper ones. Every swap must match once. */
  function swap(src, a, b) {
    if (src.split(a).length !== 2) throw new Error('t4m m2 light shader: anchor not found once: ' + a.slice(0, 60));
    return src.replace(a, b);
  }
  function lightFrag(src) {
    src = swap(src, 'uniform sampler2D uText;',
      'uniform sampler2D uText;\n' +
      'uniform vec3 uPaper, uSalt;\n' +
      'uniform float uDensL, uFade0, uLines, uRim, uFill;');
    /* the sweep: paper, a touch lower toward the bottom, the free surface far above as a faint ripple; the salt tints it */
    src = swap(src, [
'vec3 env(vec3 rd){',
'  float u = rd.y;',
'  vec3 c = mix(DEEPEST, NAVY, smoothstep(-0.75, 0.1, u));',
'  c = mix(c, LIFT * 1.35, smoothstep(0.0, 0.85, u));',
'  float k = max(dot(rd, uKeyDir), 0.0);',
'  c += uKeyCol * (pow(k, 5.0) * 0.045 + pow(k, 36.0) * 0.10);',
'  float win = smoothstep(0.5, 0.86, u);',
'  vec2 rq = rd.xz / max(u, 0.2) * 2.4;',
'  float rip = vn(vec3(rq + vec2(0.0, uTime * 0.04), uTime * 0.22));',
'  c += mix(LIFT * 2.0, uKeyCol * 0.5, 0.5) * win * (0.18 + 0.22 * rip);',
'  return mix(c, c * uTintCol * 2.4 + uTintCol * 0.006, uTint);',
'}'].join('\n'), [
'vec3 env(vec3 rd){',
'  float u = rd.y;',
'  vec3 c = uPaper * mix(0.80, 1.0, smoothstep(-0.8, 0.45, u));',
'  float win = smoothstep(0.45, 0.86, u);',
'  vec2 rq = rd.xz / max(u, 0.2) * 2.4;',
'  float rip = vn(vec3(rq + vec2(0.0, uTime * 0.04), uTime * 0.22));',
'  c *= 1.0 - win * 0.07 * rip;',
'  return c;',
'}'].join('\n'))
    /* charcoal under a soft paper ambient: sky above, a dimmer bounce below; a gentle paper rim at grazing */
    src = swap(src, '  vec3 fill = mix(NAVY * 2.2, LIFT * 4.2, nb.y * 0.5 + 0.5) * ao;',
      '  vec3 fill = uPaper * mix(vec3(1.0), uSalt, 0.7) * mix(0.30, 0.62, nb.y * 0.5 + 0.5) * ao * uFill;')
    src = swap(src, '  col += env(reflect(rd, nb)) * fr * 0.9 * ao;', '  col += env(reflect(rd, nb)) * fr * uRim * ao * ao;')
    /* charcoal reads lighter on paper than on navy: a touch darker albedo so it photographs as charcoal, not grey */
    src = swap(src, '  vec3 alb = mix(albP, albS, uLook) * (0.92 + 0.16 * vn(lp * 11.0));', '  vec3 alb = mix(albP, albS, uLook) * (0.92 + 0.16 * vn(lp * 11.0)) * 0.72;')
    /* a light main(): the depth fade and the flow lines move after the tone map, into display space, so the
       charcoal stays charcoal up close (in HDR the paper is about 15x the pebbles, and any fog washes them out) */
    var at = src.indexOf('void main(){');
    if (at < 0) throw new Error('t4m m2 light shader: no main');
    return src.slice(0, at) + [
'vec3 disp(vec3 c){ return pow(aces(c * uExposure), vec3(1.0 / 2.2)); }',
'void main(){',
'  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;',
'  vec3 rd0 = normalize(uCamF * uFocal + uCamR * uv.x + uCamU * uv.y);',
'  vec3 nq = vec3(uv.x * 3.4, uv.y * 1.15 - uFlow * 0.16, uTime * 0.16);',
'  vec2 g = vec2(vn(nq), vn(nq + vec3(5.2, 1.3, 7.7))) - 0.5;',
'  g += 0.5 * (vec2(vn(nq * 2.3 + 3.1), vn(nq * 2.3 + 8.4)) - 0.5);',
'  float amp = uRefract * 0.014 + uShimmer * 0.02;',
'  ivec3 id0; float f0; float t0 = traceBed(uCamPos, rd0, 80.0, id0, f0);',
'  float kd = clamp((id0.z >= 0 ? t0 : 30.0) / 16.0, 0.12, 1.0);',
'  vec3 rd = normalize(rd0 + (uCamR * g.x + uCamU * g.y) * amp * kd);',
'  ivec3 id; float fc; float t = traceBed(uCamPos, rd, 80.0, id, fc);',
'  bool hit = id.z >= 0;',
'  float tt = hit ? t : 60.0;',
'  vec3 bg = env(rd);',
'  vec3 col = bg;',
'  float see = 0.0;   /* how much of the bed shows through the salt: 1 up close, falling with distance */',
'  if (hit){',
'    vec3 c = siteC(id); vec3 p = uCamPos + rd * t; vec3 n = normalize(p - c);',
'    col = shadeWhole(p, n, rd, id, c);',
'    see = exp(-max(t - uFade0, 0.0) * uDensL);',
'  } else if (rd.z > 1e-3){',
'    /* a rare ray that slips through every traced layer is deep in the bed: a dark interstice, not a hole to the paper */',
'    col = uPaper * 0.012;',
'    see = exp(-max((float(BNL) * BDZ - uCamPos.z) / rd.z - uFade0, 0.0) * uDensL);',
'  }',
'  /* light shafts in the open salt in front of the bed (a soft haze over the charcoal) */',
'  float tg0 = max((-1.0 - uCamPos.z) / max(rd.z, 1e-3), 0.0);',
'  float jit = h12(gl_FragCoord.xy + fract(uTime) * 61.0);',
'  float tm = min(min(tt, tg0 + 0.5), 24.0), dt = tm / 8.0, sacc = 0.0;',
'  for (int i = 0; i < 8; i++){',
'    float ts = (float(i) + jit) * dt; vec3 x = uCamPos + rd * ts;',
'    vec2 q = surfProj(x) * 0.32;',
'    float s = smoothstep(0.5, 0.92, vn(vec3(q, uTime * 0.05)));',
'    sacc += s * exp(-ts * 0.09) * dt;',
'  }',
'  col += (uKeyCol * 0.5 + uPaper * 0.06) * sacc * 0.012 * uShafts;',
'  col = disp(col);',
'  col = mix(disp(bg) * mix(uSalt, vec3(1.0), smoothstep(0.45, 0.86, rd.y) * 0.6), col, see);   /* the salt pools a pale tint with depth */',
'  /* the salt racing through the gaps, as shadowgraph lines: light where the ground is dark, darker where it is pale */',
'  float glen = clamp(tt - tg0, 0.0, 6.0);',
'  if (glen > 0.05){',
'    float acc = 0.0, jt = h12(gl_FragCoord.xy + fract(uTime) * 37.0);',
'    for (int i = 0; i < 5; i++){',
'      float ts = tg0 + (float(i) + jt) / 5.0 * glen; vec3 x = uCamPos + rd * ts;',
'      float s = vn(vec3(x.x * 2.4 + x.z, x.y * 0.42 - uFlow * 0.5, x.z * 2.0 + uTime * 0.3));',
'      acc += smoothstep(0.58, 0.95, s);',
'    }',
'    float lum = dot(col, vec3(0.299, 0.587, 0.114));',
'    vec3 ink = mix(vec3(0.20, 0.36, 0.40), vec3(0.42, 0.30, 0.20), uShimmer * 0.6);',
'    vec3 lit = mix(vec3(0.80, 0.86, 0.84), vec3(0.95, 0.74, 0.50), uShimmer * 0.6);',
'    vec3 tgt = mix(lit, ink, smoothstep(0.32, 0.62, lum));',
'    float wl = clamp(acc / 5.0 * min(glen, 2.5) * 0.10 * uStreaks * uLines * exp(-tg0 * 0.05), 0.0, 0.6);',
'    col = mix(col, tgt, wl);',
'  }',
'  /* beat 2 heat: warm shadowgraph wisps rising through the salt */',
'  float sch = vn(vec3(uv.x * 9.0 + g.x * 2.0, uv.y * 2.2 - uFlow * 0.55, uTime * 0.35));',
'  sch = smoothstep(0.55, 0.95, sch) * smoothstep(-0.6, 0.4, uv.y);',
'  col *= 1.0 - sch * uShimmer * vec3(0.03, 0.05, 0.075) * max(uLines, 0.3);',
'  /* readout=scene: type on a plane in the salt, in front of the bed */',
'  float tz = tt;',
'  vec3 rdT = normalize(mix(rd0, rd, 0.22));',
'  for (int i = 0; i < 2; i++){',
'    if (uTxC[i].w <= 0.001) continue;',
'    vec3 R = uTxR[i].xyz, Uv = uTxU[i].xyz, n = normalize(cross(R, Uv));',
'    float dn = dot(rdT, n);',
'    if (abs(dn) < 1e-4) continue;',
'    float tp = dot(uTxC[i].xyz - uCamPos, n) / dn;',
'    if (tp <= 0.0 || tp > tt) continue;',
'    vec3 q = uCamPos + rdT * tp - uTxC[i].xyz;',
'    vec2 sv = vec2(dot(q, R) / dot(R, R), dot(q, Uv) / dot(Uv, Uv));',
'    if (abs(sv.x) > 1.0 || abs(sv.y) > 1.0) continue;',
'    vec4 tx = texture(uText, mix(uTxUV[i].xy, uTxUV[i].zw, sv * 0.5 + 0.5));',
'    float k = uTxC[i].w * 0.92;',
'    col = col * (1.0 - tx.a * k) + tx.rgb * k;',
'    if (tx.a * k > 0.3) tz = uFocus * 0.9;',
'  }',
'  float coc = clamp(uAperture * (1.0 - uFocus / tz), -1.0, 1.0);',
'  oCol = vec4(col, coc * 0.5 + 0.5);',
'}'].join('\n');
  }

  var flow = 0, creep = 0;
  var cam = BEATS[0];
  function beatBlend(ps) {
    var bf = Math.max(0, Math.min(3, ps * 4 - 0.5)), i = Math.min(2, Math.floor(bf)), f = bf - i;
    var w = T4M.smooth(0.12, 0.88, f), a = BEATS[i], b = BEATS[i + 1];
    return {
      pos: T4M.mixv(a.pos, b.pos, w), tgt: T4M.mixv(a.tgt, b.tgt, w), fov: T4M.mix(a.fov, b.fov, w),
      flow: T4M.mix(a.flow, b.flow, w), shim: T4M.mix(a.shim, b.shim, w), glow: T4M.mix(a.glow, b.glow, w)
    };
  }

  /* ---- readout=scene: type set in the salt. v4: the v3 copy (insitu/COPY.md), as the in-situ P10 did for v2 ---- */
  var TYPE = [
    { beat: 2, big: 'Near atmospheric', size: 150, unit: '', lines: ['The pressure of the air you breathe', 'Water reactors: about 150 times that'] },
    { beat: 3, big: '650', size: 236, unit: '°C', lines: ['Operating temperature', "Salt doesn't boil until 1,430 °C"] }
  ];
  /* gold is never text on paper: navy figures, a Fiord unit, navy mono lines */
  var INK = LIGHT ? { big: '#022434', unit: '#4D5A6E', line: '#022434' } : { big: '#F5F1E8', unit: '#E8E0CC', line: '#E1AB25' };
  var atlas = null, textTex = null, atlasReady = false;
  var txC = new Float32Array(8), txR = new Float32Array(8), txU = new Float32Array(8), txUV = new Float32Array(8);
  function spaced(c, str, x, y, track) {
    for (var i = 0; i < str.length; i++) { c.fillText(str[i], x, y); x += c.measureText(str[i]).width + track; }
    return x - track;
  }
  /* light: draw fn's glyphs as a blurred paper glow only (the glyphs themselves are pushed off the atlas), twice for density */
  function halo(c, blur, fn) {
    c.save();
    c.shadowColor = 'rgba(' + TH.rgb.map(function (x) { return Math.round(x * 255); }).join(',') + ',0.92)';
    c.shadowBlur = blur; c.shadowOffsetX = 4096; c.translate(-4096, 0);
    fn(); fn();
    c.restore();
  }
  function drawAtlas() {
    atlas = atlas || document.createElement('canvas');
    atlas.width = 2048; atlas.height = 1024;
    var c = atlas.getContext('2d');
    c.clearRect(0, 0, 2048, 1024);
    c.textBaseline = 'alphabetic';
    TYPE.forEach(function (b, i) {
      var y0 = i * 512, x = 16, base = y0 + 250;
      c.font = '500 ' + b.size + 'px Inter, system-ui, sans-serif'; c.fillStyle = INK.big;
      if (LIGHT) halo(c, 34, function () { c.fillText(b.big, x, base); });   // light: a soft paper pool behind the type, in the salt
      c.fillText(b.big, x, base);
      var w = x + c.measureText(b.big).width;
      if (b.unit) {
        w += 26;
        c.font = '400 84px Inter, system-ui, sans-serif'; c.fillStyle = INK.unit;
        if (LIGHT) halo(c, 26, function () { c.fillText(b.unit, w, base); });
        c.fillText(b.unit, w, base);
        w += c.measureText(b.unit).width;
      }
      c.font = '500 40px "JetBrains Mono", ui-monospace, monospace'; c.fillStyle = INK.line;
      var w2 = 0;
      if (LIGHT) halo(c, 22, function () { b.lines.forEach(function (ln, j) { spaced(c, ln.toUpperCase(), x + 6, y0 + 352 + j * 62, 8.8); }); });
      b.lines.forEach(function (ln, j) { w2 = Math.max(w2, spaced(c, ln.toUpperCase(), x + 6, y0 + 352 + j * 62, 8.8)); });
      b.wpx = Math.min(2048, Math.ceil(Math.max(w, w2) + 16));
      b.y0 = y0 + 250 - Math.round(b.size * 0.8); b.y1 = y0 + 440;
    });
  }
  function sceneType(st, U) {
    var gl = root.querySelector('canvas.t4m-gl').getContext('webgl2');
    if (!textTex) {
      textTex = gl.createTexture();
      var upload = function () {
        drawAtlas();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, textTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.activeTexture(gl.TEXTURE0);
        atlasReady = true;
      };
      upload();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(upload);
    }
    var on = st.S.readout === 'scene' && atlasReady;
    var bf = Math.max(0, Math.min(3, st.ps * 4 - 0.5));
    var portrait = st.aspect < 1;
    for (var i = 0; i < 2; i++) {
      var b = TYPE[i], bc = BEATS[b.beat];
      var a = on ? T4M.smooth(0.62, 0.18, Math.abs(bf - b.beat)) : 0;
      var fov = bc.fov * (portrait ? T4M.mix(1.25, 1.0, st.aspect) : 1);
      var c = T4M.lookAt(bc.pos, bc.tgt), d = 2.4;
      c.r = [-c.r[0], -c.r[1], -c.r[2]];   // the screen flip, so the type reads the right way round
      var visH = 2 * d * Math.tan(fov * Math.PI / 360), visW = visH * st.aspect;
      var hpx = b.y1 - b.y0, numFrac = portrait ? 0.062 : 0.07;
      var halfH = numFrac * visH * (hpx / 190) / 2, halfW = halfH * b.wpx / hpx;
      if (halfW > visW * 0.44) { halfH *= visW * 0.44 / halfW; halfW = visW * 0.44; }
      var ox = portrait ? 0 : visW * 0.24, oy = portrait ? visH * 0.24 : visH * 0.1;
      var ctr = [0, 1, 2].map(function (k) { return bc.pos[k] + c.f[k] * d + c.r[k] * ox + c.u[k] * oy; });
      txC.set([ctr[0], ctr[1], ctr[2], a], i * 4);
      txR.set([c.r[0] * halfW, c.r[1] * halfW, c.r[2] * halfW, 0], i * 4);
      txU.set([c.u[0] * halfH, c.u[1] * halfH, c.u[2] * halfH, 0], i * 4);
      txUV.set([0, 1 - b.y1 / 1024, b.wpx / 2048, 1 - b.y0 / 1024], i * 4);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    U.i('uText', 1);
    gl.activeTexture(gl.TEXTURE0);
    U.v4('uTxC', txC); U.v4('uTxR', txR); U.v4('uTxU', txU); U.v4('uTxUV', txUV);
  }

  T4M.mount(root, {
    name: 'M2 molten salt v4 · packed bed',
    /* drive=host: beats in story progress (the camera settles at each beat's middle); the highlight starts as the camera
       arrives at beat 2 (the salt streaming through the gaps) and ends settled on the 650 °C stat */
    drive: {
      beats: [
        { n: 1, from: 0.00, hold: 0.125, to: 0.25 },
        { n: 2, from: 0.25, hold: 0.375, to: 0.50 },
        { n: 3, from: 0.50, hold: 0.625, to: 0.75 },
        { n: 4, from: 0.75, hold: 0.875, to: 1.00 }
      ],
      highlight: { from: 0.30, to: 0.95, seconds: 10 }
    },
    frag: function () { return LIGHT ? lightFrag(FRAG) : FRAG; },
    edge: function (st) { return st.aspect < 1 ? [0.90, 0.86, 0.9, 1.0] : [0.84, 0.82, 0.70, 1.0]; },   // light: where the edges start to fade into the paper
    paperFade: function (st) { return T4M.clamp(st.K.edge, 0, 1.5); },
    startScale: 0.9,
    maxCoc: 12,
    grain: 0.028,
    vignette: 0.4,
    stillTime: 7.0,
    knobs: [
      { key: 'warmth', label: 'Light warmth', min: 0, max: 1, step: 0.01, value: 0.4, hint: 'key light: neutral warm white to gold' },
      { key: 'flow', label: 'Salt speed', min: 0, max: 3, step: 0.01, value: 1, hint: 'the salt through the gaps' },
      { key: 'creep', label: 'Bed creep', min: 0, max: 5, step: 0.01, value: 1, hint: 'the packed bed rising; real is weeks' },
      { key: 'streaks', label: 'Gap streaks', min: 0, max: 3, step: 0.01, value: 1 },
      { key: 'refract', label: 'Refraction strength', min: 0, max: 3, step: 0.01, value: 1 },
      { key: 'tint', label: 'Salt tint (look S)', min: 0, max: 1, step: 0.01, value: 0.5 },
      { key: 'caustic', label: 'Caustics', min: 0, max: 2, step: 0.01, value: 1 },
      { key: 'shafts', label: 'Light shafts', min: 0, max: 2, step: 0.01, value: 1 },
      { key: 'glow', label: 'Hot-surface glow', min: 0, max: 3, step: 0.01, value: 1 },
      { key: 'exposure', label: 'Exposure', min: 0.4, max: 2, step: 0.01, value: 1 },
      { key: 'blur', label: 'Depth of field', min: 0, max: 2, step: 0.01, value: 1 },
      { key: 'pacing', label: 'Pacing', min: 0.2, max: 3, step: 0.01, value: 1, hint: 'how quickly a beat settles after a scroll' },
      /* light only (THEME-light.md taste calls) */
      { key: 'depth', label: 'Salt depth (light)', min: 0, max: 3, step: 0.01, value: 1, theme: 'light', hint: 'how fast the bed dissolves into the paper with distance' },
      { key: 'lines', label: 'Flow lines (light)', min: 0, max: 3, step: 0.01, value: 1, theme: 'light', hint: 'darker shadowgraph lines where the salt streams through the gaps' },
      { key: 'edge', label: 'Paper at the edges (light)', min: 0, max: 1.5, step: 0.01, value: 1, theme: 'light', hint: 'how far the frame edges fade into the paper' }
    ],
    selects: [
      { key: 'readout', label: 'Readout', options: ['caption', 'stat', 'scene', 'none'], value: 'stat' },
      { key: 'tintHue', label: 'Salt tint colour (look S)', options: ['glass', 'ecru', 'bali'], value: 'glass' },
      { key: 'salt', label: 'Salt on paper (light)', options: ['glass', 'clear', 'bali'], value: 'glass', theme: 'light' }
    ],
    overlay: function (st) {
      var ro = st.S.readout;
      if (ro === 'scene' && root.classList.contains('is-nogl')) ro = 'stat';
      if (root.getAttribute('data-readout') !== ro) root.setAttribute('data-readout', ro);
    },
    step: function (st, dt) {
      cam = beatBlend(st.ps);
      flow += dt * 1.6 * cam.flow * st.K.flow;     // the salt: about 1.6 pebble radii a second
      creep += dt * 0.012 * st.K.creep;             // the bed: a pebble every ~3 minutes on screen
    },
    uniforms: function (st, U) {
      var K = st.K;
      var fov = cam.fov * (st.aspect < 1 ? T4M.mix(1.25, 1.0, st.aspect) : 1);
      var c = T4M.lookAt(cam.pos, cam.tgt);
      // looking along +z, cross(f, up) points to world -x; flip it so world +x is screen right
      U.v3('uCamPos', c.pos); U.v3('uCamF', c.f); U.v3('uCamR', [-c.r[0], -c.r[1], -c.r[2]]); U.v3('uCamU', c.u);
      U.f('uFocal', 0.5 / Math.tan(fov * Math.PI / 360));
      U.f('uFlow', st.reduced ? 3.0 : flow);
      U.f('uBedY', st.reduced ? 0.0 : creep);
      U.f('uCutZ', -9.0);
      U.f('uBedJit', 0.04);
      U.v3('uKeyDir', T4M.norm([-0.5, 0.75, -0.45]));
      // light: a softer, more neutral key (a studio key on charcoal; gold warmth turns graphite brown on paper)
      U.v3('uKeyCol', LIGHT ? T4M.mixv([1.0, 0.95, 0.88], [1.0, 0.66, 0.24], K.warmth * 0.35) : T4M.mixv([1.0, 0.86, 0.68], [1.0, 0.66, 0.24], K.warmth));
      var hue = { glass: [0.42, 0.60, 0.62], ecru: [0.80, 0.74, 0.62], bali: [0.40, 0.46, 0.56] }[st.S.tintHue] || [0.42, 0.6, 0.62];
      U.v3('uTintCol', hue.map(function (x) { return Math.pow(x, 2.2); }));
      U.f('uTint', st.look === 's' ? K.tint * 0.55 : 0);
      U.f('uRefract', K.refract);
      U.f('uShimmer', cam.shim * Math.max(0.3, K.refract));
      U.f('uGlow', cam.glow * K.glow);
      U.f('uCaustic', K.caustic * (st.look === 's' ? 1.15 : 1.0));
      U.f('uShafts', K.shafts);
      U.f('uStreaks', K.streaks);
      U.f('uFocus', Math.hypot(cam.tgt[0] - cam.pos[0], cam.tgt[1] - cam.pos[1], cam.tgt[2] - cam.pos[2]));
      U.f('uAperture', 0.8);
      U.f('uSurfY', 15.0);
      U.f('uExposure', K.exposure * 1.15);
      if (LIGHT) {
        // the paper, pre-exposure, so the open salt lands exactly on it whatever the exposure knob says
        U.v3('uPaper', TH.hdr.map(function (x) { return x / (K.exposure * 1.15); }));
        // the salt's tint on paper, applied in display space where the far bed dissolves (and, softly, to the ambient)
        var salt = { glass: [0.84, 0.93, 0.93], clear: [1, 1, 1], bali: [0.86, 0.90, 0.96] }[st.S.salt] || [0.84, 0.93, 0.93];
        U.v3('uSalt', salt);
        U.f('uDensL', 0.045 * K.depth);
        U.f('uFade0', 6.0);
        U.f('uLines', K.lines);
        U.f('uRim', 0.14);
        U.f('uFill', 1.0);
      }
      sceneType(st, U);
    }
  });
})();

/* ============================================================================
   M3 v2 · the neutron's path through the cut face of the packed bed    -t4m
   ----------------------------------------------------------------------------
   Pure JS, no DOM: runs in the page and in node (for checking).
   Everything is in the section plane z = 0, on the front layer of the bed,
   whose pebbles are all cut through their centres (bed-v3.js).

   Radii in units of the pebble radius (20 mm): core < 0.70, band 0.70-0.90,
   shell 0.90-1.00.

   The path:
     birth   a point in pebble A's fuel band (a fission)
     flight  one long straight run that crosses the next pebble's fuel band
             (and its core, and its band again) without reacting, ending in
             graphite beyond it: about 3.5 radii = 7 cm (a fast neutron's
             mean free path is about 6 cm)
     hops    six more bounces, each 1.6-2.4 radii (3-5 cm), roughly constant,
             always landing in graphite (core or shell), wandering toward Z
     capture a point in pebble Z's fuel band, many pebbles from A
   ========================================================================= */
var T4M_PATH = (function () {
  'use strict';
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function build(B, opt) {
    opt = opt || {};
    var JIT = opt.jit == null ? 0.04 : opt.jit;
    var R = rng(opt.seed || 7);
    var A = B.siteC(opt.ai == null ? -3 : opt.ai, opt.aj == null ? 1 : opt.aj, 0, JIT, 0);
    var Z = B.siteC(opt.zi == null ? 2 : opt.zi, opt.zj == null ? -1 : opt.zj, 0, JIT, 0);
    function at(x, y) { return B.faceSite(x, y, JIT); }
    function graphite(f) { return f && f.r < 0.97 && (f.r < 0.62 || f.r > 0.93); }

    var pts = [], kinds = [];
    var a0 = (opt.birthAngle == null ? -8 : opt.birthAngle) * Math.PI / 180;
    var birth = [A[0] + 0.8 * Math.cos(a0), A[1] + 0.8 * Math.sin(a0)];
    pts.push(birth); kinds.push('birth');

    // the long first flight, straight through the next pebble
    // aim it at the core of the pebble two along (C), so it runs clean through the one between (B)
    var Cc = B.siteC((opt.ai == null ? -3 : opt.ai) + 2, opt.aj == null ? 1 : opt.aj, 0, JIT, 0);
    var aim = [Cc[0] + 0.3, Cc[1] - 0.12], dir = Math.atan2(aim[1] - birth[1], aim[0] - birth[0]), f0 = null, L0;
    var Lmax = Math.hypot(aim[0] - birth[0], aim[1] - birth[1]);
    for (L0 = Lmax - 0.6; L0 < Lmax + 0.6; L0 += 0.02) {
      var e = [birth[0] + Math.cos(dir) * L0, birth[1] + Math.sin(dir) * L0], fs = at(e[0], e[1]);
      if (fs && fs.r < 0.45 && Math.hypot(fs.c[0] - A[0], fs.c[1] - A[1]) > 3.0) { f0 = e; break; }
    }
    if (!f0) return null;
    pts.push(f0); kinds.push('hit');

    // hops of roughly constant length, wandering toward Z
    var nh = opt.hops || 6, prev = [Math.cos(dir), Math.sin(dir)];
    for (var k = 0; k < nh; k++) {
      var cur = pts[pts.length - 1], best = null, bs = -1e9;
      var want = Math.hypot(Z[0] - cur[0], Z[1] - cur[1]);
      for (var c = 0; c < 96; c++) {
        var ang = c / 96 * Math.PI * 2, L = 1.6 + R() * 0.8;
        var d = [Math.cos(ang), Math.sin(ang)], n = [cur[0] + d[0] * L, cur[1] + d[1] * L];
        var fs2 = at(n[0], n[1]);
        if (!graphite(fs2)) continue;
        if (Math.hypot(fs2.c[0] - Z[0], fs2.c[1] - Z[1]) < 0.5) continue;          // not inside Z before the end
        var turn = Math.acos(Math.max(-1, Math.min(1, d[0] * prev[0] + d[1] * prev[1]))) * 180 / Math.PI;
        var s = 0;
        if (turn < 40) s -= (40 - turn) * 0.08;
        if (turn > 150) s -= (turn - 150) * 0.06;
        var left = nh - k, dz = Math.hypot(Z[0] - n[0], Z[1] - n[1]);
        s -= Math.abs(dz - Math.max(1.7, want * (left - 1) / left)) * 1.2;          // home in, a hop at a time
        for (var j = 0; j < pts.length - 1; j++) {                                   // keep the bounces apart
          var dj = Math.hypot(n[0] - pts[j][0], n[1] - pts[j][1]);
          if (dj < 1.0) s -= (1.0 - dj) * 6;
        }
        if (Math.abs(n[1]) > 3.3) s -= (Math.abs(n[1]) - 3.3) * 4;                 // stay in a frameable band
        s += R() * 1.2;
        if (s > bs) { bs = s; best = { n: n, d: d }; }
      }
      if (!best) return null;
      pts.push(best.n); kinds.push('hit'); prev = best.d;
    }

    // capture: a point in Z's fuel band, one more hop of the same length
    var last = pts[pts.length - 1], cap = null, cb = 1e9;
    for (var q = 0; q < 72; q++) {
      var qa = q / 72 * Math.PI * 2, p = [Z[0] + 0.8 * Math.cos(qa), Z[1] + 0.8 * Math.sin(qa)];
      var Lc = Math.hypot(p[0] - last[0], p[1] - last[1]);
      var sc = Math.abs(Lc - 2.0);
      if (sc < cb) { cb = sc; cap = p; }
    }
    pts.push(cap); kinds.push('capture');
    return { pts: pts, kinds: kinds, A: A, Z: Z, jit: JIT };
  }

  /* checks a path against the physics rules; returns a list of problems */
  function check(B, P) {
    var out = [], f;
    function at(p) { return B.faceSite(p[0], p[1], P.jit); }
    f = at(P.pts[0]); if (!(f.r > 0.72 && f.r < 0.88)) out.push('birth not in a band: r=' + f.r.toFixed(2));
    f = at(P.pts[P.pts.length - 1]); if (!(f.r > 0.72 && f.r < 0.88)) out.push('capture not in a band: r=' + f.r.toFixed(2));
    var fa = at(P.pts[0]), fz = at(P.pts[P.pts.length - 1]);
    var apart = Math.hypot(fa.c[0] - fz.c[0], fa.c[1] - fz.c[1]) / 2;
    if (apart < 3.5) out.push('capture only ' + apart.toFixed(1) + ' pebbles from birth');
    for (var i = 1; i < P.pts.length - 1; i++) {
      f = at(P.pts[i]);
      if (!(f.r < 0.62 || (f.r > 0.93 && f.r < 0.97))) out.push('bounce ' + i + ' not in graphite: r=' + f.r.toFixed(2));
    }
    // the first flight must cross another pebble's band without stopping
    var a = P.pts[0], b = P.pts[1], crossed = {};
    for (var s = 0.02; s < 0.98; s += 0.005) {
      var x = a[0] + (b[0] - a[0]) * s, y = a[1] + (b[1] - a[1]) * s, g = at([x, y]);
      if (g.r > 0.7 && g.r < 0.9 && (g.i !== fa.i || g.j !== fa.j)) crossed[g.i + ',' + g.j] = 1;
    }
    if (!Object.keys(crossed).length) out.push('first flight crosses no other fuel band');
    var lens = [];
    for (i = 1; i < P.pts.length; i++) lens.push(Math.hypot(P.pts[i][0] - P.pts[i - 1][0], P.pts[i][1] - P.pts[i - 1][1]));
    return { problems: out, lengths: lens, apart: apart, crossedBands: Object.keys(crossed) };
  }

  return { build: build, check: check };
})();
if (typeof module !== 'undefined') module.exports = T4M_PATH;

/* ============================================================================
   M3 · Graphite · v3 · "Pebble to pebble", dark and light              -t4m
   ----------------------------------------------------------------------------
   v3 (Oct 5): side by side with m3-graphite-v2.js, which is untouched.
     - theme=dark|light, paper=<hex> (core-v2.js). In dark the scene shader,
       the palette and every uniform are v2's exactly, so theme=dark renders
       as v2 did. The light shader is v2's source with the light blocks
       swapped in (lightFrag).
     - light: the cut bed on paper. The neutron was light on a dark ground
       (a long exposure: slower = brighter). On paper it becomes the same
       long exposure in ink (trace=ink): slower = denser, thicker, warmer,
       from a thin cool blue fast thread to a dense gold-amber slow one.
       Bounces and fissions become saturated amber bursts with a white-hot
       core; glints stay light, because they sit on the dark cut faces.
       trace=navy draws the path in navy with gold only at the events;
       trace=glow keeps the dark theme's additive light, for comparison.
     - The in-situ P11 / P12 anchors in overlay() are kept byte for byte.
     - drive=host (CHAPTERS.md): host story progress p is story TIME, not
       scroll: p maps to u through a warp in which each path segment takes
       its own natural time (length / that segment's speed, the same cap the
       scroll playhead uses) and the stretches between have set dwells, so a
       linear page clock plays a fast first flight and slowing hops, with time
       to read each beat. The highlight is beats 1 to 4: the first split, the
       bounces, and the next split, about 11 s.
   ----------------------------------------------------------------------------
   Replaces v1's box (Andrew didn't follow it). Physics concept 1 / art
   concept "Threaded", with the "Long exposure" brightness rule.

   The world is M2 v3's packed bed in clear salt (bed-v3.js). One section plane
   (z = uCutZ) sweeps in and cuts the front layer through every centre, so
   every pebble shows its M1 cross-section: solid fuel-free core (0-14 mm),
   gold-flecked fuel band (14-18 mm), graphite shell (18-20 mm). The fuel
   particles on the cut are drawn at true size (0.86 mm, about 37% of the band
   by area, about half showing a kernel) and fade to their average when a
   particle is smaller than a pixel.

   The neutron's path lies in that plane (m3-path-v2.js, checked in node):
     beat 1  the plane sweeps in, the bands appear (the hinge from M2)
     beat 2  a fission in pebble A's band; a fast neutron, a faint thin cool
             thread, runs straight through the next pebble's fuel, no reaction
     beat 3  hops of roughly constant, pebble-sized length; each segment is
             drawn brighter, thicker and warmer than the last: a slow light
             leaves more light on the exposure. The head also slows in real
             time: the playhead's top speed on each segment is that segment's
             speed, so scrolling cannot make the slow hops look fast
     beat 4  U-235 in pebble Z's band catches it: a flare, heat, and new fast
             threads. Pull back: single particles in the fuel bands glint at a
             calm, even rate, never in the cores
   The whole path stays drawn: it is a long exposure, and it is the poster and
   the reduced-motion still.
   ========================================================================= */
(function () {
  'use strict';
  var root = document.getElementById('t4m-m3');
  if (!root) return;
  var TH = T4M.theme(root), LIGHT = TH.light;   // v3: resolved before mount, so the CSS is right from the first frame

  var JIT = 0.04, ZT = -0.004;   // the thread sits a hair in front of the cut face
  var PATH = T4M_PATH.build(T4M_BED, { seed: 6, jit: JIT });
  var PTS = PATH.pts.map(function (p) { return [p[0], p[1], ZT]; });
  var NSEG = PTS.length - 1;                     // segment 0 is the first flight, the rest are hops
  var CAP = PTS[PTS.length - 1], BIRTH = PTS[0];
  var SEGLEN = [];
  for (var s0 = 0; s0 < NSEG; s0++) SEGLEN.push(Math.hypot(PTS[s0 + 1][0] - PTS[s0][0], PTS[s0 + 1][1] - PTS[s0][1]));

  /* ---- story, in u = scroll progress ---- */
  var U_SWEEP = 0.17, U_BIRTH = 0.22, U_FLY0 = 0.235, U_FLY1 = 0.29, U_HOP0 = 0.33, U_CAP = 0.68, U_OUT = 0.80;
  var SEG_U = [[U_FLY0, U_FLY1]];
  for (var k = 1; k < NSEG; k++) SEG_U.push([U_HOP0 + (k - 1) * (U_CAP - U_HOP0) / (NSEG - 1), U_HOP0 + k * (U_CAP - U_HOP0) / (NSEG - 1)]);
  // speed on screen per segment (units/s): fast flight, then each hop slower
  function segV(k, K) { return K.speed * (k === 0 ? 30 : 14 * Math.pow(0.7, k - 1)); }
  var OUTDIR = [40, 168, 292].map(function (a) { a *= Math.PI / 180; return [Math.cos(a), Math.sin(a)]; });

  var CAMS = [
    { u: 0.00, pos: [-7.0, 1.6, -10.0], tgt: [-1.0, 0.4, 0.0], fov: 40 },
    { u: 0.26, pos: [-8.4, 2.3, -9.6],  tgt: [-2.4, 0.9, 0.0], fov: 40 },
    { u: 0.50, pos: [-4.4, 2.5, -11.4], tgt: [0.0, -0.2, 0.0], fov: 40 },
    { u: 0.72, pos: [-1.6, 1.9, -9.8],  tgt: [2.4, -1.1, 0.0], fov: 40 },
    { u: 0.97, pos: [-6.2, 5.0, -20.0], tgt: [0.4, -0.3, 0.0], fov: 40 }
  ];
  var CAM_WHOLE = { pos: [-3.6, 3.2, -16.5], tgt: [-0.3, -0.25, 0.0], fov: 40 };
  function camAt(u) {
    if (u <= CAMS[0].u) return CAMS[0];
    for (var i = 0; i < CAMS.length - 1; i++) {
      var a = CAMS[i], b = CAMS[i + 1];
      if (u <= b.u) {
        var w = T4M.smooth(0, 1, (u - a.u) / (b.u - a.u));
        return { pos: T4M.mixv(a.pos, b.pos, w), tgt: T4M.mixv(a.tgt, b.tgt, w), fov: T4M.mix(a.fov, b.fov, w) };
      }
    }
    return CAMS[CAMS.length - 1];
  }

  var NS = 16, NH = 4, NF = 8;
  var FRAG = [
'#version 300 es',
'precision highp float;',
'out vec4 oCol;',
'uniform vec2 uRes;',
'uniform float uTime, uLook, uPixAng, uRefract, uExposure, uFocus, uAperture, uLightK, uGlint, uHeatW;',
'uniform vec3 uCamPos, uCamF, uCamR, uCamU;',
'uniform float uFocal;',
'uniform vec3 uKeyDir, uKeyCol, uHeatP;',
'#define NS ' + NS,
'#define NH ' + NH,
'#define NF ' + NF,
'uniform vec4 uSegA[NS]; uniform vec4 uSegB[NS]; uniform vec4 uSegC[NS]; uniform int uSegN;',
'uniform vec4 uHead[NH]; uniform vec4 uHeadC[NH];',
'uniform vec4 uFlash[NF];',
'uniform vec4 uFis[2];',
T4M_BED.GLSL,
'const vec3 WARM = vec3(1.0, 0.50, 0.14);',
'vec3 env(vec3 rd){',
'  vec3 c = mix(DEEPEST, NAVY, smoothstep(-0.75, 0.1, rd.y));',
'  c = mix(c, LIFT * 1.35, smoothstep(0.0, 0.85, rd.y));',
'  c += uKeyCol * pow(max(dot(rd, uKeyDir), 0.0), 5.0) * 0.04;',
'  return c;',
'}',
'/* the neutron as a light on the graphite it crosses */',
'vec3 trailLight(vec3 p, vec3 n){',
'  vec3 L = vec3(0.0);',
'  for (int i = 0; i < NS; i++){',
'    if (i >= uSegN) break;',
'    vec3 a = uSegA[i].xyz, ba = uSegB[i].xyz - a;',
'    float h = clamp(dot(p - a, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);',
'    vec3 d = a + ba * h - p; float dd = dot(d, d);',
'    L += uSegC[i].rgb * mix(uSegA[i].w, uSegB[i].w, h) / (1.0 + dd * 60.0);',
'  }',
'  for (int i = 0; i < NH; i++){ vec3 d = uHead[i].xyz - p; L += uHeadC[i].rgb * uHead[i].w * 0.6 / (1.0 + dot(d, d) * 40.0); }',
'  for (int i = 0; i < NF; i++){ vec3 d = uFlash[i].xyz - p; L += vec3(1.0, 0.86, 0.62) * uFlash[i].w * 2.0 / (1.0 + dot(d, d) * 50.0); }',
'  for (int i = 0; i < 2; i++){ vec3 d = uFis[i].xyz - p; L += vec3(1.0, 0.74, 0.40) * uFis[i].w * 3.0 / (1.0 + dot(d, d) * 6.0); }',
'  return L * 0.35;',
'}',
'/* one glint per pebble every 5.5-9 s, at a random particle in its fuel band */',
'vec4 glintAt(ivec3 id, vec3 c){',
'  vec3 h = h33i(id + ivec3(0, 0, 301));',
'  float P = 5.5 + 3.5 * h.y;',
'  float x = uTime + h.z * P, cyc = floor(x / P), ph = x - cyc * P;',
'  float I = ph < 0.5 ? sin(3.14159265 * ph / 0.5) : 0.0;',
'  vec3 g = h33i(ivec3(id.xy, int(cyc) + 1000));',
'  float a = g.x * 6.2831853, r = 0.74 + 0.12 * g.y;',
'  return vec4(c.xy + r * vec2(cos(a), sin(a)), uCutZ, I * uGlint);',
'}',
'vec3 shadeWhole(vec3 p, vec3 n, vec3 rd, ivec3 id, vec3 c){',
'  vec3 h = h33i(id + ivec3(0, 0, 17));',
'  float a = h.x * 6.2831853, ca = cos(a), sa = sin(a);',
'  vec3 lp = p - c; lp = vec3(ca * lp.x - sa * lp.z, lp.y, sa * lp.x + ca * lp.z) + h * 40.0;',
'  vec3 g = vec3(vn(lp * 7.0), vn(lp * 7.0 + 17.3), vn(lp * 7.0 + 41.1)) - 0.5;',
'  g += 0.55 * (vec3(vn(lp * 19.0), vn(lp * 19.0 + 7.7), vn(lp * 19.0 + 3.3)) - 0.5);',
'  vec3 nb = normalize(n + g * 0.42);',
'  vec3 albP = mix(lin(vec3(0.227, 0.239, 0.259)), lin(vec3(0.333, 0.349, 0.373)), vn(lp * 1.6));',
'  vec3 alb = mix(albP, lin(vec3(0.227, 0.239, 0.259)), uLook) * (0.92 + 0.16 * vn(lp * 11.0));',
'  vec3 L = uKeyDir;',
'  float sh = shadowBed(p + n * 0.01, L, id), ao = aoBed(p, n, id);',
'  vec3 col = alb * (uKeyCol * max((dot(nb, L) + 0.2) / 1.2, 0.0) * sh * 2.4 + mix(NAVY * 2.2, LIFT * 4.2, nb.y * 0.5 + 0.5) * ao);',
'  col += env(reflect(rd, nb)) * pow(1.0 - max(dot(nb, -rd), 0.0), 3.0) * 0.9 * ao;',
'  col += alb * trailLight(p + n * 0.02, nb) * uLightK * ao;',
'  return col;',
'}',
'/* the cut face: M1 cross-section, fuel particles at true size */',
'vec3 shadeFace(vec3 p, vec3 rd, ivec3 id, vec3 c, float t){',
'  vec2 f2 = (p.xy - c.xy) * 20.0;',
'  float rmm = length(p - c) * 20.0;',
'  float mmpx = max(t * uPixAng * 20.0 / max(abs(rd.z), 0.3), 0.01);',
'  vec3 h = h33i(id + ivec3(0, 0, 17));',
'  vec3 Mx = mix(lin(vec3(0.255, 0.267, 0.290)), lin(vec3(0.227, 0.239, 0.259)), uLook);',
'  vec3 Cr = mix(lin(vec3(0.300, 0.292, 0.276)), lin(vec3(0.290, 0.282, 0.267)), uLook);',
'  float coreK = 1.0 - smoothstep(14.0 - mmpx, 14.0 + mmpx, rmm);',
'  float bandK = smoothstep(14.0 - mmpx, 14.0 + mmpx, rmm) * (1.0 - smoothstep(18.0 - mmpx, 18.0 + mmpx, rmm));',
'  vec3 alb = mix(Mx, Cr, coreK) * (0.93 + 0.1 * vn(vec3(f2 * 0.35, h.x * 50.0))) * (0.95 + 0.08 * vn(vec3(f2 * 2.5, h.y * 50.0)));',
'  vec3 emis = vec3(0.0);',
'  float spec = 0.0;',
'  if (bandK > 0.001){',
'    float ra = h.z * 6.2831853, cr = cos(ra), sr = sin(ra);',
'    vec2 gq = vec2(cr * f2.x - sr * f2.y, sr * f2.x + cr * f2.y) / 1.05 + h.xy * 97.0;',
'    vec2 gi = floor(gq), gf = fract(gq);',
'    vec3 coat = uLook > 0.5 ? mix(lin(vec3(0.078, 0.165, 0.267)), lin(vec3(0.91, 0.878, 0.80)), 0.42)',
'                            : mix(lin(vec3(0.07)), lin(vec3(0.44, 0.47, 0.41)), 0.35);',
'    vec3 kern = uLook > 0.5 ? GOLD : lin(vec3(0.13, 0.12, 0.11));',
'    /* one particle per 1.05 mm cell, centre jittered over most of the cell: about 35% of the band by area, half cut through the kernel */',
'    float cov = 0.0, kov = 0.0;',
'    int seedP = id.x * 131 + id.y * 17 + 7;',
'    for (int yy = -1; yy <= 1; yy++) for (int xx = -1; xx <= 1; xx++){',
'      ivec2 cell = ivec2(gi) + ivec2(xx, yy);',
'      vec3 ph = h33i(ivec3(cell, seedP)), pj = h33i(ivec3(cell, seedP + 1));',
'      float hh = (ph.y * 2.0 - 1.0) * 0.4275;',
'      float rp = sqrt(max(0.4275 * 0.4275 - hh * hh, 0.0)), rk = sqrt(max(0.2125 * 0.2125 - hh * hh, 0.0));',
'      float d = length(gf - vec2(float(xx), float(yy)) - 0.5 - (pj.xy - 0.5) * 0.7) * 1.05;',
'      cov = max(cov, clamp((rp - d) / mmpx + 0.5, 0.0, 1.0));',
'      kov = max(kov, clamp((rk - d) / mmpx + 0.5, 0.0, 1.0));',
'    }',
'    float far = smoothstep(0.3, 0.8, mmpx);',
'    vec3 near = mix(alb, mix(coat, kern, kov / max(cov, 1e-3)), cov);',
'    vec3 avg = mix(alb, coat, 0.3) + kern * 0.04;',
'    alb = mix(alb, mix(near, avg, far), bandK);',
'    float kg = mix(kov, 0.04, far) * bandK;',
'    emis += GOLD * 0.30 * kg * uLook;',
'    spec = kg * (1.0 - uLook);',
'  }',
'  vec3 gn = vec3(vn(vec3(f2 * 1.8, 3.0)), vn(vec3(f2 * 1.8, 9.0)), 0.0) - 0.5;',
'  vec3 n = normalize(vec3(gn.xy * 0.18, -1.0));',
'  vec3 L = uKeyDir;',
'  float rim = 1.0 - 0.45 * smoothstep(17.0, 20.0, rmm);',
'  vec3 col = alb * (uKeyCol * max(dot(n, L), 0.0) * 2.3 + mix(NAVY * 2.2, LIFT * 4.0, 0.6) * rim + trailLight(p + vec3(0.0, 0.0, -0.02), n) * uLightK);',
'  col += uKeyCol * pow(max(dot(n, normalize(L - rd)), 0.0), 40.0) * 0.6 * spec;',
'  col += emis;',
'  vec3 dh = p - uHeatP;',
'  col += WARM * uHeatW * exp(-dot(dh, dh) / 0.10) * 0.5;',
'  vec4 gl = glintAt(id, c);',
'  vec2 dg = p.xy - gl.xy;',
'  col += vec3(1.0, 0.8, 0.45) * gl.w * exp(-dot(dg, dg) / 0.0016) * 1.5;',
'  return col;',
'}',
'/* the threads, heads, flashes, fissions and glints, as light in the salt */',
'vec3 glow(vec3 ro, vec3 rd, float tS){',
'  vec3 g = vec3(0.0);',
'  for (int i = 0; i < NS; i++){',
'    if (i >= uSegN) break;',
'    vec3 a = uSegA[i].xyz, ba = uSegB[i].xyz - a, w0 = ro - a;',
'    float b_ = dot(rd, ba), c_ = dot(ba, ba), d_ = dot(rd, w0), e_ = dot(ba, w0);',
'    float s = clamp((e_ - d_ * b_) / max(c_ - b_ * b_, 1e-6), 0.0, 1.0);',
'    float t = max(b_ * s - d_, 0.0);',
'    if (t > tS + 0.03) continue;',
'    vec3 q = w0 + rd * t - ba * s; float d2 = dot(q, q);',
'    float I = mix(uSegA[i].w, uSegB[i].w, s), w = uSegC[i].w;',
'    g += uSegC[i].rgb * I * (exp(-d2 / (w * w)) * 1.0 + 0.08 * exp(-d2 / (12.0 * w * w)));',
'  }',
'  for (int i = 0; i < NH; i++){',
'    if (uHead[i].w <= 0.0) continue;',
'    vec3 w0 = uHead[i].xyz - ro; float t = dot(w0, rd);',
'    if (t > tS + 0.05) continue;',
'    vec3 q = w0 - rd * t; float d2 = dot(q, q), sz = uHeadC[i].w;',
'    g += uHeadC[i].rgb * uHead[i].w * (exp(-d2 / (sz * sz)) * 2.0 + 0.2 * exp(-d2 / (12.0 * sz * sz)));',
'  }',
'  for (int i = 0; i < NF; i++){',
'    if (uFlash[i].w <= 0.0) continue;',
'    vec3 w0 = uFlash[i].xyz - ro; float t = dot(w0, rd);',
'    if (t > tS + 0.1) continue;',
'    vec3 q = w0 - rd * t; float d2 = dot(q, q);',
'    g += vec3(1.0, 0.9, 0.72) * uFlash[i].w * (exp(-d2 / 0.0016) * 2.0 + 0.25 * exp(-d2 / 0.03));',
'  }',
'  for (int i = 0; i < 2; i++){',
'    if (uFis[i].w <= 0.0) continue;',
'    vec3 w0 = uFis[i].xyz - ro; float t = dot(w0, rd);',
'    if (t > tS + 0.3) continue;',
'    vec3 q = w0 - rd * t; float d2 = dot(q, q);',
'    g += vec3(1.0, 0.78, 0.45) * uFis[i].w * (exp(-d2 / 0.006) * 2.5 + 0.35 * exp(-d2 / 0.12));',
'  }',
'  if (uGlint > 0.0 && rd.z > 1e-3){',
'    float tz = (uCutZ - ro.z) / rd.z;',
'    if (tz < tS + 0.05){',
'      vec3 xp = ro + rd * tz;',
'      ivec2 c0 = nearestSite(xp.xy, 0);',
'      for (int m = 0; m < 7; m++){',
'        ivec3 sid = ivec3(c0 + NB[m], 0);',
'        vec4 gl = glintAt(sid, siteC(sid));',
'        vec2 dg = xp.xy - gl.xy; float d2 = dot(dg, dg);',
'        g += vec3(1.0, 0.78, 0.42) * gl.w * (exp(-d2 / 0.003) * 0.9 + 0.12 * exp(-d2 / 0.06));',
'      }',
'    }',
'  }',
'  return g;',
'}',
'void main(){',
'  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;',
'  vec3 rd = normalize(uCamF * uFocal + uCamR * uv.x + uCamU * uv.y);',
'  vec3 nq = vec3(uv.x * 3.4, uv.y * 1.15 - uTime * 0.3, uTime * 0.1);',
'  vec2 g = vec2(vn(nq), vn(nq + vec3(5.2, 1.3, 7.7))) - 0.5;',
'  rd = normalize(rd + (uCamR * g.x + uCamU * g.y) * uRefract * 0.004);',
'  ivec3 id; float face; float t = traceBed(uCamPos, rd, 90.0, id, face);',
'  bool hit = id.z >= 0;',
'  float tt = hit ? t : 60.0;',
'  vec3 bg = env(rd), col = bg;',
'  if (hit){',
'    vec3 c = siteC(id), p = uCamPos + rd * t;',
'    vec3 s = face > 0.5 ? shadeFace(p, rd, id, c, t) : shadeWhole(p, normalize(p - c), rd, id, c);',
'    col = mix(bg, s, exp(-t * 0.035));',
'  }',
'  col += glow(uCamPos, rd, tt);',
'  col *= uExposure;',
'  col = aces(col);',
'  col = pow(col, vec3(1.0 / 2.2));',
'  float coc = clamp(uAperture * (1.0 - uFocus / tt), -1.0, 1.0);',
'  oCol = vec4(col, coc * 0.5 + 0.5);',
'}'
  ].join('\n');

  /* ---- light: v2's shader with the dark-ground blocks swapped for paper ones; every swap must match once ---- */
  function swap(src, a, b) {
    if (src.split(a).length !== 2) throw new Error('t4m m3 light shader: anchor not found once: ' + a.slice(0, 60));
    return src.replace(a, b);
  }
  function lightFrag(src) {
    src = swap(src, 'uniform vec3 uKeyDir, uKeyCol, uHeatP;',
      'uniform vec3 uKeyDir, uKeyCol, uHeatP;\n' +
      'uniform vec3 uPaper;\n' +
      'uniform float uDensL, uFade0, uRim, uTrace, uInk;');
    src = swap(src, [
'vec3 env(vec3 rd){',
'  vec3 c = mix(DEEPEST, NAVY, smoothstep(-0.75, 0.1, rd.y));',
'  c = mix(c, LIFT * 1.35, smoothstep(0.0, 0.85, rd.y));',
'  c += uKeyCol * pow(max(dot(rd, uKeyDir), 0.0), 5.0) * 0.04;',
'  return c;',
'}'].join('\n'), [
'vec3 env(vec3 rd){',
'  return uPaper * mix(0.80, 1.0, smoothstep(-0.8, 0.45, rd.y));',
'}'].join('\n'))
    /* charcoal under a soft paper ambient, and a gentle paper rim at grazing */
    src = swap(src, '  vec3 col = alb * (uKeyCol * max((dot(nb, L) + 0.2) / 1.2, 0.0) * sh * 2.4 + mix(NAVY * 2.2, LIFT * 4.2, nb.y * 0.5 + 0.5) * ao);',
      '  vec3 col = alb * (uKeyCol * max((dot(nb, L) + 0.2) / 1.2, 0.0) * sh * 2.4 + uPaper * mix(0.30, 0.62, nb.y * 0.5 + 0.5) * ao);')
    src = swap(src, '  vec3 alb = mix(albP, lin(vec3(0.227, 0.239, 0.259)), uLook) * (0.92 + 0.16 * vn(lp * 11.0));',
      '  vec3 alb = mix(albP, lin(vec3(0.227, 0.239, 0.259)), uLook) * (0.92 + 0.16 * vn(lp * 11.0)) * 0.8;')
    src = swap(src, '  col += env(reflect(rd, nb)) * pow(1.0 - max(dot(nb, -rd), 0.0), 3.0) * 0.9 * ao;',
      '  col += env(reflect(rd, nb)) * pow(1.0 - max(dot(nb, -rd), 0.0), 3.0) * uRim * ao * ao;')
    /* the cut face: the same key, a paper ambient instead of the navy one */
    src = swap(src, '  vec3 col = alb * (uKeyCol * max(dot(n, L), 0.0) * 2.3 + mix(NAVY * 2.2, LIFT * 4.0, 0.6) * rim + trailLight(p + vec3(0.0, 0.0, -0.02), n) * uLightK);',
      '  vec3 col = alb * 0.85 * (uKeyCol * max(dot(n, L), 0.0) * 2.3 + uPaper * 0.20 * rim + trailLight(p + vec3(0.0, 0.0, -0.02), n) * uLightK);')
    var at = src.indexOf('void main(){');
    if (at < 0) throw new Error('t4m m3 light shader: no main');
    return src.slice(0, at) + [
'vec3 disp(vec3 c){ return pow(aces(c * uExposure), vec3(1.0 / 2.2)); }',
'/* over-compositing one soft mark: a = coverage, c = its colour (display space) */',
'void over(inout vec4 acc, vec3 c, float a){ a = clamp(a, 0.0, 1.0); acc.rgb = acc.rgb * (1.0 - a) + c * a; acc.a = acc.a + a * (1.0 - acc.a); }',
'/* the neutron on paper: the same threads, heads, bounces and fissions as glow(), as ink (premultiplied colour, coverage) */',
'vec4 ink(vec3 ro, vec3 rd, float tS){',
'  vec4 acc = vec4(0.0);',
'  for (int i = 0; i < NS; i++){',
'    if (i >= uSegN) break;',
'    vec3 a = uSegA[i].xyz, ba = uSegB[i].xyz - a, w0 = ro - a;',
'    float b_ = dot(rd, ba), c_ = dot(ba, ba), d_ = dot(rd, w0), e_ = dot(ba, w0);',
'    float s = clamp((e_ - d_ * b_) / max(c_ - b_ * b_, 1e-6), 0.0, 1.0);',
'    float t = max(b_ * s - d_, 0.0);',
'    if (t > tS + 0.03) continue;',
'    vec3 q = w0 + rd * t - ba * s; float d2 = dot(q, q);',
'    float I = mix(uSegA[i].w, uSegB[i].w, s), w = uSegC[i].w;',
'    over(acc, mix(uSegC[i].rgb, vec3(1.0), 0.35), I * 0.30 * exp(-d2 / (9.0 * w * w)));',
'    over(acc, uSegC[i].rgb, I * exp(-d2 / (w * w)));',
'  }',
'  for (int i = 0; i < NH; i++){',
'    if (uHead[i].w <= 0.0) continue;',
'    vec3 w0 = uHead[i].xyz - ro; float t = dot(w0, rd);',
'    if (t > tS + 0.05) continue;',
'    vec3 q = w0 - rd * t; float d2 = dot(q, q), sz = uHeadC[i].w;',
'    over(acc, uHeadC[i].rgb, uHead[i].w * exp(-d2 / (sz * sz)));',
'    over(acc, vec3(1.0, 0.97, 0.90), uHead[i].w * 0.9 * exp(-d2 / (0.12 * sz * sz)));',
'  }',
'  for (int i = 0; i < NF; i++){',
'    if (uFlash[i].w <= 0.0) continue;',
'    vec3 w0 = uFlash[i].xyz - ro; float t = dot(w0, rd);',
'    if (t > tS + 0.1) continue;',
'    vec3 q = w0 - rd * t; float d2 = dot(q, q);',
'    over(acc, vec3(0.93, 0.62, 0.16), uFlash[i].w * (exp(-d2 / 0.0040) * 3.5 + 0.8 * exp(-d2 / 0.03)));',
'    over(acc, vec3(1.0, 0.96, 0.86), uFlash[i].w * 3.0 * exp(-d2 / 0.0006));',
'  }',
'  for (int i = 0; i < 2; i++){',
'    if (uFis[i].w <= 0.0) continue;',
'    vec3 w0 = uFis[i].xyz - ro; float t = dot(w0, rd);',
'    if (t > tS + 0.3) continue;',
'    vec3 q = w0 - rd * t; float d2 = dot(q, q);',
'    over(acc, vec3(0.96, 0.62, 0.20), min(uFis[i].w, 1.0) * 0.45 * exp(-d2 / 0.12));',
'    over(acc, vec3(0.90, 0.42, 0.08), uFis[i].w * 4.0 * exp(-d2 / 0.010));',
'    over(acc, vec3(1.0, 0.95, 0.82), uFis[i].w * 4.0 * exp(-d2 / 0.0022));',
'  }',
'  return acc;',
'}',
'void main(){',
'  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;',
'  vec3 rd = normalize(uCamF * uFocal + uCamR * uv.x + uCamU * uv.y);',
'  vec3 nq = vec3(uv.x * 3.4, uv.y * 1.15 - uTime * 0.3, uTime * 0.1);',
'  vec2 g = vec2(vn(nq), vn(nq + vec3(5.2, 1.3, 7.7))) - 0.5;',
'  rd = normalize(rd + (uCamR * g.x + uCamU * g.y) * uRefract * 0.004);',
'  ivec3 id; float face; float t = traceBed(uCamPos, rd, 90.0, id, face);',
'  bool hit = id.z >= 0;',
'  float tt = hit ? t : 60.0;',
'  vec3 bg = env(rd), col = bg;',
'  float see = 0.0;',
'  if (hit){',
'    vec3 c = siteC(id), p = uCamPos + rd * t;',
'    col = face > 0.5 ? shadeFace(p, rd, id, c, t) : shadeWhole(p, normalize(p - c), rd, id, c);',
'    see = exp(-max(t - uFade0, 0.0) * uDensL);',
'  } else if (rd.z > 1e-3){',
'    /* a rare ray that slips through every traced layer is deep in the bed: a dark interstice, not a hole to the paper */',
'    col = uPaper * 0.012;',
'    see = exp(-max((float(BNL) * BDZ - uCamPos.z) / rd.z - uFade0, 0.0) * uDensL);',
'  }',
'  /* trace=glow: the dark theme\'s additive light, as it was. Otherwise only the glints stay light: they sit on the dark faces */',
'  if (uTrace > 1.5) col += glow(uCamPos, rd, tt);',
'  else if (uGlint > 0.0 && rd.z > 1e-3){',
'    float tz = (uCutZ - uCamPos.z) / rd.z;',
'    if (tz < tt + 0.05){',
'      vec3 xp = uCamPos + rd * tz;',
'      ivec2 c0 = nearestSite(xp.xy, 0);',
'      for (int m = 0; m < 7; m++){',
'        ivec3 sid = ivec3(c0 + NB[m], 0);',
'        vec4 gq = glintAt(sid, siteC(sid));',
'        vec2 dg = xp.xy - gq.xy;',
'        col += vec3(1.0, 0.78, 0.42) * gq.w * (exp(-dot(dg, dg) / 0.003) * 0.9 + 0.12 * exp(-dot(dg, dg) / 0.06));',
'      }',
'    }',
'  }',
'  col = disp(col);',
'  col = mix(disp(bg), col, see);',
'  if (uTrace < 1.5){',
'    vec4 k = ink(uCamPos, rd, tt);',
'    col = col * (1.0 - k.a * uInk) + k.rgb * uInk;',
'  }',
'  float coc = clamp(uAperture * (1.0 - uFocus / tt), -1.0, 1.0);',
'  oCol = vec4(col, coc * 0.5 + 0.5);',
'}'].join('\n');
  }

  /* ---- per-frame story state ---- */
  var segA = new Float32Array(NS * 4), segB = new Float32Array(NS * 4), segC = new Float32Array(NS * 4);
  var head = new Float32Array(NH * 4), headC = new Float32Array(NH * 4), flash = new Float32Array(NF * 4), fis = new Float32Array(8);
  var story = { u: 0, init: false, cam: CAMS[0], crossT: [], birthT: -1e9, capT: -1e9, ns: 0, heatW: 0, glint: 0, rbeat: 0 };

  /* trace (light only): ink (default), navy, glow. Dark is always v2's light. */
  var TRACE = 'glow';
  function segCol(k) {   // fast is cool white, slow is warm gold
    var x = k / (NSEG - 1);
    if (TRACE === 'ink') {   // display colours on paper, cobalt to deep gold, mixed in linear light so the middle stays saturated (an RGB mix goes grey)
      var a = [0.09, 0.30, 0.64], b = [0.86, 0.50, 0.03], f = Math.pow(x, 0.9);
      return a.map(function (v, i) { return Math.pow(Math.pow(v, 2.2) * (1 - f) + Math.pow(b[i], 2.2) * f, 1 / 2.2); });
    }
    if (TRACE === 'navy') return T4M.mixv([0.24, 0.33, 0.43], [0.008, 0.14, 0.20], Math.pow(x, 0.9));  // Fiord into Navy
    return T4M.mixv([0.80, 0.87, 1.0], [1.0, 0.66, 0.30], Math.pow(x, 0.9));
  }
  function segI(k) {   // long-exposure rule: slower, brighter (light: slower, denser)
    if (TRACE !== 'glow') return 0.78 + 0.22 * Math.pow(k / (NSEG - 1), 1.1);
    return 0.14 + 0.86 * Math.pow(k / (NSEG - 1), 1.3);
  }
  function segW(k) {   // light: wider, so a thread of ink holds on paper at any size
    if (TRACE !== 'glow') return 0.026 + 0.040 * (k / (NSEG - 1));
    return 0.009 + 0.016 * (k / (NSEG - 1));
  }
  var OUT_HEAD = function () { return TRACE === 'glow' ? [0.85, 0.9, 1.0, 0.03] : TRACE === 'navy' ? [0.24, 0.33, 0.43, 0.04] : [0.16, 0.36, 0.66, 0.04]; };

  function compute(st) {
    var u = story.u, t = st.t, K = st.K, still = st.reduced, ns = 0, i;
    function addSeg(a, b, I, col, w) {
      if (ns >= NS) return;
      segA.set([a[0], a[1], a[2], I], ns * 4); segB.set([b[0], b[1], b[2], I], ns * 4);
      segC.set([col[0], col[1], col[2], w], ns * 4); ns++;
    }
    head.fill(0); headC.fill(0); flash.fill(0); fis.fill(0);
    // the path, a long exposure: every segment reached so far, the current one up to the head
    for (var k = 0; k < NSEG; k++) {
      var su = SEG_U[k];
      if (u <= su[0]) break;
      var f = Math.min(1, (u - su[0]) / (su[1] - su[0]));
      var a = PTS[k], b = T4M.mixv(PTS[k], PTS[k + 1], f), col = segCol(k);
      addSeg(a, b, segI(k) * K.trail, col, segW(k));
      if (f < 1) {
        head.set([b[0], b[1], b[2], 1.0], 0);
        headC.set(TRACE === 'navy' ? [0.84, 0.54, 0.06, 0.05 + 0.02 * (k / (NSEG - 1))] : [col[0], col[1], col[2], 0.035 + 0.02 * (k / (NSEG - 1))], 0);
      }
    }
    // bounces: a short flash when the head arrives (real time), a faint mark in the still
    for (i = 1; i < NSEG && i - 1 < NF; i++) {
      var ui = SEG_U[i - 1][1];
      if (u >= ui) {
        if (story.crossT[i] == null) story.crossT[i] = t;
        var fl = still ? 0.22 : Math.exp(-(t - story.crossT[i]) / 0.3) * 0.9;
        flash.set([PTS[i][0], PTS[i][1], PTS[i][2], fl * (0.5 + 0.5 * i / NSEG)], (i - 1) * 4);
      } else story.crossT[i] = null;
    }
    // birth fission
    if (u >= U_BIRTH) {
      if (story.birthT < -1e8) story.birthT = t;
      var bw = Math.exp(-(t - story.birthT) / 0.6) * 1.1 + (u < U_HOP0 + 0.05 ? 0.18 : 0.08);
      fis.set([BIRTH[0], BIRTH[1], BIRTH[2], still ? 0.22 : bw], 0);
    } else story.birthT = -1e9;
    // capture by U-235, and the new fast neutrons
    story.heatW = 0;
    if (u >= U_CAP) {
      if (story.capT < -1e8) story.capT = t;
      var cw = Math.exp(-(t - story.capT) / 0.7) * 1.4 + 0.22;
      fis.set([CAP[0], CAP[1], CAP[2], still ? 0.5 : cw], 4);
      story.heatW = 0.7 * T4M.smooth(U_CAP, U_CAP + 0.05, u) * K.heat;
      var nOut = st.S.born === '2' ? 2 : 3, dOut = 22 * T4M.smooth(U_CAP, U_OUT, u);
      for (i = 0; i < nOut; i++) {
        var o = OUTDIR[i], e = [CAP[0] + o[0] * dOut, CAP[1] + o[1] * dOut, ZT];
        addSeg(CAP, e, (TRACE === 'glow' ? 0.16 : 0.5) * K.trail, segCol(0), TRACE === 'glow' ? 0.009 : 0.02);
        if (u < U_OUT && !still) { head.set([e[0], e[1], e[2], 0.9], (i + 1) * 4); headC.set(OUT_HEAD(), (i + 1) * 4); }
      }
    } else story.capT = -1e9;
    story.glint = T4M.smooth(0.74, 0.9, u) * K.glint;
    story.ns = ns;
  }

  /* ---- drive=host: story time p <-> story u. Knots are (u, seconds); between them time runs linearly ---- */
  var WARP = null;
  function warp(K) {
    if (WARP) return WARP;
    var k, kn = [[0, 0], [0.16, 3.0], [0.22, 1.6], [U_BIRTH + 0.015, 0.5], [U_FLY1, SEGLEN[0] / segV(0, K)], [U_HOP0, 2.0]];
    for (k = 1; k < NSEG; k++) kn.push([SEG_U[k][1], SEGLEN[k] / segV(k, K)]);
    kn.push([U_OUT, 1.8], [0.90, 1.2], [1.0, 1.2]);
    for (k = 1; k < kn.length; k++) kn[k][1] += kn[k - 1][1];
    var T = kn[kn.length - 1][1];
    WARP = { kn: kn, T: T,
      p: function (u) { for (var i = 1; i < kn.length; i++) if (u <= kn[i][0]) return (kn[i - 1][1] + (kn[i][1] - kn[i - 1][1]) * (u - kn[i - 1][0]) / (kn[i][0] - kn[i - 1][0])) / T; return 1; },
      u: function (p) { var t = p * T; for (var i = 1; i < kn.length; i++) if (t <= kn[i][1]) return kn[i - 1][0] + (kn[i][0] - kn[i - 1][0]) * (t - kn[i - 1][1]) / Math.max(kn[i][1] - kn[i - 1][1], 1e-9); return 1; } };
    return WARP;
  }

  var tagEl = root.querySelector('[data-tag]');
  var spanOf = function (k) { return SEG_U[k][1] - SEG_U[k][0]; };

  T4M.mount(root, {
    name: 'M3 graphite v3 · pebble to pebble',
    /* drive=host: beats and highlight in story time (see warp) */
    drive: function (st) {
      var W = warp(st.K), r = function (x) { return Math.round(x * 10000) / 10000; };
      return {
        beats: [
          { n: 1, from: 0, hold: r(W.p(0.18)), to: r(W.p(0.20)) },
          { n: 2, from: r(W.p(0.20)), hold: r(W.p(0.30)), to: r(W.p(0.31)) },
          { n: 3, from: r(W.p(0.31)), hold: r(W.p(0.675)), to: r(W.p(U_CAP)) },
          { n: 4, from: r(W.p(U_CAP)), hold: r(W.p(0.92)), to: 1 }
        ],
        highlight: { from: r(W.p(0.16)), to: r(W.p(0.90)), seconds: Math.round((W.p(0.90) - W.p(0.16)) * W.T * 10) / 10 }
      };
    },
    frag: function () { return LIGHT ? lightFrag(FRAG) : FRAG; },
    edge: function (st) { return st.aspect < 1 ? [0.90, 0.86, 0.9, 1.0] : [0.84, 0.82, 0.70, 1.0]; },   // light: where the edges start to fade into the paper
    paperFade: function (st) { return T4M.clamp(st.K.edge, 0, 1.5); },
    startScale: 0.85,
    maxCoc: 10,
    grain: 0.026,
    vignette: 0.42,
    stillTime: 4.3,
    knobs: [
      { key: 'warmth', label: 'Light warmth', min: 0, max: 1, step: 0.01, value: 0.4, hint: 'key light: neutral warm white to gold' },
      { key: 'speed', label: 'Neutron speed', min: 0.3, max: 3, step: 0.01, value: 1, hint: 'top speed of the head on each segment' },
      { key: 'trail', label: 'Thread brightness', min: 0.2, max: 3, step: 0.01, value: 1 },
      { key: 'light', label: 'Thread lights the graphite', min: 0, max: 3, step: 0.01, value: 1 },
      { key: 'glint', label: 'Glints (beat 4)', min: 0, max: 3, step: 0.01, value: 1 },
      { key: 'heat', label: 'Fission heat', min: 0, max: 2, step: 0.01, value: 1 },
      { key: 'exposure', label: 'Exposure', min: 0.4, max: 2, step: 0.01, value: 1 },
      { key: 'blur', label: 'Depth of field', min: 0, max: 2, step: 0.01, value: 1 },
      { key: 'pacing', label: 'Pacing', min: 0.2, max: 3, step: 0.01, value: 1, hint: 'story speed outside the path (sweep, pull back)' },
      /* light only (THEME-light.md taste calls) */
      { key: 'depth', label: 'Salt depth (light)', min: 0, max: 3, step: 0.01, value: 1, theme: 'light', hint: 'how fast the bed dissolves into the paper with distance' },
      { key: 'edge', label: 'Paper at the edges (light)', min: 0, max: 1.5, step: 0.01, value: 1, theme: 'light', hint: 'how far the frame edges fade into the paper' }
    ],
    selects: [
      { key: 'born', label: 'New neutrons at capture', options: ['3', '2'], value: '3' },
      { key: 'trace', label: 'The neutron on paper (light)', options: ['ink', 'navy', 'glow'], value: 'ink', theme: 'light' }
    ],
    beatOf: function (st) {
      if (st.reduced && !st.host) return story.rbeat;   // the still and its caption step together
      var u = story.u;
      return u < 0.2 ? 0 : u < 0.31 ? 1 : u < U_CAP ? 2 : 3;
    },
    step: function (st, dt) {
      TRACE = st.light ? st.S.trace : 'glow';   // dark: always v2's light
      // #loop: restart just after the sweep, so the uncut bed never flashes in at the wrap
      var target = st.loop ? 0.19 + 0.81 * Math.min(1, (st.t * 0.1) % 1.2) : st.p;
      story.rbeat = Math.min(3, Math.floor(st.p * 4));
      if (st.host) {
        // drive=host: the page's clock; p is story time, warped to u (backward jumps re-arm the flashes in compute)
        story.u = warp(st.K).u(st.p); story.init = true;
      } else if (!story.init || st.reduced) {
        story.u = st.reduced ? [0.18, 0.30, U_CAP + 0.0005, 1.0][story.rbeat] : target;
        story.init = true;
      } else if (st.loop && target < story.u - 0.5) {
        story.u = target; story.crossT = []; story.birthT = story.capT = -1e9;
      } else {
        var diff = target - story.u, u = story.u;
        // top speed: on a path segment, that segment's own speed; elsewhere, the pacing rate
        var rate = 0.3 * st.K.pacing;
        for (var k = 0; k < NSEG; k++) if (u >= SEG_U[k][0] - 1e-4 && u < SEG_U[k][1]) rate = spanOf(k) * segV(k, st.K) / SEGLEN[k];
        if (u >= U_CAP && u < U_OUT) rate = Math.max(rate, 0.6);
        if (diff < 0) rate = Math.max(rate, 0.3 * st.K.pacing) * 4;
        var stepU = Math.sign(diff) * Math.min(Math.abs(diff) * (1 - Math.exp(-dt * 5)) + 0.004 * dt, rate * dt, Math.abs(diff));
        story.u += stepU;
      }
      compute(st);
      // the long exposure (reduced motion beat 3, and the poster) frames the whole path, birth to capture
      var c = (st.reduced && !st.host && story.rbeat === 2) ? CAM_WHOLE : camAt(story.u);
      var back = st.aspect < 1.2 ? T4M.mix(1.0, 1.9, T4M.clamp((1.2 - st.aspect) / 0.78, 0, 1)) : 1;
      var pos = T4M.mixv(c.tgt, c.pos, back);
      if (!st.reduced) pos = [pos[0] + 0.12 * Math.sin(st.t * 0.21), pos[1] + 0.06 * Math.sin(st.t * 0.17), pos[2]];
      story.cam = { pos: pos, tgt: c.tgt, fov: c.fov };
    },
    overlay: function (st) {
      if (!tagEl) return;
      var cb = T4M.lookAt(story.cam.pos, story.cam.tgt);
      /* insitu P11 (v2): uranium is named at beat 1 too, on the fuel band where the first split happens */
      var TP = story.u >= U_CAP ? CAP : BIRTH;
      var v = [TP[0] - cb.pos[0], TP[1] - cb.pos[1], TP[2] - cb.pos[2]];
      var z = v[0] * cb.f[0] + v[1] * cb.f[1] + v[2] * cb.f[2];
      var f = 0.5 / Math.tan(story.cam.fov * Math.PI / 360);
      var x = -(v[0] * cb.r[0] + v[1] * cb.r[1] + v[2] * cb.r[2]) / z * f;   // the same flip as the camera
      var y = (v[0] * cb.u[0] + v[1] * cb.u[1] + v[2] * cb.u[2]) / z * f;
      var H = st.cssH || root.querySelector('.t4m-stage').clientHeight, W = st.cssW || root.querySelector('.t4m-stage').clientWidth;
      var tx = W / 2 + x * H;
      tagEl.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + (H / 2 - y * H).toFixed(1) + 'px)';
      tagEl.classList.toggle('is-left', tx + 150 > W);
      tagEl.classList.toggle('on', story.u >= U_CAP || (story.u > 0.14 && story.u < 0.205));   /* insitu P12 (v2) */
    },
    uniforms: function (st, U) {
      var K = st.K, c = story.cam, cb = T4M.lookAt(c.pos, c.tgt);
      var fov = c.fov;
      // looking along +z, cross(f, up) points to world -x; flip it so world +x is screen right
      U.v3('uCamPos', cb.pos); U.v3('uCamF', cb.f); U.v3('uCamR', [-cb.r[0], -cb.r[1], -cb.r[2]]); U.v3('uCamU', cb.u);
      var foc = 0.5 / Math.tan(fov * Math.PI / 360);
      U.f('uFocal', foc);
      U.f('uPixAng', 1 / (foc * st.h));
      U.f('uBedY', 0.0); U.f('uBedJit', JIT);
      U.f('uCutZ', T4M.mix(-1.1, 0.0, T4M.smooth(0.015, U_SWEEP, story.u)));
      U.v3('uKeyDir', T4M.norm([-0.5, 0.75, -0.45]));
      // light: a softer, more neutral key (a studio key on charcoal; gold warmth turns graphite brown on paper)
      U.v3('uKeyCol', LIGHT ? T4M.mixv([1.0, 0.95, 0.88], [1.0, 0.66, 0.24], K.warmth * 0.35) : T4M.mixv([1.0, 0.86, 0.68], [1.0, 0.66, 0.24], K.warmth));
      U.v4('uSegA', segA); U.v4('uSegB', segB); U.v4('uSegC', segC); U.i('uSegN', story.ns);
      U.v4('uHead', head); U.v4('uHeadC', headC); U.v4('uFlash', flash); U.v4('uFis', fis);
      U.v3('uHeatP', CAP); U.f('uHeatW', story.heatW);
      U.f('uGlint', story.glint);
      U.f('uLightK', K.light);
      U.f('uRefract', 1.0);
      U.f('uFocus', Math.hypot(c.tgt[0] - c.pos[0], c.tgt[1] - c.pos[1], c.tgt[2] - c.pos[2]));
      U.f('uAperture', 0.6);
      U.f('uExposure', K.exposure * 1.15);
      if (LIGHT) {
        // the paper, pre-exposure, so the open salt lands exactly on it whatever the exposure knob says
        U.v3('uPaper', TH.hdr.map(function (x) { return x / (K.exposure * 1.15); }));
        U.f('uDensL', 0.022 * K.depth);
        U.f('uFade0', 11.0);
        U.f('uRim', 0.14);
        U.f('uTrace', { ink: 0, navy: 1, glow: 2 }[st.S.trace] || 0);
        U.f('uInk', Math.min(1, K.trail));
      }
    }
  });
})();

})();
