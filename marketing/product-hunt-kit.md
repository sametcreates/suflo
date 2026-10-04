# Suflo — Product Hunt & global launch kit (English)

Everything here matches the panel and suflo.app/en as of v3.1. Price wording follows `js/pricing.js`:
until the USD checkout exists, say **"749 TRY (≈ $19) one-time"**, never "$19", because the
checkout charges lira. When the USD variant goes live (see `marketing/v4-kurucu-yapilacaklar.md` §6),
replace it with **"$39 one-time (launch price, regular $59)"** everywhere below.

Don't name other creators or brands as style names (no "MrBeast style", "Hormozi style", "CapCut look").
Our style names are Creator Punch, Clean Pill, Bold Box, Neon, Typewriter, Karaoke Fill… Competitors may
be named only in factual comparisons, with the trademark note.

## Product Hunt listing

**Name:** Suflo

**Tagline (≤60):** Free local auto captions + AI editing inside Premiere Pro

**Topics:** Video, Artificial Intelligence, Open Source, Productivity

**Description (≤260):**
Suflo is a Premiere Pro panel. Free: local Whisper captions in 99 languages, no uploads, no account.
Pro, one price once: silence cuts, filler removal, viral Shorts with an explained 0–100 score, and
animated caption styles. No subscription, no credits.

**Links:** https://suflo.app/en/ · https://github.com/sametcreates/suflo

**Pricing field:** Free + one-time paid option

## Maker's first comment

Hi Product Hunt! I'm Samet, a solo developer and video editor from Türkiye.

Premiere's built-in Speech to Text didn't support my language, and the web tools I tried wanted me to
upload every video and pay per minute. So I built Suflo: a panel that runs Whisper on your own computer,
inside Premiere.

What's free (MIT, forever):
- Captions in 99 languages, offline after a one-time engine download
- A caption editor with draft recovery, glossary and word-by-word timing
- SRT / VTT / TXT export or straight onto a Premiere caption track

What Pro adds (one payment, no subscription, no credits):
- Auto Cut and text-based cut: silences, "um/uh", repeats and long pauses, click a word to cut it
- Viral moments: finds the strongest 15–90 s clips with a 0–100 score and a one-line reason, then
  builds 9:16 Shorts sequences with Auto Reframe
- 12 animated caption styles rendered as a transparent layer, hook titles, transitions, auto zoom,
  enhance audio, translation to 12 languages
- Every code-based Pro tool (Auto Cut, text-based cut, viral moments, zoom, transitions, enhance audio, styled captions, translation…) gives you 3 free tries on your own footage first; content libraries (MOGRTs, SFX, Motion BGs, presets) are Pro-only

The English interface is brand new and labelled beta. If you see a Turkish string, tell me and I'll fix it
the same day. I'd love feedback on accuracy in your language and on the Shorts picker.

## Gallery (1270×760, in this order)

1. Hero: panel next to a Premiere timeline, captions on the program monitor. Text: "Local captions in 99 languages. Free."
2. Caption editor with the quality score and glossary.
3. Text-based cut: words struck through, "Listen" button.
4. Viral moments list with scores and reasons, plus the generated 9:16 sequences in the Suflo Shorts bin.
5. Suflo Styles grid (Creator Punch, Clean Pill, Bold Box, Neon…) over a vertical clip.
6. Price card: "Free core · Pro one-time, no subscription, no credits".

**Demo video (30–60 s, English UI, no music needed):** pick English (beta) on first run → generate
captions on a 2-minute talking-head clip → fix one name with the glossary → Auto Cut → Viral moments →
Create Shorts → apply a style. End card: suflo.app/en.

## Short posts

**X / Threads (≤280):**
I built a free Premiere Pro panel that captions your videos locally with Whisper. 99 languages, no
uploads, no account. Pro adds silence cuts, viral Shorts and animated captions for one price, once.
English UI just landed (beta) → suflo.app/en

**Reddit (r/premiere, r/editors — follow each sub's self-promo rules; post as a question/feedback thread):**
Title: I made a free, local auto-caption panel for Premiere (Whisper, 99 languages). Feedback welcome
Body: Premiere's Speech to Text didn't cover my language, so I built a panel that runs whisper.cpp on your
machine. Free and MIT: captions, editor, SRT/VTT export, caption track. There's an optional one-time Pro
tier (silence/filler cuts, Shorts finder, animated styles), but the caption core will stay free. The English
UI is new and in beta. What would make this useful in your workflow? Download: github.com/sametcreates/suflo

**Hacker News (Show HN):**
Show HN: Suflo – local Whisper captions inside Adobe Premiere (open source)

## FAQ answers to keep consistent

- **Is it really free?** The caption core is MIT and free forever. Pro is optional.
- **Does my video leave my computer?** Not with the local engine. AI features send only caption text,
  with the user's own free Groq key.
- **Why lira at checkout?** Store is in Türkiye; the bank converts it (about $19). USD checkout is planned.
- **Refunds / trial?** Use the free tier and the 3 free tries of every code-based Pro tool before buying (content libraries are Pro-only).
- **Supported versions?** Premiere Pro 2020 (14.4) and newer, Windows and macOS.

Trademark note for comparison posts: AutoCut, FireCut, OpusClip and Adobe Premiere are trademarks of their
respective owners, named only to identify and compare products. Suflo is not affiliated with or endorsed by them.
