# tesser-atomics-assets

The live-WebGL ("heavy") scenes for the Tesser Atomics Webflow build, served from jsDelivr.
Source: `handoff-site-v11/heavy/site-t4m-v11.html` (Oct 26, 2026). Scene code is extracted
unchanged; only the loading changed.

## Publish

```
git init && git add . && git commit -m "v1.0.0: heavy scenes from handoff v11"
git remote add origin https://github.com/Mariooptio/tesser-atomics-assets.git
git push -u origin main && git tag v1.0.0 && git push --tags
```

Base URL: `https://cdn.jsdelivr.net/gh/Mariooptio/tesser-atomics-assets@v1.0.0/`
Every file in `webflow/` already points at it. New release = new tag, then find/replace
`@v1.0.0` in Webflow. Never point Webflow at `@main` (jsDelivr caches branches for up to 7 days).

## Wiring in Webflow (Home page)

| Where | What |
|---|---|
| Page `<head>` | `webflow/head.html`: scene CSS + `core.min.js` (2.7 KB gz, must run before first paint) |
| Before `</body>` | `webflow/footer.html`: `page.min.js` (drives M2's ambient loop, nav state) + `loader.min.js` |
| One Embed per scene | `webflow/embed-<scene>.html`, each inside a Designer div carrying the attributes below |

| Scene | Section | Wrapper attributes | Embed size |
|---|---|---|---|
| plant | Technology | `data-tz-scene="plant"` `data-tz-prep="tsr-plant"` | 12 KB |
| m1 | Why this reactor | `data-tz-scene="m1"` `data-tz-prep="tsr-m1"` | 2 KB |
| m2 | Why this reactor | `data-tz-scene="m2"` `data-tz-prep="t4m-m2,t4m-m3"` | 2 KB |
| m4 | Why this reactor | `data-tz-scene="m4"` `data-tz-prep="tsr-m4"` | 14 KB |
| ships | Applications | `data-tz-scene="ships"` `data-tz-prep="tsr-ships"` | 27 KB |

## How it loads

- First paint carries no scene code: `core.min.js`, the scene CSS and `loader.min.js` (~17 KB gz total).
- Each scene's script is injected when its wrapper is within 1.5 screens (`data-tz-ahead` to tune),
  or as soon as it has been scrolled past (anchor jumps, fast flings).
- Once the page has loaded and gone idle, the remaining scenes are prefetched at low priority.
- The scenes already pause offscreen and in hidden tabs, cap pixel ratio at 1.5, and honour
  `prefers-reduced-motion`.

| File | Minified | Gzipped |
|---|---|---|
| `js/scenes/plant.min.js` | 63 KB | 24 KB |
| `js/scenes/m1.min.js` | 42 KB | 17 KB |
| `js/scenes/m2.min.js` | 71 KB | 22 KB |
| `js/scenes/m4.min.js` | 74 KB | 26 KB |
| `js/scenes/ships.min.js` | 73 KB | 26 KB |
| `js/core.min.js` + `loader.min.js` + `page.min.js` | 24 KB | 10 KB |
| `css/scenes.min.css` | 74 KB | 13 KB |

## Files

- `js/core.js`: switches (defaults only, the `k` panel is inert), `__TZ_PREP`, `__TZ_LAZY`
- `js/page.js`: handoff page script (nav state, M2 ambient drive, signup). To be trimmed in Phase 5.
- `js/loader.js`: new; attribute-driven lazy loading + preps + idle prefetch
- `js/scenes/*.js`: one file per scene, code unchanged
- `css/scenes.css`: the page's scene-scoped rules + each scene's own block
- `markup/*.html`: scene markup with `{{BASE}}` placeholders (source for `webflow/`)
- `assets/`: posters and the ship tiles that were inlined as data URIs

## Known

- Chrome resolves `url()` inside CSS custom properties against the stylesheet that uses them,
  so every poster URL in the markup is absolute. Keep it that way.
- M3 (graphite) and both growth sections are off by default and not included.
