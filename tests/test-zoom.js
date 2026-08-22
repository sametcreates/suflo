/* Otomatik Zoom — plan uretici testleri (saf mantik, Premiere gerekmez) */
var Z = require("../js/zoom.js");

var gecti = 0, kaldi = 0;
function chk(ad, kosul, detay) {
  if (kosul) { gecti++; console.log("  ok  " + ad); }
  else { kaldi++; console.error("  FAIL " + ad + (detay !== undefined ? "  ->  " + JSON.stringify(detay) : "")); }
}

/* ---- segment cikarimi ---- */
var segs = Z.segmentler([{ start: 5, end: 7 }, { start: 12, end: 14 }], 20);
chk("sessizliklerin tersi konusma segmentleri", segs.length === 3 &&
  segs[0].start === 0 && segs[0].end === 5 && segs[2].start === 14 && segs[2].end === 20, segs);

chk("sessizlik yoksa tek tam segment", (function () {
  var s = Z.segmentler([], 30);
  return s.length === 1 && s[0].start === 0 && s[0].end === 30;
})());

chk("orten/sirasiz sessizlikler birlesir", (function () {
  var s = Z.segmentler([{ start: 10, end: 12 }, { start: 3, end: 6 }, { start: 5, end: 8 }], 20);
  return s.length === 3 && Math.abs(s[1].start - 8) < 0.001 && Math.abs(s[1].end - 10) < 0.001;
})());

/* ---- konusma modu plani ---- */
var p = Z.plan({
  dur: 60,
  segments: [{ start: 0, end: 8 }, { start: 10, end: 22 }, { start: 25, end: 40 }, { start: 43, end: 60 }],
  intensity: 0.12, speed: 0.45, mode: "speech"
});
chk("konusma modunda kalir", p.mode === "speech", p.mode);
chk("4 segment -> 4 toggle", p.toggles === 4, p.toggles);
chk("ilk anahtar t=0", p.keys[0].time === 0, p.keys[0]);
chk("degerler carpan araliginda (1 .. 1+I*1.02)", p.keys.every(function (k) {
  return k.value >= 0.99 && k.value <= 1.12 * 1.02 + 0.001;
}), p.keys.map(function (k) { return k.value; }));
chk("zaman siralamasi artan", p.keys.every(function (k, i) {
  return i === 0 || k.time > p.keys[i - 1].time;
}));
chk("hicbir anahtar sureyi asmaz", p.keys.every(function (k) { return k.time <= 60; }));
var son = p.keys[p.keys.length - 1].value;
chk("4 toggle sonrasi durum baz (cift sayi)", Math.abs(son - 1) < 0.001, son);

/* ---- titreme korumasi ---- */
var sik = Z.plan({
  dur: 20,
  segments: [{ start: 0, end: 0.7 }, { start: 0.8, end: 1.5 }, { start: 1.6, end: 2.5 }, { start: 9, end: 20 }],
  intensity: 0.12, speed: 0.45, mode: "speech"
});
chk("minGap: cok yakin toggle elenir (0.8 duser, 1.6 kalir)", sik.toggles === 3, sik.toggles);

/* ---- ritmik moda dusus ---- */
var tek = Z.plan({ dur: 30, segments: [{ start: 0, end: 30 }], intensity: 0.12, speed: 0.45, mode: "speech", interval: 5 });
chk("tek segment -> ritmik moda duser", tek.mode === "rhythm", tek.mode);
chk("ritmik: ~30/5 toggle", tek.toggles >= 5 && tek.toggles <= 6, tek.toggles);

/* ---- asiri icerik guvenligi ---- */
var cok = [];
for (var i = 0; i < 500; i++) cok.push({ start: i * 4, end: i * 4 + 3 });
var buyuk = Z.plan({ dur: 2000, segments: cok, intensity: 0.12, speed: 0.45, mode: "speech" });
chk("500 segmentte toggle <= 120", buyuk.toggles <= 120, buyuk.toggles);
chk("anahtar sayisi makul (<= 400)", buyuk.keys.length <= 400, buyuk.keys.length);

/* ---- girdi dogrulama ---- */
var uc = Z.plan({ dur: 10, segments: [], intensity: 99, speed: -5, mode: "speech", interval: 0.1 });
chk("asiri parametreler kelepcelenir (I tavan .30 + overshoot payi)", uc.keys.every(function (k) { return k.value <= 1.30 * 1.012 + 0.001 && k.value >= 0.99; }));

/* ---- stiller (AutoCut: Yumusak / Jump Cut / Snap-In) ---- */
var segTest = [{ start: 0, end: 6 }, { start: 8, end: 16 }, { start: 18, end: 30 }];
var yum = Z.plan({ dur: 30, segments: segTest, style: "smooth", mode: "speech" });
chk("yumusak stil: 3-anahtarli gecis (overshoot)", yum.style === "smooth" && yum.keys.length > yum.toggles * 2, yum.keys.length);

var jc = Z.plan({ dur: 30, segments: segTest, style: "jumpcut", mode: "speech" });
chk("jumpcut: stil dogru", jc.style === "jumpcut");
chk("jumpcut: yumusaktan az anahtar (sert kesme)", jc.keys.length < yum.keys.length, { jc: jc.keys.length, yum: yum.keys.length });
chk("jumpcut: art arda anahtarlar cok yakin (~kesme)", (function () {
  for (var i = 1; i < jc.keys.length; i++) {
    if (jc.keys[i].value !== jc.keys[i - 1].value && (jc.keys[i].time - jc.keys[i - 1].time) < 0.08) return true;
  }
  return false;
})());

var sn = Z.plan({ dur: 30, segments: segTest, style: "snapin", mode: "speech" });
chk("snapin: stil dogru", sn.style === "snapin");
chk("snapin: kademeli (yumusaktan cok anahtar)", sn.keys.length >= yum.keys.length, { sn: sn.keys.length, yum: yum.keys.length });

chk("bilinmeyen stil -> smooth", Z.plan({ dur: 20, segments: segTest, style: "zzz", mode: "speech" }).style === "smooth");
chk("tum stillerde deger araligi korunur", [yum, jc, sn].every(function (pl) {
  return pl.keys.every(function (k) { return k.value >= 0.99 && k.value <= 1.31; });
}));

console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
if (kaldi) process.exit(1);
