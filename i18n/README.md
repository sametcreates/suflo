# Suflo English UI (i18n)

Suflo is written in Turkish. The English UI is a runtime layer: it translates the
Turkish DOM in place, so existing code keeps working without changes. Since v3.1 the panel
loads it and offers it as **English (beta)**.

| File | Role |
| --- | --- |
| `i18n/en.js` | Turkish → English dictionary (`window.SufloI18nEN` / `module.exports`) |
| `js/i18n.js` | Translator (`window.SufloI18n` / `module.exports`) |
| `js/pricing.js` | Price + checkout single source (`window.SufloPricing`); en.js price patterns read it |
| `tools/i18n-coverage.js` | Finds Turkish UI strings in `index.html`, `js/*.js` and `jsx/host.jsx` (KS_err) that have no translation |
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

  A multi-line string tries the exact whole key first; otherwise it is translated line by
  line and every `\n` is kept (e.g. bridge.js's `msg + "\nÇözüm: " + fix`). An unknown
  string comes back unchanged.
- `apply(root)` walks text nodes and the attributes `title`, `placeholder`,
  `aria-label`, `alt`, `data-tip` and `label` (`<optgroup label>`). It skips the following:
  - `<script>`, `<style>`, `<textarea>` contents, `contenteditable` and `[data-i18n-skip]`
    (never entered: the bilingual language pickers use it);
  - input `value`s and `<option value>`. Only the option's text is translated;
  - user content: `#cap-segments`, `#cap-onizleme-metin`, `#cap-ch-list`,
    `#cap-vr-liste`, `#cap-br-liste`, `#cut-ranges`, `#cap-yt-aciklama`,
    `#cap-yt-basliklar`, `#cap-yt-etiket`, `#kanca-metin`, `#kanca-oneriler`,
    `#tc-words`, and the user's library file names in `#sfx-list` and `#emoji-assets-grid`. Inside these containers, only `BUTTON`/`LABEL`/`OPTION` text,
    button tooltips and input placeholders are translated. Transcript and caption
    words are never touched.
- `start()` applies the translation to `document.body` and attaches a `MutationObserver`
  for toasts, status lines and cards that appear later. There's no infinite loop because
  every English value is a fixed point: `translate(en) === en`, which the tests check.
  Nodes are written only when their value actually changes.
- `start()` also sets `<html lang="en">` (otherwise `text-transform: uppercase` renders
  "SETTİNGS"). Every node it changes is remembered in a `WeakMap`; `revert()` disconnects the
  observer and puts the original Turkish text and attributes back, so EN → TR needs no reload.
  `switchLang(l, { busy })` does start/revert, falls back to `location.reload()` only when
  `revert()` is unsupported and no job is running, and notifies `onChange` listeners.

## Language resolution (v3.1)

`resolveLang({ stored, legacyLS, settingsExisted, navLang })` is pure:

1. `settings.uiLang` (settings.json, via `configure({ load: K.settings, save, settingsExisted })`);
2. the legacy `localStorage["suflo.uiLang"]` (migrated into settings.json once);
3. `"tr"` when settings.json existed before this load, so every upgrader stays Turkish;
4. `null`: a fresh install, ask the user.

`navigator.language` is only a suggestion (`detect()`): in CEP it is Premiere's UI language,
and Premiere has no Turkish UI, so most Turkish installs report `en-US`. It only decides which
button of the first-run picker is highlighted. `getLang()` returns the resolved language or
`"tr"` while the choice is pending (`needsChoice()`); `tr(str)` translates only under `"en"`.

## Wiring (done in v3.1)

- `index.html` loads `js/pricing.js`, `i18n/en.js` and `js/i18n.js` right after
  `js/CSInterface.js`, before `js/bridge.js`.
- `KApp.init` calls `configure()` and, for `"en"`, `start()` first, before context polling
  and any dialog.
- Settings › Support has `#set-ui-lang` (Türkçe / English (beta)); it is disabled while a
  Whisper/ffmpeg process runs (`K.surecSayisi()`).
- A fresh install shows the bilingual step 0 (`#ia-dil`) in the first-run guide.
- `window.confirm` and `showOpenDialogEx` titles go through `uiMetni()` → `SufloI18n.tr`.
- With no saved caption preferences, the English UI defaults `#cap-lang` to Auto; when the
  language is unknown, captions.js falls back to the UI language instead of `"tr"`.
- Premiere bin and marker names (`Suflo Altyazi`, `Suflo Shorts`, `Suflo bolum`) are lookup
  keys in `jsx/host.jsx` and stay unchanged in both languages.
- Packaging (`package.ps1`, `kurucu-yap.ps1`, `install.ps1`, `install.sh`) copies `i18n/`;
  `verify-release.ps1` requires `i18n/en.js`, `js/i18n.js` and `js/pricing.js`.

## Maintaining the dictionary

- Run `node tools/i18n-coverage.js`, or `node tools/i18n-coverage.js --all` to list
  every missing string. The command exits with code 1 if `index.html` or `jsx/host.jsx`
  coverage drops below 95%. `tests/test-i18n.js` requires at least 98% for `index.html` and
  at least 95% for JS strings and for host.jsx `KS_err` messages.
- `index.html` is checked for every text with letters. Strings that are meant to stay
  the same (brands, fonts, formats) go in `KEEP` in `en.js`. JS literals are found
  heuristically: Turkish letters or words, plus `+` concatenation chains, which are
  tested with sample values.
- When a string is built by concatenation, add a template key, for example
  `"{n} klip atlandı: {}": "{} clips skipped: {}"`. Prefer refactoring the code to
  `SufloI18n.tr()` with a whole sentence.
- Never use an English value that is also a Turkish key with a different translation.
  The idempotence test catches this.
- Prices: every "749 TL" string is translated by one pattern family whose output is
  `SufloPricing.label("en")`. Until the USD variant exists that is "749 TRY (≈ $19)" and the
  button opens the TRY checkout; with `PRICING.en.url` set it becomes "$39". Turkish output is
  byte-identical to v3.0 (`tests/test-pricing.js`).
- From v3.1 on, every new Turkish UI string gets its English entry in the same change.

## Known limits

- Clipboard and file text stays Turkish: the Doctor report, the chapter list, the viral
  moments list, and the YouTube description (whose language follows the transcript).
- Sentences that `index.html` splits with inline `<b>`/`<a>`/`<code>` are translated
  fragment by fragment; word order was adapted per fragment.
- Code that builds UI text with `SufloI18n.tr()` while English is active keeps that English
  text after `revert()`; such places must re-render on `onChange` (captions.js does this for
  the style samples and the preview).
