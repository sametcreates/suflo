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
    presets:   'Motion presetleri (Slide, Zoom, Pop ve Fade)',
    sfx:       'SFX kutuphanesi + Akilli SFX onerileri',
    emojiAssets: 'Emoji Assets (PNG / WEBP / GIF kutuphanesi)',
    propack:   'Suflo Pro icerik paketi (Motion presetleri + yazi animasyonlari + SFX)',
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
    var tmp = f + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(obj), { encoding: 'utf8', mode: 384 }); // 0600
      if (fs.existsSync(f)) fs.unlinkSync(f);
      fs.renameSync(tmp, f);
      try { fs.chmodSync(f, 384); } catch (eMode) {}
    } catch (e) { try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (eTmp) {} }
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
        if (!checkOwnership(meta) || lk.status !== 'active') {
          // Lemon once aktivasyon olusturur. Yanlis urun anahtari bir koltuk
          // tuketmesin diye reddederken az once acilan instance'i geri birak.
          apiPost('/v1/licenses/deactivate', { license_key: key, instance_id: data.instance.id }, function () {
            cb({ ok: false, error: !checkOwnership(meta) ? 'Bu anahtar baska bir urune ait.' : 'Anahtar aktif degil (' + lk.status + ').' });
          });
          return;
        }

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
        if (data.valid === true && lk.status === 'active' && checkOwnership(data.meta || {})) {
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
    var isMogrt = feature === 'mogrt' || feature === 'propack';
    var isSfx = feature === 'sfx';
    var isPreset = feature === 'presets';
    var title = isMogrt ? 'Videona edit\u00f6r dokunu\u015fu veren 40 yaz\u0131 efekti' :
      (isSfx ? 'Her vurgu i\u00e7in do\u011fru ses, Premiere\'in i\u00e7inde' :
      (isPreset ? 'Slide, Zoom ve Pop hareketleri tek t\u0131kla' : label));
    var desc = isMogrt ? 'Efektleri sat\u0131n almadan \u00f6nce ger\u00e7ek \u00f6nizlemeleriyle incele. Pro\'da tek t\u0131kla playhead\'e yerle\u015ftir.' :
      (isSfx ? '265 se\u00e7ilmi\u015f sesi ara, \u00f6n dinle ve Ak\u0131ll\u0131 SFX ile altyaz\u0131 vurgular\u0131na yerle\u015ftir.' :
      (isPreset ? 'Klip se\u00e7, hareketi izle ve uygula. Harici preset paketi veya tekrar kurulum gerekmez.' :
      'Bu profesyonel i\u015f ak\u0131\u015f\u0131 Suflo Pro ile a\u00e7\u0131l\u0131r. Bir kere al, saya\u00e7 ve abonelik olmadan kullan.'));
    var visual;
    if (isMogrt) {
      visual = '<div class="pro-upsell-mogrt" aria-label="Yaz\u0131 efekti \u00f6rnekleri">' +
        '<img src="assets/pro-mogrt-showcase/previews/01-smooth-up.webp" alt="Smooth Up efekti">' +
        '<img src="assets/pro-mogrt-showcase/previews/02-rainbow-text.webp" alt="Rainbow Text efekti">' +
        '<img src="assets/pro-mogrt-showcase/previews/06-gold-text.webp" alt="Gold Text efekti">' +
      '</div>';
    } else if (isSfx) {
      visual = '<div class="pro-upsell-sfx" aria-label="SFX kategorileri">' +
        '<div class="pro-upsell-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
        '<div><span>WHOOSH</span><span>IMPACT</span><span>GLITCH</span><span>POP</span></div>' +
      '</div>';
    } else if (isPreset) {
      visual = '<div class="pro-upsell-tool"><i>\u2197</i><span><b>12 yerle\u015fik hareket</b><small>Slide \u00b7 Zoom \u00b7 Pop \u00b7 Fade \u00b7 Punch</small></span></div>';
    } else {
      visual = '<div class="pro-upsell-tool"><i>\u2726</i><span><b>Daha h\u0131zl\u0131 bitir</b><small>Tekrarlanan kurgu i\u015fini Suflo\'ya b\u0131rak</small></span></div>';
    }
    ensureUpsellCss();
    var old = document.getElementById('pro-upsell');
    if (old) old.parentNode.removeChild(old);
    var previousFocus = document.activeElement;

    var wrap = document.createElement('div');
    wrap.id = 'pro-upsell';
    wrap.className = 'pro-upsell-backdrop';
    wrap.innerHTML =
      '<div class="pro-upsell-card" role="dialog" aria-modal="true" aria-labelledby="pro-upsell-title" aria-describedby="pro-upsell-desc">' +
        '<button id="pro-upsell-x" class="pro-upsell-x" aria-label="Kapat">\u2715</button>' +
        '<div class="pro-upsell-kicker"><span class="pro-upsell-badge">SUFLO PRO</span><span>\u00d6M\u00dcR BOYU L\u0130SANS</span></div>' +
        '<h3 id="pro-upsell-title">' + esc(title) + '</h3>' +
        '<p class="pro-upsell-alt" id="pro-upsell-desc">' + esc(desc) + '</p>' +
        visual +
        '<div class="pro-upsell-proof"><i><b>40</b> yaz\u0131 efekti</i><i><b>12</b> Motion preset</i><i><b>265</b> SFX</i></div>' +
        '<ul class="pro-upsell-liste">' +
          '<li>Otomatik sessizlik kesimi + ritim marker</li>' +
          '<li>40 MOGRT + 12 Motion preset + 265 SFX</li>' +
          '<li>Lisans\u0131 bir kez gir; yeni i\u00e7erikler otomatik gelsin</li>' +
        '</ul>' +
        '<div class="pro-upsell-fiyat"><span>TEK SEFERL\u0130K</span><b>749 TL</b><small>abonelik yok \u00b7 dakika limiti yok</small></div>' +
        '<div class="pro-upsell-actions">' +
          '<button id="pro-upsell-go" class="pro-btn-primary">Suflo Pro\'yu Al \u2192</button>' +
          '<button id="pro-upsell-demo" class="pro-btn-ghost">Canl\u0131 demolar\u0131 g\u00f6r</button>' +
        '</div>' +
        '<button id="pro-upsell-key" class="pro-link-btn">Lisans anahtar\u0131m var</button>' +
      '</div>';
    document.body.appendChild(wrap);

    function close() {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      document.removeEventListener('keydown', escKapat);
      try { if (previousFocus && previousFocus.focus) previousFocus.focus(); } catch (e) {}
    }
    function escKapat(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      var ids = ['pro-upsell-x', 'pro-upsell-go', 'pro-upsell-demo', 'pro-upsell-key'];
      var focusables = ids.map(function (id) { return document.getElementById(id); }).filter(function (n) { return n && !n.disabled; });
      if (!focusables.length) return;
      var at = focusables.indexOf(document.activeElement);
      if (e.shiftKey && (at <= 0)) { e.preventDefault(); focusables[focusables.length - 1].focus(); }
      else if (!e.shiftKey && at === focusables.length - 1) { e.preventDefault(); focusables[0].focus(); }
    }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.addEventListener('keydown', escKapat);
    document.getElementById('pro-upsell-x').onclick = close;
    document.getElementById('pro-upsell-go').onclick = function () {
      close();
      if (typeof _onUpgrade === 'function') _onUpgrade(feature, 'buy');
    };
    document.getElementById('pro-upsell-demo').onclick = function () {
      close();
      if (typeof _onUpgrade === 'function') _onUpgrade(feature, 'demo');
    };
    document.getElementById('pro-upsell-key').onclick = function () {
      close();
      if (typeof _onUpgrade === 'function') _onUpgrade(feature, 'activate');
    };
    try { document.getElementById('pro-upsell-go').focus(); } catch (e) {}
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

  // Pro icerik sunucusu lisansi Lemon Squeezy'de yeniden dogrular. Anahtar
  // yalniz HTTPS POST govdesinde kullanilir; URL'ye, loga veya ayarlar dosyasina
  // yazilmaz. Diger moduller ham onbellegi okuyamasin diye kopya dondururuz.
  function contentCredentials() {
    if (!isPro()) return null;
    var c = _state.info || readCache();
    if (!c || !c.key || !c.instanceId) return null;
    return { licenseKey: String(c.key), instanceId: String(c.instanceId) };
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
      '.pro-upsell-backdrop{position:fixed;inset:0;background:rgba(4,7,13,.78);backdrop-filter:blur(8px);' +
      'display:flex;align-items:center;justify-content:center;padding:14px;z-index:99999}' +
      '@keyframes pro-in{from{opacity:0;transform:scale(.965) translateY(8px)}}' +
      '.pro-upsell-card{position:relative;overflow:hidden;background:radial-gradient(circle at 84% -12%,rgba(58,167,255,.19),transparent 38%),#111720;' +
      'color:#f3f6fb;width:min(404px,96vw);max-height:94vh;overflow-y:auto;border:1px solid #34445a;border-radius:16px;' +
      'padding:18px 18px 14px;text-align:left;font:13px/1.45 system-ui,Segoe UI,sans-serif;' +
      'box-shadow:0 26px 90px rgba(0,0,0,.7),inset 0 1px rgba(255,255,255,.045);animation:pro-in .2s cubic-bezier(.32,.72,0,1)}' +
      '.pro-upsell-card:before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,#727cff,#3aa7ff)}' +
      '.pro-upsell-x{position:absolute;top:10px;right:11px;background:rgba(255,255,255,.04);border:1px solid #2d394b;border-radius:7px;color:#8290a3;' +
      'font-size:12px;cursor:pointer;padding:5px 7px;line-height:1}' +
      '.pro-upsell-x:hover{color:#fff;border-color:#53647c}' +
      '.pro-upsell-kicker{display:flex;align-items:center;gap:7px;margin:0 34px 10px 0;color:#748197;font-size:8px;font-weight:800;letter-spacing:.09em}' +
      '.pro-upsell-badge{display:inline-block;background:linear-gradient(90deg,#727cff,#3aa7ff);color:#fff;font-weight:900;font-size:8px;letter-spacing:.08em;padding:3px 8px;border-radius:999px}' +
      '.pro-upsell-card h3{max-width:340px;margin:0 0 5px;font-size:18px;line-height:1.18;letter-spacing:-.02em}' +
      '.pro-upsell-alt{margin:0 0 12px;color:#9ca8b8;font-size:10.5px;line-height:1.45}' +
      '.pro-upsell-mogrt{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:0 0 8px}' +
      '.pro-upsell-mogrt img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;border:1px solid #2b394b;border-radius:7px;background:#080b11}' +
      '.pro-upsell-sfx{margin:0 0 8px;padding:11px;border:1px solid #29374a;border-radius:9px;background:rgba(5,9,15,.5)}' +
      '.pro-upsell-wave{height:36px;display:flex;align-items:center;justify-content:center;gap:4px}' +
      '.pro-upsell-wave i{width:4px;height:10px;border-radius:9px;background:linear-gradient(#727cff,#3aa7ff)}' +
      '.pro-upsell-wave i:nth-child(2n){height:25px}.pro-upsell-wave i:nth-child(3n){height:16px}.pro-upsell-wave i:nth-child(5n){height:32px}' +
      '.pro-upsell-sfx>div:last-child{display:flex;justify-content:center;gap:4px}' +
      '.pro-upsell-sfx span{padding:2px 5px;border:1px solid #34445a;border-radius:999px;color:#8593a7;font-size:7px;font-weight:800;letter-spacing:.06em}' +
      '.pro-upsell-tool{display:flex;align-items:center;gap:10px;margin:0 0 8px;padding:11px;border:1px solid #2b394b;border-radius:9px;background:rgba(8,13,21,.55)}' +
      '.pro-upsell-tool>i{display:grid;place-items:center;width:31px;height:31px;border-radius:8px;background:linear-gradient(135deg,#727cff,#3aa7ff);font-style:normal}' +
      '.pro-upsell-tool b,.pro-upsell-tool small{display:block}.pro-upsell-tool small{margin-top:2px;color:#8390a3;font-size:9px}' +
      '.pro-upsell-proof{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:10px}' +
      '.pro-upsell-proof i{padding:6px 4px;border:1px solid #263446;border-radius:7px;color:#7f8da0;font-size:7.5px;font-style:normal;text-align:center;text-transform:uppercase}' +
      '.pro-upsell-proof b{display:block;color:#eaf0f8;font-size:13px;line-height:1.15}' +
      '.pro-upsell-liste{list-style:none;margin:0 0 11px;padding:0;text-align:left}' +
      '.pro-upsell-liste li{font-size:9.5px;color:#a5afbd;padding-left:16px;position:relative;margin-bottom:4px}' +
      '.pro-upsell-liste li:before{content:"\\2713";position:absolute;left:0;color:#6fdca0;font-weight:800}' +
      '.pro-upsell-fiyat{display:grid;grid-template-columns:auto 1fr;align-items:end;margin:0 0 10px;padding-top:9px;border-top:1px solid #253244}' +
      '.pro-upsell-fiyat>span{grid-column:1/-1;color:#758298;font-size:7.5px;font-weight:900;letter-spacing:.11em}' +
      '.pro-upsell-fiyat b{font-size:24px;line-height:1.05;letter-spacing:-.04em}' +
      '.pro-upsell-fiyat small{padding:0 0 2px 8px;color:#8592a4;font-size:8.5px}' +
      '.pro-upsell-actions{display:grid;grid-template-columns:1.25fr 1fr;gap:6px}' +
      '.pro-btn-primary,.pro-btn-ghost{min-height:35px;padding:8px 10px;border-radius:8px;cursor:pointer;font:700 10px system-ui,Segoe UI,sans-serif}' +
      '.pro-btn-primary{background:linear-gradient(90deg,#727cff,#3aa7ff);border:0;color:#fff;box-shadow:0 10px 24px -12px rgba(58,167,255,.95)}' +
      '.pro-btn-primary:hover{filter:brightness(1.1)}' +
      '.pro-btn-ghost{background:#18212d;border:1px solid #34445a;color:#c8d1dd}' +
      '.pro-btn-ghost:hover{border-color:#53647c;background:#1c2836}' +
      '.pro-link-btn{display:block;margin:9px auto 0;background:none;border:0;color:#8491a4;font-size:9.5px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}' +
      '.pro-link-btn:hover{color:#f1f5fa}' +
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
    contentCredentials: contentCredentials,
    on: on,
    onUpgrade: onUpgrade,
    configure: configure,
    VERSION: '1.0.0'
  };
})();
