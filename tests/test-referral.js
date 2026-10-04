// Suflo testi: js/referral-core.js — davet kodu, paylasim metinleri, indirimli odeme baglantisi,
// kademeler, davet istemi kurallari, kredi satiri ve Story karti ASS'i
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var R = require(path.join(__dirname, "..", "js", "referral-core.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 240) + "]" : "")); }

/* ---------------- kod bicimi ---------------- */
ok("gecerli kodlar: SFL + 6 karakter [A-Z2-7]", ["SFLABCDEF", "SFL234567", "SFLZZZZZ2"].every(R.isValidCode));
var gecersiz = ["sflabcdef", "SFLabcdef", "SFL-ABCDE", "SFL ABCDE", "SFLABCDE", "SFLABCDEFG", "SFLABCDE1", "SFLABCDE8",
  "SFLABCD0E", "XYZABCDEF", "", null, undefined, 123, "SFLABC'OR'1", "SFLABCDE\n", " SFLABCDEF", "SFLABCDEF ", "<script>",
  "SFLİBCDEF", "SFLABCDEF&x=1", "SFLABC%20D"];
ok("gecersiz: kucuk harf, tire, bosluk, 0/1/8, uzunluk, enjeksiyon", gecersiz.every(function (c) { return !R.isValidCode(c); }),
  gecersiz.filter(R.isValidCode).join(","));
ok("kodTemizle: kullanici girisini buyutur, bosluk/tire atar", R.kodTemizle(" sfl-abc def ") === "SFLABCDEF" && R.kodTemizle("SFL ABC") === "" && R.kodTemizle(null) === "");

/* ---------------- baglantilar ---------------- */
ok("shareUrl: suflo.app/?d=KOD (GitHub Pages'te /d/ yolu yok)", R.shareUrl("SFLABCDEF") === "https://suflo.app/?d=SFLABCDEF" && R.shareUrl("bozuk") === "https://suflo.app/");
var ref = R.newRefId();
ok("newRefId: 10 karakter [a-z2-7]", /^[a-z2-7]{10}$/.test(ref) && R.isValidRefId(ref), ref);
var sabit = R.newRefId([0, 1, 25, 26, 31, 32, 255, 64, 100, 7]);
ok("newRefId: verilen baytlardan belirlenimli", sabit === "abz27a7aeh", sabit);
var hepsi = {};
for (var r = 0; r < 300; r++) hepsi[R.newRefId()] = 1;
ok("newRefId: tekrarsiz (300 deneme)", Object.keys(hepsi).length === 300);
ok("freeRefUrl: suflo.app/?ref=kimlik, gecersizde site", R.freeRefUrl(ref) === "https://suflo.app/?ref=" + ref && R.freeRefUrl("ABC") === "https://suflo.app/" &&
  R.freeRefUrl("abc&x=1234") === "https://suflo.app/");
var src = fs.readFileSync(path.join(__dirname, "..", "js", "referral-core.js"), "utf8");
ok("davet kimligi makine kimliginden turetilmez", !/machineId|instanceName|instanceId/.test(src));

/* ---------------- paylasim metinleri ---------------- */
var link = R.shareUrl("SFLABCDEF");
var tumKanal = ["whatsapp", "x", "instagram", "plain"];
["tr", "en"].forEach(function (dil) {
  tumKanal.forEach(function (ch) {
    var t = R.shareText(dil, ch, { code: "SFLABCDEF", link: link });
    ok("shareText " + dil + "/" + ch + ": kod ve baglanti var", t.indexOf("SFLABCDEF") !== -1 && t.indexOf(link) !== -1, t);
    var k = R.shareText(dil, ch, { link: R.freeRefUrl(ref) });
    ok("shareText " + dil + "/" + ch + " kodsuz: baglanti var, kod yok", k.indexOf("?ref=" + ref) !== -1 && !/SFL/.test(k) && !/%\d|\d+%/.test(k), k);
  });
  var x = R.shareText(dil, "x", { code: "SFLABCDEF", link: link });
  ok("X metni <= 280 (" + dil + ")", x.length <= 280, x.length);
});
var uzunLink = "https://suflo.app/?d=SFLABCDEF&" + new Array(240).join("u");
var xu = R.shareText("tr", "x", { code: "SFLABCDEF", link: uzunLink });
ok("X: uzun baglantida da 280 asilmaz", xu.length <= 280, xu.length);
var xk = R.shareText("tr", "x", { code: "SFLABCDEF", link: "https://suflo.app/?d=SFLABCDEF&" + new Array(200).join("u") });
ok("X: govde kisalsa da baglanti kesilmez", xk.length <= 280 && /u{150}$/.test(xk), xk.length);
ok("Turkce metin: %15 indirim, kod", /%15 indirim/.test(R.shareText("tr", "whatsapp", { code: "SFLABCDEF" })));
ok("Ingilizce metin: 15% off", /15% off/.test(R.shareText("en", "whatsapp", { code: "SFLABCDEF" })));
ok("yuzde sunucudan gelebilir", /%20 indirim/.test(R.shareText("tr", "plain", { code: "SFLABCDEF", percent: 20 })) &&
  /%15/.test(R.shareText("tr", "plain", { code: "SFLABCDEF", percent: 0 })) && /%15/.test(R.shareText("tr", "plain", { code: "SFLABCDEF", percent: "abc" })));
ok("bilinmeyen kanal/dil duz metne/Turkceye duser", R.shareText("de", "telegram", { code: "SFLABCDEF" }) === R.shareText("tr", "plain", { code: "SFLABCDEF" }));
var zor = "Türkçe ğüşıöç & #etiket\nyeni satır ?a=1";
var wa = R.whatsappUrl(zor);
ok("WhatsApp adresi: Turkce harf, &, # ve satir sonu kodlanir", /^https:\/\/wa\.me\/\?text=/.test(wa) &&
  wa.indexOf("&") === wa.indexOf("&") && wa.slice("https://wa.me/?text=".length).indexOf("&") === -1 && wa.indexOf("#") === -1 &&
  wa.indexOf("\n") === -1 && wa.indexOf(" ") === -1 && /%C4%9F/.test(wa) && /%0A/.test(wa) && /%26/.test(wa) && /%23/.test(wa) &&
  decodeURIComponent(wa.slice("https://wa.me/?text=".length)) === zor, wa);
var tw = R.tweetUrl(zor);
ok("X adresi: intent/tweet, kodlu", /^https:\/\/x\.com\/intent\/tweet\?text=/.test(tw) && decodeURIComponent(tw.split("text=")[1]) === zor);
ok("Instagram'in paylasim adresi yok: null (yalniz kopyala)", R.channelUrl("instagram", "x") === null && R.channelUrl("plain", "x") === null &&
  R.channelUrl("whatsapp", "x") === R.whatsappUrl("x") && R.channelUrl("x", "y") === R.tweetUrl("y"));

/* ---------------- indirimli odeme baglantisi ---------------- */
var CO = "https://suflo.lemonsqueezy.com/checkout/buy/e33dda31?checkout%5Bcustom%5D%5Bsource%5D=suflo_panel&checkout%5Bcustom%5D%5Bfeature%5D=cut&checkout%5Bcustom%5D%5Bapp_version%5D=3.1.0";
var ind = R.withDiscount(CO, "SFLABCDEF");
ok("withDiscount: checkout[discount_code] eklenir", ind === CO + "&checkout%5Bdiscount_code%5D=SFLABCDEF", ind);
ok("withDiscount: checkout[custom] alanlari korunur", /checkout%5Bcustom%5D%5Bsource%5D=suflo_panel/.test(ind) && /%5Bfeature%5D=cut/.test(ind) && /%5Bapp_version%5D=3\.1\.0/.test(ind));
ok("withDiscount: gecersiz/bos kodda adres aynen", R.withDiscount(CO, "") === CO && R.withDiscount(CO, null) === CO && R.withDiscount(CO, "sflabcdef") === CO &&
  R.withDiscount(CO, "SFLABCDEF&checkout[custom][x]=1") === CO);
ok("withDiscount: soru isareti yoksa ekler", R.withDiscount("https://a.b/c", "SFLABCDEF") === "https://a.b/c?checkout%5Bdiscount_code%5D=SFLABCDEF");
ok("withDiscount: eski indirim kodu (kodlu ya da duz) degistirilir, cift olmaz",
  R.withDiscount(ind, "SFL234567") === CO + "&checkout%5Bdiscount_code%5D=SFL234567" &&
  R.withDiscount("https://a.b/c?checkout[discount_code]=SFLAAAAAA&x=1", "SFL234567") === "https://a.b/c?x=1&checkout%5Bdiscount_code%5D=SFL234567");
ok("withDiscount: # parcasi sonda kalir", R.withDiscount("https://a.b/c?x=1#fiyat", "SFLABCDEF") === "https://a.b/c?x=1&checkout%5Bdiscount_code%5D=SFLABCDEF#fiyat");
ok("withRef: checkout[custom][ref] eklenir, gecersizde aynen", R.withRef(CO, ref) === CO + "&checkout%5Bcustom%5D%5Bref%5D=" + ref && R.withRef(CO, "x\"y") === CO);

/* ---------------- kademeler ---------------- */
var tierler = [0, 1, 2, 3, 9, 10, 50].map(function (n) { return R.tierFor(n); });
ok("tierFor sinirlari 0,1,2,3,9,10,50", JSON.stringify(tierler) === "[0,1,1,3,3,10,10]", JSON.stringify(tierler));
var sonraki = [0, 1, 2, 3, 9, 10, 50].map(function (n) { return R.nextTier(n); });
ok("nextTier sinirlari", JSON.stringify(sonraki) === "[1,3,3,10,10,null,null]", JSON.stringify(sonraki));
ok("tierFor: negatif/bozuk sayi 0", R.tierFor(-3) === 0 && R.tierFor("abc") === 0 && R.tierFor(null) === 0 && R.nextTier(-1) === 1);
ok("TIERS [1, 3, 10]", JSON.stringify(R.TIERS) === "[1,3,10]");
var il = R.ilerleme(2);
ok("ilerleme: '2/3 davet', oran ve sonraki odul", il.metin === "2/3 davet" && Math.abs(il.oran - 2 / 3) < 1e-9 && il.kademe === 1 && il.sonraki === 3 && /Kurucu/.test(il.odul), JSON.stringify(il));
var il0 = R.ilerleme(0), il10 = R.ilerleme(12);
ok("ilerleme: 0'da '0/1 davet', 10+ dolu cubuk", il0.metin === "0/1 davet" && il0.oran === 0 && /Davetçi/.test(il0.odul) &&
  il10.metin === "12 davet" && il10.oran === 1 && il10.sonraki === null && /iletişime/.test(il10.odul), il10.metin);
ok("ilerleme: Ingilizce", R.ilerleme(2, "en").metin === "2/3 invites");

/* ---------------- davet istemi ---------------- */
var GUN = 24 * 3600 * 1000, simdi = Date.UTC(2026, 9, 4);
var bos = {};
ok("ilk kesim, ilk Shorts ve 5. uygulamada cikar", R.shouldPrompt(bos, simdi, "cut") && R.shouldPrompt(bos, simdi, { type: "shorts" }) &&
  R.shouldPrompt(bos, simdi, { type: "apply", count: 5 }));
ok("3. ve 4. uygulamada cikmaz (3. GitHub yildizinda kalir)", !R.shouldPrompt(bos, simdi, { type: "apply", count: 3 }) &&
  !R.shouldPrompt(bos, simdi, { type: "apply", count: 4 }) && !R.shouldPrompt(bos, simdi, "apply"));
ok("bilinmeyen olayda cikmaz", !R.shouldPrompt(bos, simdi, "export") && !R.shouldPrompt(bos, simdi, null));
ok("30 gun beklemesi", !R.shouldPrompt({ lastShown: simdi - 29 * GUN }, simdi, "cut") && R.shouldPrompt({ lastShown: simdi - 31 * GUN }, simdi, "cut"));
ok("gelecek tarihli lastShown yok sayilir", R.shouldPrompt({ lastShown: simdi + 400 * GUN }, simdi, "cut") && R.shouldPrompt({ lastShown: simdi + GUN }, simdi, "cut"));
ok("mesgulken cikmaz", !R.shouldPrompt(bos, simdi, "cut", { busy: true }) && R.promptKarari(bos, simdi, "cut", { busy: true }).neden === "busy");
ok("yildiz seridi gorunurken cikmaz", !R.shouldPrompt(bos, simdi, { type: "apply", count: 5 }, { starVisible: true }) &&
  R.promptKarari(bos, simdi, "cut", { starVisible: true }).neden === "star");
ok("'bir daha gösterme' sayilir", !R.shouldPrompt({ never: true }, simdi, "cut") && R.promptKarari({ never: true }, simdi, "cut").neden === "never");
ok("ayni olay ikinci kez cikmaz (ilk olay)", !R.shouldPrompt({ seen: { cut: true } }, simdi, "cut") && R.shouldPrompt({ seen: { cut: true } }, simdi, "shorts"));
var is1 = R.olayIsle(bos, simdi, "cut", {});
ok("olayIsle: gosterilince goruldu + lastShown, girdi degismez", is1.goster && is1.state.seen.cut === true && is1.state.lastShown === simdi && !bos.seen);
var is2 = R.olayIsle(is1.state, simdi + GUN, "shorts", {});
ok("olayIsle: beklemeye takilan ilk olay tuketilir", !is2.goster && is2.neden === "cooldown" && is2.state.seen.shorts === true && is2.state.lastShown === simdi);
var is3 = R.olayIsle(bos, simdi, "cut", { busy: true });
ok("olayIsle: mesgulken tuketilmez (sonraki tekrarda denenir)", !is3.goster && !is3.state.seen.cut && R.olayIsle(is3.state, simdi, "cut", {}).goster);
var is4 = R.olayIsle({ seen: { cut: true, kotu: true }, lastShown: "x", never: "evet" }, simdi, "apply", {});
ok("olayIsle: bozuk durum temizlenir", is4.state.lastShown === 0 && is4.state.never === false && !("kotu" in is4.state.seen));

/* ---------------- kredi satiri ---------------- */
ok("creditLine: Altyazılar: Suflo · suflo.app", R.creditLine("tr") === "Altyazılar: Suflo · suflo.app" && R.creditLine("az") === R.creditLine("tr") &&
  R.creditLine("en") === "Captions: Suflo · suflo.app" && R.creditLine("de") === R.creditLine("en"));

/* ---------------- Story karti ---------------- */
var st = R.storyAss("SFLABCDEF", 1080, 1920);
ok("storyAss: 1080x1920, kod ve baglanti", /PlayResX: 1080/.test(st.ass) && /PlayResY: 1920/.test(st.ass) && st.ass.indexOf("SFLABCDEF") !== -1 &&
  st.ass.indexOf("suflo.app/?d=SFLABCDEF") !== -1 && /%15 indirim/.test(st.ass), st.ass.length);
ok("storyAss: fontlar pakette var", st.fontFiles.length && st.fontFiles.every(function (f) { return fs.existsSync(path.join(__dirname, "..", "fonts", f)); }), st.fontFiles.join(","));
var olay = st.ass.split("\n").filter(function (l) { return /^Dialogue:/.test(l); });
ok("storyAss: her olay 10 alanli, metinde ham { } yok", olay.length >= 6 && olay.every(function (l) {
  var metin = l.split(",").slice(9).join(",");
  return l.split(",").length >= 10 && metin.replace(/\{\\[^{}]*\}/g, "").replace(/\\\{|\\\}/g, "").indexOf("{") === -1;
}), olay.length);
var kotu = R.storyAss("SFL{\\b1}X", 1080, 1920);
ok("storyAss: gecersiz kod yazilmaz (kodsuz kart)", kotu.ass.indexOf("\\b1") === -1 && kotu.ass.indexOf("SFL{") === -1 && /Ücretsiz ve açık kaynak/.test(kotu.ass));
ok("storyAss: Ingilizce", /MY INVITE CODE/.test(R.storyAss("SFLABCDEF", 1080, 1920, { lang: "en" }).ass));
ok("storyDosyaAdi: Suflo-Davet-KOD.png", R.storyDosyaAdi("SFLABCDEF") === "Suflo-Davet-SFLABCDEF.png" && R.storyDosyaAdi("../x") === "Suflo-Davet-suflo.png");

/* ---------------- ES5 / CEF 74 ---------------- */
var ayikla = require("./_ayikla.js");
var YASAK = [/\?\.[A-Za-z_$(\[]/, /\?\?/, /(\|\||&&)=/, /\.replaceAll\s*\(/, /\.at\s*\(\s*-?\d/, /=>/, /\bconst\b|\blet\b|`/];
["js/referral-core.js"].forEach(function (f) {
  var s = ayikla(fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
  var sorun = s.split("\n").filter(function (l) { return YASAK.some(function (re) { return re.test(l); }); });
  ok(f + ": ES5 / Chromium 74 uyumlu", sorun.length === 0, sorun.slice(0, 2).join(" | "));
});

/* ---------------- Story karti gercek render (libass'li ffmpeg varsa) ---------------- */
var ff = cp.spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
if (!ff.error && /\ssubtitles\s/.test(String(ff.stdout || ""))) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-davet-"));
  fs.writeFileSync(path.join(dir, "davet.ass"), st.ass, "utf8");
  st.fontFiles.forEach(function (f) { fs.copyFileSync(path.join(__dirname, "..", "fonts", f), path.join(dir, f)); });
  var r1 = cp.spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x101522:s=1080x1920:d=1",
    "-vf", "subtitles=f=davet.ass:fontsdir=.", "-frames:v", "1", "kart.png"], { cwd: dir, encoding: "utf8" });
  var png = path.join(dir, "kart.png");
  var var1 = fs.existsSync(png) ? fs.readFileSync(png) : null;
  ok("Story karti PNG 1080x1920 uretilir (kanca.js tarifi)", r1.status === 0 && var1 && var1.readUInt32BE(16) === 1080 && var1.readUInt32BE(20) === 1920,
    (r1.stderr || "").slice(0, 200));
  try { fs.readdirSync(dir).forEach(function (f) { fs.unlinkSync(path.join(dir, f)); }); fs.rmdirSync(dir); } catch (e) {}
} else {
  console.log("ATLA Story karti render: libass'li ffmpeg yok");
}

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
