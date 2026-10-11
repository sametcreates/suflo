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
    ported.
  - `tests/test-whisper-words.js` exercises the adapted functions (test cases are Suflo's own).

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

## Bundled assets / Pakete dahil varlıklar

- Fonts in `fonts/` (Anton, Archivo Black, Bebas Neue, Bungee, Lora, Montserrat) are
  licensed under the SIL Open Font License 1.1 (SPDX: `OFL-1.1`). Each font's license text
  ships next to it as `fonts/OFL-<Family>.txt`.
- Emoji images in `emoji/` come from Twemoji (https://github.com/jdecked/twemoji),
  Copyright Twitter, Inc and other contributors, licensed under CC-BY 4.0
  (SPDX: `CC-BY-4.0`); see `emoji/LISANS.txt`.
- `js/CSInterface.js` is Suflo's own minimal wrapper around Adobe's CEP runtime; Adobe CEP
  itself is provided by the host application under Adobe's terms.

## Runtime downloads (not bundled) / Çalışırken indirilenler (pakette yok)

Suflo downloads these on the user's computer when the user installs the local engine or
ffmpeg. They are not part of the Suflo package and keep their own licenses; they are
listed here for transparency.

- whisper.cpp — https://github.com/ggml-org/whisper.cpp, release `v1.9.1`
  (commit `f049fff95a089aa9969deb009cdd4892b3e74916`), MIT (SPDX: `MIT`),
  Copyright (c) 2023-2026 The ggml authors. On macOS it is installed through Homebrew
  (`whisper-cpp`). Suflo only reads its JSON output (`-ojf`); no whisper.cpp source code is
  included in Suflo.
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
