// Suflo testi: Tek Tık Shorts Paketi — js/shorts-paket-plan.js (plan, altyazı cue'ları, paylaşım
// metni, dosyalar, yeniden deneme, iş durumu ve sahte bağımlılıklarla runJob)
var path = require("path");
var P = require(path.join(__dirname, "..", "js", "shorts-paket-plan.js"));
var MK = require(path.join(__dirname, "..", "js", "marka-kiti.js"));
var CT = require(path.join(__dirname, "..", "js", "caption-text.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : "")); }

var anlar = [
  { id: 1, start: 10, end: 40, title: "*Para* biriktirme sırrı", reason: "Somut tavsiye", score: 82, hooks: ["Bunu *bil*", "İkinci kanca"], kancaNo: 1 },
  { id: 2, start: 100, end: 106, title: "Kısa an", reason: "", score: 61, hooks: [] },
  { id: 3, start: 200, end: 250, title: "Üçüncü", reason: "Duygu", score: 70, hooks: ["Üç"] }
];
var tamYetenek = { autoReframe: true, ffmpeg: true, libass: true, groq: true };

/* ---------------- planla ---------------- */
var pl = P.planla({ anlar: anlar, secim: {}, yetenek: tamYetenek });
ok("planla: her an için Short, varsayılanda hiçbir adım atlanmaz (çerçeve: çubuk + CTA)", !pl.hata && pl.kisalar.length === 3 && pl.atlananlar.length === 0 &&
  pl.kisalar.every(function (k) { return P.ADIMLAR.every(function (a) { return k.adimlar[a] === "bekliyor"; }); }), JSON.stringify(pl.atlananlar));
ok("planla: kartta seçili kanca kullanılır, ad numaralı", pl.kisalar[0].kanca === "İkinci kanca" && pl.kisalar[0].ad === "Shorts 1 · Para biriktirme sırrı" &&
  pl.kisalar[1].kanca === "Kısa an", JSON.stringify(pl.kisalar[0]));
var plFf = P.planla({ anlar: anlar, yetenek: { autoReframe: true, ffmpeg: false, libass: false, groq: true } });
ok("planla: ffmpeg yoksa altyazı / kanca / çerçeve atlanır, gerekçe 'ffmpeg'", plFf.kisalar[0].adimlar.altyazi === "atlandi" && plFf.kisalar[0].adimlar.cerceve === "atlandi" &&
  plFf.kisalar[0].adimlar.kanca === "atlandi" && plFf.kisalar[0].adimlar.metin === "bekliyor" &&
  plFf.atlananlar.length === 3 && plFf.atlananlar.every(function (x) { return x.neden === "ffmpeg"; }) && plFf.kisalar[0].notlar.altyazi === "ffmpeg");
var plLa = P.planla({ anlar: anlar, yetenek: { autoReframe: true, ffmpeg: true, libass: false, groq: true } });
ok("planla: libass yoksa gerekçe 'libass'", plLa.atlananlar.length === 3 && plLa.atlananlar.every(function (x) { return x.neden === "libass"; }));
var plAi = P.planla({ anlar: anlar, yetenek: { autoReframe: true, ffmpeg: true, libass: true, groq: false } });
ok("planla: AI anahtarı yoksa metin yine yazılır (yedek), uyarı 'ai-yok'", plAi.kisalar[0].adimlar.metin === "bekliyor" && !plAi.metinAI && plAi.uyarilar.indexOf("ai-yok") !== -1);
ok("planla: Auto Reframe yoksa onaysız reddedilir, onayla yatay paket", P.planla({ anlar: anlar, yetenek: { autoReframe: false, ffmpeg: true, libass: true } }).hata === "reframe-yok" &&
  P.planla({ anlar: anlar, secim: { yatay: true }, yetenek: { autoReframe: false, ffmpeg: true, libass: true } }).dikey === false);
ok("planla: MOGRT (motorda olmayan) stil reddedilir", P.planla({ anlar: anlar, secim: { stilId: "C:/x.mogrt" }, yetenek: tamYetenek }).hata === "mogrt");
ok("planla: seçim yoksa hata", P.planla({ anlar: [], yetenek: tamYetenek }).hata === "secim-yok" && !!P.NEDEN["secim-yok"]);
var plKapali = P.planla({ anlar: anlar, secim: { altyazi: false, kanca: false, ilerleme: false, cta: false, logo: false, metin: false }, yetenek: tamYetenek });
ok("planla: kutular kapalıysa adımlar 'kapali' / 'cerceve-bos' gerekçesiyle atlanır", plKapali.kisalar[0].adimlar.sekans === "bekliyor" &&
  ["altyazi", "kanca", "metin"].every(function (a) { return plKapali.kisalar[0].notlar[a] === "kapali"; }) && plKapali.kisalar[0].notlar.cerceve === "cerceve-bos");
var kit = MK.normalize({ on: true, logo: { path: "C:/marka/logo.png", kose: "su" }, ilerleme: { konum: "alt", renk: "#00ff00", kalinlik: 12 }, cta: { acik: true, metin: "Abone ol" } }).kit;
var plKit = P.planla({ anlar: anlar, kit: kit, secim: {}, yetenek: tamYetenek });
ok("planla: Marka Kiti logo / çubuk / CTA varsayılanları", plKit.logoAcik && plKit.secim.ilerlemeKonum === "alt" && plKit.secim.ilerlemeRenk === "#00ff00" &&
  plKit.secim.ctaSecim === "ozel" && plKit.secim.ctaOzel === "Abone ol", JSON.stringify(plKit.secim));
var plLogosuz = P.planla({ anlar: anlar, secim: { logo: true, ilerleme: false, cta: false }, yetenek: tamYetenek });
ok("planla: logo isteniyor ama kitte yok: uyarı, çerçeve boş kalır", !plLogosuz.logoAcik && plLogosuz.uyarilar.indexOf("logo-yok") !== -1 && plLogosuz.kisalar[0].notlar.cerceve === "cerceve-bos");
ok("secimNormalize: bozuk değerler varsayılana, CTA özel metni ≤40", (function () {
  var s = P.secimNormalize({ ilerlemeKonum: "yan", ilerlemeRenk: "kırmızı", ilerlemeStil: "?", ctaSecim: "x", ctaOzel: new Array(60).join("a"), kredi: "evet" });
  return s.ilerlemeKonum === "ust" && s.ilerlemeRenk === "#8b7cf6" && s.ilerlemeStil === "ince" && s.ctaSecim === "takip" && s.ctaOzel.length === 40 && s.kredi === false;
})());

/* ---------------- captionCues ---------------- */
var kayit = { mod: "plain", segs: [
  { start: 0.2, end: 1.0, text: "istanbul'da *ilk* gün, harika!" },
  { start: 1.0, end: 1.1, text: "Iğdır 🔥" },
  { start: 1.1, end: 2.0, text: "😂😂" },
  { start: 2.0, end: 2.05, text: "çok" },
  { start: 2.05, end: 3, text: "kısa" },
  { start: 5, end: 4.8, text: "bozuk süre" }
] };
var cc = P.captionCues(kayit, { styleId: "mrbeast", lang: "tr" });   // mrbeast: büyük harf, noktalamasız
ok("captionCues: stilin harf kuralı Türkçe İ/ı ile, noktalama atılır, *vurgu* kalır", cc.cues[0].text === "İSTANBUL'DA *İLK* GÜN HARİKA", cc.cues[0].text);
ok("captionCues: emoji atılır; yalnız emojili satır düşer", cc.cues[1].text === "IĞDIR" && cc.cues.every(function (c) { return !/[\uD800-\uDFFF]/.test(c.text); }) && cc.cues.length === 5,
  JSON.stringify(cc.cues.map(function (c) { return c.text; })));
ok("captionCues: hiçbir cue çakışmaz, sıralı", cc.cues.every(function (c, i) { return c.end > c.start && (!cc.cues[i + 1] || c.end <= cc.cues[i + 1].start + 1e-9); }), JSON.stringify(cc.cues));
ok("captionCues: en az 0,3 sn (sonraki izin verdikçe)", Math.abs(cc.cues[4].end - cc.cues[4].start - 0.3) < 1e-9 || cc.cues[4].end - cc.cues[4].start >= 0.3, JSON.stringify(cc.cues[4]));
var ccSaas = P.captionCues(kayit, { styleId: "saas", lang: "tr" });   // saas: normal harf, noktalama kalır
ok("captionCues: başka stil kendi kuralıyla (noktalama kalır, harf değişmez)", ccSaas.cues[0].text === "istanbul'da *ilk* gün, harika!", ccSaas.cues[0].text);
ok("captionCues: İngilizce metinde 'THIS' (THİS değil)", P.captionCues({ segs: [{ start: 0, end: 1, text: "this is it" }] }, { styleId: "mrbeast", lang: "en" }).cues[0].text === "THIS IS IT");
ok("captionCues: mod → cueKind (k1 words, kc cumulative, diğer lines)", P.captionCues({ mod: "k1", segs: [] }).cueKind === "words" &&
  P.captionCues({ mod: "kc", segs: [] }).cueKind === "cumulative" && P.captionCues({ mod: "w3", segs: [] }).cueKind === "lines" && P.captionCues(null).cues.length === 0);
ok("captionCues: aynı anda başlayan satır kaybolmaz (sonrakine katılır)", (function () {
  var r = P.captionCues({ segs: [{ start: 1, end: 2, text: "bir" }, { start: 1, end: 2.5, text: "iki" }] }, { styleId: "saas", lang: "tr" });
  return r.cues.length === 1 && r.cues[0].text === "bir iki";
})());
ok("metinStili: punct kapalıyken yıldız kalır, Arapça noktalama atılır", CT.metinStili("a، *b*؟", { kase: "normal", punct: false }) === "a *b*");

ok("stilAyarlari: Marka Kiti yazı tipi / renk, 9:16'da güvenli yerleşim", (function () {
  var k2 = MK.normalize({ on: true, stil: { overrides: { font: "Anton", renk: "#ff0000" } } }).kit;
  var s = P.stilAyarlari("viral", k2, true);
  return s.overrides.font === "Anton" && s.overrides.renk === "#ff0000" && s.overrides.guvenli === true && s.konum === 5;
})());

/* ---------------- çerçeve planı ---------------- */
var cp1 = P.cercevePlani({ W: 1080, H: 1920, dur: 30, secim: P.secimNormalize({}), hookDur: 3, altyaziKonum: 2, altyaziAcik: true, lang: "tr" });
ok("cercevePlani: çubuk + CTA, altyazı altta → CTA üstte", cp1.progress && cp1.cta && !cp1.logo && !cp1.bos && cp1.cta.start === 27.5 &&
  /\\pos\(\d+,(\d+)/.test(cp1.cta.ass) && Number(/\\(?:pos|move)\(\d+,(\d+)/.exec(cp1.cta.ass)[1]) < 1920 * 0.5, cp1.cta && cp1.cta.ass.split("\n").filter(function (l) { return /^Dialogue/.test(l); })[0]);
var cp2 = P.cercevePlani({ W: 1080, H: 1920, dur: 6, secim: P.secimNormalize({ ilerleme: false }), lang: "tr" });
ok("cercevePlani: kısa Short'ta CTA gerekçeyle düşer, çerçeve boş", !cp2.cta && cp2.ctaNeden === "cta-kisa" && cp2.bos);
var cp3 = P.cercevePlani({ W: 1080, H: 1920, dur: 20, secim: P.secimNormalize({ ilerleme: false, cta: false }, kit), kit: kit, logoAcik: true });
ok("cercevePlani: logo kitten, dikeyde güvenli", cp3.logo && cp3.logo.path === "C:/marka/logo.png" && cp3.logo.guvenli === true && !cp3.bos);

/* ---------------- paylaşım metni ---------------- */
var pr = P.packPrompt([{ start: 0, end: 2, text: "Merhaba *dünya*" }], { lang: "tr", genre: "egitim", title: "*Para* sırrı", hook: "Bunu *bil*" });
ok("packPrompt: tek çağrı, üç platform, dil ve bağlam", /youtube/.test(pr.system) && /tiktok/.test(pr.system) && /reels/.test(pr.system) && /Turkish/.test(pr.system) &&
  /Clip title: Para sırrı/.test(pr.user) && /On-screen hook: Bunu bil/.test(pr.user) && /Merhaba dünya/.test(pr.user) && !/\*/.test(pr.user));
var cevap = JSON.stringify({
  youtube: { titles: ["Para biriktirmenin *sırrı*"], description: "Kısa açıklama.", hashtags: ["#para", "#tasarruf", "#finans", "#ekonomi", "#bütçe"], tags: ["x"] },
  tiktok: { titles: ["Bunu kimse söylemiyor"], description: "Kaydet!", hashtags: ["#a", "#b", "#c", "#d", "#e", "#f"] },
  reels: "bozuk"
});
var pp = P.parsePack(cevap);
ok("parsePack: YouTube 3 hashtag, etiket yok; TikTok 5; bozuk Reels yalnız kendini düşürür", pp.youtube.hashtagler.length === 3 && pp.youtube.etiketler.length === 0 &&
  pp.tiktok.hashtagler.length === 5 && pp.reels === null && pp.youtube.basliklar[0] === "Para biriktirmenin sırrı", JSON.stringify(pp));
ok("parsePack: bozuk JSON → hepsi null; kod çiti temizlenir", (function () {
  var a = P.parsePack("olmadı"), b = P.parsePack("```json\n" + cevap + "\n```");
  return a.youtube === null && a.tiktok === null && a.reels === null && b.youtube !== null;
})());
var kisa0 = { baslik: "Para sırrı", neden: "Somut tavsiye", kanca: "Bunu *bil*" };
var pm = P.paketMetni(pp, kisa0, { lang: "tr", kredi: "Altyazılar: Suflo · suflo.app" });
ok("paketMetni: AI platformları, eksik platform yedekle (başlık + gerekçe + 3 genel hashtag)", pm.youtube.ai && pm.tiktok.ai && !pm.reels.ai &&
  pm.youtube.baslik === "Para biriktirmenin sırrı" && /^Bunu kimse söylemiyor\n\nKaydet!/.test(pm.tiktok.aciklama) &&
  pm.reels.aciklama.indexOf("Somut tavsiye") !== -1 && pm.reels.aciklama.indexOf("#shorts #keşfet #viral") !== -1, JSON.stringify(pm));
ok("paketMetni: kredi yalnız verilince, en sonda", /Altyazılar: Suflo · suflo\.app$/.test(pm.youtube.aciklama) &&
  P.paketMetni(pp, kisa0, { lang: "tr" }).youtube.aciklama.indexOf("Suflo") === -1);
ok("paketMetni: AI hiç yoksa tamamen yedek, İngilizce genel hashtag", (function () {
  var y = P.paketMetni(null, kisa0, { lang: "en" });
  return !y.youtube.ai && y.youtube.baslik === "Para sırrı" && /#fyp/.test(y.tiktok.aciklama) && /^Bunu bil/.test(y.tiktok.aciklama) && !/^Bunu/.test(y.youtube.aciklama);
})());

/* ---------------- dosyalar ---------------- */
var dk = [
  { no: 1, ad: "Shorts 1 · Şişli'de, \"ilk\" gün", start: 12, end: 47, puan: 78, kanca: "Bunu *bil*", paylasim: pm, hatalar: {} },
  { no: 2, ad: "Shorts 2 · İkinci", start: 70, end: 95, puan: 0, kanca: "", paylasim: null, hatalar: { cerceve: "ffmpeg hata\nsatır" } }
];
var txt = P.paylasimTxt(dk, { lang: "tr", kaynak: "Ana sekans", tarih: "4 Ekim 2026" });
ok("TXT: BOM ve yalnız CRLF", txt.charCodeAt(0) === 0xFEFF && txt.indexOf("\r\n") !== -1 && !/[^\r]\n/.test(txt));
ok("TXT: her Short başlığı, süre, kanca ve üç platform", /=== 1\. Shorts 1 · Şişli'de, "ilk" gün \(0:12–0:47 · 35 sn · 78\/100 puan\) ===/.test(txt) &&
  /Kanca: Bunu bil/.test(txt) && /\[YouTube Shorts\]\r\nBaşlık: Para biriktirmenin sırrı/.test(txt) && /\[TikTok\]/.test(txt) && /\[Instagram Reels\]/.test(txt), txt.slice(0, 300));
ok("TXT: tamamlanmayan adımlar tek satırda", /Tamamlanmayan adımlar: cerceve \(ffmpeg hata satır\)/.test(txt));
ok("TXT: İngilizce etiketler", /Suflo — Shorts posting pack/.test(P.paylasimTxt(dk, { lang: "en" })) && /Hook: Bunu bil/.test(P.paylasimTxt(dk, { lang: "en" })));
var csv = P.paylasimCsv(dk, { lang: "tr" });
ok("CSV: BOM, CRLF satır sonu", csv.charCodeAt(0) === 0xFEFF && /\r\n$/.test(csv) && csv.split("\r\n")[0].indexOf("No,Short,Başlangıç") === 1);
function csvOku(t) {   // RFC 4180 okuyucu (yalnız test için)
  t = t.replace(/^\uFEFF/, "");
  var satirlar = [], alanlar = [], alan = "", tirnak = false;
  for (var i = 0; i < t.length; i++) {
    var c = t[i];
    if (tirnak) {
      if (c === "\"" && t[i + 1] === "\"") { alan += "\""; i++; }
      else if (c === "\"") tirnak = false;
      else alan += c;
    } else if (c === "\"") tirnak = true;
    else if (c === ",") { alanlar.push(alan); alan = ""; }
    else if (c === "\r" && t[i + 1] === "\n") { alanlar.push(alan); satirlar.push(alanlar); alanlar = []; alan = ""; i++; }
    else alan += c;
  }
  return satirlar;
}
var okunan = csvOku(csv);
ok("CSV: virgül, tırnak ve satır sonu tırnaklanır; Türkçe gidip gelir", okunan.length === 3 && okunan[1][1] === "Shorts 1 · Şişli'de, \"ilk\" gün" &&
  okunan[1][8] === pm.youtube.aciklama && okunan[1][9] === pm.tiktok.aciklama && okunan[2][7] === "" && okunan.every(function (r) { return r.length === 11; }),
  JSON.stringify(okunan[1]).slice(0, 200));
ok("CSV: formül gibi başlayan alan zararsızlaştırılır", P.paylasimCsv([{ no: 1, ad: "=HYPERLINK(1)", start: 0, end: 1, paylasim: null }], {}).indexOf(",'=HYPERLINK(1),") !== -1);
ok("CSV: kredi satırı yalnız açıksa (açıklamanın içinde)", csv.indexOf("suflo.app") !== -1 && P.paylasimCsv([{ no: 1, ad: "x", start: 0, end: 9, paylasim: P.paketMetni(pp, kisa0, { lang: "tr" }) }]).indexOf("suflo.app") === -1);
ok("dosyaAdi: CON, ':' ve yasak karakterler; Türkçe kalır", P.dosyaAdi("CON") === "_CON" && P.dosyaAdi("con.txt") === "_con.txt" && P.dosyaAdi("lpt9") === "_lpt9" &&
  P.dosyaAdi("Bölüm 1: Şeker?") === "Bölüm 1- Şeker-" && P.dosyaAdi("a/b\\c|d*e<f>g\"h") === "a-b-c-d-e-f-g-h" && P.dosyaAdi("ad. ") === "ad" && P.dosyaAdi("") === "Suflo" &&
  P.dosyaAdi("COM10") === "COM10", P.dosyaAdi("Bölüm 1: Şeker?"));
ok("paketDosyaAdi: zaman damgalı", /^Suflo-Shorts-paylasim-paketi-20261004-153005$/.test(P.paketDosyaAdi(new Date(2026, 9, 4, 15, 30, 5))), P.paketDosyaAdi(new Date(2026, 9, 4, 15, 30, 5)));

/* ---------------- retryDelay ---------------- */
ok("retryDelay: gövdeden '7.66s' ve '450ms'", P.retryDelay(429, "{\"error\":{\"message\":\"Rate limit reached. Please try again in 7.66s.\"}}", 0) === 7660 &&
  P.retryDelay(429, "Please try again in 450ms", 2) === 450);
ok("retryDelay: dakikalı süre 60 sn'ye kırpılır", P.retryDelay(429, "try again in 2m30s", 0) === 60000);
ok("retryDelay: gövdede süre yoksa 2 / 4 / 8 / 16 sn", [0, 1, 2, 3].map(function (a) { return P.retryDelay(503, "", a); }).join() === "2000,4000,8000,16000");
ok("retryDelay: 4 yeniden denemeden sonra durur", P.retryDelay(429, "try again in 1s", 4) === -1 && P.retryDelay(500, "", 5) === -1);
ok("retryDelay: 401 / 400 / 0 (bağlantı) yeniden denenmez", P.retryDelay(401, "try again in 1s", 0) === -1 && P.retryDelay(400, "", 0) === -1 && P.retryDelay(0, "", 0) === -1);

/* ---------------- iş durumu ---------------- */
var job = P.newJob({ plan: pl, kaynakId: "ana", kaynakAd: "Ana sekans", lang: "tr", ts: 5 });
ok("newJob: plan kopyalanır, durum çalışıyor", job.kisalar.length === 3 && job.durum === "calisiyor" && job.kisalar !== pl.kisalar && job.kaynakId === "ana");
ok("nextStep: önce tüm sekanslar", P.nextStep(job).adim === "sekans" && P.nextStep(job).i === 0);
P.markDone(job, 0, "sekans", { id: "s1", dikeyId: "d1" });
P.markFail(job, 1, "sekans", "Auto Reframe çöktü");
P.markDone(job, 2, "sekans", { id: "s3" });
ok("markFail(sekans): o Short'un Premiere adımları atlanır, metin kalır", job.kisalar[1].adimlar.altyazi === "atlandi" && job.kisalar[1].notlar.altyazi === "sekans-yok" &&
  job.kisalar[1].adimlar.metin === "bekliyor" && job.kisalar[1].hatalar.sekans === "Auto Reframe çöktü");
ok("nextStep: sonra Short 1'in altyazısı", JSON.stringify(P.nextStep(job)) === JSON.stringify({ i: 0, adim: "altyazi" }) && job.kisalar[0].dikeyId === "d1");
P.resumeJob(job);
ok("resumeJob: hatalı sekans ve onun yüzünden atlananlar yeniden bekler", job.kisalar[1].adimlar.sekans === "bekliyor" && job.kisalar[1].adimlar.altyazi === "bekliyor" &&
  !job.kisalar[1].hatalar.sekans && P.nextStep(job).i === 1);
ok("devamEdilebilir: yarım iş evet, bozuk kayıt hayır", P.devamEdilebilir(job) && !P.devamEdilebilir(null) && !P.devamEdilebilir({ v: 2 }) && !P.devamEdilebilir({ v: 1, kisalar: [] }));

/* ---------------- runJob: sahte bağımlılıklar ---------------- */
function sahte(o) {
  o = o || {};
  var log = [], kayitlar = 0, llmAcik = 0, llmCakisti = false, iptal = false;
  var deps = {
    makeShorts: function (k) { log.push("make:" + k.no); return Promise.resolve(o.makeHata === k.no ? { ok: false, hata: "olmadı" } : { ok: true, id: "s" + k.no, dikeyId: "d" + k.no }); },
    activate: function (k) {
      log.push("activate:" + k.no);
      if (o.activateHata === k.no) return Promise.resolve({ ok: false, hata: "açılmadı" });
      return Promise.resolve({ ok: true, width: 1080, height: 1920, end: 30, fps: 30, paket: (o.paket && o.paket[k.no]) || [], miras: { altyazi: o.miras === k.no ? 1 : 0 } });
    },
    altyazi: function (k) { log.push("altyazi:" + k.no); return Promise.resolve({ ok: true }); },
    kanca: function (k) {
      log.push("kanca:" + k.no);
      if (o.kancaAt === k.no) throw new Error("render patladı");
      return Promise.resolve({ ok: true });
    },
    cerceve: function (k) { log.push("cerceve:" + k.no); if (o.cerceveIptal === k.no) iptal = true; return Promise.resolve(o.cerceveAtla ? { atla: "cerceve-bos" } : { ok: true }); },
    metin: function (k) {
      log.push("metin:" + k.no);
      if (llmAcik) llmCakisti = true;
      llmAcik++;
      return new Promise(function (res) { setTimeout(function () { llmAcik--; res({ ok: true, paylasim: { youtube: { baslik: "b" + k.no } } }); }, 5); });
    },
    kaydet: function () { kayitlar++; },
    iptalMi: function () { return iptal; },
    anaSekansaDon: function () { log.push("ana"); return o.anaHata ? Promise.reject(new Error("x")) : Promise.resolve(); }
  };
  return { deps: deps, log: log, kayit: function () { return kayitlar; }, cakisti: function () { return llmCakisti; } };
}

(async function () {
  var s1 = sahte({ kancaAt: 2 });
  var j1 = await P.runJob(P.newJob({ plan: P.planla({ anlar: anlar, yetenek: tamYetenek }), kaynakId: "ana" }), s1.deps);
  ok("runJob: önce tüm sekanslar, sonra Short başına aç → altyazı → kanca → çerçeve → metin", s1.log.join(" ") ===
    "make:1 make:2 make:3 activate:1 altyazi:1 kanca:1 cerceve:1 metin:1 activate:2 altyazi:2 kanca:2 activate:2 cerceve:2 metin:2 activate:3 altyazi:3 kanca:3 cerceve:3 metin:3 ana", s1.log.join(" "));
  ok("runJob: Short 2'nin hatası Short 3'ü durdurmaz, hata kayıtlı", j1.kisalar[1].adimlar.kanca === "hata" && /render patladı/.test(j1.kisalar[1].hatalar.kanca) &&
    j1.kisalar[2].adimlar.metin === "tamam" && j1.durum === "bitti");
  ok("runJob: her adımdan sonra kaydedilir", s1.kayit() >= 18, s1.kayit());
  ok("runJob: LLM çağrıları üst üste binmez", !s1.cakisti());
  ok("runJob: sekans kimlikleri ve paylaşım metni işe yazılır", j1.kisalar[0].seqId === "s1" && j1.kisalar[0].dikeyId === "d1" && j1.kisalar[0].paylasim.youtube.baslik === "b1");
  var oz = P.ozet(j1);
  ok("ozet: biten Short ve hata sayısı", oz.kisa === 3 && oz.bitenKisa === 2 && oz.hata === 1, JSON.stringify(oz));

  // devam: yalnız hatalı adım yeniden; Short 2'de kanca katmanı zaten konmuşsa (yanıt kaybolmuş) o da atlanır
  var s2 = sahte({ paket: { 2: [P.KATMAN.kanca] } });
  await P.runJob(P.resumeJob(j1), s2.deps);
  ok("devam: bitmiş adımlar ve activate'in listelediği katman atlanır", s2.log.join(" ") === "activate:2 ana" && j1.kisalar[1].adimlar.kanca === "tamam", s2.log.join(" "));

  var s3 = sahte({ makeHata: 1, activateHata: 2, miras: 3 });
  var j3 = await P.runJob(P.newJob({ plan: P.planla({ anlar: anlar, yetenek: tamYetenek }) }), s3.deps);
  ok("runJob: sekansı oluşmayan Short'ta yalnız metin; açılamayan Short'un Premiere adımları hata", s3.log.join(" ") ===
    "make:1 make:2 make:3 metin:1 activate:2 metin:2 activate:3 kanca:3 cerceve:3 metin:3 ana", s3.log.join(" "));
  ok("runJob: miras altyazı katmanı varsa altyazı gerekçeyle atlanır", j3.kisalar[2].adimlar.altyazi === "atlandi" && j3.kisalar[2].notlar.altyazi === "miras" &&
    j3.kisalar[1].adimlar.altyazi === "hata" && /açılmadı/.test(j3.kisalar[1].hatalar.kanca));

  var s4 = sahte({ cerceveIptal: 1, anaHata: true });
  var j4 = await P.runJob(P.newJob({ plan: P.planla({ anlar: anlar, yetenek: tamYetenek }) }), s4.deps);
  ok("runJob: İptal adımlar arasında denetlenir; ana sekans yine açılır (hata yutulur)", j4.durum === "iptal" && s4.log[s4.log.length - 1] === "ana" &&
    s4.log.indexOf("metin:1") === -1 && j4.kisalar[0].adimlar.cerceve === "tamam" && P.devamEdilebilir(j4));

  var s5 = sahte({ cerceveAtla: true });
  var j5 = await P.runJob(P.newJob({ plan: P.planla({ anlar: [anlar[0]], yetenek: tamYetenek }) }), s5.deps);
  ok("runJob: adım { atla } dönerse gerekçeyle atlanır", j5.kisalar[0].adimlar.cerceve === "atlandi" && j5.kisalar[0].notlar.cerceve === "cerceve-bos");

  var s6 = sahte();
  s6.deps.activate = function () { throw new Error("evalScript düştü"); };
  var j6 = await P.runJob(P.newJob({ plan: P.planla({ anlar: [anlar[0]], yetenek: tamYetenek }) }), s6.deps);
  ok("runJob: activate istisnası da adımı hata yapar, iş biter", j6.durum === "bitti" && j6.kisalar[0].adimlar.metin === "tamam" &&
    ["altyazi", "kanca", "cerceve"].some(function (a) { return j6.kisalar[0].adimlar[a] === "hata"; }), JSON.stringify(j6.kisalar[0].adimlar));

  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + e.stack); process.exit(1); });
