// Suflo testi: host.jsx KS_applyCutTransition — sahte Premiere nesne modeliyle gercek calistirma
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ROOT = path.join(__dirname, "..");
var T = require(path.join(ROOT, "js", "transitions.js"));

var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 220) + "]" : ""));
}

function FakeTime() { this.seconds = 0; }
function FakeProp(value) { this.value = value; this.keys = []; }
FakeProp.prototype.getValue = function () { return this.value; };
FakeProp.prototype.getValueAtTime = function () { return this.value; };
FakeProp.prototype.setValue = function (v) { this.value = v; };
FakeProp.prototype.setTimeVarying = function (v) { this.timeVarying = v; };
FakeProp.prototype.removeKeyRange = function (a, b) { this.keys = this.keys.filter(function (k) { return k.time < a.seconds || k.time > b.seconds; }); };
FakeProp.prototype.removeKey = function (t) { this.keys = this.keys.filter(function (k) { return Math.abs(k.time - t.seconds) > .0001; }); };
FakeProp.prototype.addKey = function () {};
FakeProp.prototype.setValueAtKey = function (t, v) { this.keys.push({ time: t.seconds, value: v }); };
FakeProp.prototype.setInterpolationTypeAtKey = function () {};
FakeProp.prototype.areKeyframesSupported = function () { return true; };
FakeProp.prototype.getKeys = function () { return this.keys.map(function (k) { return { seconds: k.time }; }); };

function list(items) { var o = { numItems: items.length }; items.forEach(function (x, i) { o[i] = x; }); return o; }
function prop(m, d, v) { var p = new FakeProp(v); p.matchName = m; p.displayName = d; return p; }
function makeClip(start, end, inPoint) {
  var c = {
    pos: prop("ADBE Position", "Position", [0.5, 0.5]),
    scale: prop("ADBE Scale", "Scale", 100),
    opacity: prop("ADBE Opacity", "Opacity", 100),
    start: { seconds: start }, end: { seconds: end },
    inPoint: { seconds: inPoint }, outPoint: { seconds: inPoint + (end - start) },
    isSpeedReversed: function () { return false; },
    projectItem: {}, nodeId: "n" + start + "-" + end
  };
  c.components = list([
    { matchName: "ADBE Motion", displayName: "Motion", properties: list([c.pos, c.scale]) },
    { matchName: "ADBE Opacity", displayName: "Opacity", properties: list([c.opacity]) }
  ]);
  return c;
}

var A = makeClip(0, 5, 10), B = makeClip(5, 9, 20), C = makeClip(9.5, 12, 30);
var playhead = 5.2;
var secim = [];
var tracks = list([{ clips: list([A, B, C]), isLocked: function () { return false; } }]);
tracks.numTracks = 1;
var sequence = {
  frameSizeHorizontal: 1920, frameSizeVertical: 1080, videoTracks: tracks,
  timebase: String(254016000000 / 25),
  getSelection: function () { return secim; },
  getPlayerPosition: function () { return { seconds: playhead }; }
};
var ctx = {
  app: { project: { activeSequence: sequence }, enableQE: function () {} },
  Time: FakeTime, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
  isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, File: function () {}, Folder: function () {}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8"), ctx, { filename: "jsx/host.jsx" });
function uygula(id, opts) {
  return JSON.parse(ctx.KS_applyCutTransition(encodeURIComponent(JSON.stringify({ plan: T.hostPlan(id, opts || { duration: 0.6 }), tolerance: 1 }))));
}

var r = uygula("zoom-in");
ok("zoom-in: kesim bulundu ve iki tarafa yazildi", r.ok && r.cut === 5 && r.out && r["in"], JSON.stringify(r));
var aKeys = A.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
var bKeys = B.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("A anahtarlari A'nin KAYNAK sonunda (14.7..15)", aKeys.length === 3 && Math.abs(aKeys[0].time - 14.7) < 1e-6 && Math.abs(aKeys[2].time - 15) < 1e-6, JSON.stringify(aKeys));
ok("A kesimde buyumus", aKeys[2].value > 140, aKeys[2].value);
ok("B anahtarlari B'nin KAYNAK basinda (20..20.3), 100'e doner", bKeys.length === 3 && Math.abs(bKeys[0].time - 20) < 1e-6 &&
  Math.abs(bKeys[2].time - 20.3) < 1e-6 && bKeys[2].value === 100 && bKeys[0].value > 130, JSON.stringify(bKeys));
ok("C'ye (bosluktan sonra) dokunulmadi", C.scale.keys.length === 0);

var w = uygula("whip-left");
var bp = B.pos.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("whip-left: B sagdan (normalize konum > 1.3) gelir ve 0.5'e oturur", w.ok && bp[0].value[0] > 1.3 && bp[bp.length - 1].value[0] === 0.5 && bp[0].value[1] === 0.5, JSON.stringify(bp));

var tekrar = uygula("zoom-in");
ok("ayni gecis tekrar uygulaninca eski anahtarlar temizlenir (birikmez)", tekrar.ok && A.scale.keys.length === 3 && B.scale.keys.length === 3, A.scale.keys.length + "/" + B.scale.keys.length);
ok("tur degisince (zoom -> whip) once yazilan konum anahtarlari da temizlendi", B.pos.keys.length === 0 || B.pos.keys.every(function (k) { return k.time > 20.8; }), JSON.stringify(B.pos.keys));

// Uzun gecis sonra kisa gecis: eski egrinin ici okunmaz, olcek ust uste binmez
uygula("zoom-in", { duration: 1.2 });
uygula("zoom-in", { duration: 0.4 });
var bSon = B.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("uzun->kisa tekrar: B yalniz yeni 3 anahtar, son deger 100", bSon.length === 3 && bSon[2].value === 100 && bSon[0].value < 150, JSON.stringify(bSon));
var aSon = A.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("uzun->kisa tekrar: A taban degeri 100'den baslar", aSon.length === 3 && aSon[0].value === 100, JSON.stringify(aSon));

var sh = uygula("shake");
var bShake = B.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("sarsinti sonunda klip kendi olcegine (100) doner", sh.ok && bShake[bShake.length - 1].value === 100, JSON.stringify(bShake));
uygula("shake");
var bShake2 = B.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("sarsinti tekrarinda olcek ust uste binmez", bShake2[0].value === bShake[0].value, bShake[0].value + " -> " + bShake2[0].value);

// MOGRT altyazi sinirlari atlanir, secim tercih edilir
var M1 = makeClip(4.5, 5.2, 70), M2 = makeClip(5.2, 6, 80);
M1.isMGT = function () { return true; }; M2.isMGT = function () { return true; };
var t2 = list([{ clips: list([A, B, C]), isLocked: function () { return false; } }, { clips: list([M1, M2]), isLocked: function () { return false; } }]);
t2.numTracks = 2;
sequence.videoTracks = t2;
playhead = 5.2;
var mg = uygula("punch");
ok("ust katmandaki MOGRT siniri (5.2) degil footage kesimi (5) secilir", mg.ok && mg.cut === 5 && mg.track === 1, JSON.stringify(mg));
var D0 = makeClip(5.0, 5.2, 90), E0 = makeClip(5.2, 7, 95);
var t3 = list([{ clips: list([A, B, C]), isLocked: function () { return false; } }, { clips: list([D0, E0]), isLocked: function () { return false; } }]);
t3.numTracks = 2;
sequence.videoTracks = t3;
secim = [A];
var sec = uygula("punch");
ok("secim varsa secili klibin kesimi tercih edilir (daha uzak olsa da)", sec.ok && sec.cut === 5 && sec.track === 1, JSON.stringify(sec));
secim = [];
// Bir karelik bosluk kesim sayilmaz (25 fps: 0.04 sn)
var G1 = makeClip(30, 32, 0), G2 = makeClip(32.04, 35, 0);
var t4 = list([{ clips: list([G1, G2]), isLocked: function () { return false; } }]); t4.numTracks = 1;
sequence.videoTracks = t4; playhead = 32;
ok("bir karelik bosluk kesim sayilmaz", uygula("dip").ok === false);
sequence.videoTracks = tracks;

playhead = 5.2;
// Kisa klip: gecis yarisi klibin yarisina sikistirilir
var D = makeClip(20, 20.4, 50), E = makeClip(20.4, 25, 60);
tracks[0].clips = list([D, E]);
playhead = 20.4;
var kisa = uygula("dip", { duration: 1.2 });
ok("kisa klipte gecis sikistirilir (half=0.2)", kisa.ok && Math.abs(kisa.half - 0.2) < 1e-6, JSON.stringify(kisa));

playhead = 40;
var yok = uygula("dip");
ok("yakinda kesim yoksa anlasilir hata", !yok.ok && /kesim yok/.test(yok.error), JSON.stringify(yok));
var bozuk = JSON.parse(ctx.KS_applyCutTransition(encodeURIComponent(JSON.stringify({ plan: { half: 0 } }))));
ok("gecersiz plan reddedilir", !bozuk.ok, JSON.stringify(bozuk));

/* ======================================================================
 * 3.4 adım 11: geçiş kayıtları ve kayıt tabanlı güvenli kaldırma (KS_removeSufloKeys)
 * Premiere'e yakın sahte model: tests/_kayit-premiere.js
 * ====================================================================== */
var KR = require(path.join(ROOT, "js", "key-records.js"));
var PM = require("./_kayit-premiere.js").olustur();
function js(x) { return JSON.stringify(x); }
function yak(a, b) { return Math.abs(a - b) < 1e-6; }
function gecisUygula(id, sure) {
  return PM.cagir("KS_applyCutTransition", { plan: T.hostPlan(id, { duration: sure || 0.6 }), tolerance: 1 });
}
// Panelin sakladığı biçim (SufloKeyRecords.kayit: id, sıralı zamanlar)
function sakla(r) { return (r.records || []).map(function (x) { return KR.kayit(x); }); }
function kaldir(kayitlar, ek) {
  var arg = { records: kayitlar };
  for (var k in ek || {}) arg[k] = ek[k];
  return PM.cagir("KS_removeSufloKeys", arg);
}
var K1 = PM.klip({ ad: "A.mp4", nodeId: "K1", start: 0, end: 5, inP: 10 });
var K2 = PM.klip({ ad: "B.mp4", nodeId: "K2", start: 5, end: 9, inP: 20 });
var K3 = PM.klip({ ad: "C.mp4", nodeId: "K3", start: 9, end: 14, inP: 40 });
PM.izKur([[K1, K2, K3]]);

PM.durum.playhead = 5.1;
var g1 = gecisUygula("zoom-in");
var rA = (g1.records || []).filter(function (r) { return r.nodeId === "K1"; })[0];
var rB = (g1.records || []).filter(function (r) { return r.nodeId === "K2"; })[0];
ok("kayıt: geçiş her yazılan özellik için kayıt ve proje yolu döner (zoom-in: iki klibin Ölçeği)", g1.ok && g1.records.length === 2 && rA && rB &&
  g1.records.every(function (r) { return r.tur === "gecis" && r.seqId === "seq-1" && r.uclar === null; }) && /kayit\.prproj$/.test(g1.proje), js(g1));
ok("kayıt: kimlik, dizinler, kaynak çapası (Hareket > Ölçek)", rA.matchName === "AE.ADBE Motion/Scale" && rA.compIdx === 0 && rA.propIdx === 1 &&
  rA.clipStart === 0 && rA.clipEnd === 5 && rA.clipIn === 10 && rA.clipOut === 15 && rA.ters === false && rA.clipName === "A.mp4", js(rA));
ok("kayıt: zamanlar timeline saniyesinde yazılıp doğrulanan anahtarlar (A çıkış 4,7 → 5; B giriş 5 → 5,3)", rA.times.length === 3 && yak(rA.times[0], 4.7) && yak(rA.times[2], 5) &&
  rB.times.length === 3 && yak(rB.times[0], 5) && yak(rB.times[2], 5.3), js([rA.times, rB.times]));
ok("kayıt: kenar değerleri Suflo yazmadan önceki değer (100)", rA.kenarDegerleri.length === 2 && yak(rA.kenarDegerleri[0].t, 4.7) && yak(rA.kenarDegerleri[1].t, 5) &&
  rA.kenarDegerleri[0].v === 100 && rA.kenarDegerleri[1].v === 100 &&
  rB.kenarDegerleri.length === 2 && rB.kenarDegerleri[0].v === 100 && rB.kenarDegerleri[1].v === 100, js([rA.kenarDegerleri, rB.kenarDegerleri]));
var s1 = sakla(g1);
ok("kayıt: SufloKeyRecords kaydı olarak geçerli (çapa korunur)", s1.length === 2 && s1.every(function (r) { return r && r.id && r.clipIn !== undefined && r.times.length === 3; }), js(s1));

// Kullanıcı Suflo'nun aralığına kendi anahtarını ekler; kaldırma onu korur
K2.olcek.elle(K2, 5.15, 120);
var c1 = kaldir(s1);
var k2tl = K2.olcek.tl(K2);
ok("kaldır: iki kayıt da canlı, Suflo'nun 3+3 anahtarı silindi", c1.ok && c1.eslesen === 2 && c1.atlanan.length === 0 &&
  c1.sonuclar.every(function (x) { return x.ok && x.silinen === 3; }), js(c1));
ok("kaldır: kullanıcının eklediği anahtar (5,15 · 120) korundu", K2.olcek.keys.some(function (k, i) { return k.v === 120 && yak(k2tl[i], 5.15); }), js([k2tl, K2.olcek.keys]));
ok("kaldır: kullanıcının anahtarı tüm klibe yayılmasın: kenarlara eski değer (100) geri kondu", js(k2tl) === js([5, 5.15, 5.3]) &&
  K2.olcek.degerAt(22) === 100 && c1.sonuclar.filter(function (x) { return x.id === s1[1].id; })[0].eklenen === 2, js([k2tl, K2.olcek.keys]));
ok("kaldır: anahtarı kalmayan özellik eski sabit değerine döner (A Ölçek 100, anahtarsız)", K1.olcek.keys.length === 0 && K1.olcek.tv === false && K1.olcek.value === 100, js(K1.olcek));
ok("kaldır: Effect Controls / Program updateUI ile tazelendi", PM.ui.some(function (u) { return u.ad === "Scale" && u.ui; }), js(PM.ui.slice(-4)));
// Panel sonuclar'daki kayıtları bitirir; yine de aynı kayıtla ikinci çağrı (ör. depo yazılamadı) sonucu bozmaz
var c1b = kaldir(s1);
ok("kaldır: ikinci çağrı aynı sonucu bırakır (A 'yok'; B'de kullanıcının anahtarı ve kenarlar yerinde)", c1b.sonuclar.length === 2 &&
  c1b.sonuclar.filter(function (x) { return x.id === s1[0].id; })[0].kod === "yok" &&
  js(K2.olcek.tl(K2)) === js([5, 5.15, 5.3]) && js(K2.olcek.keys.map(function (k) { return k.v; })) === js([100, 120, 100]) && K1.olcek.keys.length === 0, js([c1b, K2.olcek.keys]));

// Taşınan klip nodeId ile bulunur (anahtarlar kaynak zamanında, klip timeline'da kaydı)
PM.durum.playhead = 9;
var g2 = gecisUygula("dip");
var s2 = sakla(g2);
ok("dip: B çıkışı ve C girişi Opaklık kaydı", g2.ok && s2.length === 2 && s2.every(function (r) { return r.matchName === "AE.ADBE Opacity/Opacity"; }), js(g2));
K2.tasi(20); K3.tasi(20);
var c2 = kaldir(s2);
ok("taşınan klip nodeId ile bulundu, kaymayla eşlendi ve Suflo'nun anahtarları silindi", c2.ok && c2.sonuclar.length === 2 &&
  c2.sonuclar.every(function (x) { return x.silinen === 2; }) && K3.opak.keys.length === 0 && K3.opak.value === 100 && K3.opak.tv === false, js([c2, K3.opak]));
ok("taşınan klipte de kullanıcının Ölçek anahtarları duruyor", K2.olcek.keys.length === 3, js(K2.olcek.keys));
K2.tasi(-20); K3.tasi(-20);

// Premiere'de dışarıdan geri alma (Ctrl+Z): Suflo'nun anahtarları gitti → kayıt düşer
PM.durum.playhead = 5;
var g3 = gecisUygula("dip");
var s3 = sakla(g3);
K1.opak.keys = []; K1.opak.value = 100; K2.opak.keys = []; K2.opak.value = 100;   // Ctrl+Z: yazımdan önceki hâl
var c3 = kaldir(s3);
ok("dış geri almadan sonra kayıtlar 'yok' ile biter (panel düşürür), hiçbir şey silinmez ya da yazılmaz", c3.ok && c3.sonuclar.length === 2 &&
  c3.sonuclar.every(function (x) { return x.kod === "yok" && x.silinen === 0 && x.eklenen === 0; }) && c3.atlanan.length === 0 && K2.opak.value === 100, js(c3));

// Kesim kapsamı: yalnız playhead'e en yakın kesimdeki geçiş (B'nin başındaki değil, sonundaki)
var g4a = gecisUygula("dip");                // kesim 5 (K1 | K2)
PM.durum.playhead = 9.05;
var g4b = gecisUygula("cross");              // kesim 9 (K2 | K3)
var s4 = sakla(g4a).concat(sakla(g4b));
var c4 = kaldir(s4, { kesim: { tolerance: 1 } });
ok("kesim kapsamı: playhead'e en yakın kesimin (9) iki kaydı kaldırıldı", c4.ok && c4.eslesen === 2 && c4.kesim && c4.kesim.cut === 9 &&
  c4.sonuclar.length === 2 && c4.sonuclar.every(function (x) { return x.silinen === 2; }), js(c4));
ok("kesim kapsamı: aynı klibin (B) öbür kesimdeki geçişine ve A'ya dokunulmadı", js(K2.opak.tl(K2)) === js([5, 5.3]) && K1.opak.keys.length === 2 && K3.opak.keys.length === 0, js([K2.opak.tl(K2), K1.opak.tl(K1)]));
PM.durum.playhead = 30;
var c4y = kaldir(s4, { kesim: { tolerance: 1 } });
ok("kesim kapsamı: playhead yakınında kesim yoksa kodlu hata", !c4y.ok && c4y.kod === "kesimYok", js(c4y));

// Kullanıcı Suflo'nun uç anahtarını sildi: kayıt canlı değil → dokunulmaz ('degisti'), kayıt saklanır
PM.durum.playhead = 5;
var s5 = sakla(gecisUygula("zoom-in"));
var bRec = s5.filter(function (r) { return r.nodeId === "K2"; })[0];
K2.olcek.removeKey({ seconds: 20 });           // B girişinin ilk anahtarı (kaynak 20 = timeline 5)
var c5 = kaldir([bRec]);
ok("uç anahtarı silinmiş kayıt 'degisti' ile atlanır, kalan anahtarlara dokunulmaz", c5.ok && c5.sonuclar.length === 0 && c5.atlanan.length === 1 &&
  c5.atlanan[0].kod === "degisti" && K2.olcek.keys.length === 2, js([c5, K2.olcek.tl(K2)]));

// Klip timeline'dan silindi: kayıt saklanır (yeniden deneme)
var hayalet = KR.kayit({ tur: "gecis", seqId: "seq-1", nodeId: "yok-boyle", clipName: "Silinen.mp4", clipStart: 100, matchName: "AE.ADBE Motion/Scale",
  compIdx: 0, propIdx: 1, times: [100, 100.3], kenarDegerleri: [{ t: 100, v: 100 }] });
var baska = KR.kayit({ tur: "gecis", seqId: "seq-baska", nodeId: "K1", clipStart: 0, matchName: "AE.ADBE Motion/Scale", compIdx: 0, propIdx: 1, times: [4, 5] });
var c6 = kaldir([hayalet, baska]);
ok("bulunamayan klibin kaydı 'klipYok', başka sekansınki 'sekans' ile saklanır", c6.ok && js(c6.atlanan.map(function (a) { return a.kod; })) === js(["klipYok", "sekans"]) && c6.sonuclar.length === 0, js(c6));
var c6k = kaldir([hayalet, baska], { secili: true });
ok("kapsamlı çağrıda (seçili) bulunamayan / başka sekanstaki kayıt kapsam dışı sayılır", c6k.ok && c6k.eslesen === 0 && c6k.atlanan.length === 0, js(c6k));

// Eski yol (kaydı olmayan geçiş, panel onay ister): pencere temizlenir, anahtarsız kalan özellik sabitlenir
K1.opak.keys = []; K1.opak.tv = false; K1.opak.value = 100;
K2.opak.keys = []; K2.opak.tv = false; K2.opak.value = 100;
K2.opak.elle(K2, 7.5, 60);                     // kullanıcının pencere dışındaki anahtarı
PM.durum.playhead = 5;
gecisUygula("dip");                            // 3.3'te uygulanmış gibi: kayıt saklanmadı
var t7 = PM.cagir("KS_applyCutTransition", { temizle: true, tolerance: 1 });
ok("eski yol: kesim bulunur, pencere temizlenir", t7.ok && t7.temizlendi === true && t7.cut === 5 && t7.removedKeys === 4, js(t7));
ok("eski yol: anahtarı kalmayan A Opaklığı pencere dışındaki değere (100) sabitlenir", K1.opak.keys.length === 0 && K1.opak.value === 100 && K1.opak.tv === false, js(K1.opak));
ok("eski yol: B'de pencere dışındaki kullanıcı anahtarı kalır", js(K2.opak.tl(K2)) === js([7.5]), js(K2.opak.tl(K2)));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
