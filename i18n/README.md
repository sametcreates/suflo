# Suflo English UI (i18n)

Suflo is written in Turkish. The English UI is a runtime layer: it translates the
Turkish DOM in place, so existing code keeps working without changes. Nothing in v3.0
loads these files. They get wired in v3.1.

| File | Role |
| --- | --- |
| `i18n/en.js` | Turkish → English dictionary (`window.SufloI18nEN` / `module.exports`) |
| `js/i18n.js` | Translator (`window.SufloI18n` / `module.exports`) |
| `tools/i18n-coverage.js` | Finds Turkish UI strings in `index.html` and `js/*.js` that have no translation |
| `tests/test-i18n.js` | Unit tests (fake DOM, no jsdom), run by `node tools/test.js` |

## How it works

- `translate(str)` trims the string and collapses internal whitespace, then looks it up.
  The surrounding whitespace is put back afterwards. Lookups run in this order:
  1. exact key;
  2. explicit `patterns`, then template keys. In a template key, `{}` matches any text,
     which is itself translated. `{n}` matches only a number such as `12`, `1.076`,
     `3,5`, `%45` or `120 MB`;
  3. the same lookups again with a leading symbol (✨, ✓, ⚠ …) or trailing
     punctuation (`…`, `.`, `:`) stripped;
  4. a split on ` · `, ` — `, ` | ` and ` → `, translating each part;
  5. a sentence-by-sentence split.

  An unknown string comes back unchanged.
- `apply(root)` walks text nodes and the attributes `title`, `placeholder`,
  `aria-label`, `alt` and `data-tip`. `index.html` uses only the first four. It skips
  the following:
  - `<script>`, `<style>`, `<textarea>` contents, `contenteditable` and `[data-i18n-skip]`;
  - input `value`s and `<option value>`. Only the option's text is translated;
  - user content: `#cap-segments`, `#cap-onizleme-metin`, `#cap-ch-list`,
    `#cap-vr-liste`, `#cap-br-liste`, `#cut-ranges`, `#cap-yt-aciklama`,
    `#cap-yt-basliklar`, `#cap-yt-etiket`, `#kanca-metin`, `#kanca-oneriler` and
    `#tc-words`. Inside these containers, only `BUTTON`/`LABEL`/`OPTION` text,
    button tooltips and input placeholders are translated. Transcript and caption
    words are never touched.
- `start()` applies the translation to `document.body` and attaches a `MutationObserver`
  for toasts, status lines and cards that appear later. There's no infinite loop because
  every English value is a fixed point: `translate(en) === en`, which the tests check.
  Nodes are written only when their value actually changes.
- `getLang()` returns `"en"` or `"tr"`. It reads `localStorage["suflo.uiLang"]` first.
  If that isn't set, it falls back to `navigator.language`: `tr*` and `az*` give
  `"tr"`, anything else gives `"en"`. `setLang(l)` saves the choice. `tr(str)`
  translates only when the language is `"en"`; use it in new code.

## Wiring in v3.1

1. In `index.html`, load both files before the other panel scripts, right after
   `js/CSInterface.js`:
   ```html
   <script src="js/CSInterface.js"></script>
   <script src="i18n/en.js"></script>
   <script src="js/i18n.js"></script>
   <script src="js/bridge.js"></script>
   ```
2. Start it once the DOM is ready. Any listener works, but the earliest is best so the
   Turkish UI doesn't flash:
   ```js
   document.addEventListener("DOMContentLoaded", function () {
     if (window.SufloI18n && SufloI18n.getLang() === "en") SufloI18n.start();
   });
   ```
3. Add a select under Settings › Support/About, labelled "Arayüz dili / Interface language":
   ```html
   <label for="set-ui-lang">Arayüz dili / Interface language</label>
   <select id="set-ui-lang"><option value="tr">Türkçe</option><option value="en">English</option></select>
   ```
   On change: `SufloI18n.setLang(value)` followed by `location.reload()`. Switching
   back to Turkish needs a reload because the DOM was rewritten. Initialise the select
   with `SufloI18n.getLang()`.
4. Add the `i18n/` folder to every packaging list. Today they copy only `js/`, so
   `i18n/en.js` would be missing from builds:
   - `tools/package.ps1` line 40:
     `$stageItems = @("CSXS", "css", "js", "jsx", "fonts", "emoji", "assets", "index.html", "README.md", "LICENSE")`
     → add `"i18n"`.
   - `tools/kurucu-yap.ps1` line 25: `$panelItems = @(...)` → add `"i18n"`.
   - `tools/install.ps1` line 27: the `foreach ($item in @(...))` list → add `"i18n"`.
   - `tools/install.sh` line 19: `for item in CSXS css js jsx fonts emoji index.html .debug; do`
     → add `i18n`.
   - `tools/verify-release.ps1`, `$required` list (lines 47–56) → add
     `'(^|/)i18n/en\.js$'` and `'(^|/)js/i18n\.js$'` so a release without them fails.
   - `tests/test-propack.js` line 95 only checks that `content` is never staged. No change needed.

   `CSXS/manifest.xml` needs no change: `index.html` is the main path, and relative
   scripts load from the extension root.

## Maintaining the dictionary

- Run `node tools/i18n-coverage.js`, or `node tools/i18n-coverage.js --all` to list
  every missing string. The command exits with code 1 if `index.html` coverage drops
  below 95%. `tests/test-i18n.js` requires at least 98% for `index.html` and at least
  95% for JS strings.
- `index.html` is checked for every text with letters. Strings that are meant to stay
  the same (brands, fonts, formats) go in `KEEP` in `en.js`. JS literals are found
  heuristically: Turkish letters or words, plus `+` concatenation chains, which are
  tested with sample values.
- When a string is built by concatenation, add a template key, for example
  `"{n} klip atlandı: {}": "{} clips skipped: {}"`. Prefer refactoring the code to
  `SufloI18n.tr()` with a whole sentence.
- Never use an English value that is also a Turkish key with a different translation.
  The idempotence test catches this.
- Prices: "749 TL" is shown as "749 TRY" for now.

## Known limits (refactor to `tr()` in v3.1)

- `window.confirm(...)` in `js/library-health.js` (lines 661 and 682) is not DOM, so it
  stays Turkish.
- Clipboard and file text stays Turkish: the Doctor report, the chapter list, the viral
  moments list, and the YouTube description (whose language follows the transcript).
- Sentences that `index.html` splits with inline `<b>`/`<a>`/`<code>` are translated
  fragment by fragment. Word order was adapted fragment by fragment, but these should
  become single `data-i18n` blocks: lines 164, 167, 317, 539, 659, 696, 762, 807,
  836, 880, 1119, 1159 and 1429.
- The translator collapses whitespace, so newlines inside a single text node are lost
  (for example `msg + "\nÇözüm: " + fix` from `bridge.js`).
