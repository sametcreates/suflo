// Suflo testi: KS_importSample (ilk acilis rehberinin ornek klibi) sahte Premiere modeliyle
var fs = require("fs"), path = require("path"), vm = require("vm");
var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) { toplam++; if (kosul) gecen++; console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 240) + "]" : "")); }

var KLIP = "/kullanici/Kesit/onboarding/ornek-tr.mp4";

// ExtendScript koleksiyonu gibi: .numItems / .numSequences ve [i] erisimi canli diziden
function liste(dizi, sayac) {
  return new Proxy(dizi, {
    get: function (hedef, ad) {
      if (ad === (sayac || "numItems")) return hedef.length;
      return hedef[ad];
    }
  });
}

/*
 * opts:
 *   api          createNewSequenceFromClips var mi (varsayilan true)
 *   donus        createNewSequenceFromClips donus degeri (varsayilan 0: guvenilmez)
 *   farkliAd     yeni sekansi baska adla olustur (Premiere "Sequence 01" der)
 *   aktifInat    activeSequence atamasi sessizce yok sayilir (openSequence calisir)
 *   proje        false: acik proje yok
 *   dosyaYok     ornek dosya diskte yok
 *   bulucu       rootItem.findItemsMatchingMediaPath tanimli
 */
function premiere(opts) {
  opts = opts || {};
  var d = { binYapildi: 0, iceAlinan: 0, olusturulan: 0, secilen: 0, acilan: [], bulucuCagrisi: 0 };
  var kok = [];
  var seqler = [];
  var aktif = null;
  function yeniSeq(ad, oge) {
    var s = {
      sequenceID: "seq-" + (seqler.length + 1), name: ad,
      videoTracks: liste([{ clips: liste([{ projectItem: oge, start: { seconds: 0 }, setSelected: function (v) { if (v) d.secilen++; } }]) }], "numTracks")
    };
    seqler.push(s);
    return s;
  }
  var proje = {
    rootItem: opts.proje === false ? null : {
      children: liste(kok),
      createBin: function (ad) { d.binYapildi++; var b = { type: 2, name: ad, children: liste([]) }; b.dizi = b.children; kok.push(b); return b; }
    },
    sequences: liste(seqler, "numSequences"),
    importFiles: function (yollar, sessiz, kutu) {
      d.iceAlinan++;
      yollar.forEach(function (y) {
        var oge = { type: 1, name: path.basename(y), getMediaPath: function () { return y; } };
        (kutu ? kutu.children : proje.rootItem.children).push(oge);
      });
      return true;
    },
    openSequence: function (id) {
      d.acilan.push(id);
      for (var i = 0; i < seqler.length; i++) if (seqler[i].sequenceID === id) aktif = seqler[i];
    }
  };
  Object.defineProperty(proje, "activeSequence", {
    get: function () { return aktif; },
    set: function (s) { if (!opts.aktifInat) aktif = s; }
  });
  if (opts.api !== false) {
    proje.createNewSequenceFromClips = function (ad, ogeler) {
      d.olusturulan++;
      yeniSeq(opts.farkliAd ? "Sequence 01" : ad, ogeler[0]);
      return opts.donus === undefined ? 0 : opts.donus;
    };
  }
  if (opts.bulucu && proje.rootItem) {
    proje.rootItem.findItemsMatchingMediaPath = function (yol) {
      d.bulucuCagrisi++;
      var out = [];
      (function tara(c) {
        for (var i = 0; i < c.length; i++) {
          if (c[i].type === 2) tara(c[i].children);
          else if (c[i].getMediaPath() === yol) out.push(c[i]);
        }
      })(kok);
      return out;
    };
  }
  var ctx = {
    app: { version: "25.6.0", project: proje },
    File: function (y) { this.exists = !opts.dosyaYok && y === KLIP; },
    Time: function () {}, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
    isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, Folder: function () {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
  return {
    d: d, kok: kok, seqler: seqler, aktif: function () { return aktif; },
    cagir: function (arg) { return JSON.parse(ctx.KS_importSample(encodeURIComponent(JSON.stringify(arg)))); }
  };
}

/* 1) Ilk deneme: kutu, ice alma, yeni sekans (ID farkiyla), aktiflestirme, secim */
var p = premiere();
var r = p.cagir({ path: KLIP, seqName: "Suflo Deneme" });
ok("ilk deneme basarili", r.ok === true, JSON.stringify(r));
ok("'Suflo Ornek' kutusu bir kez olusturuldu ve klip ona alindi",
  p.d.binYapildi === 1 && p.kok[0].name === "Suflo Ornek" && p.kok[0].children.length === 1 && p.d.iceAlinan === 1);
ok("donus degeri 0 olsa da yeni sekans kimlik farkiyla bulundu",
  r.created === true && r.sequenceId === "seq-1" && p.d.olusturulan === 1, JSON.stringify(r));
ok("yeni sekans aktif ve dogrulandi, klip secildi", r.active === true && p.aktif() === p.seqler[0] && r.selected === true && p.d.secilen === 1);
ok("surukleme gerekmez, offset klibin baslangici", r.needsDrag === false && r.offset === 0 && r.imported === true && r.reused === false);

/* 2) Ikinci deneme: oge ve sekans yeniden kullanilir (yinelenen ice alma/sekans yok) */
var r2 = p.cagir({ path: KLIP, seqName: "Suflo Deneme" });
ok("ikinci deneme ogeyi ve sekansi yeniden kullanir", r2.ok && r2.reused === true && r2.created === false && r2.imported === false, JSON.stringify(r2));
ok("ikinci denemede yeni kutu/ice alma/sekans yok", p.d.binYapildi === 1 && p.d.iceAlinan === 1 && p.d.olusturulan === 1 && p.seqler.length === 1);

/* 3) findItemsMatchingMediaPath varsa once o kullanilir */
var pb = premiere({ bulucu: true });
pb.cagir({ path: KLIP, seqName: "Suflo Deneme" });
var rb = pb.cagir({ path: KLIP, seqName: "Suflo Deneme" });
ok("findItemsMatchingMediaPath ile var olan oge bulunur", rb.ok && rb.imported === false && pb.d.bulucuCagrisi === 2 && pb.d.iceAlinan === 1);

/* 4) createNewSequenceFromClips yok: yalniz ice alir, needsDrag */
var pe = premiere({ api: false });
var re = pe.cagir({ path: KLIP, seqName: "Suflo Deneme" });
ok("API yoksa yalniz ice alir ve surukleme ister", re.ok && re.needsDrag === true && re.imported === true && re.created === false && re.sequenceId === "" && pe.seqler.length === 0, JSON.stringify(re));

/* 5) Premiere yeni sekansa baska ad verirse adi duzeltilir; aktiflestirme inat ederse openSequence */
var pa = premiere({ farkliAd: true, aktifInat: true, donus: null });
var ra = pa.cagir({ path: KLIP, seqName: "Suflo Deneme" });
ok("yeni sekansin adi 'Suflo Deneme' yapildi", ra.ok && pa.seqler[0].name === "Suflo Deneme", pa.seqler[0] && pa.seqler[0].name);
ok("activeSequence atamasi tutmazsa openSequence ile acilir ve dogrulanir", ra.active === true && pa.d.acilan[0] === "seq-1" && pa.aktif() === pa.seqler[0], JSON.stringify(ra));

/* 6) Hatalar: dosya yok, proje yok, yol yok */
var rd = premiere({ dosyaYok: true }).cagir({ path: KLIP, seqName: "Suflo Deneme" });
ok("ornek dosya yoksa KS_err", rd.ok === false && /bulunamadi/.test(rd.error), JSON.stringify(rd));
var rp = premiere({ proje: false }).cagir({ path: KLIP, seqName: "Suflo Deneme" });
ok("acik proje yoksa KS_err", rp.ok === false && /proje/i.test(rp.error), JSON.stringify(rp));
var ry = premiere().cagir({ seqName: "Suflo Deneme" });
ok("yol verilmezse KS_err", ry.ok === false, JSON.stringify(ry));

/* 7) Var olan sekansta klip yoksa (kullanici silmis) surukleme istenir */
var pk = premiere();
pk.cagir({ path: KLIP, seqName: "Suflo Deneme" });
pk.seqler[0].videoTracks[0].clips.length = 0;
var rk = pk.cagir({ path: KLIP, seqName: "Suflo Deneme" });
ok("sekans var ama klip yoksa needsDrag", rk.ok && rk.reused === true && rk.needsDrag === true && rk.selected === false, JSON.stringify(rk));

/* 8) ES3: yeni host kodu yalniz izinli sozdizimiyle (test-es3 tum dosyayi zaten tarar) */
var src = fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8");
var i = src.indexOf("function KS_importSample("), j = src.indexOf("\nfunction ", i + 10);
var govde = src.slice(i, j);
ok("KS_importSample createNewSequenceFromClips'i typeof ile sinar", /typeof app\.project\.createNewSequenceFromClips !== "function"/.test(govde));
ok("KS_importSample donus degerine guvenmez (sequenceID farki)", /once\[String\(app\.project\.sequences\[i\]\.sequenceID\)\]/.test(govde) && !/=\s*app\.project\.createNewSequenceFromClips\(/.test(govde));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
