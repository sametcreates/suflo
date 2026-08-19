/*
 * pro.js — Suflo Pro lisans kapisi (license gating)
 * -------------------------------------------------------------
 * Bu modul, sadece SAHIBIN kendi yazdigi Pro ozelliklerini kilitler
 * (animasyonlu overlay, karaoke, otomatik kesim, ritim, toplu transkripsiyon,
 *  ceviri, stilli ASS, sozluk). Ucretsiz MIT cekirdegine dokunmaz.
 *
 * Saglayici: Lemon Squeezy License API (Merchant-of-Record, TR odemeye uygun).
 * CEP + Node (--enable-nodejs) ortaminda calisir: HTTPS cagrisini panelin
 * kendi Node runtime'i yapar, CORS yok.
 *
 * ONEMLI: Bu istemci acik kaynaktir; hicbir client-side kontrol %100 kirilamaz
 * degildir. Bu "acik cekirdek / onur sistemi" modeli icin kabul edilebilir:
 * odeme yapan kitle gelistirici degil, editorlerdir. Anahtar dogrulamasi yine de
 * imzali/online yapilir ki duz bir boolean'dan daha saglam olsun.
 *
 * window.Pro API:
 *   Pro.init()                -> onbellekten durumu yukler, arka planda dogrular
 *   Pro.isPro()               -> senkron true/false
 *   Pro.activate(key, cb)     -> anahtari etkinlestirir  cb({ok, info|error})
 *   Pro.validate(cb)          -> arka planda yeniden dogrular
 *   Pro.deactivate(cb)        -> bu makinedeki koltugu birakir
 *   Pro.gate(feature, opts)   -> Pro degilse upsell gosterir, false doner
 *   Pro.status()              -> UI icin durum nesnesi
 *   Pro.on(fn)                -> durum degisince UI'yi tazele
 *   Pro.onUpgrade(fn)         -> "Yukselt" tiklaninca ne olacagini app.js belirler
 *   Pro.configure({...})      -> store/product/variant ID'lerini disardan ver
 */
;(function () {
  'use strict';

  // ---- Node modulleri (CEP --enable-nodejs ile require global'dir) ----
  var https, fs, path, os, crypto, querystring, urlmod;
  try {
    https = require('https');
    fs = require('fs');
    path = require('path');
    os = require('os');
    crypto = require('crypto');
    querystring = require('querystring');
    urlmod = require('url');
  } catch (e) {
    // Node yoksa (orn. tarayicida onizleme) her sey "pro degil" gibi davranir.
  }

  // ================================================================
  // 1) URUN AYARLARI — Lemon Squeezy panelinden doldur
  //    (0 birakirsan sahiplik kontrolu atlanir; URETIMDE MUTLAKA DOLDUR)
  // ================================================================
  var LS = {
    STORE_ID: 454844,     // Suflo magazasi (suflo.lemonsqueezy.com)
    PRODUCT_ID: 1302656,  // Suflo Pro urunu (CANLI — copy-across-modes ile test 1298713'ten klonlandi, 20 Agu)
    VARIANT_ID: 0,        // 0 = varyant kontrolu atlanir (store+product yeterli)
    API: 'https://api.lemonsqueezy.com'
  };

  // Onbellek imzasi icin gomulu anahtar. GUVENLIK DEGIL, sadece hafif engel.
  var CACHE_SECRET = 'suflo-eaa2195912684818979e11530131f6a2d4c74d81a6eb10f8';

  // Cevrimdisi tolerans: son basarili dogrulamadan bu kadar sonra ag olmadan
  // acik kalmaya devam eder (ucakta / air-gapped kurgu odalari icin).
  var GRACE_MS = 14 * 24 * 60 * 60 * 1000; // 14 gun

  var HTTP_TIMEOUT = 15000;

  // ================================================================
  // Ic durum
  // ================================================================
  var _state = { pro: false, info: null, needsRecheck: false, ready: false };
  var _subs = [];        // durum degisiklik dinleyicileri (UI tazeleme)
  var _onUpgrade = null;  // "Yukselt" tiklama davranisi (app.js verir)

  var FEATURE_LABELS = {
    overlay:   'Animasyonlu altyazi katmani (CapCut gorunumu)',
    karaoke:   'Karaoke / kelime-kelime animasyon',
    cut:       'Otomatik kesim (sessizlik temizleme)',
    beat:      'Ritim / beat senkronu',
    batch:     'Toplu (coklu klip) transkripsiyon',
    translate: 'Altyazi cevirisi',
    assexport: 'Stilli ASS disa aktarma',
    glossary:  'Terim sozlugu + gelismis bul/degistir',
    mogrt:     'Yazi animasyonlari (MOGRT kutuphanesi)',
    sfx:       'SFX kutuphanesi + Akilli SFX onerileri',
    emojiAssets: 'Emoji Assets (PNG / WEBP / GIF kutuphanesi)',
    pro:       'Suflo Pro'
  };

  // ================================================================
  // Yardimcilar: dosya sistemi
  // ================================================================
  function appDataDir() {
    if (!fs || !path || !os) return null;
    var base;
    if (process.env.APPDATA) base = process.env.APPDATA;                     // Windows
    else if (process.platform === 'darwin')                                  // macOS
      base = path.join(os.homedir(), 'Library', 'Application Support');
    else base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'); // Linux
    var dir = path.join(base, 'Suflo');
    ensureDir(dir);
    return dir;
  }

  // recursive:true eski CEP Node'unda olmayabilir -> elle
  function ensureDir(dir) {
    if (!fs || !dir) return;
    if (fs.existsSync(dir)) return;
    var parent = path.dirname(dir);
    if (parent && parent !== dir) ensureDir(parent);
    try { fs.mkdirSync(dir); } catch (e) {}
  }

  function cacheFile()   { var d = appDataDir(); return d ? path.join(d, 'pro-license.json') : null; }
  function machineFile() { var d = appDataDir(); return d ? path.join(d, 'pro-machine.json') : null; }

  // ================================================================
  // Yardimcilar: makine kimligi (koltugu tekrar tekrar yakmamak icin sabit)
  // ================================================================
  function machineId() {
    var f = machineFile();
    if (!f) return fallbackUuid();
    try {
      if (fs.existsSync(f)) {
        var j = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (j && j.id) return j.id;
      }
    } catch (e) {}
    var id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : fallbackUuid();
    try { fs.writeFileSync(f, JSON.stringify({ id: id }), 'utf8'); } catch (e) {}
    return id;
  }

  function instanceName() {
    var host = (os && os.hostname) ? os.hostname() : 'cep';
    return host + ' / ' + machineId();
  }

  function fallbackUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ================================================================
  // Yardimcilar: imzali onbellek (kurcalamaya karsi hafif engel)
  // ================================================================
  function sign(obj) {
    if (!crypto) return '';
    var copy = {};
    for (var k in obj) if (obj.hasOwnProperty(k) && k !== '_sig') copy[k] = obj[k];
    return crypto.createHmac('sha256', CACHE_SECRET).update(JSON.stringify(copy)).digest('hex');
  }

  function writeCache(obj) {
    var f = cacheFile();
    if (!f) return;
    obj._sig = sign(obj);
    try { fs.writeFileSync(f, JSON.stringify(obj), 'utf8'); } catch (e) {}
  }

  function readCache() {
    var f = cacheFile();
    if (!f) return null;
    try {
      var j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!j || j._sig !== sign(j)) return null; // imza tutmuyorsa yok say
      return j;
    } catch (e) { return null; }
  }

  function clearCache() {
    var f = cacheFile();
    if (!f) return;
    try { fs.unlinkSync(f); } catch (e) {}
  }

  // ================================================================
  // Yardimcilar: HTTPS POST (Lemon Squeezy License API)
  // Endpoint'ler kimlik dogrulamasiz tasarlandi -> panelde HICBIR gizli anahtar yok.
  // ================================================================
  function apiPost(endpoint, params, cb) {
    if (!https || !urlmod) { cb(new Error('node-yok'), null); return; }
    var body = querystring.stringify(params);
    var u = urlmod.parse(LS.API + endpoint);
    var opts = {
      method: 'POST',
      hostname: u.hostname,
      path: u.path,
      port: 443,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    var done = false;
    function finish(err, data, code) { if (!done) { done = true; cb(err, data, code); } }

    var req = https.request(opts, function (res) {
      var buf = '';
      res.setEncoding('utf8');
      res.on('data', function (d) { buf += d; });
      res.on('end', function () {
        var json = null;
        try { json = JSON.parse(buf); } catch (e) {}
        finish(null, json, res.statusCode);
      });
    });
    req.setTimeout(HTTP_TIMEOUT, function () { req.destroy(new Error('zaman-asimi')); });
    req.on('error', function (err) { finish(err, null); });
    req.write(body);
    req.end();
  }

  // ================================================================
  // Sahiplik kontrolu — baska bir LS urununun gecerli anahtari kabul edilmesin
  // ================================================================
  function checkOwnership(meta) {
    if (!meta) return false;
    if (LS.STORE_ID   && Number(meta.store_id)   !== Number(LS.STORE_ID))   return false;
    if (LS.PRODUCT_ID && Number(meta.product_id) !== Number(LS.PRODUCT_ID)) return false;
    if (LS.VARIANT_ID && Number(meta.variant_id) !== Number(LS.VARIANT_ID)) return false;
    return true;
  }

  // ================================================================
  // Onbellek gecerlilik testleri
  // ================================================================
  function notExpired(c) {
    if (!c) return false;
    if (!c.expiresAt) return true;                 // omurluk lisans (expires_at = null)
    return Date.now() < new Date(c.expiresAt).getTime();
  }
  function graceOk(c) {
    if (!c || !c.lastValidated) return false;
    return (Date.now() - c.lastValidated) < GRACE_MS;
  }

  // ================================================================
  // 2) ETKINLESTIRME — ilk anahtar girisi
  // ================================================================
  function activate(key, cb) {
    cb = cb || function () {};
    key = (key || '').trim();
    if (!key) { cb({ ok: false, error: 'Lisans anahtari bos.' }); return; }

    apiPost('/v1/licenses/activate',
      { license_key: key, instance_name: instanceName() },
      function (err, data) {
        if (err || !data) {
          cb({ ok: false, offline: true, error: 'Sunucuya ulasilamadi. Internet baglantini kontrol et.' });
          return;
        }
        if (data.activated !== true || !data.instance) {
          cb({ ok: false, error: data.error || 'Anahtar etkinlestirilemedi. (Kotasi dolmus veya gecersiz olabilir.)' });
          return;
        }
        var lk = data.license_key || {}, meta = data.meta || {};

        // --- ZORUNLU GUVENLIK KONTROLLERI ---
        if (!checkOwnership(meta)) { cb({ ok: false, error: 'Bu anahtar baska bir urune ait.' }); return; }
        if (lk.status !== 'active') { cb({ ok: false, error: 'Anahtar aktif degil (' + lk.status + ').' }); return; }

        var cache = {
          key: key,
          instanceId: data.instance.id,       // KALICI olarak sakla — validate/deactivate icin gerek
          status: lk.status,
          storeId: meta.store_id,
          productId: meta.product_id,
          variantId: meta.variant_id,
          email: meta.customer_email || '',
          expiresAt: lk.expires_at || null,
          activatedAt: Date.now(),
          lastValidated: Date.now()
        };
        writeCache(cache);
        _state.pro = true; _state.info = cache; _state.needsRecheck = false;
        emit();
        cb({ ok: true, info: cache });
      });
  }

  // ================================================================
  // 3) YENIDEN DOGRULAMA — arka planda; iade/iptal olursa kilitler
  // ================================================================
  function validate(cb) {
    cb = cb || function () {};
    var c = _state.info || readCache();
    if (!c || !c.key || !c.instanceId) { cb({ ok: false, error: 'Kayitli lisans yok.' }); return; }

    apiPost('/v1/licenses/validate',
      { license_key: c.key, instance_id: c.instanceId },
      function (err, data) {
        if (err || !data) { cb({ ok: false, offline: true }); return; } // cevrimdisi -> onbellege dokunma
        var lk = data.license_key || {};
        if (data.valid === true && lk.status === 'active') {
          c.status = 'active';
          c.expiresAt = lk.expires_at || null;
          c.lastValidated = Date.now();
          writeCache(c);
          _state.pro = true; _state.info = c; _state.needsRecheck = false;
          emit();
          cb({ ok: true });
        } else {
          // iade / chargeback / disabled / expired -> hemen kilitle
          clearCache();
          _state.pro = false; _state.info = null; _state.needsRecheck = false;
          emit();
          cb({ ok: false, revoked: true });
        }
      });
  }

  // ================================================================
  // 4) DEVRE DISI BIRAKMA — koltugu birak (makine tasima)
  // ================================================================
  function deactivate(cb) {
    cb = cb || function () {};
    var c = _state.info || readCache();
    if (!c || !c.key || !c.instanceId) {
      clearCache(); _state.pro = false; _state.info = null; emit();
      cb({ ok: true }); return;
    }
    apiPost('/v1/licenses/deactivate',
      { license_key: c.key, instance_id: c.instanceId },
      function (err, data) {
        // Ag hatasinda bile yerelde kilitle; koltuk LS panelinden de birakilabilir.
        clearCache();
        _state.pro = false; _state.info = null; _state.needsRecheck = false;
        emit();
        cb({ ok: !(err) && data && data.deactivated === true });
      });
  }

  // ================================================================
  // 5) BASLATMA — onbellekten senkron durum + arka planda dogrulama
  // ================================================================
  function init() {
    var c = readCache();
    if (c && notExpired(c) && graceOk(c)) {
      _state.pro = true; _state.info = c; _state.needsRecheck = false;      // AG YOK — aninda ac
    } else if (c && notExpired(c)) {
      _state.pro = false; _state.info = c; _state.needsRecheck = true;      // grace gecti -> yeniden dogrulama bekliyor
    } else {
      _state.pro = false; _state.info = null; _state.needsRecheck = false;  // lisans yok / suresi bitti
    }
    _state.ready = true;
    emit();
    // Cevrimici ise arka planda tazele (cevrimdisi ise sessizce gec)
    if (c && c.key) setTimeout(function () { validate(function () {}); }, 1500);
    return _state.pro;
  }

  // ================================================================
  // 6) KAPI (gate) + UPSELL
  // ================================================================
  // Lansman guvenligi: LS ID'leri doldurulmadan kilit devreye GIRMEZ.
  // Boylece bu kod yanlislikla dagitilsa bile mevcut kullanicilar kilitlenmez.
  function configured() { return Number(LS.STORE_ID) > 0 && Number(LS.PRODUCT_ID) > 0; }

  function isPro() {
    if (!configured()) return true;   // henuz yapilandirilmadi -> her sey acik
    return _state.pro === true;
  }

  function gate(feature, opts) {
    opts = opts || {};
    if (isPro()) return true;
    if (opts.silent !== true) showUpsell(feature);
    return false;
  }

  function onUpgrade(fn) { _onUpgrade = fn; }

  function showUpsell(feature) {
    var label = FEATURE_LABELS[feature] || 'Bu ozellik';
    ensureUpsellCss();
    var old = document.getElementById('pro-upsell');
    if (old) old.parentNode.removeChild(old);

    var wrap = document.createElement('div');
    wrap.id = 'pro-upsell';
    wrap.className = 'pro-upsell-backdrop';
    wrap.innerHTML =
      '<div class="pro-upsell-card" role="dialog" aria-modal="true">' +
        '<button id="pro-upsell-x" class="pro-upsell-x" aria-label="Kapat">\u2715</button>' +
        '<div class="pro-upsell-badge">SUFLO PRO</div>' +
        '<h3>' + esc(label) + '</h3>' +
        '<p class="pro-upsell-alt">Bu ozellik Pro ile acilir \u2014 tek seferlik, abonelik yok.</p>' +
        '<ul class="pro-upsell-liste">' +
          '<li>Animasyonlu altyazi + karaoke + daktilo</li>' +
          '<li>Otomatik kesim + ritim senkronu</li>' +
          '<li>Toplu islem, ceviri, sozluk, ASS</li>' +
          '<li>40 Suflo Originals + MOGRT/SFX/Emoji kutuphaneleri</li>' +
          '<li>Altyazidan Akilli SFX onerileri</li>' +
        '</ul>' +
        '<div class="pro-upsell-fiyat"><b>749 TL</b><span>tek seferlik \u00b7 abonelik yok \u00b7 omur boyu</span></div>' +
        '<div class="pro-upsell-actions">' +
          '<button id="pro-upsell-go" class="pro-btn-primary">Y\u00fckselt \u2192</button>' +
        '</div>' +
        '<button id="pro-upsell-key" class="pro-link-btn">Anahtarim var</button>' +
      '</div>';
    document.body.appendChild(wrap);

    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); document.removeEventListener('keydown', escKapat); }
    function escKapat(e) { if (e.key === 'Escape') close(); }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.addEventListener('keydown', escKapat);
    document.getElementById('pro-upsell-x').onclick = close;
    document.getElementById('pro-upsell-go').onclick = function () {
      close();
      if (typeof _onUpgrade === 'function') _onUpgrade(feature);
    };
    document.getElementById('pro-upsell-key').onclick = function () {
      close();
      if (typeof _onUpgrade === 'function') _onUpgrade(feature);
    };
  }

  // Bir DOM elemanina kilit rozeti tak/kaldir (app.js tab butonlari icin)
  function markLocked(el, locked) {
    if (!el) return;
    if (!configured()) locked = false;  // lansman oncesi: rozet yok
    if (locked) { el.classList.add('pro-locked'); el.setAttribute('data-pro', '1'); }
    else { el.classList.remove('pro-locked'); el.removeAttribute('data-pro'); }
  }

  function status() {
    return {
      ready: _state.ready,
      pro: isPro(),
      needsRecheck: _state.needsRecheck,
      email: _state.info ? _state.info.email : '',
      expiresAt: _state.info ? _state.info.expiresAt : null,
      lastValidated: _state.info ? _state.info.lastValidated : null
    };
  }

  // ================================================================
  // Olay yayini (UI tazeleme)
  // ================================================================
  function on(fn) { if (typeof fn === 'function') _subs.push(fn); }
  function emit() {
    for (var i = 0; i < _subs.length; i++) {
      try { _subs[i](status()); } catch (e) {}
    }
  }

  function configure(cfg) {
    cfg = cfg || {};
    if (cfg.storeId   != null) LS.STORE_ID   = cfg.storeId;
    if (cfg.productId != null) LS.PRODUCT_ID = cfg.productId;
    if (cfg.variantId != null) LS.VARIANT_ID = cfg.variantId;
  }

  // ================================================================
  // Kucuk yardimcilar
  // ================================================================
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var _cssDone = false;
  function ensureUpsellCss() {
    if (_cssDone) return; _cssDone = true;
    var css =
      '.pro-upsell-backdrop{position:fixed;inset:0;background:rgba(8,9,14,.6);backdrop-filter:blur(4px);' +
      'display:flex;align-items:center;justify-content:center;z-index:99999}' +
      '@keyframes pro-in{from{opacity:0;transform:scale(.96) translateY(6px)}}' +
      '.pro-upsell-card{position:relative;background:#161822;color:#edecf5;width:min(360px,92vw);' +
      'border:1px solid #363b52;border-radius:14px;padding:18px 18px 14px;text-align:center;' +
      'font:13px/1.5 system-ui,Segoe UI,sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.55);' +
      'animation:pro-in .18s cubic-bezier(.32,.72,0,1)}' +
      '.pro-upsell-x{position:absolute;top:10px;right:12px;background:none;border:0;color:#626578;' +
      'font-size:13px;cursor:pointer;padding:4px}' +
      '.pro-upsell-x:hover{color:#edecf5}' +
      '.pro-upsell-alt{margin:0 0 12px;opacity:.75;font-size:12px}' +
      '.pro-upsell-liste{list-style:none;margin:0 0 14px;padding:0;text-align:left;display:inline-block}' +
      '.pro-upsell-liste li{font-size:11.5px;color:#9a9cb4;padding-left:16px;position:relative;margin-bottom:3px}' +
      '.pro-upsell-liste li:before{content:"\\2713";position:absolute;left:0;color:#6fdca0;font-weight:700}' +
      '.pro-upsell-fiyat{margin-bottom:14px}' +
      '.pro-upsell-fiyat b{font-size:22px;display:block}' +
      '.pro-upsell-fiyat span{font-size:10.5px;color:#9a9cb4}' +
      '.pro-link-btn{background:none;border:0;color:#9a9cb4;font-size:11.5px;cursor:pointer;' +
      'margin-top:9px;text-decoration:underline;text-underline-offset:3px}' +
      '.pro-link-btn:hover{color:#edecf5}' +
      '.pro-upsell-badge{display:inline-block;background:linear-gradient(90deg,#7c5cff,#4aa3ff);' +
      'color:#fff;font-weight:700;font-size:11px;letter-spacing:.5px;padding:3px 10px;border-radius:999px;margin-bottom:10px}' +
      '.pro-upsell-card h3{margin:6px 0 4px;font-size:15px}' +
      '.pro-upsell-card p{margin:0 0 16px;opacity:.8}' +
      '.pro-upsell-actions{display:flex;gap:8px;justify-content:center}' +
      '.pro-btn-primary{background:linear-gradient(90deg,#7c5cff,#4aa3ff);border:0;color:#fff;' +
      'padding:9px 14px;border-radius:8px;cursor:pointer;font-weight:600}' +
      '.pro-btn-ghost{background:transparent;border:1px solid #444a58;color:#cdd;padding:9px 14px;border-radius:8px;cursor:pointer}' +
      '.pro-locked{position:relative;opacity:.75}' +
      '.pro-locked::after{content:"PRO";position:absolute;top:2px;right:4px;font-size:9px;font-weight:800;' +
      'letter-spacing:.5px;color:#fff;background:linear-gradient(90deg,#7c5cff,#4aa3ff);padding:1px 5px;border-radius:6px}';
    var st = document.createElement('style');
    st.type = 'text/css';
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  }

  // ================================================================
  // Disari ac
  // ================================================================
  window.Pro = {
    init: init,
    isPro: isPro,
    activate: activate,
    validate: validate,
    deactivate: deactivate,
    gate: gate,
    markLocked: markLocked,
    status: status,
    on: on,
    onUpgrade: onUpgrade,
    configure: configure,
    VERSION: '1.0.0'
  };
})();
