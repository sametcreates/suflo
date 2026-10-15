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
ok("3.4 kesimden sonra altyazı: js/kesim-esle.js ve js/kesim-altyazi.js pakette (js/ klasörü) ve verify-release'te zorunlu",
  /\$stageItems = @\([^)]*"js"/.test(okuK("tools/package.ps1")) && /\$panelItems = @\([^)]*"js"/.test(okuK("tools/kurucu-yap.ps1")) &&
  /js\/kesim-esle\\\.js\$/.test(gerekli) && /js\/kesim-altyazi\\\.js\$/.test(gerekli) &&
  fs.existsSync(path.join(__dirname, "..", "js", "kesim-esle.js")) && fs.existsSync(path.join(__dirname, "..", "js", "kesim-altyazi.js")), gerekli.slice(0, 700));
ok("3.3 'Kalın yazı' kapalı: statik Montserrat Regular / Bold pakette (fonts/ klasörü) ve verify-release'te zorunlu",
  /\$stageItems = @\([^)]*"fonts"/.test(okuK("tools/package.ps1")) && /\$panelItems = @\([^)]*"fonts"/.test(okuK("tools/kurucu-yap.ps1")) &&
  /fonts\/Montserrat-Regular\\\.ttf\$/.test(gerekli) && /fonts\/Montserrat-Bold\\\.ttf\$/.test(gerekli) &&
  fs.existsSync(path.join(__dirname, "..", "fonts", "Montserrat-Regular.ttf")) && /Montserrat-Regular\.ttf/.test(notice), gerekli.slice(0, 600));
/* ---- 3.3 adım 18: seçilmiş yeni fontlar ---- */
var SSp = require(path.join(__dirname, "..", "js", "style-share.js"));
var lisansDosyasi = { "Archivo Black": "ArchivoBlack", "Bebas Neue": "BebasNeue", "Libre Caslon Display": "LibreCaslonDisplay", "Exo 2": "Exo2", "Chakra Petch": "ChakraPetch" };
var lisansEksik = SSp.fontNames().filter(function (n) {
  var yol = path.join(__dirname, "..", "fonts", "OFL-" + (lisansDosyasi[n] || n) + ".txt");
  if (!fs.existsSync(yol)) return true;
  var t = fs.readFileSync(yol, "utf8");
  // OFL 1.1 tam metin; fontTools ile örneklenen (değiştirilmiş) ailelerin telif satırı ayrılmış ad (Reserved Font
  // Name) taşımaz: statik örnekler aynı adla dağıtılabilir (Lora olduğu gibi gelir, onun ayrılmış adı sorun değil)
  var ornekli = n === "Montserrat" || n === "Inter" || n === "Exo 2" || n === "Nunito";
  return !/SIL OPEN FONT LICENSE Version 1\.1/.test(t) || (ornekli && /Reserved Font Name/i.test(t.split("\n")[0]));
});
ok("her paket fontunun kendi fonts/OFL-<Aile>.txt'i var (OFL 1.1; örneklenen ailelerde ayrılmış ad yok)", lisansEksik.length === 0, lisansEksik.join(","));
var yeniFontlar = SSp.fontNames().filter(function (n) { return SSp.fontSurumu(n) === "3.3"; });
var yeniDosyalar = [];
yeniFontlar.forEach(function (n) { [SSp.fontFile(n), SSp.fontFile(n, true)].forEach(function (f) { if (yeniDosyalar.indexOf(f) === -1) yeniDosyalar.push(f); }); });
var yeniBayt = yeniDosyalar.reduce(function (t, f) { return t + fs.statSync(path.join(__dirname, "..", "fonts", f)).size; }, 0);
ok("yeni fontların paket büyümesi ≤ 3 MB (4-8 aile; kalın yüz yalnız iki ağırlıklılarda)", yeniFontlar.length >= 4 && yeniFontlar.length <= 8 &&
  yeniBayt <= 3 * 1024 * 1024, yeniFontlar.length + " aile, " + (yeniBayt / 1048576).toFixed(2) + " MB");
ok("yeni font dosyaları ve lisansları verify-release'te zorunlu, bildirimlerde adlı",
  yeniDosyalar.every(function (f) { return gerekli.indexOf("fonts/" + f.replace(/\./g, "\\.") + "$") !== -1 && notice.indexOf("`" + f + "`") !== -1; }) &&
  yeniFontlar.every(function (n) { var l = "OFL-" + (lisansDosyasi[n] || n) + ".txt"; return gerekli.indexOf("fonts/" + l.replace(/\./g, "\\.") + "$") !== -1 && notice.indexOf(l) !== -1; }),
  yeniDosyalar.join(","));
ok("README 'Lisanslar / Licenses' bölümü bildirimlere bağlanır", /## Lisanslar \/ Licenses[\s\S]*\[THIRD_PARTY_NOTICES\.md\]\(THIRD_PARTY_NOTICES\.md\)/.test(okuK("README.md")));

/* ---- 3.4 Yapay zekâ köprüsü (MCP): mcp/ klasörü her pakette, .debug hiçbirinde ---- */
var pk = okuK("tools/package.ps1"), ky = okuK("tools/kurucu-yap.ps1");
ok("MCP: package.ps1 $stageItems ve kurucu $panelItems mcp/ taşır", /\$stageItems = @\([^)]*"mcp"/.test(pk) && /\$panelItems = @\([^)]*"mcp"/.test(ky) &&
  /"mcp"/.test(okuK("tools/install.ps1")) && /\bmcp\b/.test(okuK("tools/install.sh")));
ok("MCP: ZXP/kurucu listelerinde .debug yok", !/\$stageItems = @\([^)]*"\.debug"/.test(pk) && !/\$panelItems = @\([^)]*"\.debug"/.test(ky));
ok("MCP: verify-release shim'i ve üç panel dosyasını zorunlu tutar", /mcp\/suflo-mcp\\\.js\$/.test(gerekli) && /js\/otomasyon\\\.js\$/.test(gerekli) &&
  /js\/otomasyon-sunucu\\\.js\$/.test(gerekli) && /js\/otomasyon-panel\\\.js\$/.test(gerekli), gerekli.slice(0, 300));
ok("MCP: shim js/otomasyon.js'i göreli yoldan ister (paket düzeni: <ext>/mcp + <ext>/js)", /require\("\.\.\/js\/otomasyon\.js"\)/.test(okuK("mcp/suflo-mcp.js")) && fs.existsSync(path.join(__dirname, "..", "mcp", "suflo-mcp.js")));
var ih = okuK("index.html");
var sira = ["js/deneme.js", "js/pro.js", "js/captions.js", "js/magiccut.js", "js/konusma-kes.js", "js/hiz-rampasi.js", "js/zoom.js", "js/otomasyon.js", "js/otomasyon-sunucu.js", "js/otomasyon-panel.js", "js/app.js"].map(function (f) { return ih.indexOf('<script src="' + f + '"></script>'); });
ok("MCP: index.html betik sırası (kayıt → sunucu → panel → app)", sira.every(function (x, i) { return x > 0 && (i === 0 || x > sira[i - 1]); }), sira.join(","));

/* ---- 3.4 adım 19-20: ağ dayanıklılığı, model içe aktarma ve Araç ara her pakette ---- */
ok("3.4 adım 19-20: verify-release ag-dayanim, model-ice-aktar ve arac-ara'yı zorunlu tutar",
  /js\/ag-dayanim\\\.js\$/.test(gerekli) && /js\/model-ice-aktar\\\.js\$/.test(gerekli) && /js\/arac-ara\\\.js\$/.test(gerekli), gerekli.slice(0, 300));
var sira34 = ["js/ag-dayanim.js", "js/bridge.js", "js/arac-ara.js", "js/model-ice-aktar.js", "js/engine.js", "js/captions.js", "js/app.js"].map(function (f) { return ih.indexOf('<script src="' + f + '"></script>'); });
ok("3.4 adım 19-20: index.html betik sırası (ag-dayanim → bridge, model-ice-aktar → engine, arac-ara → captions → app)",
  sira34.every(function (x, i) { return x > 0 && (i === 0 || x > sira34[i - 1]); }), sira34.join(","));

/* ---- Caption Editor "Çevir": kelime kelime (k1) / birikimli (kc) / N kelime belgesi çevrilmez ---- */
// Her kelime ayrı altyazı satırı olarak LLM'e gidiyor, sonuç kelime kelime yazılıyor ("Today|to you|with the
// camera…"), deneme hakkı düşüyordu. Çok dilli paketteki kural; kapıdan önce (deneme kurulmaz).
var CTp = require(path.join(__dirname, "..", "js", "caption-text.js"));
function ceviriOrtami(mode, segs) {
  var env = { segments: segs, mode: mode, CT: CTp, gonderilen: [], harcanan: [], kapi: 0, toast: "" };
  var calis = new Function("ENV", [
    "var segments = ENV.segments, segmentsMode = ENV.mode, ceviriDili = '', CT = ENV.CT;",
    "var Pro = { gate: function () { ENV.kapi++; return true; }, denemeHarca: function (k) { ENV.harcanan.push(k); } };",
    "var KApp = { toast: function (m) { ENV.toast = m; } }; var K = { hataYardimi: function (e) { return e.message; } };",
    "var DOMc = { 'cap-translate': { value: 'en' }, 'cap-translate-go': {}, 'cap-revert': {}, 'cap-cift-dil-sar': {} };",
    "function el(id) { return DOMc[id]; } function status() {} function render() {} function saveDraftNow() {} function snapshot() {}",
    "function chatConfig() { return { url: 'x', model: 'm', key: 'k' }; }",
    "async function chatCall(cfg, body) { var m = /\\[[\\s\\S]*\\]/.exec(body.messages[body.messages.length - 1].content); var lines = m ? JSON.parse(m[0]) : []; ENV.gonderilen.push(lines);",
    "  return { choices: [{ message: { content: JSON.stringify({ lines: lines.map(function (w) { return 'EN ' + w; }) }) } }] }; }",
    "var LANG_NAMES = { en: 'English' };",
    kes("async function metinleriCevir("), kes("async function translateAll("),
    "return translateAll;"
  ].join("\n"))(env);
  return { env: env, calis: calis };
}
var kelimeler = "Bugün size kamerayla ilgili birkaç şey anlatacağım".split(" ").map(function (t, i) { return { text: t, start: i * 0.4, end: i * 0.4 + 0.35, p: 0.9 }; });
var kayitK = [{ start: 0, end: 3.2, text: kelimeler.map(function (w) { return w.text; }).join(" "), words: kelimeler }];
var ceviriIsleri = ["k1", "kc", "w3"].map(function (mod) {
  var kur = CTp.segmentleriKur(JSON.parse(JSON.stringify(kayitK)), mod, {});
  var once = kur.segments.map(function (s) { return s.text; });
  var o = ceviriOrtami(kur.mode, kur.segments);
  return o.calis().then(function () {
    ok("Çevir " + mod + " (" + kur.mode + "): reddedilir, LLM'e gitmez, metin değişmez, deneme kapısı/hakkı yok",
      kur.mode !== "plain" && o.env.gonderilen.length === 0 && o.env.harcanan.length === 0 && o.env.kapi === 0 &&
      JSON.stringify(kur.segments.map(function (s) { return s.text; })) === JSON.stringify(once) && /satır modunda/.test(o.env.toast), o.env.toast + " " + JSON.stringify(o.env.gonderilen));
  });
});
var kurSatir = CTp.segmentleriKur(JSON.parse(JSON.stringify(kayitK)), "l42", {});
var oSatir = ceviriOrtami(kurSatir.mode, kurSatir.segments);
ceviriIsleri.push(oSatir.calis().then(function () {
  ok("Çevir satır modu (plain): çevrilir, hak başarıda düşer (değişmedi)", kurSatir.mode === "plain" && oSatir.env.gonderilen.length === 1 &&
    oSatir.env.harcanan.length === 1 && /^EN /.test(kurSatir.segments[0].text), JSON.stringify(kurSatir.segments.map(function (s) { return s.text; })));
}));

Promise.all(ceviriIsleri).then(function () {
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}, function (e) { console.log("FAIL beklenmeyen hata " + (e && e.stack || e)); process.exit(1); });
