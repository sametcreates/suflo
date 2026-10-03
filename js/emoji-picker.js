/*
 * Suflo — Emoji seçici (altyazı editörü)
 * captions.js'ten ayrıldı (3.0). 3.770 emojilik katalog, Türkçe arama, metne
 * ekleme ya da sahneye (timeline'a grafik) bırakma. Altyazı modülüne yalnız
 * host arayüzüyle bağlıdır: satırlar, taslak kaydı, önizleme, uzantı dizini.
 */
window.KEmojiPicker = (function () {
  "use strict";

  var host = {
    segments: function () { return []; },
    kaydet: function () {},
    onizle: function () {},
    uzantiDizini: function () { return ""; }
  };

  function el(id) { return document.getElementById(id); }

  // Yerel dosya -> URL ("#", "?", "'" iceren yollarda CSS url() ve <img> bozulmasin)
  function dosyaUrl(p) {
    return encodeURI("file:///" + String(p || "").replace(/\\/g, "/"))
      .replace(/#/g, "%23").replace(/\?/g, "%3F").replace(/'/g, "%27");
  }

  /* ---------------- Emoji seçici ---------------- */

  /*
   * Görsel emoji seti: Twemoji SVG'leri (CC-BY 4.0, emoji/LISANS.txt).
   * Apple'ın emoji çizimleri Apple'ın telifli eseri olduğu için paketlenemez;
   * görsel set kullanmanın asıl değeri tutarlılık — karakter olarak eklenen
   * emoji her platformda farklı çizilir, görsel her yerde aynıdır.
   *
   * İki mod:
   *   Metne ekle   → emoji KARAKTERİ seçili satıra girer. "Sekansa uygula"
   *                  yolunda Premiere kendi motoruyla renkli çizer.
   *                  Stilli katmanda ÇİZİLEMEZ (libass emoji desteklemiyor,
   *                  kanıtlandı: tofu bile değil, boş) — o yol uyarıyla durur.
   *   Sahneye bırak → SVG panelde PNG'ye çevrilir, playhead'e küçük bir
   *                  grafik klip olarak iner. Viral kurgudaki "kocaman 🔥
   *                  pat diye girer" görünümü budur ve libass'ten bağımsızdır.
   */
  var EMOJI_ARAMA = {
    "😂": "gulme komik lol", "🤣": "gulme yerlere komik", "😅": "ter gulme",
    "😍": "ask kalp goz begen", "🥹": "duygu aglamakli tatli", "😮": "sasirma vay",
    "😱": "sok korku cigLik", "🤯": "beyin patlama sok", "🙄": "goz devirme biktim",
    "😭": "aglama huzun", "🥶": "soguk donma", "😴": "uyku sikici", "🤔": "dusunme acaba",
    "😎": "havali gozluk", "✅": "onay tamam dogru tik", "❌": "hayir yanlis iptal",
    "⚠️": "uyari dikkat", "❗": "unlem onemli", "❓": "soru", "💯": "yuz tam mukemmel",
    "👇": "asagi ok", "👆": "yukari ok", "👉": "sag ok isaret", "🔝": "top zirve ust",
    "👍": "begen tamam", "👎": "begenme koty", "👏": "alkis bravo", "🙏": "tesekkur dua rica",
    "🤝": "anlasma el sikisma", "💪": "guc kas", "🤞": "sans dilek",
    "🔥": "ates alev viral", "💰": "para kese zengin", "🤑": "para goz dolar",
    "💸": "para ucan harcama", "📈": "grafik artis buyume", "🚀": "roket firlama",
    "⭐": "yildiz favori", "🏆": "kupa sampiyon birinci", "🎯": "hedef isabet",
    "⚡": "simsek hizli enerji", "🎬": "klaket film kurgu", "🎥": "kamera video",
    "🎧": "kulaklik muzik ses", "🎵": "nota muzik", "📱": "telefon mobil",
    "💡": "fikir ampul", "⏰": "saat alarm zaman", "📌": "pin sabit not",
    "🎁": "hediye kutu", "❤️": "kalp ask sevgi"
  };

  /*
   * TR arama köprüsü: katalogdaki adlar İngilizce (emoji-data). Türkçe sorgu
   * önce burada İngilizce karşılıklarına genişletilir, sonra adlarda aranır.
   * Anahtarlar aksansız yazılır; sorgu da aksansızlaştırılır (ateş -> ates).
   */
  var EMOJI_TR = {
    "ates": "fire", "alev": "fire", "kalp": "heart", "ask": "heart love", "sevgi": "heart",
    "gulme": "laugh joy rofl", "komik": "laugh joy", "aglama": "cry sob tear", "uzgun": "sad cry",
    "opucuk": "kiss", "para": "money dollar bank", "zengin": "money", "el": "hand",
    "alkis": "clap", "dua": "pray", "tesekkur": "pray thanks", "roket": "rocket",
    "yildiz": "star", "gunes": "sun", "ay": "moon", "kopek": "dog", "kedi": "cat",
    "yemek": "food", "pizza": "pizza", "kahve": "coffee", "cay": "tea", "bayrak": "flag",
    "turkiye": "turkey", "azerbaycan": "azerbaijan", "futbol": "soccer", "basketbol": "basketball",
    "muzik": "music note", "kamera": "camera", "video": "video movie", "film": "movie clapper",
    "telefon": "phone", "bilgisayar": "computer laptop", "ucak": "airplane", "araba": "car",
    "ev": "house home", "agac": "tree", "cicek": "flower blossom", "deniz": "water wave ocean",
    "yagmur": "rain", "kar": "snow", "dondurma": "ice cream", "pasta": "cake",
    "dogumgunu": "birthday", "hediye": "gift", "kitap": "book", "kalem": "pencil pen",
    "makas": "scissors", "kilit": "lock", "anahtar": "key", "saat": "clock watch",
    "zaman": "clock hourglass", "uyari": "warning", "yasak": "prohibited no",
    "tik": "check", "onay": "check", "tamam": "check ok", "carpi": "cross mark",
    "hayir": "cross no", "soru": "question", "unlem": "exclamation", "ok": "arrow",
    "yukari": "up", "asagi": "down", "sag": "right", "sol": "left", "guclu": "muscle flex",
    "kas": "muscle", "bebek": "baby", "kadin": "woman", "erkek": "man", "adam": "man",
    "aile": "family", "gozluk": "glasses sunglasses", "kral": "crown king", "tac": "crown",
    "kafatasi": "skull", "olum": "skull death", "hayalet": "ghost", "seytan": "imp devil",
    "melek": "angel halo innocent", "palyaco": "clown", "maymun": "monkey", "aslan": "lion",
    "ayi": "bear", "tavsan": "rabbit", "yilan": "snake", "balik": "fish", "kus": "bird",
    "kelebek": "butterfly", "ari": "bee honeybee", "orumcek": "spider", "at": "horse",
    "inek": "cow", "domuz": "pig", "panda": "panda", "elma": "apple", "muz": "banana",
    "cilek": "strawberry", "karpuz": "watermelon", "uzum": "grapes", "limon": "lemon",
    "biber": "pepper", "ekmek": "bread", "peynir": "cheese", "yumurta": "egg",
    "tavuk": "chicken", "patates": "fries potato", "makarna": "spaghetti", "bira": "beer",
    "sarap": "wine", "sise": "bottle", "top": "ball", "oyun": "game video game",
    "kupa": "trophy", "sampiyon": "trophy medal", "madalya": "medal", "hedef": "dart target",
    "beyin": "brain", "goz": "eye", "agiz": "mouth", "dil": "tongue", "burun": "nose",
    "kulak": "ear", "ayak": "foot", "sus": "shush quiet", "sessiz": "mute quiet",
    "uyku": "sleep zzz", "havali": "sunglasses cool", "sok": "shock astonished exploding",
    "korku": "fear scream", "kizgin": "angry rage", "sinirli": "angry", "dusunme": "thinking",
    "utanma": "flushed blush", "ter": "sweat", "hasta": "sick ill mask thermometer",
    "parti": "party tada confetti", "kutlama": "party tada", "dans": "dance dancer",
    "isik": "light bulb", "fikir": "bulb idea", "simsek": "zap lightning", "enerji": "zap",
    "bomba": "bomb", "silah": "pistol", "bicak": "knife", "cekic": "hammer",
    "ingiliz anahtari": "wrench", "temizlik": "soap sponge broom", "tuvalet": "toilet",
    "banyo": "bath shower", "polis": "police", "doktor": "health worker doctor",
    "asci": "cook chef", "ogretmen": "teacher", "yazilim": "technologist computer",
    "grafik": "chart", "artis": "chart increasing", "dusus": "chart decreasing",
    "takvim": "calendar", "posta": "mail envelope", "mektup": "envelope", "kutu": "package box",
    "cop": "wastebasket trash", "pil": "battery", "buyutec": "magnifying",
    "mikrofon": "microphone", "kulaklik": "headphone", "hoparlor": "speaker loud",
    "zil": "bell", "gemi": "ship boat", "tren": "train", "bisiklet": "bicycle bike",
    "motor": "motorcycle", "otobus": "bus", "dunya": "earth globe world", "harita": "map",
    "cadir": "tent camping", "dag": "mountain", "plaj": "beach", "sehir": "city",
    "gece": "night", "gokkusagi": "rainbow", "bulut": "cloud", "ruzgar": "wind",
    "sicak": "hot fire", "soguk": "cold freezing"
  };

  var emojiKatalog = null;     // katalog.json — 3770 emoji, kategoriler, sheet koordinatları
  var emojiEsleme = null;      // 51 Twemoji SVG (çevrimdışı yedek)
  var emojiMod = "metin";
  var emojiSetAdi = "apple";   // apple | twitter — spritesheet seçimi
  var emojiKatSecim = -1;      // -1 = tümü
  var emojiSheetCss = null;    // hazır sheet'in CSS url'i
  var emojiGeo = null;         // { cols, rows } sprite geometrisi
  var sonSegmentGirdisi = null;

  function trAksansiz(s) {
    return String(s).toLocaleLowerCase("tr")
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
      .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c");
  }

  function emojiDizini() {
    return nodeVarMi() ? K.path.join(host.uzantiDizini(), "emoji") : "emoji";
  }
  function nodeVarMi() { return !!(K && K.nodeOK); }

  async function emojiEslemeYukle() {
    if (emojiEsleme) return emojiEsleme;
    try {
      if (nodeVarMi()) {
        emojiEsleme = JSON.parse(K.fs.readFileSync(K.path.join(emojiDizini(), "esleme.json"), "utf8"));
      } else {
        emojiEsleme = await (await fetch("emoji/esleme.json")).json();
      }
    } catch (e) {
      K.log("[emoji] esleme yuklenemedi: " + e.message);
      emojiEsleme = {};
    }
    return emojiEsleme;
  }

  async function emojiKatalogYukle() {
    if (emojiKatalog) return emojiKatalog;
    try {
      if (nodeVarMi()) {
        emojiKatalog = JSON.parse(K.fs.readFileSync(K.path.join(emojiDizini(), "katalog.json"), "utf8"));
      } else {
        emojiKatalog = await (await fetch("emoji/katalog.json")).json();
      }
      /*
       * Geometri TAHMİNİ (gerçek ölçüm sheet yüklenince yapılır): katalogdan
       * maxX+1 sütun saymak YANILTIR — Apple görseli olmayan hücreler katalog
       * dışı kalınca sütun eksik sayılıyor ve sprite'lar yarım hücre kayıyordu.
       */
      var mx = 0, my = 0;
      emojiKatalog.emojiler.forEach(function (e) {
        if (e.x > mx) mx = e.x;
        if (e.y > my) my = e.y;
      });
      emojiGeo = { cols: mx + 1, rows: my + 1 };
    } catch (e) {
      K.log("[emoji] katalog yuklenemedi: " + e.message);
      emojiKatalog = null;
    }
    return emojiKatalog;
  }

  function emojiDurum(metin, oran) {
    var kutu = el("cap-emoji-durum");
    if (!kutu) return;
    kutu.hidden = !metin;
    el("cap-emoji-durum-metin").textContent = metin || "";
    var bar = el("cap-emoji-durum-bar");
    if (bar) bar.style.width = (oran != null ? Math.round(oran * 100) : 0) + "%";
  }

  /*
   * Spritesheet: Apple/Twemoji çizimleri TELİF nedeniyle pakete konamaz
   * (Apple'ın emoji sanatı Apple'ın eseridir). Panel seti ilk kullanımda
   * KULLANICININ makinesine indirir — ffmpeg ve Whisper modeliyle aynı
   * model; repo yalnız MIT lisanslı metadata taşır. Tek dosya (20 MB),
   * 3770 ayrı istek değil.
   */
  async function emojiSheetHazirla() {
    var url = emojiKatalog.sheet.url.replace("-apple", "-" + emojiSetAdi).replace("/apple/", "/" + emojiSetAdi + "/");
    if (!nodeVarMi()) { emojiSheetCss = url; return; }   // tarayıcı önizlemesi: doğrudan CDN

    var hedef = K.path.join(K.emojiSetDir(), emojiSetAdi + "-64.png");
    var varMi = false;
    try { varMi = K.fs.existsSync(hedef) && K.fs.statSync(hedef).size > 1000000; } catch (e) {}
    if (!varMi) {
      emojiDurum((emojiSetAdi === "apple" ? "Apple" : "Twemoji") +
        " emoji seti indiriliyor (~20 MB, tek seferlik)…", 0);
      var d = await K.download(url, hedef, function (f) {
        emojiDurum("Emoji seti indiriliyor… %" + Math.round(f * 100), f);
      }, 0, undefined, { key: "emoji:" + emojiSetAdi });
      if (!d.ok) throw new Error(d.error || "emoji seti indirilemedi");
    }
    emojiDurum("");
    emojiSheetCss = dosyaUrl(hedef);
  }

  /* Gerçek sütun/satır sayısı görselin kendisinden: hücre aralığı 66px (64+2 pay) */
  function emojiGeoOlc() {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var c = Math.round(img.naturalWidth / 66);
        var r = Math.round(img.naturalHeight / 66);
        if (c > 0 && r > 0) emojiGeo = { cols: c, rows: r };
        resolve();
      };
      img.onerror = function () { resolve(); };   // katalog tahminiyle devam
      img.src = emojiSheetCss;
    });
  }

  function emojiKatCiz() {
    var kutu = el("cap-emoji-kats");
    if (!kutu || !emojiKatalog) return;
    kutu.innerHTML = "";
    var sayilar = {};
    emojiKatalog.emojiler.forEach(function (e) { sayilar[e.g] = (sayilar[e.g] || 0) + 1; });

    function cip(ad, deger, sayi) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = ad;
      if (sayi) {
        var n = document.createElement("b");
        n.textContent = String(sayi);
        b.appendChild(n);
      }
      if (deger === emojiKatSecim) b.className = "on";
      b.addEventListener("click", function () {
        emojiKatSecim = deger;
        el("cap-emoji-ara").value = "";
        emojiKatCiz();
        emojiGridCiz();
      });
      kutu.appendChild(b);
    }
    cip("Tümü", -1, emojiKatalog.emojiler.length);
    emojiKatalog.kategoriler.forEach(function (ad, i) { cip(ad, i, sayilar[i] || 0); });
  }

  function emojiHucre(e) {
    var b = document.createElement("button");
    b.type = "button";
    b.title = e.n.split(" ").slice(0, 4).join(" ");
    var s = document.createElement("span");
    s.className = "em";
    /*
     * Yüzde tabanlı sprite konumlama: piksel tabanlı ofset, kesirli ölçekte
     * hücre hücre kayma biriktiriyordu (her emoji yarım görünüyordu).
     * bg-size = kolon*%100 iken pozisyon x/(kolon-1) tam hücre başına düşer —
     * ölçekten bağımsız, kaymasız.
     */
    s.style.backgroundImage = "url('" + emojiSheetCss + "')";
    s.style.backgroundSize = (emojiGeo.cols * 100) + "% " + (emojiGeo.rows * 100) + "%";
    s.style.backgroundPosition =
      (e.x * 100 / (emojiGeo.cols - 1)) + "% " + (e.y * 100 / (emojiGeo.rows - 1)) + "%";
    b.appendChild(s);
    b.addEventListener("click", function () { emojiSec(e.c, e); });
    return b;
  }

  function emojiGridCiz() {
    var grid = el("cap-emoji-grid");
    if (!grid) return;
    grid.innerHTML = "";

    /* Katalog ya da sheet yoksa: 51 Twemoji SVG ile çevrimdışı yedek */
    if (!emojiKatalog || !emojiSheetCss) {
      if (!emojiEsleme) return;
      Object.keys(emojiEsleme).forEach(function (ch) {
        var b = document.createElement("button");
        b.type = "button";
        var img = document.createElement("img");
        img.alt = ch;
        img.src = nodeVarMi() ? dosyaUrl(K.path.join(emojiDizini(), emojiEsleme[ch])) : "emoji/" + emojiEsleme[ch];
        b.appendChild(img);
        b.addEventListener("click", function () { emojiSec(ch); });
        grid.appendChild(b);
      });
      return;
    }

    var sorgu = trAksansiz(el("cap-emoji-ara").value).trim();
    var jetonlar = sorgu ? sorgu.split(/\s+/).map(function (j) {
      return EMOJI_TR[j] ? j + " " + EMOJI_TR[j] : j;   // TR köprüsü: her jeton EN karşılıklarıyla genişler
    }) : [];

    var parca = document.createDocumentFragment();
    var sonKat = -9;
    var sayi = 0;
    for (var i = 0; i < emojiKatalog.emojiler.length; i++) {
      var e = emojiKatalog.emojiler[i];
      if (!sorgu && emojiKatSecim !== -1 && e.g !== emojiKatSecim) continue;
      if (sorgu) {
        var metin = e.n + " " + (EMOJI_ARAMA[e.c] || "");
        var uydu = true;
        for (var j = 0; j < jetonlar.length; j++) {
          var secenekler = jetonlar[j].split(" ");
          var biri = false;
          for (var k = 0; k < secenekler.length; k++) {
            if (secenekler[k] && metin.indexOf(secenekler[k]) !== -1) { biri = true; break; }
          }
          if (!biri) { uydu = false; break; }
        }
        if (!uydu) continue;
      }
      // "Tümü" görünümünde kategori başlıkları (aramada gereksiz)
      if (!sorgu && emojiKatSecim === -1 && e.g !== sonKat) {
        sonKat = e.g;
        var bas = document.createElement("div");
        bas.className = "emoji-baslik";
        bas.textContent = emojiKatalog.kategoriler[e.g];
        parca.appendChild(bas);
      }
      parca.appendChild(emojiHucre(e));
      sayi++;
    }
    grid.appendChild(parca);
    if (sorgu && sayi === 0) {
      var yok = document.createElement("div");
      yok.className = "emoji-baslik";
      yok.textContent = "Sonuç yok — İngilizce de deneyebilirsin (fire, heart…)";
      grid.appendChild(yok);
    }
  }

  function emojiSec(ch, giris) {
    if (emojiMod === "sahne") { emojiSahneyeBirak(ch, giris); return; }
    var inp = sonSegmentGirdisi;
    if (!inp || !inp.isConnected) {
      KApp.toast("Önce listeden bir altyazı satırına tıkla.", "warn");
      return;
    }
    var i = parseInt(inp.dataset.i, 10);
    var bas = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
    var son = inp.selectionEnd != null ? inp.selectionEnd : bas;
    // emoji ile metin arasında boşluk bırak: "kelime🔥" değil "kelime 🔥"
    var sol = inp.value.slice(0, bas);
    var ek = (sol && !/\s$/.test(sol) ? " " : "") + ch;
    inp.value = sol + ek + inp.value.slice(son);
    var segs = host.segments();
    if (!isNaN(i) && segs[i]) { segs[i].text = inp.value; host.kaydet(); }
    inp.focus();
    var yeniKonum = bas + ek.length;
    try { inp.setSelectionRange(yeniKonum, yeniKonum); } catch (e) {}
    host.onizle();
  }

  /*
   * Emoji -> 512px şeffaf PNG -> playhead'e grafik klip. Üç çizim yolu,
   * kalite sırasıyla:
   *   1) Sistem emoji fontu canvas'ta (Mac: Apple Color Emoji = GERÇEK Apple
   *      çizimi, her boyutta net; Win: Segoe UI Emoji). Piksel sayımıyla
   *      doğrulanır — eski CEF'lerde renkli font çizilemeyebiliyor.
   *   2) Paketteki 51 Twemoji SVG'den biriyse: vektörden 512'ye, net.
   *   3) İndirilen spritesheet'in 64px hücresi büyütülür (yumuşatmalı; en son çare).
   */
  function emojiPikselVarMi(ctx) {
    var v = ctx.getImageData(96, 96, 320, 320).data;
    var dolu = 0;
    for (var i = 3; i < v.length; i += 4) { if (v[i] > 8) dolu++; }
    return dolu > 400;
  }

  async function emojiSahneyeBirak(ch, giris) {
    if (!nodeVarMi()) { KApp.toast("Sahneye bırakma yalnız Premiere içinde çalışır.", "warn"); return; }
    try {
      var c = document.createElement("canvas");
      c.width = 512; c.height = 512;
      var ctx = c.getContext("2d");

      // 1) sistem emoji fontu
      ctx.font = "440px \"Apple Color Emoji\",\"Segoe UI Emoji\",\"Noto Color Emoji\",sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ch, 256, 276);

      if (!emojiPikselVarMi(ctx)) {
        ctx.clearRect(0, 0, 512, 512);
        var svgAd = emojiEsleme && emojiEsleme[ch];
        if (svgAd) {
          // 2) paket Twemoji SVG
          var svg = K.fs.readFileSync(K.path.join(emojiDizini(), svgAd), "utf8");
          await new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () { ctx.drawImage(img, 0, 0, 512, 512); resolve(); };
            img.onerror = function () { reject(new Error("SVG çizilemedi")); };
            img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
          });
        } else if (emojiSheetCss && giris) {
          // 3) spritesheet hücresi
          await new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
              ctx.imageSmoothingEnabled = true;
              ctx.drawImage(img, giris.x * 66 + 1, giris.y * 66 + 1, 64, 64, 0, 0, 512, 512);
              resolve();
            };
            img.onerror = function () { reject(new Error("sheet okunamadı")); };
            img.src = emojiSheetCss;
          });
        } else {
          throw new Error("bu emoji çizilemedi");
        }
      }

      var kod = Array.from(ch).map(function (k) {
        return k.codePointAt(0).toString(16);
      }).join("-");
      var hedef = K.path.join(K.srtDir(), "emoji-" + kod + ".png");
      K.fs.mkdirSync(K.path.dirname(hedef), { recursive: true });
      K.fs.writeFileSync(hedef, c.toDataURL("image/png").split(",")[1], "base64");

      var r = await K.call("KS_placeGraphic", { path: hedef, dur: 1.6, name: "Emoji " + ch }, 60000);
      if (!r.ok) throw new Error(r.error);
      KApp.toast(ch + " " + r.trackName + " katmanına, playhead'e bırakıldı", "good");
    } catch (e) {
      KApp.toast("Emoji bırakılamadı: " + e.message, "bad");
    }
  }

  async function emojiPaneliDoldur() {
    await emojiEslemeYukle();          // çevrimdışı yedek her koşulda hazır olsun
    await emojiKatalogYukle();
    if (emojiKatalog) {
      try {
        await emojiSheetHazirla();
        await emojiGeoOlc();
      } catch (e) {
        K.log("[emoji] sheet hazirlanamadi: " + e.message);
        emojiDurum("Set indirilemedi — çevrimdışı yedek gösteriliyor (51 emoji).");
        emojiSheetCss = null;
      }
    }
    emojiKatCiz();
    emojiGridCiz();
  }

  function initEmoji(h) {
    host = h || host;
    var ac = el("cap-emoji-ac");
    var panel = el("cap-emoji-panel");
    if (!ac || !panel) return;

    try { emojiSetAdi = K.settings().emojiSet || "apple"; } catch (e) {}
    var setSec = el("cap-emoji-set");
    if (setSec) setSec.value = emojiSetAdi;

    ac.addEventListener("click", async function (e) {
      e.stopPropagation();
      if (panel.hidden) {
        panel.hidden = false;
        el("cap-emoji-ara").focus();
        await emojiPaneliDoldur();
      } else panel.hidden = true;
    });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== ac) panel.hidden = true;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) panel.hidden = true;
    });

    var araZaman = null;
    el("cap-emoji-ara").addEventListener("input", function () {
      if (araZaman) clearTimeout(araZaman);
      araZaman = setTimeout(emojiGridCiz, 120);   // 3770 hücreyi her tuşta değil, nefes alınca çiz
    });

    if (setSec) {
      setSec.addEventListener("change", async function () {
        emojiSetAdi = setSec.value;
        emojiSheetCss = null;
        try {
          var s = K.settings();
          s.emojiSet = emojiSetAdi;
          K.saveSettings();
        } catch (e) {}
        try {
          await emojiSheetHazirla();
          await emojiGeoOlc();
        } catch (e2) { emojiDurum("Set indirilemedi: " + e2.message); }
        emojiGridCiz();
      });
    }

    Array.prototype.forEach.call(el("cap-emoji-mod").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el("cap-emoji-mod").querySelectorAll("button"), function (x) {
          x.classList.remove("on");
        });
        b.classList.add("on");
        emojiMod = b.dataset.m;
        el("cap-emoji-hint").textContent = emojiMod === "sahne"
          ? "Playhead'e grafik klip olarak iner · Mac'te gerçek Apple çizimi"
          : "Seçili satıra eklenir · görseller kullanıcı makinesine indirilir";
      });
    });

    // hangi satırın aktif olduğunu izle (emoji oraya girer)
    el("cap-segments").addEventListener("focusin", function (e) {
      if (e.target && e.target.tagName === "INPUT" && e.target.dataset.i !== undefined) {
        sonSegmentGirdisi = e.target;
      }
    });
  }

  // Astral (surrogate) karakter = pratikte emoji. Stilli katman yolunun bekçisi.

  return { init: initEmoji };
})();
