/* Tesser Atomics · scene: M1 TRISO pebble · extracted unchanged from handoff-site-v11 heavy/site-t4m-v11.html (script 14). */

/* ---- M1 · TRISO pebble ---- */

/* ==========================================================================
   M1 · TRISO pebble · v3 · scroll-driven SDF ray-march, raw WebGL2.
   --------------------------------------------------------------------------
   v3 changes: theme=light (THEME-light.md). The same lit, solid scene
   photographed on a light seamless sweep: paper ground, a soft pool of
   light behind the object, an analytic contact shadow under it, neutral
   paper bounce in place of the navy fill, rim and environment. All of it
   sits in #ifdef LIGHT, so theme=dark compiles exactly the v2 shader.
   Knobs theme, paper, shadow, sweep, coats. Layer labels are the technical
   names with no A-E letters.
   drive=host (CHAPTERS.md §2): the page plays a stretch of the story on its
   own clock in a box. root.t4mDrive = { set(p), beats, highlight, start(),
   stop() }, then 't4m:drive-ready' on the root. drive=scroll is unchanged.

   v2 changes (round 1 feedback): explicit beat headings; three switchable
   pebble-to-particle transitions; three switchable layer treatments; bigger
   labels, an active layer, leaders that cannot cross; OPyC no longer navy;
   cooler graphite.

   Two scenes, each composited over the background with its own coverage
   and opacity, so they can share a frame for as long as a transition needs:
     scene 0  pebble, radius 1 = 20 mm. One particle on the frontal cut face
              is the "picked" one: the shader places it, keeps the lattice
              clear of it, and can turn it into an empty socket.
     scene 1  particle, radius 1 = 427.5 um, AGR-2 radii exact.
              layers=terrace  v1: octant cut, nested solids, stepped pocket
              layers=explode  hemisphere-cut shells pulled apart along one
                              axis like nested bowls, kernel floats free
              layers=build    octant cut, kernel first, each coating grows
                              out over the one before it
   transition=pullout  the picked particle lifts off the face and is carried
                       (screen space, not a camera move) to its own framing
                       while the pebble shrinks back and fades
   transition=inset    same lift, but the pebble parks small on one side and
                       stays, joined to the particle by a magnifier cone
   transition=dissolve v1 cross-dissolve
   Knobs: DEFAULTS below, all overridable by ?query or #hash. ?knobs = panel.
   ========================================================================== */
(function () {
  'use strict';
  /* site P4 · lazy start (as P3): boot when #tsr-m1 is within a viewport of the screen */
  var HOST = document.getElementById('tsr-m1');
  if (!HOST) return;
  var done = false, io = null;
  var go = function () { if (done) return; done = true; if (io) io.disconnect(); boot(); };
  /* v1.0.4 · window.__TZ_EAGER (the page preloads every scene behind its preloader): boot at once */
  if (window.__TZ_EAGER) { go(); }
  else if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); setTimeout(go, 0); } }, { rootMargin: '100% 0px 100% 0px' });
    io.observe(HOST);
  } else { go(); }
  function boot() {
  var root = document.getElementById('tsr-m1');
  if (!root || root.__m1) return; root.__m1 = true;

  var DEFAULTS = {
    transition: 'pullout', // pebble to particle: pullout | inset | dissolve (v1)
    layers: 'explode',     // particle anatomy: explode | build | terrace (v1)
    look: 's',             // s = stylised colour-coded (default), p = photoreal
    opyc: 'bali',          // Look S outer pyrocarbon colour: bali (#8A99AD) | graphite (#77726B) | navy (v1 #142A44)
    cut: 'wedge',          // pebble cut: wedge | plane | octant
    cutDepth: 0,           // mm: moves the pebble cut apex along its bisector
    gap: 0.3,              // explode: spacing between shells (particle radii)
    keyAz: -34,            // deg: key light azimuth; negative = from the left
    keyEl: 40,             // deg: key light elevation
    warmth: 0.12,          // 0 = near-neutral key .. 1 = full brand gold key
    keyGain: 1.0,          // key light intensity
    rim: 1.0,              // rim light on the particle
    grain: 0.03,           // film grain amplitude
    band: 1.0,             // particle visibility on the pebble cut
    pcolor: 'layers',      // particle colour at pebble scale: layers | ecru | gold
    terrace: -0.04,        // layers=terrace step between coatings
    kernel: 'whole',       // kernel whole sphere | cut with the coatings
    pace: 4,               // viewports of scroll for the four beats
    spin: 1.0,             // rotation speed in beats 1 and 3
    exposure: 1.0,
    pebYaw: 12, partYaw: -62, partPitch: 16,
    drag: 1,
    theme: 'dark',         // v3: dark (v2, unchanged) | light. URL m1.theme > theme > root data-theme > default
    paper: 'f2f2f0',       // v3, light only: the paper behind the scene, 6-digit hex without '#'. Same order
    shadow: 0.6,           // v3, light only: contact shadow on the paper. 0 = none (floats)
    sweep: 0.5,            // v3, light only: pool of light on the sweep behind the object. 0 = flat paper
    coats: 'sic',          // v3, light only, Look S: sic = SiC deepened for paper | deep = SiC and OPyC deepened | same = as on dark
    frame: 'textleft',     // site v7 P15: textleft (models right of a left text column) | own (the build's framing)
    drive: 'scroll'        // scroll (page scroll, as before) | host (the page drives progress in a box). Resolves like theme
  };
  var KNOBS = [
    ['transition', ['pullout', 'inset', 'dissolve']], ['layers', ['explode', 'build', 'terrace']],
    ['look', ['s', 'p']], ['opyc', ['bali', 'graphite', 'navy']], ['cut', ['wedge', 'plane', 'octant']],
    ['cutDepth', -6, 6, 0.5], ['gap', 0.05, 0.35, 0.01], ['keyAz', -180, 180, 1], ['keyEl', 0, 85, 1],
    ['warmth', 0, 1, 0.01], ['keyGain', 0.3, 2, 0.01], ['rim', 0, 3, 0.05], ['grain', 0, 0.12, 0.005],
    ['band', 0, 1.6, 0.05], ['pcolor', ['layers', 'ecru', 'gold']], ['terrace', -0.12, 0.12, 0.005],
    ['kernel', ['whole', 'cut']], ['pace', 2, 8, 0.5], ['spin', 0, 3, 0.05], ['exposure', 0.5, 2, 0.01],
    ['pebYaw', -90, 90, 1], ['partYaw', -180, 180, 1], ['partPitch', -60, 60, 1],
    ['theme', ['dark', 'light']], ['paper', ['f2f2f0', 'ffffff']], ['shadow', 0, 1.5, 0.05], ['sweep', 0, 1, 0.05],
    ['coats', ['sic', 'deep', 'same']]
  ];

  // ---------------------------------------------------------------- options
  var qs = new URLSearchParams((location.search + '&' + location.hash.slice(1)).replace(/^[?&]+/, ''));
  /* insitu P2 · namespaced switches: m1.<key> wins over a bare <key> */
  (function () { var add = []; qs.forEach(function (v, k) { if (k.indexOf('m1.') === 0) add.push([k.slice(3), v]); });
    add.forEach(function (a) { qs.set(a[0], a[1]); }); })();
  var o = {};
  Object.keys(DEFAULTS).forEach(function (k) {
    var d = DEFAULTS[k], v = qs.get(k);
    o[k] = v == null ? d : (typeof d === 'number' ? (isFinite(+v) ? +v : d) : v);
  });
  var HOLDS = [0.03, 0.24, 0.52, 1.0]; // beat holds; reduced motion snaps to these
  var LOCK = { '1': HOLDS[0], '2': HOLDS[1], '3': HOLDS[2], '4': HOLDS[3] }[qs.get('beat')];
  if (qs.has('p')) LOCK = Math.min(1, Math.max(0, +qs.get('p')));
  if (qs.has('poster')) root.classList.add('is-poster');
  root.setAttribute('data-look', o.look);
  // v3 · theme and paper (THEME-light.md): the namespaced URL key (m1.theme; on the in-situ page its P2
  // also folds m1.<key> into the bare key), then the bare URL key, then the root's data-theme / data-paper
  ['theme', 'paper', 'drive'].forEach(function (k) {
    var v = qs.get('m1.' + k);
    if (v == null) v = qs.get(k);
    if (k === 'theme' && v != null && v !== 'dark' && v !== 'light') v = null;   /* insitu P13 (v4): theme=mixed is the page's */
    if (v == null) v = root.getAttribute('data-' + k);
    o[k] = v ? String(v).trim().toLowerCase().replace(/^#/, '') : DEFAULTS[k];
  });
  function applyTheme() {
    if (o.theme !== 'light') o.theme = 'dark';
    if (!/^[0-9a-f]{6}$/.test(o.paper)) o.paper = DEFAULTS.paper;
    root.setAttribute('data-theme', o.theme);
    root.style.setProperty('--paper', '#' + o.paper);
    root.style.setProperty('--paper-rgb', [0, 2, 4].map(function (i) { return parseInt(o.paper.substr(i, 2), 16); }).join(','));
  }
  applyTheme();
  var hosted = o.drive === 'host';   // drive=host: no scroll track; progress comes from root.t4mDrive.set(p)
  if (hosted) root.classList.add('is-host');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- timeline (progress 0..1)
  var T = { b1: 0.07, lift0: 0.07, lift1: 0.17, reg0: 0.15, reg1: 0.19, regO0: 0.27, regO1: 0.30,
            pick0: 0.27, pick1: 0.31, tr0: 0.33, tr1: 0.47, dis0: 0.38, dis1: 0.43,
            open0: 0.58, open1: 0.66, seq0: 0.64, step: 0.055, seqB0: 0.62, stepB: 0.06, seqEnd: 0.93 };
  var HEAD = [0.11, 0.42, 0.60]; // heading boundaries between beats
  // drive: the beats in story progress, and this moment's own highlight: the cut, through the pick and the
  // pullout, to the opened particle, ending once every layer label is up (seqEnd 0.93)
  var BEATS = [{ n: 1, from: 0, hold: HOLDS[0], to: HEAD[0] }, { n: 2, from: HEAD[0], hold: HOLDS[1], to: HEAD[1] },
               { n: 3, from: HEAD[1], hold: HOLDS[2], to: HEAD[2] }, { n: 4, from: HEAD[2], hold: HOLDS[3], to: 1 }];
  var HIGHLIGHT = { from: 0.06, to: 0.95, seconds: 10 };

  // ---------------------------------------------------------------- dom
  var track = root.querySelector('.m1-track'), stage = root.querySelector('.m1-stage');
  var canvas = root.querySelector('canvas.m1-gl'), svg = root.querySelector('.m1-lines');
  var labsEl = root.querySelector('.m1-labs'), lineEl = root.querySelector('.m1-line');
  var heads = [].slice.call(root.querySelectorAll('.m1-beat > div'));
  var SVGNS = 'http://www.w3.org/2000/svg';
  function setPace() { track.style.height = ((o.pace + 1) * 100) + 'vh'; }
  setPace();
  function fallback() { root.classList.add('no-gl'); heads[1].style.opacity = 1; if (hosted && !root.t4mDrive) exposeDrive(null); }
  var gl = null;
  try { gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false,
                                            premultipliedAlpha: false, powerPreference: 'high-performance' }); } catch (e) {}
  if (!gl || qs.has('nogl')) { fallback(); return; }

  // ---------------------------------------------------------------- shaders
  var VS = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
  var FS = [
'#version 300 es',
'precision highp float; precision highp int;',
'out vec4 fragColor;',
'uniform vec2 uRes; uniform float uTime;',
'uniform vec3 uCamPos, uCamR, uCamU, uCamF;',
'uniform vec2 uShA, uShB; uniform float uFocA, uFocB, uAlA, uAlB, uFade;',
'uniform mat3 uMA, uTA, uMB, uTB;',
'uniform int uCutN; uniform vec3 uN0, uN1, uN2, uApex, uLift; uniform float uCutOn;',
'uniform int uPickK; uniform vec2 uPickF; uniform float uPickOn, uPickGone, uPickHi;',
'uniform int uLay; uniform float uOct, uTerr, uKWhole; uniform float uR[5];',
'uniform vec3 uAx; uniform float uHc, uExp; uniform float uAct, uActAmt;',
'uniform float uLook, uPCol, uBand, uGrain, uExpo, uRim;',
'uniform vec3 uKeyDir, uKeyCol, uOpyc;',
'uniform vec2 uObjPx; uniform float uObjR;',
'#ifdef LIGHT',
'uniform vec3 uPaperL; uniform float uShadow, uSweep, uCoat, uRadB;',
'#endif',
'int gScene;',
'vec3 L3(float r,float g,float b){ return pow(vec3(r,g,b)/255.0, vec3(2.2)); }',
'uvec3 pcg3(uvec3 v){ v=v*1664525u+1013904223u; v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y; v^=v>>16u; v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y; return v; }',
'vec3 h33(vec3 p){ return vec3(pcg3(uvec3(ivec3(floor(p))+ivec3(65536)))) * (1.0/4294967295.0); }',
'float h13(vec3 p){ return h33(p).x; }',
'float vn(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.0-2.0*f);',
'  float a=h13(i), b=h13(i+vec3(1,0,0)), c=h13(i+vec3(0,1,0)), d=h13(i+vec3(1,1,0));',
'  float e=h13(i+vec3(0,0,1)), f1=h13(i+vec3(1,0,1)), g=h13(i+vec3(0,1,1)), h=h13(i+vec3(1,1,1));',
'  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y), mix(mix(e,f1,u.x),mix(g,h,u.x),u.y), u.z); }',
'float fbm(vec3 p){ return 0.55*vn(p) + 0.30*vn(p*2.13+7.1) + 0.15*vn(p*4.41+3.3); }',
// ---- pebble
'float sdRegion(vec3 q){ vec3 a=q-uApex; float d=-dot(a,uN0); if(uCutN>1) d=max(d,-dot(a,uN1)); if(uCutN>2) d=max(d,-dot(a,uN2)); return d; }',
'float mapA(vec3 p, out float part){',
'  vec3 q=uMA*p; float s=length(q)-1.0; part=0.0;',
'  if(uCutOn<0.5) return s;',
'  float dA=max(s,-sdRegion(q));',
'  vec3 qb=q-uLift; float dB=max(length(qb)-1.0, sdRegion(qb));',
'  if(dB<dA){ part=1.0; return dB; } return dA; }',
// ---- particle
'float cornerIn(vec3 q, float c){ vec3 a=q-vec3(c); return min(min(a.x,a.y),a.z); }',
'float mapB(vec3 p, out float id){',
'  vec3 q=uMB*p; id=4.0; float d=1e5;',
'  if(uLay==1){',
'    for(int i=0;i<5;i++){',
'      vec3 qi=q-uAx*(uExp*float(4-i)); float l=length(qi);',
'      float s = i==0 ? l-uR[0] : max(l-uR[i], uR[max(i-1,0)]-l);',
'      if(!(i==0 && uKWhole>0.5)) s=max(s, dot(qi,uAx)-uHc);',
'      if(s<d){ d=s; id=float(i); } }',
'    return d; }',
'  float l=length(q);',
'  for(int i=4;i>=0;i--){',
'    float di=l-uR[i];',
'    if(!(i==0 && uKWhole>0.5)) di=max(di, cornerIn(q, uOct+uTerr*float(4-i)));',
'    d=min(d,di); }',
'  return d; }',
'float mapS(vec3 p){ float x; return gScene==0 ? mapA(p,x) : mapB(p,x); }',
'vec3 calcN(vec3 p, float e){ const vec2 k=vec2(1,-1);',
'  return normalize(k.xyy*mapS(p+k.xyy*e)+k.yyx*mapS(p+k.yyx*e)+k.yxy*mapS(p+k.yxy*e)+k.xxx*mapS(p+k.xxx*e)); }',
'float softSh(vec3 ro, vec3 rd){ float res=1.0, t=0.012;',
'  for(int i=0;i<40;i++){ float h=mapS(ro+rd*t); res=min(res, 9.0*h/t); t+=clamp(h,0.008,0.22); if(res<0.003||t>3.5) break; }',
'  return clamp(res,0.0,1.0); }',
'float calcAO(vec3 p, vec3 n){ float occ=0.0, sca=1.0;',
'  for(int i=0;i<5;i++){ float h=0.015+0.07*float(i); float d=mapS(p+n*h); occ+=(h-d)*sca; sca*=0.75; }',
'  return clamp(1.0-1.8*occ,0.0,1.0); }',
'vec2 isph(vec3 ro, vec3 rd, vec3 c, float r){ vec3 oc=ro-c; float b=dot(oc,rd); float h=b*b-dot(oc,oc)+r*r;',
'  if(h<0.0) return vec2(1e9,-1e9); h=sqrt(h); return vec2(-b-h,-b+h); }',
// ---- lighting
'#ifdef LIGHT',
// light: the sweep itself is what reflects: bright paper above and behind, the floor a little darker
'vec3 env(vec3 d){ vec3 c=uPaperL*mix(0.42,1.0,smoothstep(-0.35,0.35,d.y));',
'  c+=uKeyCol*2.2*pow(max(dot(d,uKeyDir),0.0),20.0); return c; }',
'#else',
'vec3 env(vec3 d){ float up=d.y*0.5+0.5; vec3 c=mix(L3(5.,13.,24.), L3(20.,42.,68.)*1.6, up);',
'  c+=uKeyCol*2.2*pow(max(dot(d,uKeyDir),0.0),20.0);',
'  c+=vec3(0.30,0.40,0.56)*0.22*pow(max(dot(d,normalize(vec3(0.7,0.15,-0.6))),0.0),5.0); return c; }',
'#endif',
'vec3 light(vec3 n, vec3 v, vec3 alb, float rough, float spec, vec3 emis, float ao, float sh){',
'  vec3 Lk=uKeyDir; float nl=max(dot(n,Lk),0.0);',
'  vec3 col=alb*uKeyCol*nl*sh*4.2;',
'  vec3 Lf=normalize(vec3(0.8,-0.1,0.45));',
'#ifdef LIGHT',
// light: a soft neutral fill, and the paper bouncing light back (bright above, the shadowed floor below)
'  col+=alb*uPaperL*max(dot(n,Lf),0.0)*0.40*ao;',
'  col+=alb*uPaperL*mix(0.10,0.36,0.5+0.5*n.y)*ao*1.5;',
'#else',
'  col+=alb*vec3(0.20,0.30,0.48)*max(dot(n,Lf),0.0)*0.55*ao;',
'  col+=alb*mix(vec3(0.010,0.016,0.026), vec3(0.055,0.085,0.135), 0.5+0.5*n.y)*ao*1.5;',
'#endif',
'  vec3 h=normalize(Lk+v); float nv=max(dot(n,v),0.0); float fr=0.04+0.96*pow(1.0-nv,5.0);',
'  float shin=exp2(11.0*(1.0-rough)+1.0);',
'  col+=uKeyCol*pow(max(dot(n,h),0.0),shin)*(shin+8.0)/25.13*spec*(0.25+fr)*nl*sh;',
'  float gl=(1.0-rough); col+=env(reflect(-v,n))*fr*gl*gl*spec*ao*1.3;',
'  vec3 Lr=normalize(vec3(0.55,0.35,-0.75)); float rs = gScene==1 ? 0.32*(1.0+1.6*uRim) : 0.32;',
'#ifdef LIGHT',
// light: the bright surround wraps the edge, neutral (never a navy rim)
'  col+=uPaperL*0.25*pow(1.0-nv,3.0)*max(dot(n,Lr)+0.35,0.0)*rs*ao;',
'#else',
'  col+=vec3(0.30,0.42,0.62)*pow(1.0-nv,3.0)*max(dot(n,Lr)+0.35,0.0)*rs*ao;',
'#endif',
'  if(gScene==1){ vec3 Lr2=normalize(vec3(-0.7,0.25,-0.6)); col+=uKeyCol*0.10*uRim*pow(1.0-nv,4.0)*max(dot(n,Lr2)+0.2,0.0)*ao; }',
'  return col+emis; }',
'vec3 bumpN(vec3 n, vec3 tq, float fq, float amp, mat3 MT, mat3 MO){',
'  float e=0.3/fq; float b0=fbm(tq*fq);',
'  vec3 g=vec3(fbm((tq+vec3(e,0,0))*fq), fbm((tq+vec3(0,e,0))*fq), fbm((tq+vec3(0,0,e))*fq))-b0;',
'  g=(g/e)*MT*MO; g-=n*dot(g,n); return normalize(n-amp*g/fq); }',
// ---- particle cross-sections on a pebble cut face (2D, mm), plus the picked particle
'const float RP=0.4275; const float HEXA=1.048;',
'vec4 discAt(vec2 x, int k, float dn, out float gap, out vec2 rel, out float isPick){',
'  const float S3=1.7320508; vec2 g=vec2(x.x-x.y/S3, 2.0*x.y/S3)/HEXA; vec2 gi=floor(g);',
'  float seed=float(k)*7.0+3.0; bool pk = uPickOn>0.5 && k==uPickK;',
'  gap=1e5; rel=vec2(0); isPick=0.0; vec4 res=vec4(-1.0);',
'  for(int j=-1;j<=2;j++) for(int i=-1;i<=2;i++){',
'    vec2 c=gi+vec2(float(i),float(j)); vec3 h=h33(vec3(c,seed)); vec3 h2=h33(vec3(c,seed+41.0));',
'    if(h2.x<0.08) continue;',
'    float hh=(h.x*2.0-1.0)*RP; float rd=sqrt(max(RP*RP-hh*hh,0.0));',
'    vec2 site=vec2(c.x+0.5*c.y, c.y*S3*0.5)*HEXA;',
'    float jr=max(HEXA*0.5-rd,0.0)*sqrt(h.y); float ja=h.z*6.2831853; site+=jr*vec2(cos(ja),sin(ja));',
'    float r3=sqrt(dot(site,site)+(dn+hh)*(dn+hh)); if(r3<14.0||r3>18.0) continue;',
'    if(pk && length(site-uPickF)<rd+RP+0.12) continue;',
'    vec2 dv=x-site; float d=length(dv); gap=min(gap,d-rd);',
'    if(d<rd){ res=vec4(d,hh,rd,r3); rel=dv; } }',
'  if(pk){ vec2 dv=x-uPickF; float d=length(dv); gap=min(gap,d-RP); if(d<RP){ res=vec4(d,0.0,RP,16.5); rel=dv; isPick=1.0; } }',
'  return res; }',
'vec3 layerCol(int i){',
'#ifdef LIGHT',
// light, coats=sic|deep: White Rock SiC lit near white disappears on paper; same hue, lower value
'  if(uLook<0.5 && uCoat>0.5 && i==3) return L3(232.,224.,204.)*0.45;',
'#endif',
'  if(uLook<0.5){ if(i==0) return L3(225.,171.,37.)*0.62; if(i==1) return L3(27.,30.,35.); if(i==2) return L3(77.,90.,110.); if(i==3) return L3(232.,224.,204.)*0.8; return uOpyc; }',
'  if(i==0) return L3(34.,31.,28.); if(i==1) return L3(17.,18.,19.); if(i==2) return L3(26.,27.,30.); if(i==3) return L3(112.,120.,104.); return L3(26.,27.,30.); }',
'vec3 pColour(float rr, float w){ float e=max(w*0.6,0.003);',
'  vec3 cA=layerCol(0), cB=layerCol(1), cC=layerCol(2), cD=layerCol(3), cE=layerCol(4);',
'  if(uPCol>1.5){ vec3 gd=L3(225.,171.,37.); cA=gd; cB=gd*0.55; cC=gd*0.8; cD=gd; cE=gd*0.8; }',
'  else if(uPCol>0.5){ vec3 ec=L3(232.,224.,204.); cA=ec*0.55; cB=ec*0.5; cC=ec*0.8; cD=ec; cE=ec*0.85; }',
'  vec3 c=cE;',
'  c=mix(c,cD,1.0-smoothstep(0.3875-e,0.3875+e,rr));',
'  c=mix(c,cC,1.0-smoothstep(0.3525-e,0.3525+e,rr));',
'  c=mix(c,cB,1.0-smoothstep(0.3125-e,0.3125+e,rr));',
'  c=mix(c,cA,1.0-smoothstep(0.2125-e,0.2125+e,rr));',
'  return c; }',
'vec3 shadePeb(vec3 p, vec3 rd, float t, float pa){',
'  float part; mapA(p,part); vec3 q=uMA*p; vec3 qo=part>0.5 ? q-uLift : q;',
'  float px=t*pa; vec3 n=calcN(p, max(0.0004,0.6*px)); vec3 v=-rd; float mmpx=px*20.0;',
'  float dS=abs(length(qo)-1.0); int fk=-1; float dF=1e9; vec3 fn=vec3(0,0,1);',
'  if(uCutOn>0.5){ vec3 a=qo-uApex; float d=abs(dot(a,uN0)); if(d<dF){dF=d;fk=0;fn=uN0;}',
'    if(uCutN>1){ d=abs(dot(a,uN1)); if(d<dF){dF=d;fk=1;fn=uN1;} }',
'    if(uCutN>2){ d=abs(dot(a,uN2)); if(d<dF){dF=d;fk=2;fn=uN2;} } }',
'  bool face = fk>=0 && dF<dS;',
'  vec3 tq=uTA*qo; vec3 alb; float rough=0.82, spec=0.22; vec3 emis=vec3(0); vec3 nn=n; float aoM=1.0;',
'  vec3 G = uLook<0.5 ? L3(58.,61.,66.) : L3(74.,78.,84.);',
'  if(!face){',
'    float m=fbm(tq*6.0); alb=G*mix(0.90,1.07,m)*mix(0.95,1.04,vn(tq*40.0));',
'    nn=bumpN(n, tq, 24.0, 0.32, uTA, uMA);',
'  } else {',
'    float r=length(qo)*20.0;',
'    vec3 fu=normalize(cross(fn, abs(fn.y)<0.9 ? vec3(0,1,0) : vec3(1,0,0))); vec3 fv=cross(fn,fu);',
'    vec2 f2=vec2(dot(qo,fu),dot(qo,fv))*20.0; float dn=dot(uApex,fn)*20.0;',
'    vec3 M = uLook<0.5 ? L3(58.,61.,66.) : L3(82.,86.,92.);',
'    vec3 C = uLook<0.5 ? L3(74.,72.,68.) : L3(92.,89.,84.);',
'    float coreK=1.0-smoothstep(14.0-mmpx,14.0+mmpx,r);',
'    alb=mix(M,C,coreK)*mix(0.9,1.07,vn(tq*55.0))*mix(0.94,1.04,vn(tq*7.0));',
'    float bandK=smoothstep(14.0-mmpx,14.0+mmpx,r)*(1.0-smoothstep(18.0-mmpx,18.0+mmpx,r));',
'    alb*=1.0+max(uBand-1.0,0.0)*0.9*bandK; rough=0.7; spec=0.25;',
'    nn=bumpN(n, tq, 60.0, 0.12, uTA, uMA);',
'    if(r>13.4 && r<18.6 && uBand>0.0){',
'      float gap; vec2 rel; float ip; vec4 dsc=discAt(f2, fk, dn, gap, rel, ip);',
'      float vis=clamp(uBand,0.0,1.0);',
'      if(dsc.x>=0.0){',
'        float rr=sqrt(dsc.x*dsc.x+dsc.y*dsc.y);',
'        vec3 pc=pColour(rr,mmpx);',
'        float cov=(1.0-smoothstep(dsc.z-mmpx,dsc.z+0.5*mmpx,dsc.x))*max(vis,ip);',
'        vec2 dir=rel/max(dsc.x,1e-4); float e=pow(dsc.x/max(dsc.z,1e-3),3.0);',
'        vec3 fuW=fu*uMA, fvW=fv*uMA;',
'        if(ip>0.5){',
'          pc*=1.0+0.7*uPickHi;',
'#ifdef LIGHT',
'          vec3 sock=L3(18.,18.,19.)*0.6*(0.45+0.55*dsc.x/RP);',
'#else',
'          vec3 sock=L3(10.,22.,38.)*0.6*(0.45+0.55*dsc.x/RP);',
'#endif',
'          pc=mix(pc,sock,uPickGone);',
'          nn=normalize(nn+(fuW*dir.x+fvW*dir.y)*mix(0.45,-0.9,uPickGone)*e*cov);',
'        } else nn=normalize(nn+(fuW*dir.x+fvW*dir.y)*0.45*e*cov);',
'        alb=mix(alb,pc,cov);',
'        float kA=(1.0-smoothstep(0.2125-mmpx,0.2125+mmpx,rr))*cov*(1.0-ip*uPickGone);',
'        if(uLook<0.5 && uPCol<0.5) emis=L3(225.,171.,37.)*(0.10+0.25*ip*uPickHi)*kA;',
'        rough=mix(rough,0.45,cov); spec=mix(spec,0.5*(1.0-ip*uPickGone),cov);',
'      } else { aoM=1.0-0.5*exp(-max(gap,0.0)/0.07)*vis; }',
'    }',
'  }',
'  float ao=calcAO(p,n)*aoM; float sh=softSh(p+n*0.004, uKeyDir);',
'  return light(nn,v,alb,rough,spec,emis,ao,sh); }',
'vec3 shadePart(vec3 p, vec3 rd, float t, float pa){',
'  float idm; mapB(p,idm); vec3 q=uMB*p; float px=t*pa;',
'  vec3 n=calcN(p, max(0.0004,0.6*px)); vec3 v=-rd;',
'  int li; vec3 ql=q; bool face; vec3 alb;',
'  if(uLay==1){',
'    li=int(idm+0.5); ql=q-uAx*(uExp*float(4-li));',
'    face = !(li==0 && uKWhole>0.5) && abs(dot(ql,uAx)-uHc)<max(0.003,1.5*px);',
'    alb=layerCol(li);',
'  } else {',
'    float l=length(q); li=4; for(int i=3;i>=0;i--){ if(l<uR[i]+0.003) li=i; }',
'    face = abs(l-uR[li])>0.0035;',
'    if(face){ float e=max(px*0.7,0.002); vec3 c=layerCol(4);',
'      c=mix(c,layerCol(3),1.0-smoothstep(uR[3]-e,uR[3]+e,l)); c=mix(c,layerCol(2),1.0-smoothstep(uR[2]-e,uR[2]+e,l));',
'      c=mix(c,layerCol(1),1.0-smoothstep(uR[1]-e,uR[1]+e,l)); c=mix(c,layerCol(0),1.0-smoothstep(uR[0]-e,uR[0]+e,l));',
'      alb=c; } else alb=layerCol(li);',
'  }',
'  vec3 tq=uTB*ql; float rough=0.5, spec=0.35; vec3 emis=vec3(0); vec3 nn=n;',
'  if(li==0){ alb*=mix(0.85,1.1,fbm(tq*9.0)); rough=0.5; spec=uLook<0.5?0.45:0.3; nn=uLook<0.5?bumpN(n,tq,14.0,0.07,uTB,uMB):n;',
'    if(uLook<0.5) emis=L3(225.,171.,37.)*0.06; }',
'  else if(li==1){ float pm=smoothstep(0.52,0.78,vn(tq*48.0)); float pm2=smoothstep(0.6,0.85,vn(tq*110.0+5.0));',
'    alb*=mix(1.35,0.25,max(pm,pm2*0.8)); rough=0.95; spec=0.12; nn=bumpN(n,tq,40.0,0.9,uTB,uMB); }',
'  else if(li==2){ rough=uLook<0.5?0.5:0.3; spec=uLook<0.5?0.3:0.7; nn=bumpN(n,tq,24.0,0.12,uTB,uMB); alb*=mix(0.92,1.06,vn(tq*30.0)); }',
'  else if(li==3){ rough=0.55; spec=0.3; nn=bumpN(n,tq,70.0,0.3,uTB,uMB); alb*=mix(0.88,1.05,fbm(tq*40.0)); }',
'  else { rough=uLook<0.5?0.7:0.38; spec=uLook<0.5?0.2:0.55; nn=bumpN(n,tq,34.0,0.045,uTB,uMB); alb*=mix(0.95,1.05,fbm(tq*8.0)); }',
'  float ao=calcAO(p,n); float sh=softSh(p+n*0.004, uKeyDir);',
'  vec3 col=light(nn,v,alb,rough,spec,emis,ao,sh);',
'  if(uAct>-0.5){ float on = abs(float(li)-uAct)<0.5 ? 1.0 : 0.0; col*=mix(1.0, mix(0.6,1.3,on), uActAmt); }',
'  return col; }',
'vec4 renderScene(int sc, vec2 frag, vec3 bg){',
'  gScene=sc; vec2 sh = sc==0?uShA:uShB; float foc = sc==0?uFocA:uFocB;',
'  vec2 uv=(frag-0.5*uRes)/uRes.y - sh;',
'  vec3 ro=uCamPos; vec3 rd=normalize(uv.x*uCamR+uv.y*uCamU+foc*uCamF);',
'  float pa=1.0/(uRes.y*foc); float grow=4.0*pa*length(uCamPos);',
'  float bR = sc==0 ? 1.0 : 1.0+uExp*4.0;',
'  vec2 b0=isph(ro,rd,vec3(0),bR+grow); vec2 b1=vec2(1e9,-1e9);',
'  if(sc==0 && uCutOn>0.5) b1=isph(ro,rd,uLift*uMA,1.0+grow);',
'  float t0=min(b0.x,b1.x), t1=max(b0.y,b1.y); if(t1<0.0) return vec4(0);',
'  float t=max(t0,0.0), dm=1e9, tm=t; bool hit=false;',
'  for(int i=0;i<140;i++){ vec3 p=ro+rd*t; float h=mapS(p); float px=t*pa;',
'    if(h<0.3*px){ hit=true; break; }',
'    float rr=h/px; if(rr<dm){ dm=rr; tm=t; }',
'    t+=h*0.95; if(t>t1) break; }',
'  float D=length(uCamPos);',
'  if(hit){ vec3 c = sc==0 ? shadePeb(ro+rd*t,rd,t,pa) : shadePart(ro+rd*t,rd,t,pa);',
'#ifdef LIGHT',
'    return vec4(c,1.0); }',
'#else',
'    return vec4(mix(c,bg,smoothstep(D-0.9,D+0.25,t)*0.4),1.0); }',
'#endif',
'  if(dm<1.2){ vec3 c = sc==0 ? shadePeb(ro+rd*tm,rd,tm,pa) : shadePart(ro+rd*tm,rd,tm,pa);',
'#ifdef LIGHT',
'    return vec4(c, 1.0-smoothstep(0.3,1.2,dm)); }',
'#else',
'    return vec4(mix(c,bg,smoothstep(D-0.9,D+0.25,tm)*0.4), 1.0-smoothstep(0.3,1.2,dm)); }',
'#endif',
'  return vec4(0); }',
'vec3 shoulder(vec3 c){ return c*(1.0+c/9.0)/(1.0+c); }',
'#ifdef LIGHT',
// light: the floor of the sweep touches the object from below (y = -1 in the object's own units). Its
// shadow is analytic: cosine-weighted occlusion by the object's bounding sphere (the contact shadow)
// plus a wide, soft key shadow from the same sphere. Each scene draws it in its own framing.
'float sceneShadow(int sc, vec2 frag, float rad){',
'  vec2 sh = sc==0?uShA:uShB; float foc = sc==0?uFocA:uFocB;',
'  vec2 uv=(frag-0.5*uRes)/uRes.y - sh;',
'  vec3 rd=normalize(uv.x*uCamR+uv.y*uCamU+foc*uCamF);',
'  if(rd.y>-1e-3) return 0.0;',
'  vec3 x=uCamPos+rd*((-1.0-uCamPos.y)/rd.y);',
'  float l2=dot(x,x); float ao=rad*rad*max(-x.y,0.0)/(l2*sqrt(l2));',
'  float b=dot(x,uKeyDir), h=b*b-(l2-rad*rad);',
'  float dd=sqrt(max(0.0,rad*rad-h))-rad, tt=-b-sqrt(max(h,0.0));',
'  float ks = tt<0.0 ? 1.0 : smoothstep(0.0,1.0,4.0*dd/tt);',
'  return clamp(uShadow*(0.8*ao+0.45*(1.0-ks)),0.0,0.9); }',
'vec3 tone(vec3 c){ return pow(max(shoulder(c*uExpo*uFade*1.18),0.0),vec3(1.0/2.2)); }',
'#endif',
'void main(){',
'  vec2 frag=gl_FragCoord.xy;',
'  vec2 d=(frag-uObjPx)/uRes.y; float r=length(d);',
'#ifdef LIGHT',
// light: a light seamless sweep. A soft pool of light behind the object, the contact shadow under it,
// and exactly the paper at the top and bottom edges, where the stage meets the page's own paper.
// Objects are tone-mapped on their own and laid over the paper; no vignette, no veil, no navy.
'  float pool=uSweep*exp(-r*r/(uObjR*uObjR*2.2));',
'  vec2 e=frag/uRes; pool*=smoothstep(0.0,0.14,e.y)*smoothstep(0.0,0.14,1.0-e.y);',
'  vec3 bg=mix(uPaperL,vec3(1.0),pool);',
'  float shd=0.0;',
'  if(uAlA>0.001) shd=max(shd,sceneShadow(0,frag,1.0)*uAlA);',
'  if(uAlB>0.001) shd=max(shd,sceneShadow(1,frag,uRadB)*uAlB);',
'  vec3 col=pow(bg*(1.0-shd),vec3(1.0/2.2)); float cov=0.0;',
'  if(uAlA>0.001){ vec4 a=renderScene(0,frag,bg); col=mix(col,tone(a.rgb),a.a*uAlA); cov=a.a*uAlA; }',
'  if(uAlB>0.001){ vec4 b=renderScene(1,frag,bg); col=mix(col,tone(b.rgb),b.a*uAlB); cov=max(cov,b.a*uAlB); }',
'  float dith=min(1.0,(pool+shd)*40.0)/255.0;',
'  col+=(h13(vec3(frag,floor(uTime*24.0)))-0.5)*mix(dith,uGrain,cov);',
'  fragColor=vec4(col,1.0);',
'#else',
'  vec3 bg=mix(L3(2.,36.,52.)*1.12, L3(5.,13.,24.), smoothstep(0.05,0.95,r));',
'  bg+=L3(20.,42.,68.)*0.35*exp(-r*r/(uObjR*uObjR*2.2));',
'  vec3 col=bg;',
'  if(uAlA>0.001){ vec4 a=renderScene(0,frag,bg); col=mix(col,a.rgb,a.a*uAlA); }',
'  if(uAlB>0.001){ vec4 b=renderScene(1,frag,bg); col=mix(col,b.rgb,b.a*uAlB); }',
'  col=col*uExpo*uFade*1.18;',
'  col=shoulder(col); col=pow(max(col,0.0),vec3(1.0/2.2));',
'  vec2 vv=frag/uRes-0.5; col*=1.0-0.42*dot(vv,vv);',
'  col+=(h13(vec3(frag,floor(uTime*24.0)))-0.5)*uGrain;',
'  fragColor=vec4(col,1.0);',
'#endif',
'}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error('[m1] shader', gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  // v3: one program per theme, compiled when first needed. Dark compiles FS as written, which after the
  // preprocessor is exactly the v2 shader; light adds '#define LIGHT 1'.
  var PROGS = {}, prog = null, U = {};
  function makeProg(th) {
    if (PROGS[th]) return PROGS[th];
    var vs = compile(gl.VERTEX_SHADER, VS);
    var fs = compile(gl.FRAGMENT_SHADER, th === 'light' ? FS.replace('#version 300 es\n', '#version 300 es\n#define LIGHT 1\n') : FS);
    if (!vs || !fs) return null;
    var pg = gl.createProgram(); gl.attachShader(pg, vs); gl.attachShader(pg, fs); gl.linkProgram(pg);
    if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) { console.error('[m1] link', gl.getProgramInfoLog(pg)); return null; }
    return (PROGS[th] = pg);
  }
  function useProg(th) { var pg = makeProg(th); if (!pg) return false; prog = pg; U = {}; gl.useProgram(prog); return true; }
  if (!useProg(o.theme)) { fallback(); return; }
  gl.bindVertexArray(gl.createVertexArray());
  function u(name) { if (!(name in U)) U[name] = gl.getUniformLocation(prog, name); return U[name]; }

  // ---------------------------------------------------------------- math
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sat(x) { return clamp(x, 0, 1); }
  function k01(a, b, x) { return sat((x - a) / (b - a)); }
  function ss(a, b, x) { var t = k01(a, b, x); return t * t * (3 - 2 * t); }
  function ease(t) { t = sat(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mm(a, b) { var r = []; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; }
  function mv(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
  function mtv(m, v) { return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]]; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function hexLin(h) { return [1, 3, 5].map(function (i) { return Math.pow(parseInt(h.substr(i, 2), 16) / 255, 2.2); }); }
  var DEG = Math.PI / 180;

  // ---------------------------------------------------------------- camera
  var CAM_D = 7.0, CAM_EL = 17 * DEG;
  var camPos = [0, CAM_D * Math.sin(CAM_EL), CAM_D * Math.cos(CAM_EL)];
  var camF = norm(mul(camPos, -1)), camR = norm(cross(camF, [0, 1, 0])), camU = cross(camR, camF), toCam = norm(camPos);

  // ---------------------------------------------------------------- geometry constants
  var CUTS = {
    wedge:  { n: [norm([1, 0, 1]), norm([-1, 0, 1])], b: [0, 0, 1], yaw: 28, pitch: 0, lift: norm([0.12, 1, 0.3]) },
    plane:  { n: [norm([0, 0.25, 1])], b: norm([0, 0.25, 1]), yaw: 18, pitch: 0, lift: norm([0, 1, 0.45]) },
    octant: { n: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], b: norm([1, 1, 1]), yaw: -40, pitch: 8, lift: norm([0.4, 1.4, 0.4]) }
  };
  var RL = [0.497076, 0.730994, 0.824561, 0.906433, 1.0];
  var RPm = 0.4275; // particle radius, mm
  var OPYC = { bali: '#8A99AD', graphite: '#77726B', navy: '#142A44' };

  // ---------------------------------------------------------------- labels
  var LAYN = ['Uranium fuel kernel', 'Porous carbon buffer', 'Inner pyrocarbon', 'Silicon carbide', 'Outer pyrocarbon'];
  var L = {};
  function mkLab(id, html, cls) {
    var x = { id: id, el: document.createElement('div'), w: 0, h: 13, wb: 0, hb: 24 };
    x.el.className = 'm1-lab' + (cls ? ' ' + cls : ''); x.el.innerHTML = html; labsEl.appendChild(x.el);
    x.path = document.createElementNS(SVGNS, 'path');
    x.path.setAttribute('fill', 'none'); x.path.setAttribute('stroke', '#E1AB25'); x.path.setAttribute('stroke-width', '1');
    svg.appendChild(x.path);
    x.dot = document.createElementNS(SVGNS, 'circle'); x.dot.setAttribute('r', '3'); x.dot.setAttribute('fill', '#E1AB25'); svg.appendChild(x.dot);
    L[id] = x; return x;
  }
  mkLab('bar', '<span class="u">4 cm</span><span class="u u2">&lt; 1 mm</span>');
  /* insitu P7 (v2): the core and shell labels are gone ("obvious"); the band says what is in it */
  mkLab('band', '<span class="n">TRISO particles</span>');
  mkLab('pick', '<span class="n">One particle</span>');   /* insitu P8 (v2) */
  mkLab('icap', '<span class="n">Pebble · 4 cm</span>');
  for (var li = 0; li < 5; li++) mkLab('L' + li, '<span class="n">' + LAYN[li] + '</span>');
  var ring = document.createElementNS(SVGNS, 'circle'); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#E1AB25');
  ring.setAttribute('stroke-width', '1.5'); svg.appendChild(ring);
  var cone = document.createElementNS(SVGNS, 'path'); cone.setAttribute('fill', 'none'); cone.setAttribute('stroke', '#E1AB25');
  cone.setAttribute('stroke-width', '1'); svg.appendChild(cone);
  var barSpans = L.bar.el.querySelectorAll('.u');
  L.bar.path.setAttribute('class', 'm1-bar');   // v3: light draws the scale bar stronger than the leaders
  L.pick.el.classList.add('m1-tag');            // v3: light gives the pick label and the inset caption a paper plate,
  L.icap.el.classList.add('m1-tag');            //     as both can sit on the 3D

  function measure() {
    Object.keys(L).forEach(function (k) {
      var x = L[k];
      x.el.classList.remove('is-big'); x.w = x.el.offsetWidth; x.h = x.el.offsetHeight || 13;
      if (k.charAt(0) === 'L') { x.el.classList.add('is-big'); x.wb = x.el.offsetWidth; x.hb = x.el.offsetHeight || 24; x.el.classList.remove('is-big'); }
    });
    L.bar.w = barSpans[0].offsetWidth; L.bar.w2 = barSpans[1].offsetWidth;
  }
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); dirty = true; });

  // ---------------------------------------------------------------- layout
  var W = 1, H = 1, lay = {}, dpr = 1, qScale = 1, scrolling = 0, dirty = true, K = 1;   // K: host box scale (1 on scroll)
  function side() { return o.layers === 'explode' ? 'right' : 'left'; }
  function framing(cx, cy, r) {
    return { cx: cx, cy: cy, r: r, foc: (r / H) * Math.sqrt(CAM_D * CAM_D - 1), sh: [(cx - W / 2) / H, (H / 2 - cy) / H] };
  }
  function regW() { var w = 0; ['core', 'band', 'shell'].forEach(function (k) { if (L[k]) w = Math.max(w, L[k].w); }); return w; }
  function layout() {
    var rc = stage.getBoundingClientRect(); W = Math.max(1, rc.width); H = Math.max(1, rc.height);
    var mobile = hosted ? (W < 560 || H > 1.15 * W) : W < 820, A, B, I, sd = side();
    K = hosted && !mobile ? clamp(Math.min(W / 1280, H / 760), 0.55, 1) : 1;
    if (hosted) { root.classList.toggle('is-compact', !mobile && K < 0.8); root.classList.toggle('is-narrow', mobile); }
    if (!mobile) {
      A = { cx: 0.6 * W, cy: 0.5 * H, r: Math.min(0.25 * H, 0.2 * W) };
      if (hosted) A.cx = Math.min(A.cx, W - A.r - 130 * K - regW());   // host: leave room for the beat 2 region labels
      var rb = Math.min(0.24 * H, 0.18 * W);
      var cxb = sd === 'right' ? Math.min(0.46 * W, W - 40 * K - 300 * K - 90 * K - rb) : Math.max(0.58 * W, 40 * K + 330 * K + 90 * K + rb);
      B = { cx: cxb, cy: 0.5 * H, r: rb };
      var ri = Math.min(0.1 * H, 0.08 * W);
      I = sd === 'right' ? { cx: Math.max(0.11 * W, ri + 40), cy: 0.34 * H, r: ri } : { cx: Math.min(0.87 * W, W - ri - 70), cy: 0.36 * H, r: ri };
    } else {
      var ra = Math.min(0.4 * W, 0.2 * H);
      A = { cx: 0.5 * W, cy: Math.min(0.4 * H, 108 + ra), r: ra };
      // explode spreads toward the upper left by about 1.4 radii, so it sits right of centre and smaller
      var rbm = sd === 'right' ? Math.min(0.27 * W, 0.16 * H) : Math.min(0.33 * W, 0.18 * H);
      B = { cx: (sd === 'right' ? 0.58 : 0.47) * W, cy: Math.min(0.37 * H, (sd === 'right' ? 124 : 108) + rbm), r: rbm };
      I = { cx: W - 56, cy: Math.max(150, 0.19 * H), r: 34 };
    }
    /* site v7 P15 · text-left framing: every model frame sits right of a left text column (frame centres become the
       camera's lens shift in framing(), so the canvas still fills the stage and the labels follow) */
    if (!mobile && !hosted && o.frame === 'textleft') {
      A = { cx: 0.64 * W, cy: 0.5 * H, r: Math.min(0.25 * H, 0.2 * W) };
      if (sd === 'right') { var rbt = Math.min(0.2 * H, 0.15 * W); B = { cx: Math.max(0.635 * W, 600 * K + 1.5 * rbt), cy: 0.5 * H, r: rbt }; }
      var rit = Math.min(0.1 * H, 0.08 * W); I = { cx: Math.min(0.87 * W, W - rit - 70), cy: 0.3 * H, r: rit };
    }
    lay = { mobile: mobile, A: A, B: B, I: I };
    dirty = true;
  }
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var s = dpr * qScale * (scrolling ? 0.72 : 1);
    var w = Math.max(2, Math.round(W * s)), h = Math.max(2, Math.round(H * s));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }
  function project(Pw, f) {
    var v = sub(Pw, camPos), x = dot(v, camR), y = dot(v, camU), z = dot(v, camF);
    return [(f.foc * x / z + f.sh[0]) * H + W / 2, H / 2 - (f.foc * y / z + f.sh[1]) * H];
  }

  // ---------------------------------------------------------------- the picked particle (pebble frame)
  function frontFace(cutN, Rw) {
    var best = 0, bd = -9;
    for (var k = 0; k < cutN.length; k++) { var d = dot(mv(Rw, cutN[k]), toCam); if (d > bd) { bd = d; best = k; } }
    return best;
  }
  function faceBasis(cut, k, apex) {
    var nk = cut.n[k], dvec = [0, 0, 0];
    cut.n.forEach(function (nj, j) { if (j !== k) dvec = add(dvec, sub(nj, mul(nk, dot(nj, nk)))); });
    if (cut.n.length === 1) dvec = cross([0, 1, 0], nk);
    dvec = norm(dvec); var wv = norm(cross(nk, dvec));
    return { nk: nk, d: dvec, w: wv, base: mul(nk, dot(apex, nk)) };
  }

  // ---------------------------------------------------------------- state
  var spinA = 0, spinB = 0, userYaw = 0, userPitch = 0, dragging = false, pS = null, tNow = 0, driveP = null;
  function progress() {
    if (hosted && driveP != null) return driveP;
    if (LOCK != null) return LOCK;
    var r = track.getBoundingClientRect(), range = track.offsetHeight - stage.offsetHeight;
    return range > 0 ? sat(-r.top / range) : 0;
  }
  function snap(p) { return p < 0.17 ? HOLDS[0] : p < 0.42 ? HOLDS[1] : p < 0.62 ? HOLDS[2] : HOLDS[3]; }

  function state(p, t, dt) {
    var S = { p: p }, cut = CUTS[o.cut] || CUTS.wedge, still = reduce || LOCK != null, drift = still ? 0 : 1;
    S.cut = cut;
    if (!still) {
      spinA += dt * 0.22 * o.spin * (1 - ss(T.b1 - 0.04, T.b1, p));
      spinB += dt * 0.28 * o.spin * ss(T.tr0, T.tr1, p) * (1 - ss(T.open0 - 0.02, T.open0 + 0.01, p));
    }
    var yawA0 = (o.cut === 'wedge' ? o.pebYaw : cut.yaw) * DEG, pitA0 = cut.pitch * DEG;
    S.RwA0 = mm(rotY(yawA0), rotX(pitA0));
    S.RwA = mm(rotY(yawA0 + drift * 0.07 * Math.sin(t * 0.21) + userYaw), rotX(pitA0 + drift * 0.03 * Math.sin(t * 0.17 + 1.3) + userPitch));
    var yawB0 = o.partYaw * DEG, pitB0 = o.partPitch * DEG;
    S.RwB0 = mm(rotY(yawB0), rotX(pitB0));
    S.RwB = mm(rotY(yawB0 + drift * 0.08 * Math.sin(t * 0.19 + 0.4) + userYaw), rotX(pitB0 + drift * 0.03 * Math.sin(t * 0.23) + userPitch));

    // pebble cut
    var A0 = lay.A;
    var liftMax = (0.5 + Math.abs((H / 2 - A0.cy) / H) + 0.2) / framing(A0.cx, A0.cy, A0.r).foc * CAM_D * 1.25 + 1.6;
    S.lk = ease(k01(T.lift0, T.lift1, p));
    S.apex = mul(cut.b, o.cutDepth / 20);
    S.lift = mul(cut.lift, S.lk * liftMax);

    // picked particle on the frontal face
    var k = frontFace(cut.n, S.RwA0), fb = faceBasis(cut, k, S.apex), phi = 0.42, rho = 16.0 / 20;
    var P = add(fb.base, add(mul(fb.d, rho * Math.cos(phi)), mul(fb.w, rho * Math.sin(phi))));
    if (dot(mv(S.RwA0, fb.w), camU) < 0) P = add(fb.base, add(mul(fb.d, rho * Math.cos(phi)), mul(fb.w, -rho * Math.sin(phi))));
    var fn = cut.n[k], fu = norm(cross(fn, Math.abs(fn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), fv = cross(fn, fu);
    S.pickK = k; S.pickF = [dot(P, fu) * 20, dot(P, fv) * 20]; S.pickP = P; S.pickN = fn;

    // transition
    var tr = o.transition, kt = k01(T.tr0, T.tr1, p);
    var fA = framing(A0.cx, A0.cy, A0.r), fB, alA = 1, alB = 0, pg = 0, kb = 0, fade = 1;
    var B0 = lay.B;
    if (tr === 'dissolve') {
      var m = ss(T.dis0, T.dis1, p); alA = 1 - m; alB = m; kb = m;
      fade = 1 - 0.3 * Math.sin(Math.PI * k01(T.dis0, T.dis1, p));
      fB = framing(B0.cx, B0.cy, B0.r);
    } else {
      var kA = ease(k01(0.1, 0.95, kt)), tgt;
      if (tr === 'inset') tgt = lay.I;
      else tgt = { cx: A0.cx + (lay.mobile ? 0 : -0.06 * W), cy: A0.cy + (lay.mobile ? -0.04 * H : 0.02 * H), r: A0.r * 0.55 };
      fA = framing(lerp(A0.cx, tgt.cx, kA), lerp(A0.cy, tgt.cy, kA), lerp(A0.r, tgt.r, kA));
      if (tr === 'pullout') alA = 1 - ss(0.45, 0.95, kt);
      // the particle starts exactly on its cross-section, lifts off the face, then flies to its framing
      var Pw = mv(S.RwA, P), s0 = project(Pw, fA), s1 = project(add(Pw, mul(mv(S.RwA, fn), 0.08)), fA);
      var r0 = Math.max(2, Math.hypot.apply(null, sub(project(add(Pw, mul(camR, RPm / 20)), fA), s0.concat(0)).slice(0, 2)));
      var nx = s1[0] - s0[0], ny = s1[1] - s0[1], nl = Math.hypot(nx, ny) || 1;
      var kl = ss(0, 0.22, kt), kf = ease(k01(0.16, 1, kt)), kr = ss(0.14, 1, kt);
      var st = { cx: s0[0] + nx / nl * 26 * kl, cy: s0[1] + ny / nl * 26 * kl, r: r0 * (1 + 0.8 * kl) };
      fB = framing(lerp(st.cx, B0.cx, kf), lerp(st.cy, B0.cy, kf), st.r * Math.pow(B0.r / st.r, kr));
      alB = ss(0, 0.03, kt); pg = ss(0, 0.06, kt); kb = kf;
      S.pickScreen = { x: s0[0], y: s0[1], r: r0 };
    }
    if (!S.pickScreen) {
      var Pw2 = mv(S.RwA, P), q0 = project(Pw2, fA);
      S.pickScreen = { x: q0[0], y: q0[1], r: Math.max(2, Math.hypot(project(add(Pw2, mul(camR, RPm / 20)), fA)[0] - q0[0], 0)) };
    }
    S.fA = fA; S.fB = fB; S.alA = alA; S.alB = alB; S.pickGone = pg; S.kb = kb; S.kt = kt; S.fade = fade;
    S.pickHi = ss(T.pick0, T.pick1, p) * (1 - pg);

    // particle anatomy
    var lm = o.layers;
    S.R = RL.slice(); S.oct = 0.62; S.terr = o.terrace; S.hc = 1.05; S.exp = 0; S.lay = 0;
    S.ax = norm(mtv(S.RwB0, norm([-0.72, 0.42, 0.55])));
    var t0s = lm === 'build' ? T.seqB0 : T.seq0, stp = lm === 'build' ? T.stepB : T.step;
    S.ti = [0, 1, 2, 3, 4].map(function (i) { return t0s + i * stp; });
    if (lm === 'terrace') { S.oct = lerp(0.62, 0, ease(k01(T.open0, T.open1, p))); }
    else if (lm === 'explode') {
      S.lay = 1; S.hc = lerp(1.05, 0, ease(k01(T.open0, T.open0 + 0.05, p)));
      S.exp = o.gap * ease(k01(T.open0 + 0.035, T.open1 + 0.02, p));
    } else {
      var kd = k01(T.open0, T.open0 + 0.04, p);
      if (kd > 0 && kd < 1) S.alB *= Math.abs(1 - 2 * kd);
      if (kd >= 0.5) {
        S.oct = 0; S.terr = 0;
        for (var i = 1; i < 5; i++) S.R[i] = lerp(S.R[i - 1], RL[i], ease(k01(S.ti[i], S.ti[i] + 0.7 * stp, p)));
      }
    }
    // active layer
    S.act = -1;
    for (var j = 0; j < 5; j++) if (p >= S.ti[j]) S.act = j;
    if (p >= T.seqEnd) S.act = -1;
    S.actAmt = S.act < 0 ? 0 : ss(S.ti[0], S.ti[0] + 0.015, p) * (1 - ss(T.seqEnd - 0.02, T.seqEnd, p));
    if (S.act < 0 && p >= T.seqEnd - 0.02 && p < T.seqEnd) S.act = 4;
    return S;
  }

  function up(name, m) { gl.uniformMatrix3fv(u(name), false, new Float32Array(m)); }
  function draw(S, t) {
    resizeCanvas();
    var cw = canvas.width, ch = canvas.height, sx = cw / W;
    gl.uniform2f(u('uRes'), cw, ch); gl.uniform1f(u('uTime'), t);
    gl.uniform3fv(u('uCamPos'), camPos); gl.uniform3fv(u('uCamR'), camR); gl.uniform3fv(u('uCamU'), camU); gl.uniform3fv(u('uCamF'), camF);
    gl.uniform2fv(u('uShA'), S.fA.sh); gl.uniform2fv(u('uShB'), S.fB.sh);
    gl.uniform1f(u('uFocA'), S.fA.foc); gl.uniform1f(u('uFocB'), S.fB.foc);
    gl.uniform1f(u('uAlA'), S.alA); gl.uniform1f(u('uAlB'), S.alB); gl.uniform1f(u('uFade'), S.fade);
    up('uMA', S.RwA); up('uMB', S.RwB); up('uTA', rotY(spinA)); up('uTB', mm(rotY(spinB), rotX(spinB * 0.37)));
    var n = S.cut.n;
    gl.uniform1i(u('uCutN'), n.length);
    gl.uniform3fv(u('uN0'), n[0]); gl.uniform3fv(u('uN1'), n[1] || [0, 0, 1]); gl.uniform3fv(u('uN2'), n[2] || [0, 0, 1]);
    gl.uniform3fv(u('uApex'), S.apex); gl.uniform3fv(u('uLift'), S.lift); gl.uniform1f(u('uCutOn'), S.lk > 0.0005 ? 1 : 0);
    gl.uniform1i(u('uPickK'), S.pickK); gl.uniform2fv(u('uPickF'), S.pickF);
    gl.uniform1f(u('uPickOn'), 1);
    gl.uniform1f(u('uPickGone'), S.pickGone); gl.uniform1f(u('uPickHi'), S.pickHi);
    gl.uniform1i(u('uLay'), S.lay); gl.uniform1f(u('uOct'), S.oct); gl.uniform1f(u('uTerr'), S.terr);
    gl.uniform1f(u('uKWhole'), o.kernel === 'cut' ? 0 : 1); gl.uniform1fv(u('uR'), new Float32Array(S.R));
    gl.uniform3fv(u('uAx'), S.ax); gl.uniform1f(u('uHc'), S.hc); gl.uniform1f(u('uExp'), S.exp);
    gl.uniform1f(u('uAct'), S.act); gl.uniform1f(u('uActAmt'), S.actAmt);
    gl.uniform1f(u('uLook'), o.look === 'p' ? 1 : 0);
    gl.uniform1f(u('uPCol'), o.pcolor === 'gold' ? 2 : o.pcolor === 'ecru' ? 1 : 0);
    gl.uniform1f(u('uBand'), o.band); gl.uniform1f(u('uGrain'), o.grain); gl.uniform1f(u('uExpo'), o.exposure); gl.uniform1f(u('uRim'), o.rim);
    var az = o.keyAz * DEG, el = o.keyEl * DEG;
    gl.uniform3fv(u('uKeyDir'), norm([Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]));
    var neutral = [1.0, 0.95, 0.88], gold = hexLin('#E1AB25'), gm = Math.max.apply(null, gold);
    gl.uniform3fv(u('uKeyCol'), [0, 1, 2].map(function (i) { return (neutral[i] + (gold[i] / gm - neutral[i]) * o.warmth) * o.keyGain; }));
    var light = o.theme === 'light', okc = o.opyc === 'navy' ? 1.25 : 0.62;
    if (light && o.coats === 'deep' && o.opyc !== 'navy') okc = 0.4;   // v3, light, coats=deep: Bali Hai OPyC a step darker on paper
    gl.uniform3fv(u('uOpyc'), hexLin(OPYC[o.opyc] || OPYC.bali).map(function (c) { return c * okc; }));
    if (light) {
      gl.uniform3fv(u('uPaperL'), hexLin('#' + o.paper));
      gl.uniform1f(u('uShadow'), o.shadow); gl.uniform1f(u('uSweep'), o.sweep);
      gl.uniform1f(u('uCoat'), o.coats === 'same' ? 0 : 1); gl.uniform1f(u('uRadB'), S.R[4]);
    }
    var kg = S.kb;
    var gx = lerp(S.fA.cx, S.fB.cx, kg), gy = lerp(S.fA.cy, S.fB.cy, kg), gr = lerp(S.fA.r, S.fB.r, kg);
    gl.uniform2f(u('uObjPx'), gx * sx, (H - gy) * sx); gl.uniform1f(u('uObjR'), (gr / H) * 1.6);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---------------------------------------------------------------- labels
  function hide(x) { x.el.style.opacity = 0; x.path.style.opacity = 0; x.dot.style.opacity = 0; }
  function show(x, a, d, dot) {
    x.path.setAttribute('d', d); x.path.style.opacity = a * 0.8;
    if (dot) { x.dot.setAttribute('cx', dot[0]); x.dot.setAttribute('cy', dot[1]); x.dot.style.opacity = a; } else x.dot.style.opacity = 0;
  }
  function putLab(x, px, py, a) { x.el.style.opacity = a; x.el.style.transform = 'translate(' + Math.round(px) + 'px,' + Math.round(py) + 'px)'; }

  function anchorsReg(S) {
    var fb = faceBasis(S.cut, frontFace(S.cut.n, S.RwA0), S.apex), wv = fb.w;
    if (dot(mv(S.RwA0, wv), camU) < 0) wv = mul(wv, -1);
    function at(rho, phi) { return mv(S.RwA, add(fb.base, add(mul(fb.d, rho * Math.cos(phi)), mul(wv, rho * Math.sin(phi))))); }
    return { core: at(0.36, -0.1), band: at(0.8, 0.32), shell: at(0.95, -0.5) };
  }
  function anchorsLay(S) {
    var Rw = S.RwB, out = [], sgn = lay.mobile ? -1 : (side() === 'right' ? 1 : -1);  // phones: lower-left extremes, labels right-aligned below
    if (S.lay === 1) {
      var ax = S.ax, u1 = norm(cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), u2 = cross(ax, u1);
      for (var i = 0; i < 5; i++) {
        var off = mul(ax, S.exp * (4 - i)), best = null, bx = -1e9;
        if (i === 0) {
          var dirW = norm(add(mul(camR, sgn * 0.65), add(mul(toCam, 0.6), mul(camU, -0.55))));
          best = mv(Rw, add(off, mul(mtv(Rw, dirW), RL[0])));
        } else {
          var rm = (RL[i - 1] + RL[i]) / 2, c = add(off, mul(ax, S.hc));
          for (var a = 0; a < 36; a++) {
            var th = a / 36 * Math.PI * 2, Pp = mv(Rw, add(c, add(mul(u1, rm * Math.cos(th)), mul(u2, rm * Math.sin(th)))));
            var sp = project(Pp, S.fB), sx = sp[0] * sgn + 0.8 * sp[1];   // lower outer extreme: keeps rows in A..E order
            if (sx > bx) { bx = sx; best = Pp; }
          }
        }
        out.push(best);
      }
      return out;
    }
    var axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], want = norm(add(toCam, mul(camR, 0.9))), k = 0, bd = -9;
    axes.forEach(function (a, i) { var d = dot(mv(S.RwB0, a), want); if (d > bd) { bd = d; k = i; } });
    var nk = axes[k], dv = norm(add(axes[(k + 1) % 3], axes[(k + 2) % 3]));
    for (var j = 0; j < 5; j++) {
      if (j === 0 && o.kernel !== 'cut') { out.push(mv(Rw, mul(norm([1, 1, 1]), S.R[0]))); continue; }
      var rmj = j === 0 ? S.R[0] * 0.55 : (S.R[j - 1] + S.R[j]) / 2, cj = S.oct + S.terr * (4 - j);
      out.push(mv(Rw, add(mul(nk, cj), mul(dv, Math.sqrt(Math.max(rmj * rmj - cj * cj, 0))))));
    }
    return out;
  }

  // a column of callouts beside an object; leaders run horizontal from the anchor to a shared bend,
  // then straight to the label row. Anchors and rows are sorted the same way, so no two cross.
  function column(list, sd, f, pad) {
    if (!list.length) return;
    if (!lay.mobile) {
      list.sort(function (m, n) { return m.ay - n.ay; });
      var wmax = Math.max.apply(null, list.map(function (c) { return c.w; }));
      var colX = sd === 'right' ? Math.min(f.cx + f.r + 90 * K, W - 40 * K - wmax) : Math.max(f.cx - f.r - 90 * K, 40 * K + wmax);
      var prev = -1e9, prevH = 0;
      list.forEach(function (c) { c.y = Math.max(c.ay, prev + Math.max(40 * K, (prevH + c.h) / 2 + 22 * K)); prev = c.y; prevH = c.h; });
      var sa = 0, sy = 0; list.forEach(function (c) { sa += c.ay; sy += c.y; });
      var sh = (sa - sy) / list.length; list.forEach(function (c) { c.y += sh; });
      var lo = list[0].y - 120 * K, hi = list[list.length - 1].y - (H - 110 * K);
      if (lo < 0) list.forEach(function (c) { c.y -= lo; }); else if (hi > 0) list.forEach(function (c) { c.y -= hi; });
      var xb = sd === 'right' ? Math.max.apply(null, list.map(function (c) { return c.ax; })) + 24 : Math.min.apply(null, list.map(function (c) { return c.ax; })) - 24;
      if (sd === 'right') xb = Math.min(xb, colX - 50); else xb = Math.max(xb, colX + 50);
      var s = sd === 'right' ? 1 : -1;
      list.forEach(function (c) {
        show(c.x, c.a * c.la, 'M' + c.ax + ' ' + c.ay + 'H' + xb + 'L' + (colX - s * 18) + ' ' + c.y + 'H' + (colX - s * 6), [c.ax, c.ay]);
        putLab(c.x, sd === 'right' ? colX : colX - c.w, c.y - c.h / 2, c.a);
      });
    } else {
      // L leaders: drop from the anchor to the row, then run across to the label
      var meanX = list.reduce(function (m, c) { return m + c.ax; }, 0) / list.length;
      var leftAl = meanX > W * 0.5, y = f.cy + f.r + pad, edge = 20;
      list.sort(function (m, n) { return leftAl ? m.ax - n.ax : n.ax - m.ax; });
      list.forEach(function (c) {
        y += c.h / 2;
        var lx = leftAl ? edge : W - edge - c.w, end = leftAl ? lx + c.w + 8 : lx - 8;
        show(c.x, c.a * c.la, 'M' + c.ax + ' ' + c.ay + 'V' + y + 'H' + end, [c.ax, c.ay]);
        putLab(c.x, lx, y - c.h / 2, c.a);
        y += c.h / 2 + 18;
      });
    }
  }

  function headings(p) {
    var b = [0].concat(HEAD).concat([1.01]);
    heads.forEach(function (h, i) {
      var a = (i === 0 ? 1 : ss(b[i], b[i] + 0.014, p)) * (i === 3 ? 1 : 1 - ss(b[i + 1] - 0.014, b[i + 1], p));
      h.style.opacity = a.toFixed(3);
    });
    if (lineEl) {
      /* insitu P9 (v2): with sub=fold (the page default) the subhead folds after beat 1 at every width; built, it folded on phones only */
      var fold = lay.mobile || !document.documentElement.classList.contains('tz-sub-stay');
      var lk = fold ? 1 - ss(0.08, 0.12, p) : 1;
      if (lineEl.__w !== W) { lineEl.__w = W; lineEl.__h = lineEl.scrollHeight; lineEl.__m = parseFloat(getComputedStyle(lineEl).marginTop) || 0; }
      lineEl.style.opacity = lk.toFixed(3); lineEl.style.overflow = 'hidden';
      lineEl.style.maxHeight = fold ? (lk * (lineEl.__h + 2)).toFixed(1) + 'px' : '';
      lineEl.style.marginTop = fold ? (lk * lineEl.__m).toFixed(1) + 'px' : '';
    }
  }

  function placeLabels(S) {
    var p = S.p, fA = S.fA, fB = S.fB, mob = lay.mobile, tr = o.transition;
    headings(p);
    // scale bar: under the pebble, carried to the particle as it arrives
    var raM = ss(T.reg0 - 0.02, T.reg0 + 0.02, p) * (1 - ss(T.regO0, T.regO1, p));
    var barA = (1 - ss(T.open0, T.open0 + 0.03, p)) * (mob ? 1 - raM : 1), kb = S.kb, gapB = mob ? 24 : 34;
    var bx0 = lerp(fA.cx - fA.r, fB.cx - fB.r, kb), bx1 = lerp(fA.cx + fA.r, fB.cx + fB.r, kb), by = lerp(fA.cy + fA.r, fB.cy + fB.r, kb) + gapB;
    if (barA > 0.001) {
      show(L.bar, barA, 'M' + bx0 + ' ' + (by - 5) + 'V' + (by + 5) + 'M' + bx0 + ' ' + by + 'H' + bx1 + 'M' + bx1 + ' ' + (by - 5) + 'V' + (by + 5), null);
      var tm = ss(0.4, 0.6, kb); barSpans[0].style.opacity = 1 - tm; barSpans[1].style.opacity = tm;
      putLab(L.bar, (bx0 + bx1) / 2 - lerp(L.bar.w, L.bar.w2, tm) / 2, by + 12, barA);
    } else hide(L.bar);

    // beat 2 regions
    var ra = ss(T.reg0, T.reg1, p) * (1 - ss(T.regO0, T.regO1, p)), regs = [];
    if (ra > 0.001) {
      var an = anchorsReg(S);
      ['band'].forEach(function (id) { var s = project(an[id], fA); regs.push({ x: L[id], a: ra, la: 1, ax: s[0], ay: s[1], w: L[id].w, h: L[id].h }); });
      column(regs, 'right', fA, mob ? 40 : 0);
    } else ['band'].forEach(function (id) { hide(L[id]); });

    // the picked particle: ring + label, carried with the particle in pullout, left on the pebble in inset
    var ps = S.pickScreen, pa = ss(T.pick0, T.pick1, p), rc, rr;
    if (tr === 'dissolve') { pa *= 1 - ss(T.dis0, T.dis0 + 0.02, p); rc = [ps.x, ps.y]; rr = ps.r + 6; }
    else if (tr === 'pullout') { pa *= 1 - ss(0.6, 0.85, S.kt); rc = S.kt > 0 ? [fB.cx, fB.cy] : [ps.x, ps.y]; rr = (S.kt > 0 ? fB.r : ps.r) + 6; }
    else { rc = [ps.x, ps.y]; rr = Math.max(ps.r + 5, 7); }
    if (pa > 0.001) {
      ring.setAttribute('cx', rc[0]); ring.setAttribute('cy', rc[1]); ring.setAttribute('r', Math.max(rr, 8)); ring.style.opacity = pa;
    } else ring.style.opacity = 0;
    var la = ss(T.pick0, T.pick1, p) * (1 - ss(0.5, 0.75, S.kt));
    if (tr === 'dissolve') la *= 1 - ss(T.dis0, T.dis0 + 0.02, p);
    if (la > 0.001) {
      var lx, ly, d;
      var lr = tr === 'pullout' && S.kt > 0 ? fB.r + 6 : Math.max(rr, 8);
      if (!mob) { lx = rc[0] + lr + 44; ly = rc[1]; d = 'M' + (rc[0] + lr) + ' ' + ly + 'H' + (lx - 8); putLab(L.pick, lx, ly - L.pick.h / 2, la); }
      else { lx = clamp(rc[0] - L.pick.w / 2, 16, W - 16 - L.pick.w); ly = rc[1] + lr + 30; d = 'M' + rc[0] + ' ' + (rc[1] + lr) + 'V' + (ly - 6); putLab(L.pick, lx, ly, la); }
      show(L.pick, la, d, null);
    } else hide(L.pick);

    // inset: magnifier cone from the ring on the small pebble to the particle, plus a caption
    if (tr === 'inset' && S.kt > 0.3) {
      var ca = ss(0.45, 0.75, S.kt), c1 = rc, r1 = Math.max(rr, 8), c2 = [fB.cx, fB.cy], r2 = fB.r;
      var dx = c2[0] - c1[0], dy = c2[1] - c1[1], dd = Math.hypot(dx, dy);
      if (dd > Math.abs(r2 - r1) + 1) {
        var ux = dx / dd, uy = dy / dd, vx = -uy, vy = ux, cb = (r1 - r2) / dd, sb = Math.sqrt(1 - cb * cb), path = '';
        [1, -1].forEach(function (sg) {
          var nx = ux * cb + vx * sb * sg, ny = uy * cb + vy * sb * sg;
          path += 'M' + (c1[0] + nx * r1) + ' ' + (c1[1] + ny * r1) + 'L' + (c2[0] + nx * r2) + ' ' + (c2[1] + ny * r2);
        });
        cone.setAttribute('d', path); cone.style.opacity = ca * 0.45;
      }
      var cap = ss(0.7, 1, S.kt);
      putLab(L.icap, clamp(fA.cx - L.icap.w / 2, 12, W - 12 - L.icap.w), fA.cy + fA.r + 14, cap); show(L.icap, 0, 'M0 0', null);
    } else { cone.style.opacity = 0; hide(L.icap); }

    // layers
    var anc = anchorsLay(S), items = [], big = o.layers === 'build';
    for (var i = 0; i < 5; i++) {
      var x = L['L' + i], a = ss(S.ti[i], S.ti[i] + 0.02, p);
      if (a <= 0.001) { hide(x); x.el.classList.remove('is-act', 'is-big'); continue; }
      var isAct = S.act === i && S.actAmt > 0.01, dim = S.act >= 0 && !isAct;
      x.el.classList.toggle('is-act', isAct); x.el.classList.toggle('is-big', isAct && big);
      var s = project(anc[i], fB);
      items.push({ x: x, a: a * (dim ? 0.42 : 1), la: isAct ? 1.1 : 0.9, ax: s[0], ay: s[1], w: isAct && big ? x.wb : x.w, h: isAct && big ? x.hb : x.h });
      x.dot.setAttribute('r', isAct ? 4 : 3);
    }
    column(items, lay.mobile ? 'below' : side(), fB, 40);
  }

  // ---------------------------------------------------------------- loop
  var visible = true, raf = 0, last = performance.now(), ftimes = [], lastKey = '';
  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible || document.hidden) return;
    tNow += reduce ? 0 : dt;
    var pr = progress();
    if (reduce && LOCK == null && !hosted) pr = snap(pr);   // host: the module steps the holds itself
    if (pS == null || reduce || LOCK != null || hosted) pS = pr; else pS += (pr - pS) * (1 - Math.exp(-dt * 10));
    if (!dragging) { var dk = Math.exp(-dt * 2.2); userYaw *= dk; userPitch *= dk; }
    var still = reduce || LOCK != null;
    var key = [pS.toFixed(4), W, H, qScale, scrolling, userYaw.toFixed(4)].join('|');
    if (still && key === lastKey && !dirty) return;
    lastKey = key; dirty = false;
    var S = state(pS, tNow, dt);
    draw(S, tNow);
    placeLabels(S);
    if (!still) {
      ftimes.push(dt); if (ftimes.length > 30) ftimes.shift();
      if (ftimes.length === 30) {
        var avg = ftimes.reduce(function (a, b) { return a + b; }, 0) / 30;
        if (avg > 0.024 && qScale > 0.5) { qScale = Math.max(0.5, qScale * 0.86); ftimes = []; }
        else if (avg < 0.0175 && qScale < 1) { qScale = Math.min(1, qScale * 1.07); ftimes = []; }
        root.setAttribute('data-q', qScale.toFixed(2));
      }
    }
  }

  layout();
  window.addEventListener('resize', function () { layout(); measure(); }, { passive: true });
  // host: the canvas and the labels follow the box, including when it goes from hidden to shown
  if (hosted && 'ResizeObserver' in window) new ResizeObserver(function () { layout(); measure(); layout(); }).observe(stage);
  var scrollT = 0;
  if (!hosted) window.addEventListener('scroll', function () {
    if (!scrolling) { scrolling = 1; dirty = true; }
    clearTimeout(scrollT); scrollT = setTimeout(function () { scrolling = 0; dirty = true; }, 160);
  }, { passive: true });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; dirty = true; }).observe(track);
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); cancelAnimationFrame(raf); fallback(); });

  if (o.drag && !reduce) {
    stage.classList.add('can-drag');
    var px0 = 0, py0 = 0;
    stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') return;
      dragging = true; px0 = e.clientX; py0 = e.clientY; stage.classList.add('is-drag'); stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      userYaw = clamp(userYaw + (e.clientX - px0) * 0.008, -1.2, 1.2);
      userPitch = clamp(userPitch + (e.clientY - py0) * 0.006, -0.5, 0.5);
      px0 = e.clientX; py0 = e.clientY;
    });
    var end = function () { dragging = false; stage.classList.remove('is-drag'); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  }

  // ---------------------------------------------------------------- ?knobs panel
  if (qs.has('knobs')) {
    var pn = document.createElement('div');
    pn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;background:#0b1320;color:#e8e0cc;font:11px/1.4 ui-monospace,Menlo,monospace;padding:10px 12px;border:1px solid #142A44;max-height:92vh;overflow:auto;width:270px';
    var h = '<div style="color:#E1AB25;letter-spacing:.18em;margin-bottom:6px">M1 KNOBS · v3</div>';
    h += '<label style="display:block;margin:4px 0">beat <select data-beat><option value="">scroll</option><option>1</option><option>2</option><option>3</option><option>4</option></select></label>';
    KNOBS.forEach(function (k) {
      var key = k[0], val = o[key];
      if (Array.isArray(k[1])) h += '<label style="display:block;margin:4px 0">' + key + ' <select data-k="' + key + '">' + (k[1].indexOf(val) < 0 ? k[1].concat([val]) : k[1]).map(function (x) { return '<option' + (x === val ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>';
      else h += '<label style="display:block;margin:4px 0">' + key + ' <span data-v="' + key + '">' + val + '</span><br><input type="range" style="width:100%" data-k="' + key + '" min="' + k[1] + '" max="' + k[2] + '" step="' + k[3] + '" value="' + val + '"></label>';
    });
    h += '<button data-copy style="margin-top:6px;background:#E1AB25;color:#050D18;border:0;padding:4px 8px;font:inherit;cursor:pointer">copy JSON</button>';
    pn.innerHTML = h;
    pn.addEventListener('input', function (e) {
      if (e.target.hasAttribute('data-beat')) { var b = e.target.value; LOCK = b ? HOLDS[+b - 1] : null; dirty = true; return; }
      var k = e.target.getAttribute('data-k'); if (!k) return;
      o[k] = typeof DEFAULTS[k] === 'number' ? +e.target.value : e.target.value;
      var vs = pn.querySelector('[data-v="' + k + '"]'); if (vs) vs.textContent = o[k];
      if (k === 'pace') setPace();
      if (k === 'look') root.setAttribute('data-look', o.look);
      if (k === 'layers') layout();
      if (k === 'theme' || k === 'paper') { applyTheme(); if (!useProg(o.theme)) { fallback(); return; } measure(); }
      dirty = true;
    });
    pn.querySelector('[data-copy]').addEventListener('click', function () {
      var out = {}; Object.keys(DEFAULTS).forEach(function (k) { if (o[k] !== DEFAULTS[k]) out[k] = o[k]; });
      var s = JSON.stringify(out); if (navigator.clipboard) navigator.clipboard.writeText(s); console.log('[m1 knobs]', s);
    });
    document.body.appendChild(pn);
  }

  // ---------------------------------------------------------------- drive=host API (CHAPTERS.md §2)
  // The page owns the clock: it calls set(p) every frame. Stopped, set(p) still draws that one frame.
  // root.t4mDrive is set now; 't4m:drive-ready' fires once this script has finished (so start/stop from a
  // listener act on a running loop). A page that runs after this script can also just check root.t4mDrive.
  function exposeDrive(api) {
    var none = function () {};
    root.t4mDrive = {
      beats: BEATS.map(function (b) { return { n: b.n, from: b.from, hold: b.hold, to: b.to }; }),
      highlight: { from: HIGHLIGHT.from, to: HIGHLIGHT.to, seconds: HIGHLIGHT.seconds },
      set: api ? api.set : none, start: api ? api.start : none, stop: api ? api.stop : none
    };
    Promise.resolve().then(function () { root.dispatchEvent(new CustomEvent('t4m:drive-ready', { bubbles: true })); });
  }
  if (hosted) exposeDrive({
    set: function (p) {
      driveP = sat(+p || 0); dirty = true;
      if (!raf) { frame(performance.now()); cancelAnimationFrame(raf); raf = 0; }
    },
    start: function () { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } dirty = true; },
    stop: function () { cancelAnimationFrame(raf); raf = 0; }
  });

  raf = requestAnimationFrame(frame);
  }
})();

