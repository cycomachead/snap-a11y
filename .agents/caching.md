# Caching: why your `src/` change "doesn't load"

Snap! has **two** cache layers that will happily serve stale files after
you edit `src/`. If your change doesn't appear in the browser, it's almost
certainly one of these, not your code.

## 1. `?version=` query strings in `snap.html`

Every script tag in `snap.html` carries a date query string:

```html
<script src="src/morphic.js?version=2026-08-07"></script>
```

The query string is pure cache-busting: browsers cache by full URL, so an
unchanged version string means the browser keeps using its cached copy of
the old file. **Whenever you edit a file in `src/`, bump its `?version=`
date in `snap.html`.** Convention is `YYYY-MM-DD`.

Also update the matching in-file version marker (upstream convention, and
it's what "About → modules" displays): `morphicVersion` near the top of
`morphic.js`, and `modules.<name> = '<date>'` in the other modules.

## 2. The service worker (`sw.js`)

`sw.js` precaches `snap.html` and all of `src/` under a cache named from
`snapVersion` (currently `12.0.6-a11y.1`). Old caches are deleted on
activate when the name changes. Two implications:

- On `localhost`/`127.0.0.1` a `Date.now()` cache-buster disables SW
  caching, so local dev is safe.
- Anywhere else (deployed preview, LAN hostname, etc.) users keep getting
  the old cached files until `snapVersion` changes. **Bump `snapVersion`
  in `sw.js` when shipping changes.**

The Playwright harness sidesteps all of this with
`serviceWorkers: 'block'` in `tests/playwright.config.js`, and the python
dev server doesn't send aggressive cache headers — which is why tests can
pass while a regular browser tab still shows stale behavior. Hard-reload
(and unregister the service worker in devtools) when in doubt.
