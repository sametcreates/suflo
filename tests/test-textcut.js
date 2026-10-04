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
/* "Dinle" onizlemesi */
var pf = T.previewFilter([{ start: 11, end: 12 }, { start: 14, end: 14.5 }], { clipStart: 10, clipEnd: 20, dur: 10 });
chk("previewFilter: klip-ici kaynak zamanlari", pf === "aselect='not(between(t,1.000,2.000)+between(t,4.000,4.500))',asetpts=N/SR/TB", pf);
chk("previewFilter: %200 hizda kaynak zamani iki kati", /between\(t,2\.000,4\.000\)/.test(T.previewFilter([{ start: 11, end: 12 }], { clipStart: 10, clipEnd: 15, dur: 10 })));
chk("previewFilter: kesim yoksa bos", T.previewFilter([], { clipStart: 0, clipEnd: 5, dur: 5 }) === "");
var cpx = require("child_process"), fsx = require("fs"), osx = require("os"), px = require("path");
if (!cpx.spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).error) {
  var dir = fsx.mkdtempSync(px.join(osx.tmpdir(), "suflo-dinle-"));
  var giris = px.join(dir, "ses.wav"), cikis = px.join(dir, "onizleme.wav");
  cpx.spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=10", giris]);
  // gercek panel argumanlari: -ss inPoint -t dur, ardindan filtre
  var r = cpx.spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", "0", "-t", "10", "-i", giris, "-vn", "-af", pf, cikis], { encoding: "utf8" });
  var sure = Number(cpx.spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", cikis], { encoding: "utf8" }).stdout);
  chk("gercek ffmpeg: 10 sn - 1.5 sn kesim = 8.5 sn onizleme", r.status === 0 && Math.abs(sure - 8.5) < 0.05, sure + " " + (r.stderr || ""));
  try { fsx.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
} else console.log("ATLA gercek ffmpeg onizleme testi");

/* yeni diller: gercek tek harfli sozcukler dolgu degil, dile ozgu dolgular yakalanir */
chk("es/fr/it/pt: 'a' ve 'e' sozcuk, dolgu degil", ["es", "fr", "it", "pt"].every(function (l) { return T.fillerKind("a", l) === null && T.fillerKind("e", l) === null; }));
chk("de 'äh', fr 'euh', it 'ehm' kesin dolgu", T.fillerKind("Äh,", "de") === "filler" && T.fillerKind("euh", "fr") === "filler" && T.fillerKind("ehm", "it") === "filler");
chk("tablosu olmayan dil (nl): yalniz evrensel sesler", T.fillerKind("hm", "nl") === "filler" && T.fillerKind("e", "nl") === null);
chk("fillerPrompt: bilinmeyen dilde Turkce ipucu yok", !/ı|şey/.test(T.fillerPrompt("nl")) && /äh/i.test(T.fillerPrompt("de")));

// EN arayuz + "Otomatik" (cap-lang "") Turkce dolgu ipucu gondermemeli
chk("promptLang: EN arayuz + Otomatik -> en", T.promptLang("", "", "en") === "en" && T.promptLang("auto", "", "en") === "en");
chk("promptLang: TR arayuz + Otomatik -> tr", T.promptLang("", "", "tr") === "tr" && T.promptLang(undefined, "", "") === "tr");
chk("promptLang: acik secim ve algilanan dil oncelikli", T.promptLang("de", "", "en") === "de" && T.promptLang("", "ru", "en") === "ru");
chk("EN + Otomatik ipucunda Turkce dolgu yok", !/ı|şey/.test(T.fillerPrompt(T.promptLang("", "", "en"))));
var kkKaynak = fsx.readFileSync(px.join(__dirname, "..", "js", "konusma-kes.js"), "utf8");
chk("konusma-kes: dolgu ipucu promptLang + arayuz diliyle (|| \"tr\" yok)", /TC\.promptLang\(/.test(kkKaynak) && !/cap-lang"\)\.value\) \|\| "tr"/.test(kkKaynak));


/* ---- v4 Tek Tık Temizlik uzantilari (geriye uyumlu) ---- */
var ek = T.parseExtraFillers("tr: yani yani\nen: you see\nböyle\n# yorum\n\n");
chk("parseExtraFillers: dil onekli ve oneksiz satirlar", JSON.stringify(ek) === JSON.stringify({ tr: ["yani yani"], en: ["you see"], "*": ["böyle"] }), JSON.stringify(ek));
var ekCumle = [w(0, .3, "Yani"), w(.35, .6, "yani,"), w(.7, 1, "geldim"), w(1.1, 1.4, "böyle")];
var ekTr = T.classify(ekCumle, { lang: "tr", extraFillers: ek });
chk("extraFillers: cok sozcuklu tr dolgu + her dilde gecerli satir", JSON.stringify(ekTr) === JSON.stringify(["filler", "filler", null, "filler"]), JSON.stringify(ekTr));
var ekEn = T.classify([w(0, .3, "yani"), w(.35, .6, "yani"), w(1, 1.2, "you"), w(1.3, 1.5, "see")], { lang: "en", extraFillers: "tr: yani yani\nen: you see" });
chk("extraFillers: dile gore uygulanir (en'de tr dolgu yok, metin girdisi de olur)", ekEn[0] !== "filler" && ekEn[1] !== "filler" && ekEn[2] === "filler" && ekEn[3] === "filler", JSON.stringify(ekEn));
var eskiCikti = JSON.stringify(T.classify(cumle, { lang: "tr" }));
chk("phraseRepeats/extraFillers verilmezse cikti aynen", eskiCikti === JSON.stringify(k1) && JSON.stringify(T.classify(cumle, { lang: "tr", phraseRepeats: false })) === eskiCikti);
var yb = [w(0, .2, "bu"), w(.25, .6, "ürünü"), w(.7, 1, "ııı"), w(1.1, 1.3, "bu"), w(1.35, 1.7, "ürünü"), w(1.8, 2.4, "kesinlikle")];
var ybK = T.classify(yb, { lang: "tr", phraseRepeats: true });
chk("phraseRepeats: 'bu ürünü ııı bu ürünü' ilk kopya falsestart", ybK[0] === "falsestart" && ybK[1] === "falsestart" && ybK[2] === "filler" && ybK[3] === null && ybK[4] === null, JSON.stringify(ybK));
chk("phraseRepeats kapaliyken (varsayilan) falsestart yok", T.classify(yb, { lang: "tr" }).indexOf("falsestart") === -1);
chk("stemEq: önek ve ilk 4 harf", T.stemEq("size", "sizlere") === false && T.stemEq("video", "videoda") && T.stemEq("kamera", "kamerayı") && T.stemEq("sizlerle", "sizlere") && !T.stemEq("bu", "bunu"));

var cok = [];
for (var ci = 0; ci < 500; ci++) cok.push({ start: ci * 1.0, end: ci * 1.0 + 0.85 });
var cc = T.capCuts(cok, { max: 300, mergeGap: 0.25 });
chk("capCuts: 500 kesim <=300'e iner, birlesme bildirilir", cc.ranges.length <= 300 && cc.merged > 0, cc.ranges.length + " / merged " + cc.merged);
chk("capCuts: sirali ve cakismasiz", cc.ranges.every(function (r, i) { return i === 0 || r.start > cc.ranges[i - 1].end; }));
var seyrek = [];
for (var si = 0; si < 400; si++) seyrek.push({ start: si * 3, end: si * 3 + (si % 2 ? 0.5 : 0.2) });
var cs2 = T.capCuts(seyrek, { max: 300 });
chk("capCuts: uzak kesimler birlesmez, en kisalar birakilir (konusma yutulmaz)", cs2.ranges.length === 300 && cs2.merged === 0 && cs2.dropped === 100 &&
  cs2.ranges.filter(function (r) { return r.end - r.start > 0.4; }).length === 200, JSON.stringify([cs2.ranges.length, cs2.merged, cs2.dropped]));
var az = T.capCuts([{ start: 1, end: 2 }], {});
chk("capCuts: sinir altinda dokunmaz", az.ranges.length === 1 && az.merged === 0 && az.dropped === 0);
var inv = T.invertRanges([{ start: 0, end: 1 }, { start: 3, end: 4 }, { start: 3.5, end: 5 }, { start: 9, end: 12 }], 0, 10);
chk("invertRanges: kenarlarda dogru", JSON.stringify(inv) === JSON.stringify([{ start: 1, end: 3 }, { start: 5, end: 9 }]), JSON.stringify(inv));
chk("invertRanges: bos liste tum aralik", JSON.stringify(T.invertRanges([], 2, 5)) === JSON.stringify([{ start: 2, end: 5 }]));
chk("previewFilter: varsayilan bayt bayt ayni", T.previewFilter([{ start: 11, end: 12 }, { start: 14, end: 14.5 }], { clipStart: 10, clipEnd: 20, dur: 10 }) === pf);
var only = T.previewFilter([{ start: 11, end: 12 }, { start: 14, end: 14.5 }], { clipStart: 10, clipEnd: 20, dur: 10 }, null, { only: true });
chk("previewFilter only: aselect between()", only === "aselect='between(t,1.000,2.000)+between(t,4.000,4.500)',asetpts=N/SR/TB", only);
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
