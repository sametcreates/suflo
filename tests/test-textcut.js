// Suflo testi: js/textcut.js — metinden kurgu ve dolgu temizligi
var path = require("path");
var T = require(path.join(__dirname, "..", "js", "textcut.js"));

var gecen = 0, toplam = 0;
function chk(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : ""));
}
function w(s, e, t) { return { start: s, end: e, text: t }; }
function yakin(a, b) { return Math.abs(a - b) < 1e-6; }

/* ---- dolgu algilama ---- */
chk("ııı kesin dolgu", T.fillerKind("Iııı...", "tr") === "filler");
chk("eeee kesin dolgu", T.fillerKind("eeee,", "tr") === "filler");
chk("hmmm kesin dolgu", T.fillerKind("Hmmm", "tr") === "filler");
chk("'şey' yumusak dolgu", T.fillerKind("şey", "tr") === "soft");
chk("'evet' dolgu degil", T.fillerKind("evet", "tr") === null);
chk("'ama' dolgu degil (a ile baslasa da)", T.fillerKind("ama", "tr") === null);
chk("Ingilizce um", T.fillerKind("Um,", "en") === "filler");
chk("Turkce buyuk I normalize", T.normalize("IIIı", "tr") === "ıııı", T.normalize("IIIı", "tr"));

var cumle = [w(0, 0.4, "Bugün"), w(0.5, 0.9, "ııı"), w(1.0, 1.3, "ben"), w(1.35, 1.6, "ben"),
  w(1.7, 2.1, "şey"), w(2.2, 2.6, "anlatacağım.")];
var k1 = T.classify(cumle, { lang: "tr" });
chk("classify: dolgu + tekrar isaretlendi, yumusak kapali", JSON.stringify(k1) === JSON.stringify([null, "filler", "repeat", null, null, null]), JSON.stringify(k1));
var k2 = T.classify(cumle, { lang: "tr", soft: true });
chk("classify: yumusak acikken 'şey' isaretlendi", k2[4] === "soft", JSON.stringify(k2));
var k3 = T.classify([w(0, 0.3, "ben"), w(3, 3.3, "ben")], { lang: "tr" });
chk("classify: uzak tekrar kekemelik sayilmaz", k3[0] === null);

/* ---- kesim araliklari ---- */
var cuts = T.buildCuts(cumle, [false, true, false, false, false, false], { gap: 0.1 });
chk("tek dolgu: tek kesim", cuts.length === 1, JSON.stringify(cuts));
chk("kesim onceki kelimeye girmez, nefes payi birakir", cuts[0] && yakin(cuts[0].start, 0.5), cuts[0] && cuts[0].start);
chk("kesim sonraki kelimeye girmez", cuts[0] && cuts[0].end <= 1.0 && cuts[0].end >= 0.9, cuts[0] && cuts[0].end);

var ard = T.buildCuts(cumle, [false, true, true, false, false, false], { gap: 0.1 });
chk("ardisik silinenler tek kesimde birlesir", ard.length === 1 && yakin(ard[0].start, 0.5) && ard[0].end >= 1.3 && ard[0].end <= 1.35, JSON.stringify(ard));

var bas = T.buildCuts(cumle, [true, false, false, false, false, false], { edge: 0.05, clipStart: 0 });
chk("bastaki kelime: klip baslangicina tasmaz", bas[0] && bas[0].start === 0, JSON.stringify(bas));

// minCut yalniz otomatik duraksama kesimlerine uygulanir: 0.64 sn'lik bosluk 0.6'ya
// indirilirken dogan 0.04 sn'lik kesim anlamsiz, atlanir
var sik = T.buildCuts([w(0, 1, "a"), w(1.64, 2, "b")], [false, false], { maxPause: 0.6, minCut: 0.12 });
chk("cok kisa duraksama kesimi (<minCut) atlanir", sik.length === 0, JSON.stringify(sik));

var dur = T.buildCuts([w(0, 1, "bir"), w(4, 5, "iki"), w(5.2, 6, "üç")], [false, false, false], { maxPause: 0.6 });
chk("uzun duraksama 0.6 sn'ye indirilir", dur.length === 1 && yakin(dur[0].start, 1.3) && yakin(dur[0].end, 3.7) && dur[0].reason === "pause", JSON.stringify(dur));
chk("kalan duraksama tam maxPause", dur.length === 1 && yakin((4 - 1) - (dur[0].end - dur[0].start), 0.6));
chk("maxPause kapaliyken duraksama kesilmez", T.buildCuts([w(0, 1, "a"), w(4, 5, "b")], [false, false], {}).length === 0);

var bozuk = T.buildCuts([w(0, 1, "a"), { start: NaN, end: 2, text: "x" }, w(2, 3, "b")], [false, true, false], {});
chk("bozuk zamanli kelime yok sayilir", bozuk.length === 0, JSON.stringify(bozuk));

var karisik = T.buildCuts([w(0, 1, "a"), w(1.1, 1.4, "ııı"), w(3.5, 4, "b")], [false, true, false], { gap: 0.1, maxPause: 0.6 });
chk("dolgu + duraksama birlesip cakismasiz", karisik.every(function (r, i) { return i === 0 || r.start > karisik[i - 1].end; }), JSON.stringify(karisik));
chk("totalSeconds", yakin(T.totalSeconds([{ start: 1, end: 2 }, { start: 3, end: 3.5 }]), 1.5));
chk("fillerPrompt Turkce", /ıı/.test(T.fillerPrompt("tr")));

/* inceleme duzeltmeleri */
chk("Rusca 'а' baglaci kesin dolgu degil", T.fillerKind("а", "ru") === "soft");
var ik = T.classify([w(0, .4, "yavaş"), w(.45, .8, "yavaş"), w(1, 1.3, "ben"), w(1.35, 1.6, "ben")], { lang: "tr" });
chk("Turkce ikileme (yavaş yavaş) tekrar sayilmaz, kekemelik (ben ben) sayilir", ik[0] === null && ik[2] === "repeat", JSON.stringify(ik));
var kisa = T.buildCuts([w(0, 1, "a"), w(1, 1.05, "ı"), w(1.05, 2, "b")], [false, true, false], {});
chk("kullanicinin sildigi cok kisa kelime de kesilir", kisa.length === 1 && kisa[0].start === 1 && kisa[0].end === 1.05, JSON.stringify(kisa));
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
