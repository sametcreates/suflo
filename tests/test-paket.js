// Suflo testi: cok dilli SRT paketi — zamanlama cueler() ile ayni, dile gore buyuk harf, ceviri parcalama
var fs = require("fs"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
function kes(imza) { var i = src.indexOf(imza); if (i < 0) throw new Error("yok: " + imza); return src.slice(i, src.indexOf("\n  }\n", i) + 4); }
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }

var DOM = { "cap-case": { value: "upper" }, "cap-punct": { checked: true } };
var M = new Function("DOM", [
  "function el(id) { return DOM[id]; }",
  kes("function tc(sec, comma)"), kes("function paketZamanlari("), kes("function paketStil("), kes("function paketSrt("),
  "return { z: paketZamanlari, srt: paketSrt, stil: paketStil };"].join("\n"))(DOM);
var liste = [{ start: 0, end: 0.1, text: "kısa" }, { start: 0.5, end: 2, text: "" }, { start: 1, end: 3, text: "iki" }, { start: 2.5, end: 4, text: "üç" }];
var z = M.z(liste);
ok("bos satir atlanir, en az 0.3 sn, cakisma yok", z.length === 3 && Math.abs(z[0].end - 0.3) < 1e-9 && z[1].end === 2.5 && z[2].end === 4, JSON.stringify(z));
var srt = M.srt(z, ["kısa", "iki", "üç"], "tr");
ok("SRT bicimi ve numaralandirma", /^1\r\n00:00:00,000 --> 00:00:00,300\r\nKISA\r\n\r\n2\r\n/.test(srt), JSON.stringify(srt.slice(0, 60)));
ok("buyuk harf: Turkce dosyada İ, Almanca/Ingilizce dosyada I", M.stil("bilgi", "tr") === "BİLGİ" && M.stil("bitte", "de") === "BITTE" && M.stil("this", "en") === "THIS");
var pk = src.slice(src.indexOf("async function cokDilliPaket()"), src.indexOf("function paketZamanlari("));
ok("paket: ekrandaki altyazi degismez (segments yazilmaz), kaynak orig, vurgu temiz", !/segments\s*=|s\.text\s*=/.test(pk) && /typeof s\.orig === "string" \? s\.orig : s\.text/.test(pk) && /CT\.stripEmphasis/.test(pk));
ok("paket: Pro kapisi ve ortak ceviri fonksiyonu", /Pro\.gate\("translate"/.test(pk) && /await metinleriCevir\(cfg, metinler, dil/.test(pk));
ok("translateAll da ortak ceviri fonksiyonunu kullanir", /var out = await metinleriCevir\(cfg, texts, target/.test(src));
ok("index: paket kutusu ve dil secimleri", /id="cap-paket-box"/.test(fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8")));
DOM["cap-punct"].checked = false;
var bosSrt = M.srt(M.z([{ start: 0, end: 1, text: "bir" }, { start: 1, end: 2, text: "…" }, { start: 2, end: 3, text: "üç" }]), ["bir", "…", "çok\n\n\nsatır"], "tr");
ok("bos kalan satir atlanir, numaralar ardisik, ic bos satirlar kapanir", /^1\r\n[^\r]+\r\nBİR\r\n\r\n2\r\n[^\r]+\r\nÇOK SATIR\r\n/.test(bosSrt) && bosSrt.indexOf("3\r\n") === -1, JSON.stringify(bosSrt));
ok("paket: kelime/karaoke modunda reddedilir", /if \(segmentsMode !== "plain"\)/.test(pk));

/* ---- Yayın paketi: THIRD_PARTY_NOTICES.md (uyarlanan MIT kodun lisans metni) ---- */
function okuK(f) { return fs.readFileSync(path.join(__dirname, "..", f), "utf8"); }
var notice = fs.existsSync(path.join(__dirname, "..", "THIRD_PARTY_NOTICES.md")) ? okuK("THIRD_PARTY_NOTICES.md") : "";
ok("THIRD_PARTY_NOTICES.md depo kökünde, Raunen girdisi + tam MIT metni + çalışırken indirilenler",
  /### Raunen/.test(notice) && /063df7b8453b79ca04331bebdeef2eaf5cfe2b99/.test(notice) && /SPDX: `MIT`/.test(notice) &&
  /Permission is hereby granted, free of charge/.test(notice) && /THE SOFTWARE IS PROVIDED "AS IS"/.test(notice) && /## Runtime downloads \(not bundled\)/.test(notice) &&
  /whisper\.cpp/.test(notice) && /Silero VAD/.test(notice) && /ffmpeg/.test(notice));
ok("package.ps1 $stageItems THIRD_PARTY_NOTICES.md'yi ZXP'ye koyar", /\$stageItems = @\([^)]*"THIRD_PARTY_NOTICES\.md"/.test(okuK("tools/package.ps1")));
ok("kurucu ve geliştirici kurulumları da taşır", /\$panelItems = @\([^)]*"THIRD_PARTY_NOTICES\.md"/.test(okuK("tools/kurucu-yap.ps1")) &&
  /"THIRD_PARTY_NOTICES\.md"/.test(okuK("tools/install.ps1")) && /THIRD_PARTY_NOTICES\.md/.test(okuK("tools/install.sh")));
var vr = okuK("tools/verify-release.ps1");
var gerekli = (/\$required = @\(([\s\S]*?)\n\s*\)/.exec(vr) || ["", ""])[1];
ok("verify-release.ps1: THIRD_PARTY_NOTICES.md ve LICENSE paketten eksikse yayın durur", /THIRD_PARTY_NOTICES\\\.md\$/.test(gerekli) && /LICENSE\$/.test(gerekli) && /missing=\{4\}/.test(vr) && /exit 1/.test(vr), gerekli.slice(-160));
ok("3.3 Altyazı Efektleri: oluşturucu modeli ve stil motoru pakette (js/ klasörü) ve verify-release'te zorunlu",
  /\$stageItems = @\([^)]*"js"/.test(okuK("tools/package.ps1")) && /\$panelItems = @\([^)]*"js"/.test(okuK("tools/kurucu-yap.ps1")) &&
  /altyazi-efekt\\\.js\$/.test(gerekli) && /style-engine\\\.js\$/.test(gerekli) && fs.existsSync(path.join(__dirname, "..", "js", "altyazi-efekt.js")), gerekli.slice(0, 400));
ok("3.4 canlı eşikli sessizlik kesimi: js/sessizlik.js pakette (js/ klasörü) ve verify-release'te zorunlu",
  /\$stageItems = @\([^)]*"js"/.test(okuK("tools/package.ps1")) && /\$panelItems = @\([^)]*"js"/.test(okuK("tools/kurucu-yap.ps1")) &&
  /js\/sessizlik\\\.js\$/.test(gerekli) && fs.existsSync(path.join(__dirname, "..", "js", "sessizlik.js")), gerekli.slice(0, 600));
ok("3.3 'Kalın yazı' kapalı: statik Montserrat Regular / Bold pakette (fonts/ klasörü) ve verify-release'te zorunlu",
  /\$stageItems = @\([^)]*"fonts"/.test(okuK("tools/package.ps1")) && /\$panelItems = @\([^)]*"fonts"/.test(okuK("tools/kurucu-yap.ps1")) &&
  /fonts\/Montserrat-Regular\\\.ttf\$/.test(gerekli) && /fonts\/Montserrat-Bold\\\.ttf\$/.test(gerekli) &&
  fs.existsSync(path.join(__dirname, "..", "fonts", "Montserrat-Regular.ttf")) && /Montserrat-Regular\.ttf/.test(notice), gerekli.slice(0, 600));
ok("README 'Lisanslar / Licenses' bölümü bildirimlere bağlanır", /## Lisanslar \/ Licenses[\s\S]*\[THIRD_PARTY_NOTICES\.md\]\(THIRD_PARTY_NOTICES\.md\)/.test(okuK("README.md")));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
