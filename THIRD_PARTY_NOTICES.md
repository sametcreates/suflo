# Third-party notices / Üçüncü taraf bildirimleri

Suflo is MIT-licensed (see [LICENSE](LICENSE)). Some Suflo files contain portions adapted
from other open-source projects. Each one is listed below with its source, pinned commit,
license and the Suflo files that contain the adapted code. Every adapted file carries a
header naming the source, and every ported function is marked with a
`// <Project>: <original name>` comment.

Suflo MIT lisanslıdır ([LICENSE](LICENSE)). Bazı Suflo dosyaları başka açık kaynak
projelerden uyarlanmış bölümler içerir. Her biri aşağıda kaynağı, sabitlenmiş commit'i,
lisansı ve uyarlanan kodu içeren Suflo dosyalarıyla listelenmiştir.

## Adapted source code / Uyarlanan kaynak kod

### Raunen

- Project: Raunen — https://github.com/Zeyphers/raunen
- Pinned commit: `063df7b8453b79ca04331bebdeef2eaf5cfe2b99` (063df7b, "Raunen 1.1")
- License: MIT (SPDX: `MIT`)
- Copyright: `Copyright (c) 2026 Jacob Szczepaniak`
- Adapted in Suflo:
  - `js/whisper-words.js` — `tokensToWords()` (as `kelimelereAyir`: sub-word tokens merged
    into words, special tokens skipped, untimed tokens interpolated) and `splitByWords()`
    (as `kelimeGrupla`: N-word groups across segment boundaries, broken on pauses). Both
    ported from `com.raunen.premiere/js/lib/subtitles.js` to ES5 (CEF 74 / Node 12.3) and
    extended for Suflo (character-weighted interpolation, VAD time-base alignment, byte-level
    UTF-8 merge for older whisper.cpp builds, sentence-end flush). Raunen's DTW path was not
    ported: the DTW word timing in the same file (`dtwZamani`, `dtwUygula`: `t_dtw` word starts,
    next-word ends) and the engine flags in `js/whisper-args.js` (fast / accurate decoding,
    `-dtw <preset> -nfa`, offline `-tr`) are Suflo's own clean-room code (3.2 step 5; only the idea of
    exposing decoding flags came from Raunen).
  - `tests/test-whisper-words.js` exercises the adapted functions (test cases are Suflo's own).
  - `js/caption-text.js` — `NOISE_PATTERNS` and `isNoise()` (as `SES_ETIKETLERI` / `gurultuMu`:
    whole-cue `[BLANK_AUDIO]`, bracketed and parenthesised non-speech tags such as `[music]` or
    `(applause)`, and `*tag*`), ported from `com.raunen.premiere/js/lib/subtitles.js` to ES5 and
    extended for Suflo with a Turkish tag vocabulary (`müzik`, `alkış`, `gülüşme(ler)`, `kahkaha`,
    `sessizlik`, `gürültü`, `anlaşılmıyor`, `şarkı`, `nefes`, `öksürük`), Turkish-aware case folding,
    ♪/♫-only cues, `*tag*` only for vocabulary words (so Suflo's `*emphasis*` syntax survives),
    inline tag removal in mixed cues, word-list filtering and an optional "keep tags" mode.
    `tests/test-caption-text.js` covers it (test cases are Suflo's own). The silent-audio warning
    (`js/sessiz-ses.js`) takes only the idea of Raunen's peak-below-0.001 check; its code is Suflo's own.
  - `js/caption-layout.js` — `wrapText()` (as `dengeliSar`: balanced wrap to at most N lines, a 21/21
    split instead of 38/4, greedy fallback that never drops a word) and the merge, split and
    min/max-duration passes of `shapeSegments()` (as `kisaBirlestir`, `karakterleBol` and
    `zamanHijyeni`), ported from `com.raunen.premiere/js/lib/subtitles.js` to ES5 and extended for
    Suflo: exact balanced partition shared with the styled overlay's two-line split, the split pass
    keeps measured word timings and rebalances the greedy chunk count, merging never crosses a sentence
    end or the word limit, the duration pass follows Suflo's caption-quality `fixTiming` rules (never
    overlaps) and keeps words inside their caption. The word-to-line builder (`kelimedenSatirlar`,
    character + word limits with measured word timings) and the LCS word re-alignment after edits
    (`kelimeleriHizala`) are Suflo's own (ideas only from Animated Captions / TranscriptAI; no code).
    `tests/test-caption-layout.js` covers it (test cases are Suflo's own).

```
MIT License

Copyright (c) 2026 Jacob Szczepaniak

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### TranscriptAI (Animated Captions)

- Project: TranscriptAI / Animated Captions — https://github.com/aktugantika/animated-captions-transcriptai
- Pinned commit: `f1881ea74a228ad5e1a500a98b6753c6e94bf224` (f1881ea)
- License: MIT (SPDX: `MIT`)
- Copyright: `Copyright (c) 2026 Aktuğ Antika`
- Caption template used with the author's permission / Altyazı şablonu yazarın izniyle kullanılır:
  `assets/mogrt/altyazi-efekt-v1.mogrt` is TranscriptAI's `dist/source/dinamik_altyazi_motoru.mogrt`,
  unchanged (sha256 `32c2394de3f639fede180bc274e30166daa0375298af5c5f7ae3dfbf73989969`). The Suflo owner
  (Samet Kaygısız) confirmed the author's permission to bundle it (2026-10-12). Its After Effects project uses
  only Adobe built-ins (Drop Shadow, Slider Control) and references the system font Arial; no font, footage or
  third-party plug-in is embedded. `tools/verify-release.ps1` allows exactly this path and hash; any other
  `.mogrt` still stops a release.
- Adapted in Suflo:
  - `jsx/host.jsx` — `KS_placeCaptionJsonMogrt` and `KS_captionJsonParam` adapt the placement steps of
    `addMOGRTCaption()` in `host/index.jsx` (`importMGT`, `getMGTComponent`, `getParamForDisplayName("JSON_Input")`
    + `setValue` of the JSON array) to Suflo's style: direct placement on a free video track of the active sequence,
    read-back verification of `JSON_Input`, `Caption_Position` / Motion › Scale, trimming to the caption range, and
    removal on any failure. TranscriptAI's nested `CAPTIONS [V]` sequence, QE audio-track removal, audio-track
    locking and razor trimming were not adopted. The JSON contract
    (`[highlightRGB, textRGB, font, size, outline, shadow, box, textAnim, hlAnim, lines]`) is followed in
    `js/altyazi-efekt.js` (`sablonStili`) and `js/caption-mogrt-json.js` (Suflo's own code; data layout only).
- TranscriptAI's LICENSE (section 5) keeps MOGRT assets outside the MIT grant unless stated otherwise; the
  template is therefore bundled on the basis of the author's permission above, not the MIT License.
- Not shipped / Pakette yok: TranscriptAI's fonts, ffmpeg / ffprobe binaries, Python engine (`whisper_engine.py`)
  and `CSInterface.js`.

```
MIT License

Copyright (c) 2026 Aktuğ Antika

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Bundled assets / Pakete dahil varlıklar

- Fonts in `fonts/` (Anton, Archivo Black, Bebas Neue, Bungee, Lora, Montserrat; 3.3 additions below) are
  licensed under the SIL Open Font License 1.1 (SPDX: `OFL-1.1`). Each font's license text
  ships next to it as `fonts/OFL-<Family>.txt`. `Montserrat-Bold.ttf` and
  `Montserrat-Regular.ttf` are static instances (wght 700 / 400) of the bundled variable
  `Montserrat.ttf`, made with fontTools so libass can select them; same license.
- Suflo 3.3 adds seven curated caption families from google/fonts (https://github.com/google/fonts),
  all under the SIL Open Font License 1.1 (SPDX: `OFL-1.1`), none with a Reserved Font Name;
  each ships with its own `fonts/OFL-<Family>.txt`:
  - Bangers (`Bangers.ttf`), Copyright 2010 The Bangers Project Authors (`fonts/OFL-Bangers.txt`)
  - Chakra Petch (`ChakraPetch-Regular.ttf`, `ChakraPetch-Bold.ttf`), Copyright 2018 The Chakra Petch
    Project Authors (`fonts/OFL-ChakraPetch.txt`)
  - Exo 2 (`Exo2-Regular.ttf`, `Exo2-Bold.ttf`), Copyright 2013 The Exo 2 Project Authors (`fonts/OFL-Exo2.txt`)
  - Inter (`Inter-Regular.ttf`, `Inter-Bold.ttf`), Copyright 2020 The Inter Project Authors (`fonts/OFL-Inter.txt`)
  - Libre Caslon Display (`LibreCaslonDisplay.ttf`), Copyright 2012 The Libre Caslon Display Authors
    (`fonts/OFL-LibreCaslonDisplay.txt`)
  - Nunito (`Nunito-Regular.ttf`, `Nunito-Bold.ttf`), Copyright 2014 The Nunito Project Authors (`fonts/OFL-Nunito.txt`)
  - Poppins (`Poppins-Regular.ttf`, `Poppins-Bold.ttf`), Copyright 2020 The Poppins Project Authors (`fonts/OFL-Poppins.txt`)

  The Inter, Exo 2 and Nunito files are static instances (wght 400 / 700) of the upstream variable
  fonts, made with fontTools so libass can select them; the others are the upstream static files.
  Their internal family names are unchanged.
  Provenance (3.3 step 18): only the idea of a categorized font dropdown comes from Animated Captions /
  TranscriptAI (MIT); the picker (`js/style-share.js` `fontGruplari`, the `<optgroup>` lists in
  `index.html`) is Suflo's own clean-room code. No font files or code were taken from TranscriptAI; all of
  the files above come from google/fonts upstream (OFL-1.1).
  Kaynak: Animated Captions / TranscriptAI (MIT) yalnız fikir (kategorili font listesi); font dosyaları
  google/fonts upstream (OFL-1.1), TranscriptAI'dan dosya / kod alınmadı.
- Emoji images in `emoji/` come from Twemoji (https://github.com/jdecked/twemoji),
  Copyright Twitter, Inc and other contributors, licensed under CC-BY 4.0
  (SPDX: `CC-BY-4.0`); see `emoji/LISANS.txt`.
- `js/CSInterface.js` is Suflo's own minimal wrapper around Adobe's CEP runtime; Adobe CEP
  itself is provided by the host application under Adobe's terms.

## Runtime downloads (not bundled) / Çalışırken indirilenler (pakette yok)

Suflo downloads these on the user's computer when the user installs the local engine or
ffmpeg, or first uses the YouTube downloader. They are not part of the Suflo package and keep
their own licenses; they are listed here for transparency.

- whisper.cpp — https://github.com/ggml-org/whisper.cpp, release `v1.9.1`
  (commit `f049fff95a089aa9969deb009cdd4892b3e74916`), MIT (SPDX: `MIT`),
  Copyright (c) 2023-2026 The ggml authors. On macOS it is installed through Homebrew
  (`whisper-cpp`). Suflo only reads its JSON output (`-ojf`); no whisper.cpp source code is
  included in Suflo. The test fixture `tests/fixtures/whisper-cli-v1.9.1-yardim.txt` is the
  unmodified `whisper-cli -h` output of that release (used to test flag detection; not shipped).
- Whisper models in ggml format (https://huggingface.co/ggerganov/whisper.cpp) — OpenAI
  Whisper weights, MIT (SPDX: `MIT`).
- Silero VAD in ggml format (`ggml-silero-v5.1.2.bin`, https://huggingface.co/ggml-org/whisper-vad)
  — Silero VAD, MIT (SPDX: `MIT`).
- ffmpeg builds — each build keeps the license its provider publishes:
  - BtbN FFmpeg-Builds `win64-lgpl` (https://github.com/BtbN/FFmpeg-Builds): LGPL
    (SPDX: `LGPL-3.0-or-later`), Suflo's first choice on Windows;
  - gyan.dev `release-essentials` (https://www.gyan.dev/ffmpeg/builds/): GPL
    (SPDX: `GPL-3.0-or-later`), Windows fallback;
  - martin-riedl.de macOS builds (https://ffmpeg.martin-riedl.de/) and evermeet.cx
    (https://evermeet.cx/ffmpeg/, Intel Macs only): GPL builds of FFmpeg.
- yt-dlp — https://github.com/yt-dlp/yt-dlp, The Unlicense (SPDX: `Unlicense`), public domain.
  Downloaded only when the user first uses the YouTube downloader (3.3): the latest release's
  platform executable (`yt-dlp.exe` on Windows, `yt-dlp_arm64.exe` on ARM Windows when listed,
  `yt-dlp_macos` on macOS) together with that same release's `SHA2-256SUMS`; the executable is
  run only after its SHA-256 matches. Suflo runs it as a separate program with an argument
  list and includes none of its code. The official yt-dlp executables bundle Python and other
  third-party components under their own licenses, as documented in the yt-dlp repository. The test
  fixture `tests/fixtures/yt-dlp-2026.08.19-SHA2-256SUMS.txt` is that release's unmodified
  checksum list (used to test parsing; not shipped).
