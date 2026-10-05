# Suflo v4 yol haritası (rakip araştırması sonucu)

**Suflo 4.0 'Tek Tık', shipped in two drops: 3.1 'Kapı' (ranks 1-5: onboarding, explained viral score, trial credits, invite loop, English beta) and 4.0 'Tek Tık' (ranks 6-9: retake cleanup, brand kit, one-click Shorts package, podcast mode)**

Suflo 4.0 turns a raw Turkish talking-head recording into a clean cut and N finished, branded Shorts inside Premiere. It needs no credits, no upload and no subscription. Every user also gets ways to bring in the next user: trial credits, invite codes, share codes, an opt-in credit line and an English UI. Premiere's speech-to-text has no Turkish support, so Suflo owns that gap.

## İnşa sırası

### 1. İlk altyazın 2 dakikada / First caption in 2 minutes (first-run onboarding, sample clip, AI key wizard)
- Katman: free · Tahmini efor: 4.5 gün · Premiere'de elle test: evet
- Neden: This sets the size of everything that comes after it. Today about 1,229 downloads become about 75 Pro buyers (~6%). A new install gets the 3.0 what's-new dialog (app.js:1192), with no guided first caption and no sample clip. AI buttons only fail with a toast after they are clicked. Before the first caption the user downloads ffmpeg (141 MB on Windows), the model and sometimes cuBLAS. OpusClip and Submagic get to value in 1-2 minutes. All three versions of this item in the shortlist were checked as feasible. Every Premiere call except the probed createNewSequenceFromClips is already in use, and that call has a fallback.

### 2. Viral Skor 2.0 / Explained viral score: 0-100 with reasons, genre/focus, sentence-safe edges, ±1 sentence
- Katman: pro (highlights; trial credits apply) · Tahmini efor: 2 gün · Premiere'de elle test: evet
- Neden: This is the best value-to-effort item in the plan: about 2 days, high confidence, no host change. OpusClip, AutoCut, Phantom and claude-shorts all show sub-scores and reasons. The category's top complaint, cited for OpusClip, Klap and Vizard, is clips that start or end mid-thought; testers discard about 40% of OpusClip clips. Suflo shows one 1-10 number. Rank 8, the Shorts package, depends on this.

### 3. Pro'yu dene: her araca 3 kalıcı hak / Pro trial credits that never expire (+ small watermark on trial renders, Pro table copy fixes)
- Katman: free → pro conversion · Tahmini efor: 3.5 gün · Premiere'de elle test: evet
- Neden: Suflo has no trial and no refunds, and the upsell 'demo' button only opens the website. CaptionX (5 generations that never expire), PremiereCopilot (daily quotas), REDitors and Adobe Stock's watermarked comps all let users try on their own footage. Spending a credit only on success removes the main purchase objection, and watermarked trial renders posted to Reels carry suflo.app. Feasibility review: medium-high. The core is panel JS on existing code paths; KS_removeOverlay and the arm-then-re-invoke flow need a manual Premiere check.

### 4. Davet et, kazan / Invite codes, share card and opt-in 'Made with Suflo' credit (lite: Pro codes + dormant server)
- Katman: growth infra (share link free; personal discount codes and reward packs Pro) · Tahmini efor: 5 gün · Premiere'de elle test: evet
- Neden: Suflo's only built-in way to spread is a GitHub star bar, which works against the goal of every user recommending it. Dropbox's give/get referral raised signups by about 60%, AutoCut gives €10 in-app credit per referral, Submagic's affiliates drive about 20% of revenue, and Calendly and Typeform grow through 'Powered by' links. The full version failed feasibility: Lemon Squeezy cannot create license keys, free users have no identity, and a new manifest category breaks v3.0 clients. This cut-down version uses only the SDK-verified discount and redemption APIs and ships dormant until the owner turns it on.

### 5. English (beta) arayüz + global satış / English UI (beta) + USD pricing module + trademark-safe names + English site
- Katman: free (growth) · Tahmini efor: 7 gün · Premiere'de elle test: evet
- Neden: The English layer already exists and is tested (667/667 HTML strings, 1010/1012 JS strings) but is not loaded. Most competitors sell in English, while every comparable lifetime license costs $99-399 and Suflo's 749 TRY is about $19. Turning it on opens a much larger market at a higher price, and it is required for Product Hunt, Reddit and later the Creative Cloud Marketplace. Feasibility review: medium-high for the panel and site work. The README wiring as written would switch Turkish users to English, so the language resolution below corrects that.

### 6. Tek Tık Temizlik / One-click cleanup: retakes, false starts, take policy, script mode, one review drawer, shared transcript cache
- Katman: pro (textcut; trial credits apply). The filler stoplist setting is visible to everyone but only affects Konuşmadan kes · Tahmini efor: 6 gün · Premiere'de elle test: evet
- Neden: Retake removal is the most-cited new feature of 2026: AutoCut Repeat 2.0, EditBuddy take policy, FireCut half-starts, TimeBolt, Cutback, BadWords and SmartCut all ship it. Users criticise AutoCut for missing false starts. Suflo only catches word-level 'ben ben' repeats and re-transcribes the clip every time. Talking-head creators, the largest Turkish creator segment, save the most time here, and foreign tools handle Turkish poorly. All three shortlist versions passed feasibility with no new host API; this item merges them. Detection rules were tightened after a prototype found false positives.

### 7. Marka Kiti + stil ince ayarı + paylaşılabilir stil kodları / Brand kit, visible style fine-tuning, shareable style codes, Shorts safe-zone placement
- Katman: free to edit, preview, share and import; Pro to apply to the timeline (overlay, or a trial credit with watermark) · Tahmini efor: 4.5 gün · Premiere'de elle test: evet
- Neden: Brand kits are standard at OpusClip, Vizard, Submagic and VEED, and shared presets spread products (AutoCut has 1000+ community presets; CapCut pays template creators). Suflo already passes style overrides to the engine, but the fine-tune block is hidden in the markup. Each shared code is a credited ad for Suflo. This item is also a prerequisite for rank 8: the package applies the brand kit and logo. Feasibility review: medium-high. The logo composite was verified against real ffmpeg, and override injection was confirmed as a real risk.

### 8. Tek Tık Shorts Paketi / One-click Shorts package: chosen moments → 9:16 sequences → branded captions, hook, progress bar, CTA, logo → posting pack
- Katman: pro (new feature key shortsPaket; not trial-able) · Tahmini efor: 8 gün · Premiere'de elle test: evet
- Neden: This is the flagship demo: '1 video → 5 bitmiş Shorts, Premiere'in içinde, kredi yok'. It covers what OpusClip ($15-29/mo), Vizard, Klap and Submagic plus Magic Clips ($19+$19) do, and GoatEdit's 5-clip output. Suflo already has every piece (viral moments, KS_makeShorts, Shorts transcripts, the style engine, hook titles, youtube-meta), but the steps are run by hand one at a time. Feasibility review: medium. Each primitive has been checked in Premiere. The chained multi-sequence run has not, so the plan uses two phases, resume support and a sequence-ID guard.

### 9. Podcast Modu: mikrofona göre otomatik kamera geçişi / Podcast multicam auto-switch from per-mic audio + speaker-coloured captions
- Katman: pro (new feature key multicam) · Tahmini efor: 7 gün · Premiere'de elle test: evet
- Neden: This is the biggest feature gap against competitors. AutoPod ($29/mo), Phantom Wraith ($118), WizCut ($119), EditBuddy, FireCut, AutoCut Podcast, PremiereCopilot, KreateFlo and Black Hat all have it, and Turkish video podcasts are growing fast. Feasibility review: medium-high. Every Premiere API it needs (QE razor, trackItem.disabled, clone, per-track audio export) already ships in host.jsx. The one unverified behaviour, whether disabling a linked video clip also disables its audio, gets a runtime guard. It ranks last because it takes 7 days and serves a narrower segment than ranks 6 and 8.

## Reddedilenler

- **Duplicate shortlist entries: retake removal (3 entries), Shorts package (3), onboarding (3), referral (2), and the explained viral score inside the Shorts specs**: Merged into ranks 6, 8, 1, 4 and 2. For each, I kept the feasibility-corrected plan. Examples: no reuse of rawSegments, the tighter retake rules with adjacency, two-phase Shorts runs, and a code format without hyphens.
- **Free-user 7-day Pro keys as referral rewards**: The Lemon Squeezy API cannot create license keys. The SDK only gets, lists and patches them. The only workaround is a $0 checkout on a separate variant, which is unverified and would hand out the full Pro library, which stays on disk after the key expires.
- **Referral codes and reward packs for free users**: Free users have no identity. Machine IDs are self-generated, so a code per machine ID is effectively a public 15% discount, and anyone could flood the store with discount objects. Rewards are also delivered behind validate_license. Free users get an attributed share link instead, and rewards for those referrals are handled manually.
- **A new 'reward' category in the main Pro manifest**: pro-sync.js safeItem throws on unknown path prefixes, which would abort every v3.0 sync. Putting per-user files into files[] would also change the release directories, and Premiere locks imported SFX. It is replaced by an append-only extras channel, served only to clients ≥3.1.0.
- **Media Encoder queue export inside the Shorts package**: An agent cannot produce a valid bundled H.264 1080x1920 .epr without AME. AME may not be installed, and the step can't be tested headless. Revisit in 4.x after a manual check that system presets can be found.
- **Centre-crop fallback and Suflo-owned 9:16 layouts (split, screenshare, gaming facecam)**: Sequence.setSettings and the frame-size changes were never verified in this codebase. Layouts are the biggest remaining Shorts gap compared with OpusClip and Klap, so they are the first candidate for the next release once a spike proves the API.
- **Single-track diarization multicam (Mode B) and diarization-based speaker captions**: It needs sherpa-onnx native binaries per OS and architecture, model distribution, and a review of pyannote's gated terms. Ship Mode A (per-mic) now and market Mode B as the next step, since it is WizCut's advantage over AutoPod.
- **'Suflo'ya söyle' natural-language command bar (Groq JSON plan of Suflo actions)**: It has not been checked for feasibility. It is only safe once the review drawer exists, and ExtendScript has no undo grouping. UXP's executeTransaction would give a one-step undo, so build it on the UXP port.
- **Local MCP bridge for Claude Desktop / Claude Code**: Power-user niche. Open-source Premiere MCPs with 283-1,027 tools already exist, there is no revenue path, and it adds support load. Reconsider as an open-source distribution play after UXP.
- **Audio wave: keyframe auto-ducking, two-pass loudnorm with a platform loudness report card, room-tone fill, arnndn denoise with strength slider, snap-cuts-to-beat**: Cheap with the existing ffmpeg and keyframe primitives and well supported by the research, but none of it was feasibility-checked this round. Premiere 26.5 already ships Dynamic Ducking and Enhance Speech. These are the top candidates for 4.1.
- **Profanity bleep/mute and clean + explicit versions**: Cheap and offered by Caption Plug, CaptionX and Choppity, but it was not checked this round, and Premiere 26 added one-click word censoring. Ship in 4.1 with an exact-word Turkish and English list (whole-word matching so words like 'sikke' are not hit) and bleeps on their own track.
- **'Yayına hazır mı?' ready-to-post score / Kurgu Karnesi, and reference-style cloning ('bu videodaki gibi kurgula')**: Few competitors offer these and they would be easy to share, but they were not checked this round. Plan them for 4.1+ on top of the ebur128, scene and beat analysis code.
- **Animated emoji captions and depth captions (text behind the subject)**: libass cannot draw colour emoji, and licenses for animated emoji sets have to be checked. Depth captions need a segmentation model or Premiere Object Mask through UXP.
- **Lip-sync dubbing, AI Foley, local voice cloning**: Needs 8-18 GB of VRAM. Many weights are non-commercial (Wav2Lip, MMAudio, XTTS-v2, F5-TTS). Handling it in the cloud with the user's own ElevenLabs or HeyGen key is a later option.
- **Social publishing, scheduling and YouTube upload from the panel**: OAuth flows are heavy and fragile in CEP 10 / Chromium 74. The Shorts posting pack (TXT/CSV with title, description and hashtags per platform) covers most of the value.
- **Watermark on free core outputs (SRT/VTT/native captions)**: The clean, unlimited free core is what users trust and why they recommend Suflo. Watermarks apply only to trial renders of Pro overlays and hook titles.
- **AppSumo lifetime deal**: Suflo is already a one-time purchase. AppSumo would add a deep discount, a large revenue share, deal-seeker buyers and support load. A self-run, time-boxed 'Kurucu üye' launch price for the international beta works better.
- **Hardening Pro gating (obfuscation, server checks for code-only features)**: The source is MIT, and buyers are editors rather than crackers. Server-gated content is the real paywall. The effort is better spent on value and on the trial and referral loops.
- **Reusing the editor transcript (KCaptions.rawSegments) for Konuşmadan kes**: Rejected in review: the segments are caption lines, they include user edits and emphasis, they were transcribed without the filler prompt, and they can be stale after cuts. Replaced by the source-relative transcript cache in rank 6.

## Kod dışı büyüme adımları

- Before rank 1 ships, record the 15 s Turkish talking-head sample for onboarding: your own face and voice, at most 1.5 MB, with rights you own. Then record three 30-60 s screen captures to use as ads: '3 take → 1 temiz kesim', '1 uzun video → 5 bitmiş Shorts' and '2 dakikada ilk Türkçe altyazı'.
- Lemon Squeezy setup:
- Under product 1302656, create a USD variant at $39 launch / $59 regular for the English beta.
- Create a test-mode API key and put it only in private/pro-v1/config.php.
- Make one end-to-end test purchase with ?d=CODE before setting referral_enabled.
- Confirm that Lemon Squeezy affiliate payouts work for Turkish residents (PayPal has been unavailable since 2016) before enabling the native affiliate program at 30-35% of the sale.
- Creator seeding: give 30-50 Turkish editing YouTubers, TikTok/Reels editors and university film/iletişim clubs a free Pro license and a named coupon (e.g. EDITORALI15). Pay 30% per sale monthly by IBAN and ask each for one tutorial. Run a 'Suflo Elçisi' list: a free license for anyone with 2,000+ followers who posts one video.
- Pricing:
- Give all ~75 existing buyers 4.0 free. They are the evangelists.
- Pre-announce any price change for new buyers with a date (e.g. 'Fiyat 4.0 ile 999 TL oluyor') instead of a surprise. Submagic's price rise stalled its growth for about 7 months.
- Add a gift license ('Hediye et'), 2 activations per license (desktop + laptop) and a 3/5-seat agency pack.
- Once trial credits are live, replace 'no refund' with a 7-day refund for first-time buyers. That removes the main objection and makes it safe for people to recommend Suflo.
- Turkish SEO pages in docs/blog:
- 'Premiere Türkçe altyazı otomatik' (Premiere's speech-to-text doesn't support Turkish)
- 'AutoCut alternatifi'
- 'FireCut Türkçe'
- 'OpusClip alternatifi Premiere içinde'
- 'CapCut altyazı alternatifi' (CapCut moved auto-captions behind Pro)
- 'Tekrar çekimleri otomatik silme'
- 'Podcast kamera geçişi otomatik'
- 'Crack yerine ücretsiz Suflo'
Use 'Adobe Premiere' naming; Adobe dropped 'Pro' in 26.0.
- Messaging to use everywhere:
- 'Premiere Türkçe bilmiyor, Suflo biliyor'
- 'Kredi yok, yükleme yok, abonelik yok, filigran yok'
- 'Rakiplerin bir aylık fiyatına ömür boyu'
- 'Videon bilgisayarından çıkmaz'
Add a TRY comparison table of yearly FireCut, OpusClip, AutoCut and Submagic costs against 749 TL to pro.html.
- Product Hunt after the English beta ships:
- Self-hunt at 12:01 AM PT on a weekday.
- Post a first comment explaining why Suflo exists, with real screenshots and the '1 video → 5 Shorts' demo.
- Don't ask for upvotes.
- Cross-post to r/premiere, r/editors and r/VideoEditing.
- Relaunch about 6 months later with 4.x.
- Community:
- Start a Pro-only WhatsApp/Discord, 'Suflo Güç Kullanıcıları', with direct founder access and early betas (modelled on AutoCut's Power User Program).
- Publish a public roadmap with voting.
- Repost customers' Shorts with credit on @sametcreates.
- Run a weekly 'haftanın stili' post using the new style share codes.
- Pitch Turkish tech and creator curators (e.g. Selahattin Ünlü's harika-github-repolari list, Turkish creator newsletters and Telegram channels) with free Pro and a referral code.
- Before selling internationally, verify redistribution rights for the caption MOGRTs derived from the Captioneer collection and for any third-party-named packs. Remove CapCut, Hormozi and MrBeast names from the site, blog and marketing copy.
- Attribution: give every channel (each creator, Product Hunt, Instagram, YouTube) its own Lemon Squeezy discount code. Each month, read redemptions per code alongside Cloudflare analytics and the 'Bizi nereden duydun?' answers. Baseline: 1,229 downloads → ~75 buyers (~6%).
- Prepare a Creative Cloud Marketplace listing for the future UXP build: 10% fee, FastSpring as merchant of record, EU DSA trader info, about a 10-business-day review. Keep selling direct in TRY in Turkey.
- Website: add an interactive caption-style playground (pick a style, type Turkish text, watch it animate), a before/after silence-cut player and Meta/TikTok pixels. Put the '2 dakikada ilk altyazı' video above the fold.

## Stratejik riskler

- CEP SUNSET (the most urgent risk):
- Adobe declared CEP superseded in Premiere 25.6 (Nov 2025) and plans to remove it after about one calendar year, i.e. around Nov 2026, probably near Premiere 27.0.
- The ExtendScript commitment ran only through September 2026, which has already passed.
- Suflo is 100% CEP + ExtendScript + Node.
- Actions, in parallel with this release:
  1. Test the 3.x panel on the Premiere 27.0 beta now.
  2. Add a Doctor check that flags 'CEP disabled'.
  3. Run a 5-day UXP spike: a 'Suflo Engine' local companion (loopback WebSocket, reusing the Node whisper/ffmpeg code) plus a minimal UXP panel.
- UXP has no razor API and cannot write captions, and its UI has no CSS animations and no drag-and-drop. Expect a UI rewrite, a tiny CEP or QE companion for razor, and Suflo's overlay approach for captions.
- All new logic in this plan is written as host-agnostic pure UMD modules, so it will port.
- ADOBE NATIVE FEATURES:
- Premiere 26.x already ships text-based filler and pause deletion (18 languages), Create Captions and single-word captions, Translate Captions, Enhance Speech, Dynamic Ducking, Paper Edit, Generate Music, the AI Assistant beta and free Premiere on iPhone.
- Suflo's moat is Turkish quality (Premiere's speech-to-text doesn't support Turkish), animated styles, short-form packaging and retake logic.
- If Adobe adds Turkish speech-to-text, the free tier loses its edge. Keep Pro value in packaging, retakes and podcast work, not in raw transcription.
- COMMODITIZATION OF FREE CAPTIONS:
- FreeCaption (free and MIT, built by a Turkish developer, Whisper large-v3 + WhisperX), AutoSubs, OpenCut (55 styles) and Mister Horse (130+ free styles) give away what Suflo's free tier does.
- Caption Plug ($14.99 one-time) nearly clones the caption core.
- The free tier has to win on onboarding, the editor, Turkish polish and support. Pro has to be sold as 'finished Shorts and clean cuts', not as captions.
- AI PROVIDER DEPENDENCY:
- Groq models are hard-coded (llama-3.3-70b-versatile, whisper-large-v3-turbo) and Groq deprecates models.
- Free-tier rate limits will be hit by Shorts packages and retake LLM passes.
- Mitigation: backoff and non-AI fallbacks (built into ranks 6 and 8). Soon after, make model IDs configurable in settings with a remote default list.
- LEMON SQUEEZY API KEY ON SHARED HOSTING:
- The referral server needs a full-store-scope key on Hostinger PHP. A leak would allow store-wide discounts and refunds.
- Keep it dormant until needed, keep it in private config only, rotate it on any suspicion, never ship it in the client (verify-release asserts this), and consider moving it later to a small serverless worker.
- Also, Lemon Squeezy is now owned by Stripe, so its affiliate and payout terms may change.
- CLIENT-SIDE GATING:
- Code-only Pro features and trial credits can be bypassed by anyone who edits the JS (MIT source).
- That is acceptable while server-gated content (MOGRT, SFX, presets, reward packs) remains the real paywall.
- Do not let new flagship value live only in public code without matching content or server value.
- PREMIERE STABILITY UNDER BATCH OPERATIONS:
- evalScript replies get lost in long chains.
- The 27.0 beta reportedly crashes under rapid timeline mutations.
- Premiere lags after 300-500 razor cuts.
- Ranks 6, 8 and 9 use chunking, resumable jobs, sequence-ID guards, clone-first and cut caps. Their test matrix must include 14.4, 24.x, 25.x, 26.3 and the 27 beta on Windows and Mac.
- CURRENCY AND ARBITRAGE:
- The TRY price loses value as the lira falls, and international buyers can use the cheaper TRY checkout.
- Index the TRY price quarterly with pre-announced dates. Accept some arbitrage rather than adding geo-blocking friction.
- TRADEMARK AND CONTENT PROVENANCE:
- Style names using CapCut, Hormozi and MrBeast, plus caption templates described as the 'Captioneer collection', become a legal risk once Suflo sells abroad or lists on Adobe's Marketplace.
- Rename them (rank 5) and audit content rights first.
- EXECUTION BANDWIDTH:
- This plan is about 47.5 dev-days across 9 items for a solo founder working with agents.
- The bottleneck is manual Premiere testing and support, not code.
- Ship in two drops (3.1: ranks 1-5; 4.0: ranks 6-9), use a fixed manual test checklist per drop, and let onboarding and Doctor absorb support DMs.
- MEASUREMENT BLIND SPOT:
- There is no in-panel analytics, so activation and feature adoption can't be measured.
- Per-channel discount codes and the activation question are the only signals.
- Consider opt-in anonymous feature counters in 4.1, made opt-in to protect the 'local, private' positioning.

## Rakip tablosu

| Ürün | Fiyat | Öne çıkanlar | Suflo cevabı |
|---|---|---|---|
| FireCut | Starter ~$19/mo; Pro $34/mo (~$20 billed yearly); Max $44/mo ($34 billed yearly). 7-day trial, no Premiere free tier, 3-day refund on monthly plans | Magic Cut (raw footage to first draft), Advanced silence review, repetition and half-start removal, zoom cuts, podcast switching, chapters, captions in 50+ languages, 'edit to script' | Tek Tık Temizlik (Turkish-aware retakes, script mode, one review drawer, clone-first) plus Shorts Paketi and Podcast Modu, for a one-time 749 TL with unlimited local processing. FireCut's AI is English-centric; Suflo's is Turkish-first. |
| AutoCut | Basic €9.90/mo; AI €19.80/mo (€14.90/mo billed yearly); 14-day trial; affiliate 20% lifetime; €10 in-app referral credit | 10 tools including Repeat 2.0 (reference script, review editor), AutoViral, AutoResize, AutoPodcast, a library of 1000+ community caption presets, Premiere + Resolve | Retake detection that also catches abandoned false starts (AutoCut is criticised for missing them), an explained viral score with sentence-safe edges, shareable style codes (a community loop), and trial credits that never expire. Resolve is not covered; interchange export is a later item. |
| EditBuddy | Pro $19/mo (400 AI minutes), Max $39/mo (1,000 AI minutes); 7-day trial | One combined review list (silences, retakes, fillers), take policy (Keep Last/Longest/Best), automatic '- Backup' sequence, podcast for 8 speakers with sync-offset detection | The same review-drawer pattern and take policy, plus Turkish fillers and İ/ı handling. No AI minutes. The original sequence stays untouched as the backup (clone-first). |
| PremiereCopilot | Free with daily quotas (2-5 runs per tool); Pro+ $7.99/mo; Studio $63/mo for 4 seats; some lifetime bundles | Copilot text-to-edit with a plan step (Claude/GPT/Gemini), Smart Virals with auto-reframe, chapters as MoGRTs, Vibe Motion, GenAI B-roll, 'better than a crack' SEO | Trial credits that never expire, a free core with no daily cap, Turkish accuracy, and an explained viral score with clean edges. A chat command bar is deferred to the UXP port, where one-step undo exists. |
| Phantom Editor | Free tier; Pro ~$19-24/mo; standalone lifetime tools (Wraith multicam $118) | Viral Spectre (Gemini), Wraith multicam for 8 angles, Phantom Chat, choice of transcription engines, utilities (folder watcher, downloader) | Podcast Modu and Shorts Paketi included in one 749 TL license, plus a Turkish-first editor and captions. |
| AutoPod | $29/mo per computer; 30-day trial | Industry-standard per-mic multicam switching, jump cuts, Social Clip Creator (formatting only) | Podcast Modu uses the same per-mic signal, plus a bleed-dominance score, wide shot on crosstalk, a live density preview and an editable clone, for a one-time price. Single-track (Mode B) is the next step, removing AutoPod's biggest limitation. |
| WizCut | $14/mo, $129/yr or $119 lifetime | Diarization from a single mixed track, native multicam sequences, rhythm and reaction-shot rules, web app, n8n node | Mode A (per-mic, local, no ML) now, with the same rhythm controls. Mode B diarization via sherpa-onnx is on the roadmap. |
| OpusClip | Free (watermark, 60 credits/mo); Starter $15/mo; Pro $29/mo ($14.50 billed yearly); credits expire after 60 days; XML export Pro only | Virality score with hook/flow/value/trend, ClipAnything prompts, ReframeAnything plus scene layouts, brand templates, AI B-roll, scheduler | Viral Skor 2.0 (5 weighted sub-scores, a reason line, hook variants, ±1 sentence) and Shorts Paketi (branded captions, hook, progress bar, CTA, logo, posting pack) inside Premiere. No credits, no upload, no watermark. Scene layouts and scheduling are still gaps. |
| Submagic | Starter $12-19/mo; Pro $23-39/mo; Business $41-69/mo; Magic Clips +$19/mo; 30% lifetime affiliate | Hormozi/creator-style animated captions, presets that save a whole recipe, brand kit, Magic B-roll, hooks, zooms, a huge affiliate army | Suflo Styles plus Brand Kit and share codes, edited inside the Premiere timeline (no burned-pixel round trip, which is Submagic's top complaint), an affiliate program and invite codes. |
| Caption Plug | $14.99 one-time | Bundled local Whisper, 45-53 animated presets, native or rendered output, auto-censor with bleeps on their own track, 62 fonts | The closest clone of Suflo's caption core. Suflo wins on Turkish-first quality and on everything bundled around captions (retakes, Shorts package, podcast, audio, hooks). Profanity bleep is planned for 4.1. |
| CaptionX | Free (5 generations, never expire); Pro $13.95/mo or $139/yr; Pro+ $79/mo; lifetime $399-799 | 100+ languages including RTL, translation onto a new track, profanity filter with clean/explicit versions, eye-contact correction | Trial credits with the same 'never expire' idea, animated bilingual and translated captions (CaptionX can't animate translations), and a one-time price. |
| Adobe Premiere 26.x (native) | Included in Creative Cloud (~$22.99/mo single app); Firefly credits for generative features | Text-based editing with filler deletion (18 languages), Create/Single-Word/Translate Captions, Enhance Speech, Dynamic Ducking, Paper Edit, Generate Music, AI Assistant beta | 'Premiere Türkçe bilmiyor, Suflo biliyor' (Premiere speech-to-text has no Turkish support): Turkish speech-to-text and fillers, animated styles, retake logic, Shorts packaging, podcast switching. Avoid competing on generic audio cleanup. |
| FreeCaption (Turkish, open source) | Free, MIT | Whisper large-v3 + WhisperX alignment, Turkish/English, CUDA, local and unlimited | The free tier wins on 2-minute onboarding, an easy Mac/Windows installer, the editor and quality score, style previews, 99 languages and support. Pro goes beyond captions. |
| OpenCut / AutoSubs (open source) | Free (MIT); donations | OpenCut: 55 caption styles, CEP + UXP builds, cut review panel, stem separation. AutoSubs: diarization, Premiere + Resolve + After Effects, 1,000+ languages | Polished non-developer UX without a Python/PyTorch stack, Turkish quality, Doctor self-repair, and a supported product with content packs. A UXP plan is needed so OpenCut's UXP-first lead does not grow. |
| Gling / TimeBolt / Recut (standalone) | Gling $20-100/mo; TimeBolt $17/mo, $97/yr or $347 lifetime; Recut $99-129 one-time | Smart pause thresholding, editable filler stoplist, FastForward instead of cut, accept/deny per cut, XML round trip | A native Premiere panel (no round trip), an editable per-language filler stoplist, a 'listen only to what's cut' preview, a combined review drawer, and a one-time price lower than all of them. |

## Kaynaklar

### ai-edit-panels
- https://sourceforge.net/software/product/FireCut/
- https://www.spotsaas.com/product/firecut/pricing
- https://firecut.ai/pricing/all/
- https://learn.firecut.ai/features/remove-silences
- https://community.adobe.com/questions-729/using-firecut-plugin-to-cut-silence-and-after-i-do-my-premiere-pro-is-unusably-laggy-1409243
- https://www.producthunt.com/products/firecut-ai/reviews
- https://www.freevisuals.net/post/firecut-ai-review
- https://premieregal.com/blog/2024/1/5/firecut-ai-for-premiere-pro-unmasking-the-editing-magic
- https://www.adobevideopartner.com/partners/firecut/
- https://www.anygen.io/showcase/firecut-ai/index.html
- https://digitalproduction.com/2026/04/08/autocut-brings-ai-cleanup-inside-premiere-pro/
- https://www.cined.com/autocut-plugin-now-integrates-ai-directly-into-premiere-pro-to-automatically-handle-time-consuming-tasks/
- https://www.autocut.com/en/
- https://www.autocut.com/en/blogs/autocut-march-updates/
- https://www.autocut.com/en/autocutrepeat/
- https://www.autocut.com/en/autocaptions/
- https://www.autocut.com/en/referral-program/
- https://www.autocut.com/en/ambassador/
- https://www.autocut.com/en/power-user-program/
- https://taprefer.com/autocut-affiliate-program/autocut/
- https://www.trustpilot.com/review/autocut.fr
- https://www.g2.com/products/autocut/reviews?qs=pros-and-cons
- https://editbuddy.app/
- https://editbuddy.app/pricing
- https://editbuddy.app/features/retake-removal
- https://editbuddy.app/creator-partner
- https://editbuddy.app/roadmap
- https://editbuddy.app/blog/what-is-autocut-premiere-pro
- https://www.premierecopilot.com/en
- https://www.premierecopilot.com/en/pricing
- https://www.premierecopilot.com/en/copilot
- https://www.premierecopilot.com/en/auto-chapters
- https://www.premierecopilot.com/en/blog/free-autocut-opus-clip-alternative-premiere-pro-tutorial
- https://phantomeditor.video/
- https://phantomeditor.video/pricing
- https://phantomeditor.video/products/Wraith
- https://phantomeditor.video/blog/phantom-chat-ai-new-ai-models-v1-3-4-update
- https://ca.trustpilot.com/review/phantomeditor.video
- https://goatedit.com/
- https://goatedit.com/features/viral-shorts
### caption-tools
- https://www.captionplug.com/
- https://www.captionplug.com/features
- https://www.captionplug.com/faq
- https://www.captionplug.com/blog/captionx-alternative-premiere-pro
- https://www.captionplug.com/blog/censor-swear-words-premiere-pro
- https://www.captionplug.com/blog/best-auto-caption-tools-premiere-pro
- https://caption-x.com/pricing
- https://caption-x.com/features
- https://caption-x.com/profanity-filter-premiere-pro
- https://caption-x.com/blog/best-caption-plugins-premiere-pro
- https://larryjordan.com/articles/captionx-caption-in-more-languages-with-more-options-for-adobe-premiere/
- https://www.brevidy.pro/
- https://www.brevidy.pro/captions
- https://www.brevidy.pro/alternatives
- https://www.cined.com/brevidy-for-adobe-premiere-pro-ai-captions-automatic-social-clips-and-vertical-reframing-in-one-panel/
- https://kompozy.io/reviews/brevidy
- https://www.submagic.co/pricing
- https://www.submagic.co/features/b-roll
- https://www.submagic.co/affiliate
- https://care.submagic.co/en/article/how-to-add-custom-words-to-the-dictionary-xr8dg2/
- https://www.submagic.co/blog/how-to-make-alex-hormozi-captions
- https://www.trustpilot.com/review/submagic.co
- https://fluxnote.io/guides/submagic-pricing-2026
- https://cutsnap.ai/blog/submagic-pricing-2026
- https://www.autocut.com/en/blogs/AutoCut-vs-Submagic/
- https://captions.ai/help/docs/subscriptions
- https://captions.ai/help/docs/captions/word-effects
- https://help.captions.ai/docs/captions/styles
- https://captions.ai/help/guides/engagement/highlight-keywords
- https://www.trustpilot.com/review/captions.ai
- https://openaffiliate.dev/programs/captions
- https://prizmad.com/review/captions-ai
- https://misterhorse.com/what-s-new/automatic-captions-release
- https://misterhorse.com/products/automatic-captions/20034
- https://www.g2.com/products/mister-horse/reviews
- https://helpx.adobe.com/premiere/desktop/whats-new/release-notes.html
- https://community.adobe.com/announcements-727/what-s-new-in-adobe-premiere-26-3-june-2026-1628369
- https://www.kylerholland.com/blog/single-word-captions-premiere-pro-tutorial
- https://www.miracamp.com/learn/premiere-pro/adobe-speech-to-text
- https://www.capcut.com/tools/auto-caption-generator
### shortform
- https://www.eesel.ai/blog/opusclip
- https://sendshort.ai/guides/opus-review/
- https://techsy.io/en/blog/opusclip-vs-vizard
- https://creatify.ai/blog/opusclip-pricing-plans-and-what-you-ll-actually-pay-in-2026
- https://www.eesel.ai/blog/opusclip-pricing
- https://quso.ai/blog/opus-clip-pricing
- https://www.g2.com/products/opusclip/pricing
- https://www.opus.pro/home-a-b
- https://coldiq.com/tools/opus-clip
- https://www.opus.pro/export-to-xml
- https://help.opus.pro/docs/article/import-to-adobe-premiere
- https://help.opus.pro/docs/article/layout-and-reframing
- https://help.opus.pro/docs/article/select-clip-length
- https://help.opus.pro/api-reference/schemas/curation-preferences
- https://opusclip.canny.io/changelog/new-b-roll-layouts-picture-in-picture-and-split
- https://help.opus.pro/docs/article/how-to-add-a-brand-template
- https://www.eesel.ai/blog/opusclip-reviews
- https://www.scalereach.ai/blog/opus-clip-review
- https://bigvu.tv/blog/opus-clip-tested-2026-where-ai-wins-40-percent-discard/
- https://mer.vin/2026/07/agent-opus-explained-opusclip-end-to-end-ai-video-agent/
- https://sacra.com/c/opusclip/
- https://startupspells.com/p/opusclip-ai-video-editing-tool-1m-arr-14-days
- https://startupfounderstories.com/stories/young-zhao-opus-clip
- https://help.opus.pro/docs/article/affiliate-program-faq
- https://openaffiliate.dev/programs/opus-clip
- https://www.opus.pro/business/e-commerce
- https://creatorintelhq.com/reviews/opusclip-watermark-export-limits/
- https://coldiq.com/tools/vizardai
- https://makerstack.co/reviews/vizard-review/
- https://www.buildfastwithai.com/ai-tools/vizard
- https://pexo.ai/blog/vizard-ai-review-and-alternatives-9195
- https://mwm.ai/apps/vizard-ai-video-clip-maker/6748490660
- https://vantaige.io/ai-tool/vizard
- https://www.g2.com/products/vizard-corp-vizard/reviews?qs=pros-and-cons
- https://www.trustpilot.com/review/vizard.ai
- https://www.roborhythms.com/vizard-ai-review/
- https://vizard.ai/affiliate
- https://www.toolsforhumans.ai/ai-tools/klap
- https://traksource.com/klap-review/
- https://contentcreators.com/tools/klap-review
### claude-indie-devs
- https://github.com/browser-use/video-use
- https://github.com/browser-use/video-use/issues?q=is%3Aissue+sort%3Areactions-%2B1-desc
- https://github.com/Moh4696/freecut
- https://github.com/heygen-com/hyperframes
- https://github.com/heygen-com/hyperframes-launches
- https://github.com/nateherkai/hyperframes-student-kit
- https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP
- https://github.com/leancoderkavy/premiere-pro-mcp
- https://github.com/ayushozha/AdobePremiereProMCP
- https://github.com/samuelgursky/davinci-resolve-mcp
- https://github.com/samuelgursky/davinci-resolve-mcp/blob/main/README.md
- https://github.com/barckley75/resolve-claude-mcp
- https://github.com/wassermanproductions/unofficial-davinci-mcp
- https://github.com/tmoroney/auto-subs
- https://github.com/tmoroney/auto-subs/issues?q=is%3Aissue+sort%3Areactions-%2B1-desc
- https://github.com/Paulothedeveloper/blade
- https://github.com/barefootford/buttercut
- https://github.com/kurbaitaev/ghost-editor
- https://github.com/krusemediallc/video-editor-agent
- https://github.com/AgriciDaniel/claude-shorts
- https://github.com/Robelob/Ambar-AI-Video-Editor-Plugin-For-Premiere-Pro
- https://github.com/SysAdminDoc/OpenCut
- https://github.com/hikari8126/premiere-claude-plugin
- https://github.com/MarvelCollin/adobe-premiere-cc-mcp
- https://github.com/a-y-ibrahim/after-effects-mcp
- https://github.com/paichanut/AfterShoot-Auto-Caption
- https://github.com/davidammielwan/beatsync
- https://github.com/CelaviiHQ/cutmaster-ai
- https://github.com/veritus-git/BadWords
- https://github.com/mrbuslov/capcut-ai-editor
- https://github.com/jub0t/Concat
- https://github.com/0xsline/OpenChatCut
- https://github.com/pireel/pireel
- https://github.com/ronak-create/FableCut
- https://github.com/iart-ai/motion-skills
- https://github.com/kajisho5/ffmpeg-skill
- https://github.com/aeflowtools-cpu/aeflowtools-site
- https://github.com/AldaGs/pieFX
- https://github.com/AldaGs/pieFX/commit/fa90a8e6304bb72525c6106637a368b257d16bcd
- https://github.com/jonasnaimark/AirBoard
### growth-wom
- https://github.com/fmerian/awesome-product-hunt (fetched, verified)
- https://github.com/fmerian/awesome-product-hunt/blob/main/product-hunt-launch-guide.md (fetched, verified: 12:01 AM PT, first 4 hours hidden/randomized, 79% featured self-hunted, 60% of #1 self-hunted, relaunch after ~6 months)
- https://github.com/fmerian/awesome-product-hunt/blob/main/product-hunt-community-kit.md (fetched, verified: don't ask for upvotes or cold-DM)
- https://raw.githubusercontent.com/lmsqueezy/lemonsqueezy.js/main/README.md (fetched, verified: discount, redemption and license endpoints)
- https://github.com/lmsqueezy/lemonsqueezy.js/wiki (fetched, verified: full function list incl. createDiscount, listDiscountRedemptions, createCheckout, issueOrderRefund)
- https://github.com/lmsqueezy/lemonsqueezy.js/wiki/Discounts (fetched, partial)
- https://github.com/antiwork/gumroad (fetched, verified: Gumroad open source, MIT)
- https://raw.githubusercontent.com/dubinc/dub/main/README.md (fetched, verified: Dub positions itself for link attribution and affiliate programs)
- https://github.com/LisaDziuba/Marketing-for-Engineers (fetched; referral/PH/pricing resource index)
- /home/user/suflo/docs/index.html (local: 749 TRY one-time price, no-refund FAQ, 1,229 download count, Lemon Squeezy checkout)
- /home/user/suflo/js/pro.js (local: Lemon Squeezy License API, expires_at handling)
- /home/user/suflo/marketing/analytics-kurulum.md (local: Cloudflare Web Analytics in place)
- https://www.slideshare.net/gueste94e4c/dropbox-startup-lessons-learned-3836587 (Dropbox referral case, from prior knowledge, not fetched)
- https://firecut.ai/affiliate (NOT fetched: egress-blocked)
- https://www.autocut.com/en/affiliate (NOT fetched: egress-blocked)
- https://www.submagic.co/affiliate (NOT fetched: egress-blocked)
- https://www.opus.pro/affiliate (NOT fetched: egress-blocked)
- https://motionarray.com/affiliate/ (NOT fetched: egress-blocked)
- https://www.misterhorse.com/ (NOT fetched: egress-blocked)
- https://aejuice.com/affiliate/ (NOT fetched: egress-blocked)
- https://www.descript.com/affiliates (NOT fetched: egress-blocked)
- https://www.capcut.com/ (NOT fetched: egress-blocked)
- https://www.lemonsqueezy.com/affiliates and https://docs.lemonsqueezy.com/help/affiliates (NOT fetched: egress-blocked)
- https://www.rewardful.com/ (NOT fetched: egress-blocked)
- https://www.producthunt.com/products/firecut (NOT fetched: egress-blocked)
- https://appsumo.com (NOT fetched: egress-blocked)
- https://www.trustpilot.com/review/submagic.co and https://www.g2.com/products/opusclip/reviews (NOT fetched: egress-blocked)
### audio-tools
- https://github.com/k2-fsa/sherpa-onnx (fetched README)
- https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/HEAD/nodejs-addon-examples/README.md (fetched)
- https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/HEAD/nodejs-examples/README.md (fetched)
- https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/HEAD/nodejs-addon-examples/test_offline_speech_enhancement_gtcrn.js (fetched)
- https://registry.npmjs.org/sherpa-onnx-node (fetched: v1.13.8, Apache-2.0, 2026-09-10)
- https://registry.npmjs.org/onnxruntime-node (fetched)
- https://registry.npmjs.org/essentia.js (fetched: AGPL-3.0)
- https://registry.npmjs.org/deepfilternet3-noise-filter (fetched)
- https://github.com/ceva-ip/DPDFNet (fetched README: Apache-2.0, 48 kHz models)
- https://github.com/Xiaobin-Rong/gtcrn (fetched)
- https://github.com/Rikorose/DeepFilterNet (fetched)
- https://github.com/Rikorose/DeepFilterNet/releases (fetched: v0.5.6)
- https://github.com/richardpl/arnndn-models (fetched)
- https://raw.githubusercontent.com/GregorR/rnnoise-models/HEAD/README.md (fetched)
- https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/doc/filters.texi (fetched: arnndn, afftdn sample_noise, sidechaincompress, speechnorm, dialoguenhance, deesser, adeclick, adeclip, whisper filter, loudnorm)
- https://github.com/adefossez/demucs (fetched)
- https://github.com/nomadkaraoke/python-audio-separator (fetched)
- https://github.com/Anjok07/ultimatevocalremovergui (fetched)
- https://github.com/Audio-AGI/AudioSep (fetched)
- https://github.com/ggml-org/whisper.cpp (fetched)
- https://github.com/pyannote/pyannote-audio (fetched)
- https://github.com/snakers4/silero-vad (fetched)
- https://github.com/OHF-Voice/piper1-gpl (fetched)
- https://raw.githubusercontent.com/rhasspy/piper/HEAD/VOICES.md (fetched: tr_TR dfki/fahrettin/fettah)
- https://github.com/resemble-ai/chatterbox (fetched: MIT, Turkish, PerTh watermark)
- https://github.com/idiap/coqui-ai-TTS (fetched; XTTS-v2 license CPML from TTS/.models.json)
- https://github.com/SWivid/F5-TTS (fetched)
- https://github.com/myshell-ai/OpenVoice (fetched)
- https://github.com/FunAudioLLM/CosyVoice (fetched)
- https://github.com/fishaudio/fish-speech (fetched)
- https://github.com/boson-ai/higgs-audio (fetched)
- https://github.com/Zyphra/Zonos (fetched)
- https://github.com/hexgrad/kokoro (fetched)
- https://github.com/Rudrabha/Wav2Lip (fetched)
- https://github.com/bytedance/LatentSync (fetched)
- https://github.com/TMElyralab/MuseTalk (fetched)
- https://github.com/hkchengrex/MMAudio (fetched)
- https://github.com/mir-aidj/all-in-one (fetched)
- https://github.com/resemble-ai/resemble-enhance (fetched)
- https://github.com/haoheliu/voicefixer (fetched)
### templates-library
- https://github.com/aejuicellc/aejuice-ai-assistant (fetched: AEJuice AI Assistant features — Auto Captions/Subtitles, AI Hook, Claude Code slash commands, roadmap)
- https://github.com/aejuicellc/pack-manager-api (fetched: Voiceover API, generation minutes)
- https://github.com/aejuicellc (fetched: org repo list)
- https://raw.githubusercontent.com/aejuicellc/pack-manager/main/release-manifest.json (fetched: update/latest channels, rollout segments, versions 26.09.1107 / 26.07.0031)
- https://raw.githubusercontent.com/aejuicellc/pack-manager/main/log.txt (fetched: last release log 2026-10-02)
- https://github.com/sploid/sploid.github.io/blob/main/projects/aejuice/README.md (fetched: Pack Manager 4 architecture — Qt/C++, AE+Premiere plugins, auto-update, VMProtect)
- https://raw.githubusercontent.com/afterpartyai/llms_txt_store/148b11d989a650523cf3c6bc32bf0ae902c4ca08/com/m/i/s/t/e/r/h/o/r/s/e/llms.txt (fetched: Mister Horse product and pack list)
- https://raw.githubusercontent.com/afterpartyai/llms_txt_store/148b11d989a650523cf3c6bc32bf0ae902c4ca08/com/luts/i/w/l/t/b/a/p/llms.txt (fetched: IWLTBAP free/paid LUT packs)
- https://raw.githubusercontent.com/afterpartyai/llms_txt_store/148b11d989a650523cf3c6bc32bf0ae902c4ca08/com/blog/p/o/n/d/5/llms.txt (fetched: Pond5 free camera-shake presets)
- https://github.com/BCSSA-IT/BIT-website/blob/main/docs/post/video.md (GitHub code search hit: Premiere Composer free Starter Pack contents, Product Manager install)
- https://github.com/sammyppr/sammyppr.github.io (GitHub code search hit: 2022–2026 course slides — account + email verification, Starter Pack auto-installs)
- https://github.com/sir-editor/Manuscript/tree/master/extensions/excalibur (fetched: Excalibur docs tree)
- https://raw.githubusercontent.com/sir-editor/Manuscript/master/extensions/excalibur/search-bar.md (fetched: abbreviation search, submenus, default-apply)
- https://raw.githubusercontent.com/sir-editor/Manuscript/master/extensions/excalibur/what-is-it-for.md (fetched: use cases)
- https://raw.githubusercontent.com/sir-editor/Manuscript/master/extensions/excalibur/change-log.md (fetched: 3rd-party transitions, undo, Stream Deck/Loupedeck, light theme)
- https://raw.githubusercontent.com/sir-editor/Manuscript/master/extensions/excalibur/special-bins.md (fetched)
- https://raw.githubusercontent.com/sir-editor/Manuscript/master/extensions/quiver/README.md (fetched: Quiver shortcuts, destination track, replace in sync)
- https://raw.githubusercontent.com/sir-editor/Manuscript/master/SUMMARY.md (fetched: Knights of the Editing Table product suite)
- https://github.com/sir-editor/Manuscript/blob/master/extensions/compass/change-log.md (GitHub code search hit: conflict workaround with Premiere Composer)
- https://github.com/Tomshiii/ahk/blob/main/Backups/Adobe%20Backups/Premiere/Knights%20of%20the%20Editing%20Table/excalibur/fixing%20issues.md (GitHub code search hit: .cmdlist.json duplicate-key bug)
- https://github.com/inlife/awesome-ae (fetched: one-line descriptions of Motion Bro, AEJuice, Mister Horse, Motion Array, Envato Elements, Storyblocks, FX Console, Mixkit)
- https://github.com/Mograph-Mindset/mogrts (fetched: Captioneer default MOGRTs in Landscape/Portrait/Square)
- https://github.com/yurihamuniz-td/premiere-titulos-plugin (fetched: CSV + range-marker batch lower thirds)
- https://github.com/mirror4869/material-workbench (fetched: local-first asset library UX — tags, browse/organize modes, dedupe)
- https://github.com/SWASTIKing17/MisterBloomX/blob/main/myDocs/backendLogicAndFeatures.md (fetched: webm proxy + on-demand download + cloud/downloaded badge pattern)
- https://github.com/D3strukt0r/dotfiles/blob/main/Windows/Robines-PC/README.md (GitHub code search hit: AEJuice free-plugin $0 checkout URL pattern)
- https://misterhorse.com/premiere-composer (BLOCKED by proxy — not fetched)
- https://motionarray.com/plugins/ (BLOCKED)
- https://elements.envato.com (BLOCKED)
- https://aejuice.com/pack-manager/ (BLOCKED)
- https://motionbro.net (BLOCKED)
- https://aescripts.com/excalibur/ (BLOCKED)
- https://www.storyblocks.com (BLOCKED)
- https://artlist.io (BLOCKED)
- https://www.shutterstock.com/discover/plugins (BLOCKED)
- https://helpx.adobe.com/premiere-pro/using/adobe-stock-premiere-pro.html (BLOCKED)
### platform-uxp
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/changelog/index.md
- https://github.com/AdobeDocs/uxp-premiere-pro
- https://github.com/AdobeDocs/uxp-premiere-pro/tree/main/src/pages/ppro-reference/classes
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/introduction/index.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/captiontrack.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/transcript.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/sequenceeditor.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/sequence.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/project.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/markers.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/videofilterfactory.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/videocliptrackitem.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/encodermanager.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/exporter.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/objectmaskutils.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/ppro-reference/classes/sequenceutils.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/uxp-api/known-issues.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/plugins/concepts/manifest/index.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/plugins/hybrid-plugins/index.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/plugins/hybrid-plugins/faq.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/plugins/distribution/adobe-marketplace/index.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/plugins/distribution/listing/index.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/plugins/distribution/review-guidelines/index.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/plugins/distribution/independent-distribution/index.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/plugins/distribution/overview/index.md
- https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/resources/faq/index.md
- https://github.com/AdobeDocs/uxp-premiere-pro/commits/main/src/pages/changelog/index.md
- https://github.com/AdobeDocs/uxp-premiere-pro-samples
- https://raw.githubusercontent.com/Adobe-CEP/Samples/master/PProPanel/ReadMe.md
- https://github.com/Adobe-CEP/CEP-Resources
- https://github.com/Adobe-CEP/CEP-Resources/tree/master/UXP-Migration-Guide
- https://raw.githubusercontent.com/docsforadobe/premiere-scripting-guide/master/docs/index.md
- https://github.com/tro2789/premiere-uxp-dev-notes
- https://raw.githubusercontent.com/tro2789/premiere-uxp-dev-notes/main/uxp/timeline-editing.md
- https://raw.githubusercontent.com/tro2789/premiere-uxp-dev-notes/main/uxp/hybrid-addon.md
- https://raw.githubusercontent.com/tro2789/premiere-uxp-dev-notes/main/uxp/panel-javascript.md
- https://raw.githubusercontent.com/tro2789/premiere-uxp-dev-notes/main/uxp/sync-vs-async.md
- https://raw.githubusercontent.com/leancoderkavy/premiere-pro-mcp/main/docs/adobe-uxp-26.5-coverage.md
- https://raw.githubusercontent.com/leancoderkavy/premiere-pro-mcp/main/RESEARCH.md
- https://raw.githubusercontent.com/crypticnull/ae-llama/main/docs/PREMIERE-PLATFORM.md
