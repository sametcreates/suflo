// Suflo testi: Tek Tık Temizlik panel bağlantıları — kart denetimleri, inceleme listesi,
// ayarlar, kopya sekans adı (host.jsx), i18n atlama listesi, AI anahtar çipi
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var TC = require(path.join(KOK, "js", "textcut.js"));
var R = require(path.join(KOK, "js", "retakes.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function oku(f) { return fs.readFileSync(path.join(KOK, f), "utf8").replace(/\r\n/g, "\n"); }

var html = oku("index.html");
var kart = html.slice(html.indexOf('id="tc-card"'), html.indexOf('id="sc-card"'));
ok("#tc-retake varsayılan açık", /<input id="tc-retake" type="checkbox" checked>/.test(kart) && /Tekrar çekimler \(baştan alınan cümleler, yarım başlangıçlar\)/.test(kart));
ok("#tc-policy: son (varsayılan) / uzun / akici", /<option value="son" selected>Son çekimi tut<\/option>/.test(kart) && /value="uzun">En uzunu tut/.test(kart) && /value="akici">En akıcıyı tut/.test(kart));
ok("#tc-ai anahtar çipi için etiketli", /id="tc-ai-lbl"[^>]*><input id="tc-ai" type="checkbox">/.test(kart) && /AI ile benzer anlatımları da grupla/.test(kart));
ok("senaryo: <details> içinde #tc-script", /<details[^>]*>\s*<summary>Senaryoyu yapıştır \(isteğe bağlı\)<\/summary>\s*<textarea id="tc-script"/.test(kart));
ok("#tc-review #tc-words'ten önce", kart.indexOf('id="tc-review"') > 0 && kart.indexOf('id="tc-review"') < kart.indexOf('id="tc-words"'));
ok("#tc-dinle-cuts ve önbellek satırı", /id="tc-dinle-cuts"[^>]*>Yalnız kesilecekleri dinle</.test(kart) && /id="tc-retranscribe"/.test(kart) && /önbellekten ·/.test(kart));
ok("lejant: tekrar çekim, yarım başlangıç, tutulan çekim", /tc-w retake">tekrar çekim/.test(kart) && /tc-w falsestart">yarım başlangıç/.test(kart) && /tc-w retake-kept">tutulan çekim/.test(kart));
ok("Ayarlar: #set-fillers 'Konuşmadan kes için (Pro)' + önbellek temizleme", /id="set-fillers"/.test(html) && /Konuşmadan kes için \(Pro\)/.test(html) && /id="set-tcache-clear"[^>]*>Transkript önbelleğini temizle/.test(html));

var css = oku("css/style.css");
ok("CSS: .tc-w.retake mavi + üstü çizili, .retake-kept mavi alt çizgi, .falsestart", /\.tc-w\.retake, \.tc-w\.falsestart \{ text-decoration: line-through/.test(css) && /\.tc-w\.retake-kept \{ text-decoration: underline/.test(css) && /\.tc-w\.falsestart \{/.test(css));

var i18n = require(path.join(KOK, "js", "i18n.js"));
ok("i18n: senaryo ve inceleme listesi kullanıcı içeriği", i18n.USER_CONTENT_IDS.indexOf("tc-script") !== -1 && i18n.USER_CONTENT_IDS.indexOf("tc-review") !== -1 && i18n.USER_CONTENT_IDS.indexOf("tc-words") !== -1);

var kk = oku("js/konusma-kes.js");
var uygula = kk.slice(kk.indexOf("async function apply()"), kk.indexOf("// \"Dinle\""));
ok("uygula: önce capCuts (300), sonra KS_applyCuts", uygula.indexOf("TC.capCuts(kesimler(), { max: 300, mergeGap: 0.25 })") !== -1 && uygula.indexOf("capCuts") < uygula.indexOf("KS_applyCuts"));
ok("uygula: '300+ kesim birleştirildi' uyarısı", /"300\+ kesim birleştirildi"/.test(uygula));
ok("uygula: ripple + kopya sekans + '— Suflo Temiz' adı", /removeMode: "ripple", cloneFirst: target === "clone"/.test(uygula) && /" — Suflo Temiz"/.test(uygula));
ok("Yalnız kesilecekleri dinle: only:true", /only: true/.test(kk) && /oynatici\.MAX_SN \+ " kesim dinletiliyor/.test(kk));
ok("özet satırı ' · N tekrar çekim'", /" · " \+ n \+ " tekrar çekim"/.test(kk));
ok("AI: sıralı chatCall + bayat cevap koruması + hata uyarısı", /await KCaptions\.chatCall\(cfg, RT\.llmRequest\(/.test(kk) && /benim !== aiSurum \|\| clip !== benimKlip/.test(kk) && /AI gruplama yapılamadı — sezgisel sonuç geçerli/.test(kk));
ok("AI: anahtar yoksa #tc-ai kapalı", /ai\.disabled = !hazir/.test(kk));
ok("Yeniden yazıya dök önbelleği atlar", /cache: zorla \? false : undefined/.test(kk) && /analyze\(true\)/.test(kk));
ok("çip tıklaması: elle[] grubu temizlenir ve yeniden sınıflanır", /function cekimSec\(g, sid\) \{\s*grupSecim\[grupAnahtari\(g\)\] = \{ keep: sid, on: true \};\s*grupElleTemizle\(g\);\s*yenidenSinifla\(\);/.test(kk));
ok("inceleme işareti elle[]'ye yazar (tek doğruluk kaynağı)", /row\.words\.forEach\(function \(i\) \{ elle\[i\] = isaretli;/.test(kk));
ok("zaman bağlantısı KS_setPlayerPosition", /K\.call\("KS_setPlayerPosition", \{ sec: row\.start \}\)/.test(kk));
ok("ek dolgular sınıflamaya gider", /extraFillers: K\.settings\(\)\.extraFillers/.test(kk));

var host = oku("jsx/host.jsx");
var ac = host.slice(host.indexOf("function KS_applyCuts"), host.indexOf("app.enableQE();", host.indexOf("function KS_applyCuts")));
ok("host.jsx: kopyadan sonra isteğe bağlı cloneName, try içinde", /if \(p\.cloneName\) \{ try \{ seq\.name = String\(p\.cloneName\); \} catch \(eN\) \{\} \}/.test(ac) && ac.indexOf("KS_cloneActiveSeq") < ac.indexOf("p.cloneName"));

var onb = oku("js/onboarding.js");
ok("AI anahtar çipi #tc-ai-lbl yanında", /\{ id: "tc-ai-lbl", ozellik: "AI tekrar gruplama" \}/.test(onb));
var SO = require(path.join(KOK, "js", "onboarding-steps.js"));
ok("AI tekrar gruplama Pro'ya bağlı (textcut)", SO.aiProOzelligi("AI tekrar gruplama") === "textcut");

var app = oku("js/app.js");
ok("Ayarlar: extraFillers kaydı + önbellek temizleme", /st\.extraFillers = String\(el\("set-fillers"\)\.value/.test(app) && /KCaptions\.onbellegiTemizle\(\)/.test(app));

/* ---- inceleme listesi (saf) ---- */
function kur(cumleler) {
  var words = [], t = 0;
  cumleler.forEach(function (c, ci) {
    if (ci > 0) t += 1.0;
    c.split(/\s+/).forEach(function (s, i) { if (i > 0) t += 0.1; words.push({ start: t, end: t + 0.3, text: s }); t += 0.3; });
  });
  return words;
}
var w = kur(["Merhaba ııı arkadaşlar.", "Bugün size kamerayı nasıl ayarladığımı anlatacağım.", "Bugün size kamerayı nasıl ayarladığımı anlatacağım.", "Bu arada abone olun.", "Şimdi size", "Şimdi size ışığı göstereceğim."]);
var res = R.detect(w, { lang: "tr", script: "Merhaba arkadaşlar.\nBugün size kamerayı nasıl ayarladığımı anlatacağım.\nŞimdi size ışığı göstereceğim." });
var et = R.labelWords(w, res);
var oneri = TC.classify(w, { lang: "tr" });
et.forEach(function (e, i) { if (e === "retake" || e === "falsestart") oneri[i] = e; });
var cut = oneri.map(function (x) { return !!x; });
var cuts = TC.buildCuts(w, cut, { clipStart: 0, clipEnd: 40, maxPause: 0.6 });
var rows = R.reviewRows({ words: w, cut: cut, labels: oneri, elle: {}, cuts: cuts, res: res });
var nedenler = rows.map(function (r) { return r.reason + (r.checked ? "+" : "-"); });
ok("inceleme: dolgu, tekrar çekim (işaretli)", nedenler.indexOf("dolgu+") !== -1 && nedenler.indexOf("tekrar-cekim+") !== -1, nedenler.join(" "));
ok("inceleme: orta güvenli yarım başlangıç işaretsiz aday", rows.some(function (r) { return r.type === "group" && r.reason === "yarim" && !r.checked && r.conf === "orta"; }), nedenler.join(" "));
ok("inceleme: senaryo dışı cümle işaretsiz aday", rows.some(function (r) { return r.type === "offscript" && !r.checked && r.words.length === 4; }), nedenler.join(" "));
ok("inceleme: duraksama satırı", nedenler.indexOf("duraksama+") !== -1, nedenler.join(" "));
ok("inceleme: zamana göre sıralı", rows.every(function (r, i) { return i === 0 || r.start >= rows[i - 1].start; }));
// senaryo dışı cümle elle işaretlenince kesim satırına "senaryo dışı" nedeniyle girer
var dis = rows.filter(function (r) { return r.type === "offscript"; })[0];
var elle = {};
dis.words.forEach(function (i) { elle[i] = true; });
var cut2 = cut.map(function (c, i) { return elle.hasOwnProperty(i) ? elle[i] : c; });
var rows2 = R.reviewRows({ words: w, cut: cut2, labels: oneri, elle: elle, cuts: TC.buildCuts(w, cut2, { clipStart: 0, clipEnd: 40 }), res: res });
ok("senaryo dışı işaretlenince kesim satırı 'senaryo-disi'", rows2.some(function (r) { return r.type === "range" && r.reason === "senaryo-disi"; }) && !rows2.some(function (r) { return r.type === "offscript"; }), rows2.map(function (r) { return r.type + ":" + r.reason; }).join(" "));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
