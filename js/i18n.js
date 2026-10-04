/*
 * Suflo — arayüz çevirisi (i18n)
 *
 * Panelin Türkçe DOM'unu, mevcut koda dokunmadan çalışma anında İngilizceye
 * çevirir. Sözlük i18n/en.js'ten gelir (window.SufloI18nEN). Kullanıcı içeriği
 * (transkript, altyazı satırları, kanca metni, bölüm adları) ASLA çevrilmez:
 * textarea/input değerlerine dokunulmaz, düzenleyici kaplarında yalnız düğme
 * metinleri ve düğme ipuçları çevrilir.
 *
 * Kablolama: index.html bu dosyayı CSInterface.js'ten hemen sonra yükler; KApp.init
 * en başta configure() + (dil "en" ise) start() çağırır. Dil settings.json'daki
 * uiLang'de durur (localStorage yalnız ayna). Eski kurulumlar Türkçe kalır: Premiere'in
 * Türkçe arayüzü yok, navigator.language çoğu Türk kurulumda en-US döner.
 * EN → TR geçişi yeniden yükleme istemez: revert() özgün metinleri geri koyar.
 * Node'da test edilebilir (saf mantık + küçük DOM arayüzü: nodeType, childNodes,
 * getAttribute, setAttribute).
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloI18n = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";

  var LS_KEY = "suflo.uiLang";
  var ATTRS = ["title", "placeholder", "aria-label", "alt", "data-tip", "label"];   // label: <optgroup label>
  // Hiç girilmeyen öğeler (kod, stil, kullanıcı metni alanları)
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1, svg: 1 };
  // Kullanıcı içeriği barındıran kaplar: transkript/altyazı düzenleyicisi, önizleme,
  // metinden kesim, bölüm/viral/B-roll listeleri. Burada yalnız BUTTON/LABEL içindeki
  // metinler ve düğme/alan ipuçları çevrilir; serbest metin (kullanıcının sözleri) kalır.
  var USER_CONTENT_IDS = [
    "cap-segments", "cap-onizleme-metin", "cap-ch-list", "cap-vr-liste", "cap-br-liste",
    "cut-ranges", "cap-yt-aciklama", "cap-yt-basliklar", "cap-yt-etiket", "kanca-metin", "kanca-oneriler", "tc-words",
    // Kullanıcının kütüphane dosya adları (bir SFX'in adı "Kapat" ise "Close" olmasın)
    "sfx-list", "emoji-assets-grid"
  ];
  var UI_IN_USER_ZONE = { BUTTON: 1, LABEL: 1, OPTION: 1, SELECT: 1 };

  var dict = null, patterns = [], cache = {}, cacheSize = 0, lang = null;
  var env = { storage: null, navigator: null };
  // Ayar deposu (configure): { load: () => ayarlar nesnesi, save: () => void, settingsExisted: bool | () => bool }
  var cfg = null;
  // Çevirdiğimiz her düğümün özgün hâli: revert() bunları geri koyar (yeniden yüklemesiz EN → TR)
  var HAS_WM = typeof WeakMap === "function";
  var origText = HAS_WM ? new WeakMap() : null, origAttr = HAS_WM ? new WeakMap() : null;
  var origDoc = null;   // { title, lang } start() öncesi
  var listeners = [];

  function loadDefault() {
    var d = root && root.SufloI18nEN;
    if (!d && typeof require === "function") {
      try { d = require("../i18n/en.js"); } catch (e) { d = null; }
    }
    if (d) setDictionary(d);
  }

  // Sözlük: { strings: { "Türkçe": "English", "{n} klip seçili": "{} clips selected" }, patterns: [[RegExp, hedef]] }
  // "{}" / "{n}" içeren anahtarlar kalıba derlenir: {} = herhangi bir metin (çevrilerek yerleştirilir),
  // {n} = yalnız sayı (ör. 12, 1.076, 3,5, 45%, 120 MB). Hedefte {} sırayla, {1} {2} numarasıyla yer alır.
  function setDictionary(d) {
    dict = {};
    patterns = [];
    cache = {};
    if (!d) return;
    var strings = d.strings || {}, tpl = [];
    Object.keys(strings).forEach(function (k) {
      var nk = normKey(k);
      if (nk.indexOf("{}") === -1 && nk.indexOf("{n}") === -1) { dict[nk] = strings[k]; return; }
      tpl.push([nk, strings[k]]);
    });
    patterns = (d.patterns || []).slice();
    // en çok sabit metni olan kalıp önce denensin
    tpl.sort(function (a, b) { return b[0].replace(/\{n?\}/g, "").length - a[0].replace(/\{n?\}/g, "").length; });
    tpl.forEach(function (t) { patterns.push([compileTemplate(t[0]), templateTarget(t[1])]); });
  }
  var NUM = "([\u2212+-]?%?\\d[\\d.,]*%?(?: ?(?:KB|MB|GB))?)";
  function compileTemplate(k) {
    var esc = function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
    var src = k.split(/(\{n?\})/).map(function (x) {
      return x === "{}" ? "([\\s\\S]+?)" : x === "{n}" ? NUM : esc(x);
    }).join("");
    return new RegExp("^" + src + "$");
  }
  function templateTarget(v) {
    return function (m, t) {
      var n = 0;
      return String(v).replace(/\{(\d?)\}/g, function (x, i) {
        var c = m[i ? Number(i) : ++n];
        return c === undefined ? "" : t(c);
      });
    };
  }

  function normKey(s) { return String(s).replace(/\s+/g, " ").trim(); }

  // Kalıp: [RegExp, hedef]. Hedefte $1..$9 yakalananı olduğu gibi, %1..%9 ise çevrilmiş
  // hâlini koyar (ör. "{ad} kopyalandı" → "%1 copied"). Hedef işlevse fn(eşleşme, translate).
  function translatePatterns(key) {
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      var re = p[0];
      re.lastIndex = 0;
      var m = re.exec(key);
      if (!m) continue;
      if (typeof p[1] === "function") return p[1](m, translate);
      return String(p[1]).replace(/([$%])(\d)/g, function (x, k, n) {
        var v = m[Number(n)];
        if (v === undefined) return "";
        return k === "$" ? v : translate(v);
      });
    }
    return null;
  }

  // Çekirdek: tam eşleşme → kalıp → (ön ek simge / son ek noktalama ayıklanmış) tekrar
  function lookup(key) {
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
    var p = translatePatterns(key);
    if (p !== null) return p;
    // "✨ AI ile öner", "Yükleniyor…", "Hata: ...", "(Pro)" gibi süsler
    var m = /^([^A-Za-z0-9\u00C0-\u024F"'(]*)([\s\S]*?)([\s.…:!?;,)]*)$/.exec(key);
    if (m && (m[1] || m[3]) && m[2]) {
      var core = m[2];
      if (Object.prototype.hasOwnProperty.call(dict, core)) return m[1] + dict[core] + m[3];
      p = translatePatterns(core);
      if (p !== null) return m[1] + p + m[3];
      // son ek noktalama sözlükte zaten kayıtlıysa (ör. "Bekleyin…")
      if (m[1] && Object.prototype.hasOwnProperty.call(dict, core + m[3])) return m[1] + dict[core + m[3]];
    }
    // "A · B · C", "A — B" gibi birleşik durum satırları: parça parça
    var seps = [" · ", " — ", " | ", " → "];
    for (var i = 0; i < seps.length; i++) {
      if (key.indexOf(seps[i]) === -1) continue;
      var any = false;
      var out = key.split(seps[i]).map(function (x) {
        var y = x ? lookup(x) : null;
        if (y === null) return x;
        any = true; return y;
      });
      if (any) return out.join(seps[i]);
    }
    // Birden çok cümle: cümle cümle
    var cumleler = key.match(/[^.!?…]+(?:[.!?…]+|$)\s*/g);
    if (cumleler && cumleler.length > 1) {
      var deg = false;
      var r = cumleler.map(function (c) {
        var mm = /^([\s\S]*?)(\s*)$/.exec(c), y = lookup(mm[1]);
        if (y === null) return c;
        deg = true; return y + mm[2];
      }).join("");
      if (deg) return r;
    }
    return null;
  }

  function translate(str) {
    if (typeof str !== "string" || !str) return str;
    if (!dict) loadDefault();
    if (!dict) return str;
    if (Object.prototype.hasOwnProperty.call(cache, str)) return cache[str];
    if (++cacheSize > 4000) { cache = {}; cacheSize = 1; } // ilerleme satırları sınırsız büyümesin
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str);
    var out = str;
    if (m[2] && /[A-Za-z\u00C0-\u024F]/.test(m[2])) {
      var nk = normKey(m[2]), t = null;
      if (m[2].indexOf("\n") === -1) t = lookup(nk);
      else {
        // Çok satırlı metin: önce bütün anahtarın tam eşleşmesi; tutmazsa satır
        // satır, "\n" korunur (bridge.js'in "msg\nÇözüm: …" iletisi tek karışık satıra
        // dönmesin); hiçbir satır çevrilmezse eski bütünleşik arama
        t = Object.prototype.hasOwnProperty.call(dict, nk) ? dict[nk] : null;
        if (t === null) {
          var degisti = false;
          var satirlar = m[2].split("\n").map(function (x) {
            var y = translate(x);
            if (y !== x) degisti = true;
            return y;
          });
          t = degisti ? satirlar.join("\n") : lookup(nk);
        }
      }
      if (t !== null && t !== undefined) out = m[1] + t + m[3];
    }
    cache[str] = out;
    return out;
  }

  // Gelecekteki kod için: yalnız dil "en" iken çevirir
  function tr(str) { return getLang() === "en" ? translate(str) : str; }

  /* ---------------- dil seçimi ---------------- */
  function storage() {
    if (env.storage) return env.storage;
    try { return root && root.localStorage ? root.localStorage : null; } catch (e) { return null; }
  }
  function nav() { return env.navigator || (root && root.navigator) || null; }
  function gecerli(v) { return v === "en" || v === "tr" ? v : null; }

  // Yalnız öneri: ilk açılıştaki dil seçicide hangi düğmenin vurgulanacağı. Dili KENDİSİ
  // belirlemez: CEP'te navigator.language Premiere'in arayüz dilidir ve Premiere'in
  // Türkçe arayüzü olmadığından Türk kullanıcıların çoğunda "en-US" gelir.
  function detect(navLang) {
    var l = navLang;
    if (l === undefined) {
      var n = nav();
      l = n && (n.language || (n.languages && n.languages[0]));
    }
    l = String(l || "tr").toLowerCase();
    return /^(tr|az)\b/.test(l) ? "tr" : "en";
  }

  /*
   * Dil çözümü (saf): 1) settings.uiLang  2) eski localStorage "suflo.uiLang"
   * 3) settings.json bu yüklemeden önce vardıysa "tr" (her güncelleyen Türkçe kalır)
   * 4) null: taze kurulum, kullanıcıya sor. navLang yalnız öneridir, sonucu değiştirmez.
   */
  function resolveLang(o) {
    o = o || {};
    var s = gecerli(o.stored);
    if (s) return s;
    var l = gecerli(o.legacyLS);
    if (l) return l;
    if (o.settingsExisted) return "tr";
    return null;
  }

  function lsOku() {
    var s = storage();
    try { return s ? s.getItem(LS_KEY) : null; } catch (e) { return null; }
  }
  function lsYaz(v) {
    var s = storage();
    try { if (s) s.setItem(LS_KEY, v); return !!s; } catch (e) { return false; }
  }
  function ayarlar() {
    if (!cfg || typeof cfg.load !== "function") return null;
    try { var a = cfg.load(); return a && typeof a === "object" ? a : null; } catch (e) { return null; }
  }
  function ayarDosyasiVardi() {
    if (!cfg) return false;
    var v = cfg.settingsExisted;
    try { return !!(typeof v === "function" ? v() : v); } catch (e) { return true; }
  }
  function girdiler() {
    var a = ayarlar();
    return { stored: a ? a.uiLang : null, legacyLS: lsOku(), settingsExisted: ayarDosyasiVardi(), navLang: detect() };
  }

  // Ayar deposunu bağla. Eski localStorage seçimi settings.json'a bir kez taşınır.
  function configure(o) {
    cfg = o || null;
    lang = null;
    var a = ayarlar();
    if (a && !gecerli(a.uiLang)) {
      var eski = gecerli(lsOku());
      if (eski) {
        a.uiLang = eski;
        try { if (typeof cfg.save === "function") cfg.save(a); } catch (e) {}
      }
    }
    return getLang();
  }

  // Taze kurulumda dil henüz seçilmedi mi? (ilk açılış rehberinin 0. adımı)
  function needsChoice() { return !lang && resolveLang(girdiler()) === null; }

  function getLang() {
    if (lang) return lang;
    return resolveLang(girdiler()) || "tr";
  }
  function setLang(l) {
    l = l === "en" ? "en" : "tr";
    lang = l;
    var a = ayarlar();
    if (a) {
      a.uiLang = l;
      try { if (typeof cfg.save === "function") cfg.save(a); } catch (e) {}
    }
    lsYaz(l);   // ayna: settings.json yazılamazsa da seçim kalsın
    return l;
  }

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }
  function bildir(l) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](l); } catch (e) {}
    }
  }

  /*
   * Arayüz dilini değiştir. EN: çevir + gözlemciyi bağla. TR: özgün metinleri geri koy.
   * Geri koyma yapılamazsa (WeakMap yok) yalnız iş yokken sayfa yeniden yüklenir.
   * opts.busy(): Whisper/ffmpeg işi sürüyor mu · opts.reload(): yeniden yükleme işlevi.
   * Sonuç: "en" | "tr" | "reload" | "busy" (hiçbir şey değişmedi)
   */
  function switchLang(l, opts) {
    opts = opts || {};
    l = l === "en" ? "en" : "tr";
    var mesgul = false;
    try { mesgul = !!(opts.busy && opts.busy()); } catch (e) { mesgul = false; }
    if (l === "tr" && !HAS_WM && mesgul) return "busy";
    setLang(l);
    var sonuc = l;
    if (l === "en") start();
    else if (!revert()) {
      var yukle = opts.reload || function () { if (root && root.location) root.location.reload(); };
      try { yukle(); } catch (e2) {}
      sonuc = "reload";
    }
    bildir(l);
    return sonuc;
  }

  /* ---------------- DOM ---------------- */
  function isUserZone(el) {
    var id = el.id || (el.getAttribute && el.getAttribute("id"));
    return !!(id && USER_CONTENT_IDS.indexOf(id) !== -1);
  }
  // [data-i18n-skip]: hiç girilmez (iki dilli dil seçicileri, büyük listeler)
  function isSkipped(el) {
    if (!el.getAttribute) return false;
    var v = el.getAttribute("data-i18n-skip");
    return v !== null && v !== undefined;
  }
  function isEditable(el) {
    if (el.isContentEditable) return true;
    var ce = el.getAttribute ? el.getAttribute("contenteditable") : null;
    return ce !== null && ce !== undefined && ce !== "false";
  }

  function translateText(node) {
    var v = node.nodeValue;
    if (!v || !/[^\s]/.test(v)) return;
    var t = translate(v);
    if (t === v) return;
    if (origText) {
      // zaten çevrilmiş bir değerin üstüne yeniden çeviri gelirse en eski Türkçe kalsın
      var r = origText.get(node);
      origText.set(node, { o: r && r.t === v ? r.o : v, t: t });
    }
    node.nodeValue = t;
  }
  function translateAttrs(el, inZone) {
    if (!el.getAttribute) return;
    var tag = String(el.tagName || "").toUpperCase();
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (inZone && !(UI_IN_USER_ZONE[tag] || (a === "placeholder" && (tag === "INPUT" || tag === "TEXTAREA")))) continue;
      var v = el.getAttribute(a);
      if (typeof v !== "string" || !v) continue;
      var t = translate(v);
      if (t === v) continue;
      if (origAttr) {
        var rec = origAttr.get(el);
        if (!rec) { rec = {}; origAttr.set(el, rec); }
        var eskiR = rec[a];
        rec[a] = { o: eskiR && eskiR.t === v ? eskiR.o : v, t: t };
      }
      el.setAttribute(a, t);
    }
  }

  // inZone: kullanıcı içeriği kabının içinde miyiz; uiAncestor: BUTTON/LABEL içinde miyiz
  function walk(node, inZone, uiAncestor) {
    if (!node) return;
    if (node.nodeType === 3) {
      if (!inZone || uiAncestor) translateText(node);
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      var tag = String(node.tagName || "").toUpperCase();
      if (SKIP_TAGS[tag] || SKIP_TAGS[node.tagName]) {
        // textarea'nın kendisi değil, yalnız ipucu çevrilir
        if (tag === "TEXTAREA") translateAttrs(node, false);
        return;
      }
      if (isEditable(node) || isSkipped(node)) return;
      if (UI_IN_USER_ZONE[tag]) uiAncestor = true;
      // kabın kendi ipucu (ör. tc-words title) arayüz metnidir; kısıt yalnız içindekilere
      translateAttrs(node, inZone && !uiAncestor);
      if (isUserZone(node)) inZone = true;
    }
    var kids = node.childNodes || [];
    for (var i = 0; i < kids.length; i++) walk(kids[i], inZone, uiAncestor);
  }

  // Bir düğümün üst zincirindeki durumu çıkar (gözlemci eklenen düğümler için)
  function context(node) {
    var inZone = false, ui = false, p = node.parentNode;
    while (p && p.nodeType === 1) {
      var tag = String(p.tagName || "").toUpperCase();
      if (SKIP_TAGS[tag] || isEditable(p) || isSkipped(p)) return null;
      if (isUserZone(p)) inZone = true;
      if (UI_IN_USER_ZONE[tag]) ui = true;
      p = p.parentNode;
    }
    return { inZone: inZone, ui: ui };
  }

  function apply(rootNode) {
    if (!rootNode) rootNode = root && root.document ? root.document.body : null;
    if (!rootNode) return;
    var c = rootNode.parentNode ? context(rootNode) : { inZone: false, ui: false };
    if (!c) return;
    walk(rootNode, c.inZone, c.ui);
  }

  var observer = null;
  function handle(records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === "childList") {
        for (var j = 0; j < r.addedNodes.length; j++) apply(r.addedNodes[j]);
      } else if (r.type === "characterData") {
        var c = context(r.target);
        if (c && (!c.inZone || c.ui)) translateText(r.target);
      } else if (r.type === "attributes") {
        var c2 = context(r.target);
        if (!c2 || isSkipped(r.target)) continue;
        var tg = String(r.target.tagName || "").toUpperCase();
        var zone = c2.inZone, ui = c2.ui || !!UI_IN_USER_ZONE[tg];
        translateAttrs(r.target, zone && !ui);
      }
    }
  }

  // Kendi yazdıklarımız yeni kayıt üretir; ama çeviri sabit noktadır (translate(en) === en),
  // bu yüzden ikinci turda hiçbir şey değişmez ve döngü kendiliğinden biter.
  function start(opts) {
    var doc = root && root.document;
    if (!doc || !doc.body) return false;
    var de = doc.documentElement;
    if (!origDoc) origDoc = { title: doc.title, lang: de && de.getAttribute ? de.getAttribute("lang") : null };
    // lang="en" olmadan text-transform:uppercase kuralları Türkçe büyük harf kuralıyla
    // "SETTİNGS" yazar
    if (de && de.setAttribute) de.setAttribute("lang", "en");
    apply(doc.body);
    if (doc.title) doc.title = translate(doc.title);
    if (observer || typeof root.MutationObserver !== "function") return !!observer;
    observer = new root.MutationObserver(handle);
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS.slice() });
    return true;
  }
  function stop() { if (observer) { observer.disconnect(); observer = null; } }

  function geriKoy(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      var r = origText.get(node);
      if (r) {
        // kod o arada kendi metnini yazdıysa ona dokunma
        if (node.nodeValue === r.t) node.nodeValue = r.o;
        origText["delete"](node);
      }
      return;
    }
    if (node.nodeType === 1) {
      var rec = origAttr.get(node);
      if (rec) {
        for (var a in rec) {
          if (!Object.prototype.hasOwnProperty.call(rec, a)) continue;
          if (node.getAttribute(a) === rec[a].t) node.setAttribute(a, rec[a].o);
        }
        origAttr["delete"](node);
      }
    }
    var kids = node.childNodes || [];
    for (var i = 0; i < kids.length; i++) geriKoy(kids[i]);
  }

  // EN → TR: gözlemciyi ayır, çevrilen her metni ve özniteliği özgün hâline döndür.
  // false: geri koyma desteklenmiyor (WeakMap yok); çağıran yeniden yüklemeli.
  function revert() {
    stop();
    if (!HAS_WM) return false;
    var doc = root && root.document;
    if (!doc || !doc.body) return true;
    geriKoy(doc.body);
    if (origDoc) {
      if (typeof origDoc.title === "string") doc.title = origDoc.title;
      var de = doc.documentElement;
      if (de && de.setAttribute) {
        if (origDoc.lang) de.setAttribute("lang", origDoc.lang);
        else if (de.removeAttribute) de.removeAttribute("lang");
      }
      origDoc = null;
    }
    return true;
  }
  function running() { return !!observer; }

  return {
    LS_KEY: LS_KEY, ATTRS: ATTRS, USER_CONTENT_IDS: USER_CONTENT_IDS,
    translate: translate, tr: tr, apply: apply, start: start, stop: stop, revert: revert, running: running,
    getLang: getLang, setLang: setLang, detect: detect, setDictionary: setDictionary,
    resolveLang: resolveLang, configure: configure, needsChoice: needsChoice, switchLang: switchLang, onChange: onChange,
    _handle: handle,
    _setEnv: function (e) { env = { storage: e && e.storage || null, navigator: e && e.navigator || null }; lang = null; cfg = e && e.cfg || null; }
  };
});
