## @jamesernator/babel-plugin-import-features-browser

This plugin allows for the use of `import()`/`import.meta` in browsers that only support `<script type="module"></script>`.

For example if you've got a script tag like:

```html
<script type="module" src="./some-file.js"></script>
```

then applying this plugin to `some-file.js` (and it's dependencies) will replace `import()`/`import.meta` with something equivalent that works in all modern evergreen browsers.

## Caveats

The dynamic import transpilation depends on the availability of the `document.createElement('script')`. If that isn't available (e.g. web workers) then the transpiled code won't work.

Also be aware that any source transforms that wrap the `new Error().stack` into a function instead of being top-level code it'll break as well so be sure to check any other tools you might be using like minifiers/babel for any transforms that wrap your code in an IIFE.
