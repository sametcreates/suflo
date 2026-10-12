// Suflo testi: KS_importDownloaded (YouTube indirici, 3.3) sahte Premiere modeliyle
// "Suflo İndirilenler" kutusu (Unicode ad panelden), ikinci indirmede yeniden kullanım, yol bulucu,
// macOS Unicode yol farkında kutuya eklenen son öğe, proje / dosya yok hataları, adında "%" olan dosya
// (ExtendScript File yolu URI gibi çözer), Proje panelinde seçim (select yoksa ya da hata verirse sessiz)
// ve timeline'a hiç dokunulmaması.
var fs = require("fs"), path = require("path"), vm = require("vm");
var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) { toplam++; if (kosul) gecen++; console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 240) + "]" : "")); }
function js(x) { return JSON.stringify(x); }

var DOSYA = "C:\\Users\\Ömer\\Belgeler\\Düğün Projesi\\Suflo İndirilenler\\Klip [dQw4w9WgXcQ] 1080p.mp4";
var KUTU = "Suflo İndirilenler";

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
 *   proje       false: açık proje yok
 *   dosyaYok    dosya diskte yok
 *   bulucu      rootItem.findItemsMatchingMediaPath tanımlı
 *   yolFarki    Premiere getMediaPath'i farklı Unicode biçiminde döner (macOS NFD)
 *   iceAlmaz    importFiles hiçbir şey eklemez
 *   select      "yok" | "atar" | (varsayılan) çalışır
 *   kutuVar     aynı adlı kutu kökte zaten var
 *   dosya       diskteki dosyanın yolu (varsayılan DOSYA)
 * File, ExtendScript gibi yolu URI olarak çözer ("%50" → "P", "%25" → "%"): "%" taşıyan YouTube başlıkları için.
 */
function uriCoz(y) {
  return String(y).replace(/(%[0-9A-Fa-f]{2})+/g, function (m) { try { return decodeURIComponent(m); } catch (e) { return m; } });
}
function premiere(opts) {
  opts = opts || {};
  var d = { binYapildi: 0, iceAlinan: [], secilen: 0, bulucu: 0, timeline: [] };
  var kok = [];
  function oge(y) {
    var o = { type: 1, name: path.win32.basename(y), getMediaPath: function () { return opts.yolFarki ? y.normalize("NFD") : y; } };
    if (opts.select !== "yok") o.select = function () { if (opts.select === "atar") throw new Error("select desteklenmiyor"); d.secilen++; return 0; };
    return o;
  }
  if (opts.kutuVar) kok.push({ type: 2, name: KUTU, children: liste([]) });
  var proje = {
    rootItem: opts.proje === false ? null : {
      children: liste(kok),
      createBin: function (ad) { d.binYapildi++; var b = { type: 2, name: ad, children: liste([]) }; kok.push(b); return b; }
    },
    sequences: liste([], "numSequences"),
    importFiles: function (yollar, sessiz, kutu, sayiliResim) {
      d.iceAlinan.push({ yollar: yollar.slice(), sessiz: sessiz, kutu: kutu ? kutu.name : null, sayiliResim: sayiliResim });
      if (opts.iceAlmaz) return false;
      yollar.forEach(function (y) { (kutu ? kutu.children : kok).push(oge(y)); });
      return true;
    },
    openSequence: function () { d.timeline.push("openSequence"); },
    createNewSequenceFromClips: function () { d.timeline.push("createNewSequenceFromClips"); }
  };
  Object.defineProperty(proje, "activeSequence", {
    get: function () { d.timeline.push("activeSequence"); return null; },
    set: function () { d.timeline.push("activeSequence="); }
  });
  if (opts.bulucu && proje.rootItem) {
    proje.rootItem.findItemsMatchingMediaPath = function (yol) {
      d.bulucu++;
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
    app: { version: "26.0.0", project: proje },
    File: function (y) { d.fileYollari = (d.fileYollari || []).concat([String(y)]); this.exists = !opts.dosyaYok && uriCoz(y) === (opts.dosya || DOSYA); },
    Time: function () {}, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
    isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, Folder: function () {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
  return {
    d: d, kok: kok,
    cagir: function (arg) { return JSON.parse(ctx.KS_importDownloaded(encodeURIComponent(JSON.stringify(arg)))); }
  };
}

/* 1) İlk indirme: kutu, içe alma, seçim */
var p = premiere();
var r = p.cagir({ path: DOSYA, bin: KUTU });
ok("ilk indirme başarılı", r.ok === true && r.imported === true && r.reused === false, js(r));
ok("'Suflo İndirilenler' kutusu (Unicode ad) bir kez oluşturuldu, dosya ona alındı", p.d.binYapildi === 1 && p.kok[0].name === KUTU && p.kok[0].children.length === 1 &&
  p.d.iceAlinan.length === 1 && p.d.iceAlinan[0].kutu === KUTU && p.d.iceAlinan[0].yollar[0] === DOSYA, js(p.d.iceAlinan));
ok("importFiles uyarıları bastırır, sayılı resim değil", p.d.iceAlinan[0].sessiz === true && p.d.iceAlinan[0].sayiliResim === false);
ok("öğe Proje panelinde seçildi, adı döner", r.selected === true && p.d.secilen === 1 && r.name === "Klip [dQw4w9WgXcQ] 1080p.mp4" && r.bin === KUTU, js(r));
ok("timeline'a / sekanslara dokunulmadı", p.d.timeline.length === 0, js(p.d.timeline));

/* 2) Aynı dosya ikinci kez: yeniden kullanılır */
var r2 = p.cagir({ path: DOSYA, bin: KUTU });
ok("ikinci kez: yeniden içe alınmaz, yeni kutu yok", r2.ok && r2.reused === true && r2.imported === false && p.d.iceAlinan.length === 1 && p.d.binYapildi === 1 && p.kok[0].children.length === 1, js(r2));

/* 3) findItemsMatchingMediaPath varsa o kullanılır */
var pb = premiere({ bulucu: true });
pb.cagir({ path: DOSYA, bin: KUTU });
var rb = pb.cagir({ path: DOSYA, bin: KUTU });
ok("yol bulucu ile var olan öğe bulunur", rb.ok && rb.reused === true && pb.d.bulucu === 2 && pb.d.iceAlinan.length === 1);

/* 4) Var olan kutu yeniden kullanılır */
var pk = premiere({ kutuVar: true });
var rk = pk.cagir({ path: DOSYA, bin: KUTU });
ok("aynı adlı kutu varsa yenisi yapılmaz", rk.ok && pk.d.binYapildi === 0 && pk.kok.length === 1 && pk.kok[0].children.length === 1);

/* 5) Kutu adı verilmezse varsayılan "Suflo İndirilenler" (\u0130 kaçışı) */
var pv = premiere();
var rv = pv.cagir({ path: DOSYA });
ok("varsayılan kutu adı", rv.ok && pv.kok[0].name === "Suflo İndirilenler" && rv.bin === "Suflo İndirilenler", js(rv));
var pz = premiere();
pz.cagir({ path: DOSYA, bin: "Kötü\nad\t" + new Array(100).join("x") });
ok("kutu adı tek satır, 80 karakter sınırı", pz.kok[0].name.indexOf("\n") === -1 && pz.kok[0].name.length === 80);

/* 6) macOS Unicode yol farkı: yolla bulunamayan yeni öğe kutuya eklenen son öğe */
var pu = premiere({ yolFarki: true });
var ru = pu.cagir({ path: DOSYA, bin: KUTU });
ok("yol biçimi farklıysa kutuya yeni eklenen öğe alınır", ru.ok && ru.imported === true && ru.name === "Klip [dQw4w9WgXcQ] 1080p.mp4", js(ru));

/* 7) Hatalar */
var r7 = premiere({ proje: false }).cagir({ path: DOSYA, bin: KUTU });
ok("açık proje yok → proje-yok", r7.ok === false && r7.kod === "proje-yok", js(r7));
var r8 = premiere({ dosyaYok: true }).cagir({ path: DOSYA, bin: KUTU });
ok("dosya yok → dosya-yok", r8.ok === false && r8.kod === "dosya-yok", js(r8));
var r9 = premiere().cagir({ bin: KUTU });
ok("yol verilmedi → yol-yok", r9.ok === false && r9.kod === "yol-yok");
var pi = premiere({ iceAlmaz: true });
var r10 = pi.cagir({ path: DOSYA, bin: KUTU });
ok("Premiere içe alamadı → ice-alinamadi", r10.ok === false && r10.kod === "ice-alinamadi" && pi.d.timeline.length === 0, js(r10));

/* 7b) Başlıkta "%" (Türkçede "%50 indirim", "%100 gerçek"): ExtendScript File "%50"yi "P" sanar */
var YUZDE = "C:\\Users\\Ömer\\Belgeler\\Düğün Projesi\\Suflo İndirilenler\\Fiyatlar %50 düştü, %100 gerçek [dQw4w9WgXcQ] 1080p.mp4";
ok("sahte File URI çözümü gerçekçi: düz yolla '%50' dosyası bulunmaz", uriCoz(YUZDE) !== YUZDE && uriCoz(YUZDE.replace(/%/g, "%25")) === YUZDE);
var py = premiere({ dosya: YUZDE });
var ry = py.cagir({ path: YUZDE, bin: KUTU });
ok("'%' taşıyan başlık: dosya bulunur ve kutuya alınır (dosya-yok değil), importFiles'a yol aynen gider",
  ry.ok === true && ry.imported === true && py.d.iceAlinan.length === 1 && py.d.iceAlinan[0].yollar[0] === YUZDE && py.kok[0].children[0].getMediaPath() === YUZDE, js(ry));
var ry2 = premiere({ dosya: YUZDE, dosyaYok: true }).cagir({ path: YUZDE, bin: KUTU });
ok("'%' taşıyan başlık ama dosya gerçekten yok → yine dosya-yok", ry2.ok === false && ry2.kod === "dosya-yok", js(ry2));
var pd = premiere();
pd.cagir({ path: DOSYA, bin: KUTU });
ok("'%' yoksa tek File denemesi (eskisi gibi)", js(pd.d.fileYollari) === js([DOSYA]), js(pd.d.fileYollari));

/* 8) Seçim isteğe bağlı */
var rs1 = premiere({ select: "yok" }).cagir({ path: DOSYA, bin: KUTU });
var rs2 = premiere({ select: "atar" }).cagir({ path: DOSYA, bin: KUTU });
ok("select yoksa ya da hata verirse yine başarılı, selected false", rs1.ok && rs1.selected === false && rs2.ok && rs2.selected === false, js([rs1, rs2]));

/* 9) Kaynak: ES3 ve zaman çizelgesi çağrısı yok */
var src = fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8").replace(/\r\n/g, "\n");
var i = src.indexOf("function KS_importDownloaded(encoded)"), govde = src.slice(i, src.indexOf("\n}\n", i));
ok("KS_importDownloaded gövdesinde sekans / playhead / klip yerleştirme yok", i > 0 && !/activeSequence|insertClip|overwriteClip|openSequence|setPlayerPosition|videoTracks/.test(govde));
ok("panel KS_importDownloaded'ı kutu adıyla çağırır", /K\.call\("KS_importDownloaded", \{ path: sonuc\.dosya, bin: Y\.KLASOR_ADI \}/.test(fs.readFileSync(path.join(__dirname, "..", "js", "youtube-indir-ui.js"), "utf8")));

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
