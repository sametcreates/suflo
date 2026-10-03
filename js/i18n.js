/*
 * Suflo — arayüz çevirisi (i18n)
 *
 * Panelin Türkçe DOM'unu, mevcut koda dokunmadan çalışma anında İngilizceye
 * çevirir. Sözlük i18n/en.js'ten gelir (window.SufloI18nEN). Kullanıcı içeriği
 * (transkript, altyazı satırları, kanca metni, bölüm adları) ASLA çevrilmez:
 * textarea/input değerlerine dokunulmaz, düzenleyici kaplarında yalnız düğme
 * metinleri ve düğme ipuçları çevrilir.
 *
 * Kablolama v3.1'de: bkz. i18n/README.md. Node'da test edilebilir (saf mantık
 * + küçük DOM arayüzü: nodeType, childNodes, getAttribute, setAttribute).
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloI18n = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";

  var LS_KEY = "suflo.uiLang";
  var ATTRS = ["title", "placeholder", "aria-label", "alt", "data-tip"];
  // Hiç girilmeyen öğeler (kod, stil, kullanıcı metni alanları)
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1, svg: 1 };
  // Kullanıcı içeriği barındıran kaplar: transkript/altyazı düzenleyicisi, önizleme,
  // metinden kesim, bölüm/viral/B-roll listeleri. Burada yalnız BUTTON/LABEL içindeki
  // metinler ve düğme/alan ipuçları çevrilir; serbest metin (kullanıcının sözleri) kalır.
  var USER_CONTENT_IDS = [
    "cap-segments", "cap-onizleme-metin", "cap-ch-list", "cap-vr-liste", "cap-br-liste",
    "cut-ranges", "cap-yt-aciklama", "cap-yt-basliklar", "cap-yt-etiket", "kanca-metin", "kanca-oneriler", "tc-words"
  ];
  var UI_IN_USER_ZONE = { BUTTON: 1, LABEL: 1, OPTION: 1, SELECT: 1 };

  var dict = null, patterns = [], cache = {}, cacheSize = 0, lang = null;
  var env = { storage: null, navigator: null };

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
      var t = lookup(normKey(m[2]));
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

  function detect() {
    var n = nav();
    var l = String(n && (n.language || (n.languages && n.languages[0])) || "tr").toLowerCase();
    return /^(tr|az)\b/.test(l) ? "tr" : "en";
  }
  function getLang() {
    if (lang) return lang;
    var s = storage(), v = null;
    try { v = s ? s.getItem(LS_KEY) : null; } catch (e) { v = null; }
    return v === "en" || v === "tr" ? v : detect();
  }
  function setLang(l) {
    l = l === "en" ? "en" : "tr";
    lang = null;
    var s = storage();
    try { if (s) s.setItem(LS_KEY, l); } catch (e) { lang = l; }
    return l;
  }

  /* ---------------- DOM ---------------- */
  function isUserZone(el) {
    var id = el.id || (el.getAttribute && el.getAttribute("id"));
    if (id && USER_CONTENT_IDS.indexOf(id) !== -1) return true;
    if (el.getAttribute && el.getAttribute("data-i18n-skip") !== null && el.getAttribute("data-i18n-skip") !== undefined) return true;
    return false;
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
    if (t !== v) node.nodeValue = t;
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
      if (t !== v) el.setAttribute(a, t);
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
      if (isEditable(node)) return;
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
      if (SKIP_TAGS[tag] || isEditable(p)) return null;
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
        if (!c2) continue;
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
    apply(doc.body);
    if (doc.title) doc.title = translate(doc.title);
    if (observer || typeof root.MutationObserver !== "function") return !!observer;
    observer = new root.MutationObserver(handle);
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS.slice() });
    return true;
  }
  function stop() { if (observer) { observer.disconnect(); observer = null; } }

  return {
    LS_KEY: LS_KEY, ATTRS: ATTRS, USER_CONTENT_IDS: USER_CONTENT_IDS,
    translate: translate, tr: tr, apply: apply, start: start, stop: stop,
    getLang: getLang, setLang: setLang, detect: detect, setDictionary: setDictionary,
    _handle: handle,
    _setEnv: function (e) { env = { storage: e && e.storage || null, navigator: e && e.navigator || null }; lang = null; }
  };
});
