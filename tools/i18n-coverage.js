#!/usr/bin/env node
/*
 * Suflo — İngilizce arayüz sözlüğü kapsama raporu
 *   node tools/i18n-coverage.js            özet + eksikler
 *   node tools/i18n-coverage.js --all      eksiklerin tamamı
 *   node tools/i18n-coverage.js --dump     çıkarılan tüm Türkçe metinler (JSON)
 *
 * index.html'deki statik metinleri (metin düğümleri + title/placeholder/aria-label/alt)
 * ve js/*.js içindeki kullanıcıya görünen Türkçe metin sabitlerini çıkarır, her birinin
 * js/i18n.js + i18n/en.js ile çevrilip çevrilmediğine bakar. Birleştirme ile kurulan
 * metinlerde ("n + ' klip atlandı'") değişken yerine örnek değer konup kalıplar denenir.
 * index.html kapsamı %95'in altındaysa çıkış kodu 1.
 */
var fs = require("fs");
var path = require("path");

var KOK = path.resolve(__dirname, "..");
var ESIK = 95;

var TR_HARF = /[ıİşŞğĞçÇöÖüÜ]/;
var TR_KELIME = /(^|[^A-Za-z])(ve|bu|bir|ile|veya|için|yok|var|ekle|sil|kapat|kaydet|iptal|tamam|evet|hayir|yeni|sekans|klip|ses|metin|renk|boyut|kalite|hata|dosya|klasor|ayarlar|yazi|kelime|satir|sure|hiz|devam|geri|indir|yukle|bekle|hazir|sec|tum|daha|once|sonra|kes|yalniz|otomatik|altyazi|baslik|kanca|bolum|stil|ac|kapali|acik|lisans|anahtar|deneme|guncelle|surum|gibi|dakika|saat|saatler|saniye|sn|mi|mu|de|da|ya|en|cok|bul|ara|ayar|al|ver|gir|olarak|kadar|her|hep|yine|sadece|simdi|sonraki|onceki|kopya|orijinal|marker'?lar[ıi]?|timeline'?[ıia]?|uygula|uygulanamadi|giris|cikis|temiz|yumusak|vurgu|dolgu|belgesel|eksik|durum|tarih|sorun|modu|dikey|yatay|oynat|gerekli|kesim|kur|aktif|kurgu|eklenemedi|temizlenemedi|yaklasma|acilma|gorunme|kaybolma)([^A-Za-z]|$)/i;
var TR_COKEK = /[A-Za-zâ](iyor|ıyor|uyor|üyor|ndi|ndu|ldi|ldu|tti|ttu|ddi|mez|maz|ecek|acak|leri|lari|ları|siz)([^A-Za-z]|$)|(^|[^A-Za-z])(kontrol|ayarla|sahne|bitti|durdu|ekleniyor|kuruldu|bulundu)([^A-Za-z]|$)/i;
var TR_EK = /[A-Za-z]'(e|a|i|ı|u|ü|de|da|te|ta|ye|ya|yi|yı|yu|nin|nın|in|ın|den|dan|ten|tan|le|la|yle|yla)([^A-Za-z]|$)/;

function turkceMi(s) {
  if (!s || !/[A-Za-zÀ-ɏ]/.test(s)) return false;
  return TR_HARF.test(s) || TR_KELIME.test(s) || TR_EK.test(s) || TR_COKEK.test(s);
}

/* ---------------- HTML ---------------- */
var ENTITY = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", hellip: "…", middot: "·", rarr: "→", larr: "←", mdash: "—", ndash: "–", times: "×", bull: "•", copy: "©", check: "✓" };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
    if (e[0] === "#") return String.fromCharCode(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return Object.prototype.hasOwnProperty.call(ENTITY, e.toLowerCase()) ? ENTITY[e.toLowerCase()] : m;
  });
}
function satirNo(src, idx) { return src.slice(0, idx).split("\n").length; }

// Sonuç: [{ text, kind: "text"|"attr:<ad>", line }]
// tumu: true → harf içeren HER metin (Türkçe sezgisi yerine); kapsamda "keep" listesi düşülür
function extractHtml(src, tumu) {
  var out = [];
  var temiz = src.replace(/<!--[\s\S]*?-->|<(script|style|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, function (m) {
    // satır numaraları korunsun; textarea'nın kendi açılış etiketini (placeholder) bırak
    var t = /^<textarea/i.test(m) ? m.match(/^<textarea\b[^>]*>/i)[0] : "";
    return t + m.slice(t.length).replace(/[^\n]/g, " ");
  });
  var re = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g, m, son = 0;
  function metin(parca, idx) {
    var t = decode(parca).replace(/\s+/g, " ").trim();
    if ((tumu ? /[A-Za-z\u00C0-\u024F]{2}/.test(t) : turkceMi(t)) && YOKSAY.indexOf(t) === -1) out.push({ text: t, kind: "text", line: satirNo(src, idx) });
  }
  while ((m = re.exec(temiz))) {
    if (m.index > son) metin(temiz.slice(son, m.index), son);
    son = m.index + m[0].length;
    var ar = /\s(title|placeholder|aria-label|alt|data-tip)\s*=\s*("([^"]*)"|'([^']*)')/gi, a;
    while ((a = ar.exec(m[0]))) {
      var v = decode(a[3] !== undefined ? a[3] : a[4]).replace(/\s+/g, " ").trim();
      if (tumu ? /[A-Za-z\u00C0-\u024F]{2}/.test(v) : turkceMi(v)) out.push({ text: v, kind: "attr:" + a[1].toLowerCase(), line: satirNo(src, m.index) });
    }
  }
  if (son < temiz.length) metin(temiz.slice(son), son);
  return out;
}

/* ---------------- JS ---------------- */
// Kullanıcıya görünmeyen (ya da bilerek Türkçe kalan) bilinen metinler: motor istem ipuçları,
// önizlemedeki örnek altyazı sözcükleri
var YOKSAY = ["Iıı, eee, hmm, şey, yani... ıı, ee.", "Ee, ıı, hmm, yəni, şey.", "Doğru yazılması gereken özel adlar ve terimler: {}.",
  "Hikâyenin başladığı yer.", "ŞAK!", "BU", "FİKİR", "DAHA", "İYİ", "Türkçe ANSI",
  "Euh, heu, hum... en fait, du coup, bah.",
  "Français", // dil seçicide dilin kendi adı
  "Pro altyazi vitrini", "Pro animasyon vitrini", // iç katalog adı (hata günlüğü)
  "{}. {} ({}–{}, {} sn){}"]; // panoya kopyalanan liste
var REGEX_ONCESI = /^(return|typeof|case|in|of|do|else|void|throw|new|delete|instanceof|yield|await)$/;
function tokenize(src) {
  var toks = [], i = 0, n = src.length, onceki = "", sonKelime = "";
  function push(t) { toks.push(t); }
  while (i < n) {
    var c = src[i], d = src[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && d === "/") { var j = src.indexOf("\n", i); i = j < 0 ? n : j; continue; }
    if (c === "/" && d === "*") { var k = src.indexOf("*/", i + 2); i = k < 0 ? n : k + 2; continue; }
    if (c === "\"" || c === "'" || c === "`") {
      var m = i + 1, val = "", parts = [], depth = 0;
      while (m < n && src[m] !== c) {
        if (src[m] === "\\") {
          var e = src[m + 1];
          if (e === "n") val += "\n"; else if (e === "t") val += "\t";
          else if (e === "u") { val += String.fromCharCode(parseInt(src.substr(m + 2, 4), 16)); m += 4; }
          else if (e === "x") { val += String.fromCharCode(parseInt(src.substr(m + 2, 2), 16)); m += 2; }
          else if (e === "\n" || e === "\r") { /* satır devamı */ } else val += e;
          m += 2; continue;
        }
        if (c === "`" && src[m] === "$" && src[m + 1] === "{") {
          parts.push(val); val = ""; m += 2; depth = 1;
          while (m < n && depth) { if (src[m] === "{") depth++; else if (src[m] === "}") depth--; m++; }
          continue;
        }
        val += src[m]; m++;
      }
      if (c === "`" && parts.length) { parts.push(val); push({ t: "tpl", parts: parts, s: i, e: m + 1 }); }
      else push({ t: "str", v: val, s: i, e: m + 1 });
      i = m + 1; onceki = "x"; sonKelime = ""; continue;
    }
    if (c === "/" && (!/[\w$)\]]/.test(onceki) || REGEX_ONCESI.test(sonKelime))) {
      var r = i + 1, sinif = false;
      while (r < n && src[r] !== "\n") {
        if (src[r] === "\\") { r += 2; continue; }
        if (src[r] === "[") sinif = true; else if (src[r] === "]") sinif = false;
        else if (src[r] === "/" && !sinif) break;
        r++;
      }
      while (r + 1 < n && /[a-z]/.test(src[r + 1])) r++;
      push({ t: "re", s: i, e: r + 1 }); i = r + 1; onceki = "x"; sonKelime = ""; continue;
    }
    if (/[\w$]/.test(c)) {
      var w = i;
      while (w < n && /[\w$]/.test(src[w])) w++;
      var kel = src.slice(i, w);
      push({ t: "id", v: kel, s: i, e: w }); onceki = kel[kel.length - 1]; sonKelime = kel; i = w; continue;
    }
    push({ t: "p", v: c, s: i, e: i + 1 });
    onceki = c; sonKelime = ""; i++;
  }
  return toks;
}

// Kullanıcıya gösterilmeyen çağrılar (günlük, depolama, seçici, host çağrıları, regex)
var GIZLI_CAGRI = /^(log|logText|debug|info|warn|error|require|getItem|setItem|removeItem|indexOf|lastIndexOf|test|match|split|replace|RegExp|call|evalScript|querySelector|querySelectorAll|getElementById|addEventListener|removeEventListener|dispatchEvent|postMessage|join|startsWith|endsWith|localeCompare|toLocaleLowerCase|toLocaleUpperCase|fetch|open|send|setRequestHeader|createElement|getAttribute|hasAttribute|removeAttribute|classList|toggle|contains|add|remove|search|exec|has|normalize|encodeURIComponent)$/;

function operandSol(toks, k) { // toks[k] işlenenin SON belirteci; işlenenin İLK indeksini döndür
  var t = toks[k];
  if (!t) return -1;
  if (t.t === "p" && (t.v === ")" || t.v === "]")) {
    var acik = t.v === ")" ? "(" : "[", d = 0;
    for (var j = k; j >= 0; j--) {
      if (toks[j].t === "p" && toks[j].v === t.v) d++;
      else if (toks[j].t === "p" && toks[j].v === acik) { d--; if (!d) break; }
    }
    k = j;
    if (k > 0 && (toks[k - 1].t === "id" || (toks[k - 1].t === "p" && (toks[k - 1].v === ")" || toks[k - 1].v === "]")))) return operandSol(toks, k - 1);
    return k;
  }
  if (t.t === "id" || t.t === "str" || t.t === "tpl") {
    while (k >= 2 && toks[k - 1].t === "p" && toks[k - 1].v === "." && (toks[k - 2].t === "id" || (toks[k - 2].t === "p" && (toks[k - 2].v === ")" || toks[k - 2].v === "]")))) {
      if (toks[k - 2].t === "id") k -= 2; else return operandSol(toks, k - 2);
    }
    return k;
  }
  return -1;
}
function operandSag(toks, k) { // toks[k] işlenenin İLK belirteci; SON indeksini döndür
  var t = toks[k];
  if (!t) return -1;
  if (t.t === "p" && t.v === "(") {
    var d = 0;
    for (var j = k; j < toks.length; j++) {
      if (toks[j].t === "p" && toks[j].v === "(") d++;
      else if (toks[j].t === "p" && toks[j].v === ")") { d--; if (!d) break; }
    }
    return j;
  }
  if (t.t === "id" || t.t === "str" || t.t === "tpl") {
    var e = k;
    while (e + 1 < toks.length) {
      var x = toks[e + 1];
      if (x.t === "p" && x.v === "." && toks[e + 2] && toks[e + 2].t === "id") { e += 2; continue; }
      if (x.t === "p" && (x.v === "(" || x.v === "[")) {
        var kap = x.v === "(" ? ")" : "]", dd = 0;
        for (var q = e + 1; q < toks.length; q++) {
          if (toks[q].t === "p" && toks[q].v === x.v) dd++;
          else if (toks[q].t === "p" && toks[q].v === kap) { dd--; if (!dd) break; }
        }
        e = q; continue;
      }
      break;
    }
    return e;
  }
  return -1;
}
function opParcasi(toks, a, b) { // a..b arası tek işlenen: metin mi, değişken mi
  if (a === b && toks[a].t === "str") return { lit: toks[a].v };
  return { lit: null };
}

// + zincirini bul ve şablona çevir: ["Toplam ", {0}, " klip"]
function zincir(toks, k) {
  var parcalar = [{ a: k, b: k }];
  var a = k;
  while (a >= 2 && toks[a - 1].t === "p" && toks[a - 1].v === "+" && !(toks[a - 2].t === "p" && toks[a - 2].v === "+")) {
    var s = operandSol(toks, a - 2);
    if (s < 0) break;
    // önceki belirteç = ise sol taraf atama hedefi değil, zincir sağdadır
    parcalar.unshift({ a: s, b: a - 2 }); a = s;
  }
  var b = k;
  while (toks[b + 1] && toks[b + 1].t === "p" && toks[b + 1].v === "+" && toks[b + 2] && !(toks[b + 2].t === "p" && toks[b + 2].v === "=")) {
    var e = operandSag(toks, b + 2);
    if (e < 0) break;
    parcalar.push({ a: b + 2, b: e }); b = e;
  }
  return parcalar.map(function (p) { return opParcasi(toks, p.a, p.b); });
}

function cagriAdi(toks, k) { // k'yı içeren en yakın açık "(" öncesindeki ad
  var d = 0;
  for (var j = k - 1; j >= 0 && j > k - 400; j--) {
    var t = toks[j];
    if (t.t !== "p") continue;
    if (t.v === ")" || t.v === "]" || t.v === "}") d++;
    else if (t.v === "(" || t.v === "[" || t.v === "{") {
      if (d) { d--; continue; }
      if (t.v !== "(") return t.v === "{" ? "{" : "[";
      var ad = toks[j - 1];
      return ad && ad.t === "id" ? ad.v : "(";
    } else if (t.v === ";" && !d) return null;
  }
  return null;
}

// Sonuç: [{ text, sample, template, line, file }]
function extractJs(src, file) {
  var toks = tokenize(src), out = [];
  for (var k = 0; k < toks.length; k++) {
    var t = toks[k];
    if (t.t !== "str" && t.t !== "tpl") continue;
    var duz = t.t === "str" ? t.v : t.parts.join("{}");
    if (!turkceMi(duz)) continue;
    if (/^suflo[.:]/i.test(duz) || /^[a-z0-9_.:-]+$/.test(duz)) continue; // anahtar/tanımlayıcı
    if (/^[a-z ]+$/.test(duz)) continue; // arama anahtar kelimeleri (ASCII, küçük harf)
    if (/^[a-z0-9{}_ -]+$/.test(duz) && /-/.test(duz)) continue; // CSS sınıf listesi
    if (/^(https?:|Dialogue:|Style:|;|color=)/.test(duz)) continue; // URL, ASS başlıkları, ffmpeg filtreleri
    if (YOKSAY.indexOf(duz) !== -1) continue;
    if ((duz.match(/[{};]/g) || []).length > 8 && /[a-z-]+:[^ ]/.test(duz) && !/<[a-z]/.test(duz)) continue; // üretilen CSS
    var sonraki = toks[k + 1], onceki = toks[k - 1];
    if (sonraki && sonraki.t === "p" && sonraki.v === ":" && onceki && onceki.t === "p" && (onceki.v === "{" || onceki.v === ",")) continue; // nesne anahtarı
    var ad = cagriAdi(toks, k);
    if (ad && GIZLI_CAGRI.test(ad)) continue;
    // anahtar kelime listeleri (ör. otomatik emoji eşleştirme verisi): küçük harfli kısa öğeler
    if (ad === "[" && t.t === "str" && duz.length < 24 && duz === duz.toLocaleLowerCase("tr") && duz.split(" ").length <= 2) continue;
    // console.x(...)
    if (onceki && onceki.t === "p" && onceki.v === "(" && toks[k - 3] && toks[k - 3].v === "console") continue;
    var sablonMetni = (t.t === "tpl" ? [] : zincir(toks, k)).map(function (p) { return p.lit === null ? "" : p.lit; }).join("");
    if (/^(https?:|Dialogue:|Style:|color=)/.test(sablonMetni)) continue;
    var sablon = t.t === "tpl" ? (function () {
      var r = [];
      t.parts.forEach(function (p, i) { if (i) r.push({ lit: null }); r.push({ lit: p }); });
      return r;
    })() : zincir(toks, k);
    if (YOKSAY.indexOf(sablon.map(function (p) { return p.lit === null ? "{}" : p.lit; }).join("")) !== -1) continue;
    out.push({ text: duz, template: sablon, line: satirNo(src, t.s), file: file });
  }
  return out;
}

function ornekler(sablon) {
  var degerler = ["3", "Video", "12.5"];
  return degerler.map(function (d) {
    return sablon.map(function (p) { return p.lit === null ? d : p.lit; }).join("");
  });
}

/* ---------------- kapsama ---------------- */
function yukleCevirmen() {
  delete require.cache[require.resolve(path.join(KOK, "i18n", "en.js"))];
  delete require.cache[require.resolve(path.join(KOK, "js", "i18n.js"))];
  var I = require(path.join(KOK, "js", "i18n.js"));
  var d = require(path.join(KOK, "i18n", "en.js"));
  I.setDictionary(d);
  KEEP = {};
  (d.keep || []).forEach(function (k) { KEEP[k] = 1; });
  return I;
}
// innerHTML ile kurulan metinler: çalışma anında etiketler ayrışır, her metin düğümü ayrı çevrilir
function parcala(s) {
  if (!/<[a-z\/][^>]*>/i.test(s)) return [s];
  return s.split(/<(?:[^>"']|"[^"]*"|'[^']*')*>/).map(function (x) { return x.replace(/&[a-z]+;/g, " "); }).filter(turkceMi);
}
var KEEP = {};
function cevrildi(I, s) {
  if (KEEP[s.replace(/\s+/g, " ").trim()]) return true;
  var p = parcala(s);
  return p.every(function (x) {
    var t = I.translate(x);
    return t !== x && !TR_HARF.test(t);
  });
}

function rapor() {
  var I = yukleCevirmen();
  var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
  var hs = extractHtml(html, true);
  var hTekil = {}, hEksik = [];
  hs.forEach(function (x) {
    if (hTekil[x.text]) return;
    hTekil[x.text] = 1;
    if (!cevrildi(I, x.text)) hEksik.push(x);
  });
  var hToplam = Object.keys(hTekil).length;

  var dir = path.join(KOK, "js");
  var jsTum = [];
  fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f) && f !== "CSInterface.js" && f !== "i18n.js"; }).sort().forEach(function (f) {
    jsTum = jsTum.concat(extractJs(fs.readFileSync(path.join(dir, f), "utf8"), "js/" + f));
  });
  var jTekil = {}, jEksik = [], jToplam = 0;
  jsTum.forEach(function (x) {
    var anahtar = JSON.stringify(x.template.map(function (p) { return p.lit; }));
    if (jTekil[anahtar]) return;
    jTekil[anahtar] = 1; jToplam++;
    var tam = ornekler(x.template);
    var ok = tam.some(function (s) { return cevrildi(I, s); }) || cevrildi(I, x.text);
    if (!ok) jEksik.push(x);
  });
  return {
    html: { toplam: hToplam, eksik: hEksik, yuzde: hToplam ? 100 * (hToplam - hEksik.length) / hToplam : 100 },
    js: { toplam: jToplam, eksik: jEksik, yuzde: jToplam ? 100 * (jToplam - jEksik.length) / jToplam : 100 },
    hepsi: { html: hs, js: jsTum }
  };
}

if (require.main === module) {
  var r = rapor();
  if (process.argv.indexOf("--dump") !== -1) {
    console.log(JSON.stringify({ html: Object.keys(r.hepsi.html.reduce(function (o, x) { o[x.text] = 1; return o; }, {})),
      js: r.hepsi.js.map(function (x) { return { file: x.file, line: x.line, t: x.template.map(function (p) { return p.lit === null ? "{}" : p.lit; }).join("") }; }) }, null, 1));
    process.exit(0);
  }
  var hepsi = process.argv.indexOf("--all") !== -1;
  function yaz(baslik, b, satir) {
    console.log("\n" + baslik + ": " + (b.toplam - b.eksik.length) + "/" + b.toplam + " çevrildi (%" + b.yuzde.toFixed(1) + ")");
    b.eksik.slice(0, hepsi ? 1e9 : 25).forEach(function (x) { console.log("  - " + satir(x)); });
    if (!hepsi && b.eksik.length > 25) console.log("  … " + (b.eksik.length - 25) + " daha (--all)");
  }
  yaz("index.html statik metinler", r.html, function (x) { return "index.html:" + x.line + " [" + x.kind + "] " + x.text.slice(0, 110); });
  yaz("js/*.js kullanıcı metinleri", r.js, function (x) {
    return x.file + ":" + x.line + " " + x.template.map(function (p) { return p.lit === null ? "{…}" : p.lit; }).join("").replace(/\n/g, "\\n").slice(0, 110);
  });
  var gecti = r.html.yuzde >= ESIK;
  console.log("\n" + (gecti ? "TAMAM" : "YETERSIZ") + ": index.html kapsamı %" + r.html.yuzde.toFixed(1) + " (eşik %" + ESIK + ")");
  process.exit(gecti ? 0 : 1);
}

module.exports = { extractHtml: extractHtml, extractJs: extractJs, tokenize: tokenize, turkceMi: turkceMi, rapor: rapor, ornekler: ornekler };
