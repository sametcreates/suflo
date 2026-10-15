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

/* ---- inceleme: aynı kesimde geçiş türü değişince (Karartma → Zoom İçeri) klip artık değerde kalmaz ---- */
var PM2 = require("./_kayit-premiere.js").olustur();
var D1 = PM2.klip({ ad: "A.mp4", nodeId: "D1", start: 0, end: 5 }), D2 = PM2.klip({ ad: "B.mp4", nodeId: "D2", start: 5, end: 10 });
PM2.izKur([[D1, D2]]);
PM2.durum.playhead = 5;
var dip = PM2.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.6 }), tolerance: 1 });
var zi = PM2.cagir("KS_applyCutTransition", { plan: T.hostPlan("zoom-in", { duration: 0.6 }), tolerance: 1 });
ok("Karartma → Zoom İçeri: önceki geçişin Opaklık anahtarları silinir, anahtarsız kalan Opaklık pencere dışındaki değere (100) sabitlenir (0'da, görünmez kalmaz)",
  dip.ok && zi.ok && D2.opak.keys.length === 0 && D2.opak.value === 100 && D2.opak.tv === false && D1.opak.keys.length === 0 && D1.opak.value === 100, js([D1.opak, D2.opak]));
var tzB = (zi.temizlenen || []).filter(function (e) { return e.nodeId === "D2" && e.matchName === "AE.ADBE Opacity/Opacity"; })[0];
ok("temizlenen: host silinen anahtarları (Karartma'nın B'deki 5 ve 5,3) ve pencereyi bildirir, özellik boşaldı; tolerans 0,25 kare",
  tzB && js(tzB.times) === js([5, 5.3]) && tzB.bosaldi === true && tzB.seqId === "seq-1" && tzB.pencereler.length >= 1 &&
  tzB.pencereler[0][0] === 5 && yak(zi.tol, 0.25 / 25), js([tzB, zi.tol]));
var zi2 = PM2.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.6 }), tolerance: 1 });
ok("Zoom İçeri → Karartma: Ölçek de 145'te kalmaz (anahtarsız, 100)", zi2.ok && D2.olcek.keys.length === 0 && D2.olcek.value === 100 &&
  D1.olcek.keys.length === 0 && D1.olcek.value === 100, js([D1.olcek, D2.olcek]));
ok("Zoom İçeri → Karartma: yeni Karartma kaydının önceki değeri 100 (artık değil)", zi2.records.every(function (r) {
  return r.kenarDegerleri.every(function (k) { return k.v === 100; });
}), js(zi2.records.map(function (r) { return r.kenarDegerleri; })));

/* ---- inceleme: Premiere anahtarları silmezse kayıt 'yok' (zaten kaldırılmış) sayılmaz ---- */
var s8 = sakla(zi2);
D2.opak.removeKey = function () { throw new Error("Premiere reddetti"); };
var c8 = PM2.cagir("KS_removeSufloKeys", { records: s8 });
ok("removeKey hata verirse: o kayıt atlanan 'silinemedi' (kayıt saklanır), öbürü kaldırılır", c8.ok && c8.atlanan.length === 1 && c8.atlanan[0].kod === "silinemedi" &&
  c8.sonuclar.length === 1 && c8.sonuclar[0].silinen === 2 && D2.opak.keys.length === 2, js([c8, D2.opak.keys]));
delete D2.opak.removeKey;

/* ---- inceleme 2: Geçişi kaldır'da seçim playhead'in önüne geçmez; eski yöntem tam gösterilen kesimi temizler ---- */
var PM3 = require("./_kayit-premiere.js").olustur();
var E1 = PM3.klip({ ad: "A.mp4", nodeId: "E1", start: 0, end: 9 }), E2 = PM3.klip({ ad: "B.mp4", nodeId: "E2", start: 9, end: 10 });
var E3 = PM3.klip({ ad: "C.mp4", nodeId: "E3", start: 10, end: 20 });
PM3.izKur([[E1, E2, E3]]);
PM3.durum.playhead = 9;
var s9 = sakla(PM3.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.4 }), tolerance: 1 }));
E3.opak.elle(E3, 10, 0); E3.opak.elle(E3, 10.3, 100);   // kullanıcının C başındaki kendi solması (kesim 10)
PM3.durum.playhead = 9.1; PM3.durum.secim = [E3];
ok("uygulama kuralı değişmedi: seçili C'nin kesimi (10) playhead'e daha yakın kesimin (9) önüne geçer",
  PM3.ctx.KS_gecisKesimBul(PM3.sequence, 9.1, 1).cut === 10);
var c9 = PM3.cagir("KS_removeSufloKeys", { records: s9, kesim: { tolerance: 1 } });
ok("kaldırma: seçili C'ye dokunan kesim (10) değil, playhead'in altındaki Suflo geçişinin kesimi (9) seçilir ve kaldırılır",
  c9.ok && c9.kesim && c9.kesim.cut === 9 && c9.kesim.track === 1 && c9.eslesen === 2 && E1.opak.keys.length === 0 && E2.opak.keys.length === 0, js(c9));
ok("kaldırma: kullanıcının C'deki anahtarları (10 · 0, 10,3 · 100) yerinde", js(E3.opak.tl(E3)) === js([10, 10.3]) && E3.opak.keys[0].v === 0, js(E3.opak.keys));
// Kayıt hiçbir kesimde yoksa: playhead'e en yakın kesim (seçim öne geçmez); eski yöntem tam o kesimi temizler
PM3.durum.secim = []; PM3.durum.playhead = 9;
PM3.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.4 }), tolerance: 1 });   // kesim 9'a kayıtsız (eski) Karartma
PM3.durum.playhead = 9.1; PM3.durum.secim = [E3];
var c10 = PM3.cagir("KS_removeSufloKeys", { records: [], kesim: { tolerance: 1 } });
ok("kayıt yoksa kesim cevabı playhead'e en yakın kesim (9; seçili C'nin kesimi 10 değil)", c10.ok && c10.eslesen === 0 && c10.kesim && c10.kesim.cut === 9, js(c10));
var t10 = PM3.cagir("KS_applyCutTransition", { temizle: true, tolerance: 1, cut: c10.kesim.cut, track: c10.kesim.track });
ok("eski yöntem cut + track ile tam o kesimi temizler (seçim yeniden aramayı 10'a çekmez); C'deki kullanıcı anahtarları kalır",
  t10.ok && t10.cut === 9 && E1.opak.keys.length === 0 && E2.opak.keys.length === 0 && js(E3.opak.tl(E3)) === js([10, 10.3]), js([t10, E3.opak.keys]));
var t10y = PM3.cagir("KS_applyCutTransition", { temizle: true, tolerance: 1, cut: 12, track: 1 });
ok("eski yöntem: gösterilen kesim artık yoksa (timeline değişti) başka kesime düşmez, hata", !t10y.ok && /Kesim artik orada degil/.test(t10y.error) &&
  js(E3.opak.tl(E3)) === js([10, 10.3]), js(t10y));
// Kayıtlı kesim, kayıtsız daha yakın kesimin önüne geçer (tolerans içinde)
E1.opak.keys = []; E2.opak.keys = []; E3.opak.keys = []; E1.opak.tv = E2.opak.tv = E3.opak.tv = false; E1.opak.value = E2.opak.value = E3.opak.value = 100;
PM3.durum.secim = []; PM3.durum.playhead = 10;
var s11 = sakla(PM3.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.4 }), tolerance: 1 }));
PM3.durum.playhead = 9.4;
var c11 = PM3.cagir("KS_removeSufloKeys", { records: s11, kesim: { tolerance: 1 } });
ok("kaldırma: playhead'e daha yakın kesimde (9) kayıt yoksa, tolerans içindeki Suflo geçişinin kesimi (10) kaldırılır",
  c11.ok && c11.kesim.cut === 10 && c11.eslesen === 2 && E2.opak.keys.length === 0 && E3.opak.keys.length === 0, js(c11));

/* ---- inceleme 2: ucu kaldırılan anahtarlarda duran Eğri'nin iç anahtarları da kalkar ---- */
var PM4 = require("./_kayit-premiere.js").olustur();
var F1 = PM4.klip({ ad: "A.mp4", nodeId: "F1", start: 0, end: 5 }), F2 = PM4.klip({ ad: "B.mp4", nodeId: "F2", start: 5, end: 10 });
PM4.izKur([[F1, F2]]);
PM4.durum.playhead = 5;
var s12 = sakla(PM4.cagir("KS_applyCutTransition", { plan: T.hostPlan("zoom-in", { duration: 0.6 }), tolerance: 1 }));
var b12 = s12.filter(function (r) { return r.nodeId === "F2"; })[0];
var bT = F2.olcek.tl(F2), bV = F2.olcek.keys.map(function (k) { return k.v; });
// Eğri: B'nin geçiş anahtarlarının ilk ikisinin arasına iç anahtarlar
var icK = [];
for (var ii = 1; ii < 5; ii++) { var tt = bT[0] + (bT[1] - bT[0]) * ii / 5; icK.push({ t: tt, v: bV[0] + (bV[1] - bV[0]) * ii / 5 }); }
var eb = PM4.cagir("KS_easeBake", { target: { nodeId: "F2", clipName: "B.mp4", clipStart: 5, seqId: "seq-1" },
  items: [{ compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", t0: bT[0], t1: bT[1], v0: bV[0], v1: bV[1], keys: icK }] });
var eRec = KR.kayit(eb.records[0]);
// Kullanıcının iki anahtarı arasında başka bir Eğri (uçları geçişin değil): dokunulmaz
F2.olcek.elle(F2, 8, 110); F2.olcek.elle(F2, 9, 120);
var eb2 = PM4.cagir("KS_easeBake", { target: { nodeId: "F2", clipName: "B.mp4", clipStart: 5, seqId: "seq-1" },
  items: [{ compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", t0: 8, t1: 9, v0: 110, v1: 120, keys: [{ t: 8.5, v: 115 }] }] });
var eRec2 = KR.kayit(eb2.records[0]);
ok("Eğri hazırlığı: geçişin iki anahtarı arasına 4, kullanıcının iki anahtarı arasına 1 iç anahtar", eb.ok && eb.yazilan === 4 && eb2.ok && eb2.yazilan === 1, js([eb, eb2]));
var c12 = PM4.cagir("KS_removeSufloKeys", { records: [b12], egriler: [eRec, eRec2] });
var f2tl = F2.olcek.tl(F2);
ok("Geçiş kaldırılınca ucu geçişin anahtarında duran Eğri'nin 4 iç anahtarı da silinir, Eğri kaydı biter (egriBiten)",
  c12.ok && js(c12.egriBiten) === js([eRec.id]) && c12.sonuclar[0].silinen === b12.times.length + 4 && js(c12.sonuclar[0].egri) === js([eRec.id]) &&
  !f2tl.some(function (t) { return t > 5 && t < 5.5; }), js([c12, f2tl]));
ok("uçları kullanıcının anahtarlarında olan Eğri ve kullanıcının anahtarları yerinde (8, 8,5, 9)", js(f2tl.filter(function (t) { return t >= 7; })) === js([8, 8.5, 9]), js(f2tl));
var u12 = PM4.cagir("KS_easeUndo", { records: [eRec2] });
ok("öbür Eğri'nin kendi Geri al'ı hâlâ çalışır", u12.ok && u12.sonuclar.length === 1 && u12.sonuclar[0].silinen === 1, js(u12));

/* ---- 3.4 adım 12: özel eğri — yoğun yazım (Bezier 5 yok, doğrusal 0, kayıtlar) ---- */
function izliPremiere() {
  var P = require("./_kayit-premiere.js").olustur({ fps: 25 });
  var interp = [];
  P.FakeProp.prototype.setInterpolationTypeAtKey = function (t, tur, u) { interp.push({ ad: this.displayName, s: t.seconds, tur: tur, ui: u === true }); };
  return { P: P, interp: interp };
}
var Y = izliPremiere();
var G1 = Y.P.klip({ ad: "A.mp4", nodeId: "G1", start: 0, end: 5 }), G2 = Y.P.klip({ ad: "B.mp4", nodeId: "G2", start: 5, end: 10 });
Y.P.izKur([[G1, G2]]);
Y.P.durum.playhead = 5;
var yPlan = T.hostPlan("zoom-in", { duration: 0.6, ease: "yumusak", fps: 25 });
var uiOnce = Y.P.ui.length;
var yr = Y.P.cagir("KS_applyCutTransition", { plan: yPlan, tolerance: 1 });
var g1tl = G1.olcek.tl(G1), g2tl = G2.olcek.tl(G2);
ok("yoğun: anahtar sayısı plandakiyle aynı (A ve B Ölçek; 0,3 sn · 25 kare: 2 çapa + 6 iç)", yr.ok && yr.yogun === true && g1tl.length === yPlan.out.scale.length &&
  g2tl.length === yPlan["in"].scale.length && g1tl.length === 8, js([g1tl, g2tl]));
ok("yoğun: zamanlar plandaki (kesim + t) ve değerler klibin ölçeği × çarpan", g1tl.every(function (t, i) { return yak(t, 5 + yPlan.out.scale[i].t); }) &&
  G1.olcek.keys.every(function (k, i) { return yak(k.v, 100 * yPlan.out.scale[i].v); }), js(G1.olcek.keys.slice(0, 3)));
ok("yoğun: hiçbir anahtara Bezier (5) yazılmadı; her anahtar doğrusal (0)", Y.interp.length === g1tl.length + g2tl.length &&
  Y.interp.every(function (c) { return c.tur === 0 && !c.ui; }), js(Y.interp.slice(0, 3)));
var anahtarUi = Y.P.ui.slice(uiOnce).filter(function (u) { return u.tur === "anahtar" && u.ad === "Scale"; });
ok("yoğun: updateUI yalnız her özelliğin son anahtarında", anahtarUi.filter(function (u) { return u.ui; }).length === 2 &&
  anahtarUi[g1tl.length - 1].ui === true && anahtarUi[anahtarUi.length - 1].ui === true && anahtarUi.length === g1tl.length + g2tl.length, js(anahtarUi.map(function (u) { return u.ui; })));
var ys = sakla(yr);
ok("yoğun: kayıtlar döner; her kayıt yazılan tüm anahtarların zamanını taşır; yazilan toplamı", ys.length === 2 && ys.every(function (r) { return r.tur === "gecis" && r.times.length === 8; }) &&
  yr.yazilan === 16, js(yr.records.map(function (r) { return r.times.length; })));
var yk = Y.P.cagir("KS_removeSufloKeys", { records: ys });
ok("yoğun yazım kayıtla kaldırılır: tüm anahtarlar gider, Ölçek 100", yk.ok && yk.sonuclar.every(function (x) { return x.silinen === 8; }) &&
  G1.olcek.keys.length === 0 && G1.olcek.value === 100 && G2.olcek.keys.length === 0, js(yk));
// 'auto' planı: Bezier (5) eskisi gibi, doğrusal yok
Y.interp.length = 0;
var ar = Y.P.cagir("KS_applyCutTransition", { plan: T.hostPlan("zoom-in", { duration: 0.6 }), tolerance: 1 });
ok("'auto': her anahtara Bezier (5) — yazım eskisi gibi; cevapta yogun yok", ar.ok && ar.yogun === undefined && Y.interp.length === 6 && Y.interp.every(function (c) { return c.tur === 5; }), js(Y.interp));
// Premiere setInterpolationTypeAtKey sunmuyorsa (kfInterp yok): yoğun anahtarlar yine yazılır, ara değerleme çağrılmaz
var Y2 = izliPremiere();
delete Y2.P.FakeProp.prototype.setInterpolationTypeAtKey;
var H1 = Y2.P.klip({ ad: "A.mp4", nodeId: "H1", start: 0, end: 5 }), H2 = Y2.P.klip({ ad: "B.mp4", nodeId: "H2", start: 5, end: 10 });
Y2.P.izKur([[H1, H2]]);
Y2.P.durum.playhead = 5;
var nr = Y2.P.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.6, ease: "sert-cikis", fps: 25 }), tolerance: 1 });
ok("kfInterp yoksa: yoğun anahtarlar yine yazılır (ara değerleme çağrısı yok)", nr.ok && H1.opak.keys.length === 8 && H2.opak.keys.length === 8, js([H1.opak.keys.length, H2.opak.keys.length]));
// Kısa klip: host zamanı sıkıştırır (oran < 1); kare altına sıkışan iç örnekler seyreltilir, çapalar kalır
var Y3 = izliPremiere();
var J1 = Y3.P.klip({ ad: "A.mp4", nodeId: "J1", start: 0, end: 0.3 }), J2 = Y3.P.klip({ ad: "B.mp4", nodeId: "J2", start: 0.3, end: 5 });
Y3.P.izKur([[J1, J2]]);
Y3.P.durum.playhead = 0.3;
var kPlan = T.hostPlan("dip", { duration: 1.6, ease: "yumusak", fps: 25 });   // yarı 0,8 sn; A yalnız 0,3 sn → oran 0,1875
var kr = Y3.P.cagir("KS_applyCutTransition", { plan: kPlan, tolerance: 1 });
var j1tl = J1.opak.tl(J1), j2tl = J2.opak.tl(J2);
var enYakin = 1;
[j1tl, j2tl].forEach(function (d) { for (var q = 1; q < d.length; q++) enYakin = Math.min(enYakin, d[q] - d[q - 1]); });
ok("kısa klip: sıkıştırılan iç örnekler seyreltilir (komşu anahtarlar en az yarım kare), uçlar yerinde", kr.ok && kr.half < 0.8 &&
  j1tl.length < kPlan.out.opacity.length && j1tl.length >= 2 && enYakin >= 0.5 / 25 - 1e-9 && yak(j1tl[j1tl.length - 1], 0.3) && yak(j2tl[0], 0.3) &&
  J1.opak.keys[J1.opak.keys.length - 1].v === 0 && J2.opak.keys[J2.opak.keys.length - 1].v === 100, js([j1tl, j2tl, kr.half]));
var sy = Y3.P.ctx.KS_yogunSeyrelt([{ time: 0 }, { time: 0.001 }, { time: 0.03 }, { time: 0.05 }, { time: 0.051 }], 25).map(function (k) { return k.time; });
ok("KS_yogunSeyrelt: çapa işareti yoksa ilk ve son çapa; ara örnek yarım kareden yakınsa (öncekine ya da sonraki çapaya) atılır", js(sy) === js([0, 0.03, 0.051]), js(sy));
var syA = Y3.P.ctx.KS_yogunSeyrelt([{ time: 0, a: 1 }, { time: 0.001, a: 1 }, { time: 0.01 }, { time: 0.04, a: 1 }], 25).map(function (k) { return k.time; });
ok("KS_yogunSeyrelt: çapalar (a: 1) birbirine çok yakın olsa da kalır", js(syA) === js([0, 0.001, 0.04]), js(syA));
// Opaklık: taşan eğri (Taşma) Opaklığı 0..100 dışına itmez
var Y4 = izliPremiere();
var L1 = Y4.P.klip({ ad: "A.mp4", nodeId: "L1", start: 0, end: 5 }), L2 = Y4.P.klip({ ad: "B.mp4", nodeId: "L2", start: 5, end: 10 });
Y4.P.izKur([[L1, L2]]);
Y4.P.durum.playhead = 5;
var lr = Y4.P.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.8, ease: "tasma", fps: 25 }), tolerance: 1 });
ok("Taşma eğrisi: Opaklık 0..100 içinde kalır (en az bir örnek sınırda)", lr.ok && L1.opak.keys.concat(L2.opak.keys).every(function (k) { return k.v >= 0 && k.v <= 100; }) &&
  L2.opak.keys.some(function (k, i) { return i < L2.opak.keys.length - 1 && k.v === 100; }), js(L2.opak.keys.map(function (k) { return k.v; })));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
