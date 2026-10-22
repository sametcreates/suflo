/*
 * Suflo Studio uctan uca (gercek tarayici + gercek php -S sunucusu + gecici SQLite). Yalniz anonim ornek veri.
 * Masaustu ve telefon boyutunda: giris, musteri / stok girisi / cekim / icerik akislari, toplu durum + geri al,
 * pano surukle-birak, cakisma uyarisi, yenilemede kalicilik, cikis, yedek indirme + mukerrersiz ice aktarma onizlemesi,
 * yaniti kaybolan kaydetmenin yeniden denenmesinde mukerrer kayit olusmamasi, gunluk otomatik kopya etiketi,
 * cihaz saat dilimi farkli olsa da Istanbul tarihi, telefonda yatay tasma yok; tek tik sonraki durum (liste, pano), Genel Bakis ozeti,
 * bugun paylasilacaklar, onay bekleme suresi, son yedek tarihi ve hatirlatmasi, toplu arsiv onayi / arsivden cikar,
 * kaydedilmemis pencerenin kapatilmadan once sormasi; uzun liste (200'er satir, yerinde secim, Shift ile aralik, eski yayinlananlar gizli),
 * pano sutun siniri, arama sirasi ve "+N tane daha", geri tusunda kaydirma konumu, telefonda 16 px girdi / parmak boyu hedefler /
 * altta toplu cubuk / kart tablolar / katli takvim filtreleri, Stok sayfasinda acil olanlar ustte; saatli takvim (hafta / gun / ay,
 * filtre, gece yarisini asan is, surukle-tasi + geri al, cakisma hayaleti, alt kenardan sure, klavye, cekmeceden blok, hizli olusturma,
 * kaydetme hatasinda geri donus, iki sayfada 409, tamamlama anlamlari, ayarlar / ozel gun, telefonda adim dugmeleri ve kaydirma);
 * takvimde 1280 / 1440 / 1920 ve 360 / 390 / 430 genislikte tasma / kirpilma yok, dar seritte musteri adi ve "+N", 44 px hedefler,
 * alt sayfa (modal, Tab icinde kalir), dokunmatik dikey kaydirma ve yana kaydirma, yalniz klavyeyle akis, ekran okuyucu etiketleri,
 * renk tek isaret degil, hareket azaltma, 300 is, uzak gecmis / gelecek, arsivli musteri, kopuk baglantilar, New York saat diliminde Istanbul.
 * php ya da Playwright yoksa ATLA; STUDIO_E2E_ZORUNLU=1 iken (CI'daki e2e isi) atlamak kalmak sayilir.
 */
"use strict";
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process"), net = require("net"), http = require("http");
var ROOT = path.join(__dirname, "..");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) { if (k) gecen++; else kalan++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 500) + "]" : "")); }

function playwrightBul() {
  try { return require("playwright"); } catch (e) { /* global kurulum */ }
  try {
    var g = cp.execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return require(path.join(g, "playwright"));
  } catch (e2) { return null; }
}
var phpVar = cp.spawnSync("php", ["-r", "echo in_array('sqlite', PDO::getAvailableDrivers()) ? 'var' : 'yok';"], { encoding: "utf8" });
var pw = playwrightBul();
if (phpVar.error || phpVar.stdout !== "var" || !pw) {
  console.log("ATLA Studio uctan uca: " + (!pw ? "Playwright yok" : "php / pdo_sqlite yok"));
  process.exit(process.env.STUDIO_E2E_ZORUNLU ? 1 : 0); // CI'daki e2e isinde atlamak kalmak sayilir
}

var SIFRE = "ornek-e2e-sifresi-123";
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-studio-e2e-"));
var PUB = path.join(TMP, "public_html"), PRIV = path.join(TMP, "private", "studio-v1");
var EKRAN = process.env.STUDIO_EKRAN || null; // ekran goruntusu klasoru (istege bagli, repo disinda)
fs.mkdirSync(path.join(PUB, "studio", "v1"), { recursive: true });
fs.mkdirSync(PRIV, { recursive: true });
["index.html", "studio.css", "studio-core.js", "studio.js", "favicon.svg"].forEach(function (f) { fs.copyFileSync(path.join(ROOT, "server", "studio-v1", "arayuz", f), path.join(PUB, "studio", f)); });
fs.copyFileSync(path.join(ROOT, "docs", "favicon.svg"), path.join(PUB, "favicon.svg"));
fs.copyFileSync(path.join(ROOT, "server", "studio-v1", "index.php"), path.join(PUB, "studio", "v1", "index.php"));
var ozet = cp.spawnSync("php", ["-r", "echo password_hash($argv[1], PASSWORD_DEFAULT);", SIFRE], { encoding: "utf8" }).stdout;

var PORT, phpSurec, tarayici;
function bosPort() { return new Promise(function (res) { var s = net.createServer(); s.listen(0, "127.0.0.1", function () { var p = s.address().port; s.close(function () { res(p); }); }); }); }
function hazir() {
  return new Promise(function (res, rej) {
    var n = 0;
    (function dene() {
      http.get({ host: "127.0.0.1", port: PORT, path: "/studio/" }, function (r) { r.resume(); res(); }).on("error", function () {
        if (++n > 60) return rej(new Error("php -S baslamadi"));
        setTimeout(dene, 100);
      });
    })();
  });
}
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
// Menuden sayfaya git ve yeni sayfanin cizildigini bekle (hashchange esnek oldugu icin eski sayfayi okumamak icin).
// Pencerede etiketi tam olarak verilen alanin girdisi
function alanGirdi(d, etiket, tur) { return d.locator(".alan:has(> span:text-is('" + etiket + "')) " + tur).first(); }
async function menuyeGit(p, ad, baslik) {
  await p.click(".yan-menu >> text=" + ad);
  await p.waitForSelector(".sayfa h1:has-text('" + baslik + "')");
}

async function calis() {
  PORT = await bosPort();
  var ORIGIN = "http://127.0.0.1:" + PORT;
  fs.writeFileSync(path.join(PRIV, "config.php"), "<?php\nreturn ['password_hash' => '" + ozet + "', 'dsn' => 'sqlite:" + path.join(PRIV, "studio.sqlite").split("\\").join("/") +
    "', 'allowed_origins' => ['" + ORIGIN + "'], 'cookie_secure' => false, 'login_max_fail' => 20];\n");
  phpSurec = cp.spawn("php", ["-S", "127.0.0.1:" + PORT, "-t", PUB], { stdio: ["ignore", "ignore", "ignore"] });
  await hazir();
  tarayici = await pw.chromium.launch();
  var URL_ = ORIGIN + "/studio/";

  /* ================= Masaustu ================= */
  // Cihaz New York saatinde; uygulama yine Istanbul tarihini kullanmali.
  var ctx = await tarayici.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: "America/New_York", locale: "tr-TR", acceptDownloads: true });
  var page = await ctx.newPage();
  var hatalar = [];
  page.on("pageerror", function (e) { hatalar.push(String(e)); });
  page.on("console", function (m) { if (m.type() === "error" && !/favicon|401|Failed to load resource/.test(m.text())) hatalar.push(m.text()); });
  // 2099-10-19 22:30 UTC = New York'ta 19 Ekim, Istanbul'da 20 Ekim 01:30.
  // Yil uzak gelecekte kalmali ve takvimi 2026 ile ayni olmali (1 Ocak Persembe, artik yil degil): sunucu gecmis gun
  // istisnalarini kendi gercek saatine gore budar; tarayici saati gecmise dusen bir tarihe sabitlenirse test kendiliginden kalir.
  await page.clock.setFixedTime(new Date("2099-10-19T22:30:00Z"));
  await page.goto(URL_);
  await page.waitForSelector("#studio-sifre");
  ok("giris ekrani: sifre alani, uygulama verisi yok", await page.locator("#studio-sifre").isVisible() && !(await page.locator(".yan-menu").count()));
  await page.fill("#studio-sifre", "yanlis-sifre-000");
  await page.click("button[type=submit]");
  await page.waitForSelector(".giris-kart .hata:has-text('Şifre yanlış')");
  ok("yanlis sifre: hata mesaji", true);
  await page.fill("#studio-sifre", SIFRE);
  await page.click("button[type=submit]");
  await page.waitForSelector(".yan-menu");
  var menu = await page.locator(".yan-menu a").allTextContents();
  ok("sol menu 7 bolum", menu.join("|") === "Genel Bakış|Müşteriler|İçerikler|Takvim|Yayın Takvimi|Stok|Ayarlar", menu.join("|"));
  var tarihMetni = await page.locator(".sayfa-bas .soluk").first().textContent();
  ok("genel bakis tarihi Istanbul'a gore (cihaz New York'ta 19 Ekim)", tarihMetni === "20 Ekim 2099, Salı", tarihMetni);
  ok("bos baslangic: ornek veri yok, yonlendirme var", await page.locator("text=Henüz kayıt yok").isVisible());
  var depolama = await page.evaluate(function () { return Object.keys(localStorage).join(",") + "|" + document.cookie; });
  ok("tarayicida veri / oturum saklanmiyor (localStorage bos, cerez JS'den okunamaz)", depolama === "|", depolama);

  // Musteri ekle (hizli ekle)
  await page.click("text=+ Ekle");
  await page.click("dialog >> text=Müşteri");
  var d = page.locator("dialog[open]");
  await alanGirdi(d, "Ad", "input").fill("Örnek Müşteri A");
  await alanGirdi(d, "Aylık ücret (TL)", "input").fill("10.000");
  await alanGirdi(d, "Yayın sıklığı", "select").selectOption("haftalik");
  await alanGirdi(d, "Haftada kaç paylaşım", "input").fill("2");
  await d.locator(".gunler label:has-text('Sal') input").check();
  await d.locator(".gunler label:has-text('Cum') input").check();
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("h1:has-text('Örnek Müşteri A')");
  ok("musteri eklendi, sayfasi acildi; stok girisi yapilmadi gorunur (0 degil)", await page.locator(".sayfa >> text=Stok girişi yapılmadı").first().isVisible());
  ok("yayin duzeni metni", await page.locator("text=Haftada 2: Sal, Cum").first().isVisible());

  // Ucreti belirsiz ikinci musteri
  await page.click("text=+ Ekle");
  await page.click("dialog >> text=Müşteri");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Ad", "input").fill("Örnek Müşteri B");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("h1:has-text('Örnek Müşteri B')");
  ok("ucreti ve sikligi belirsiz musteri: yayin duzeni kurulmali", await page.locator(".sayfa >> text=Yayın düzeni kurulmalı").first().isVisible());
  await menuyeGit(page, "Müşteriler", "Müşteriler");
  var ozetMetni = await page.locator(".sayfa-bas .soluk").first().textContent();
  ok("musteri ozeti: bilinen toplam 10.000 TL, 1 musterinin ucreti belirlenmedi", /2 aktif müşteri · Bilinen aylık ücret toplamı 10\.000 TL \(1 müşteri\) · 1 müşterinin ücreti belirlenmedi/.test(ozetMetni), ozetMetni);
  ok("ucret alacak / tahsilat gibi gosterilmez", await page.locator("text=tahsil edilen para ya da alacak değildir").isVisible());

  // Ayni musteri ikinci kez eklenemez
  await page.click("text=Müşteri ekle");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Ad", "input").fill("ÖRNEK müşteri a");
  await d.locator("button[type=submit]").click();
  ok("ayni ad ikinci kez eklenmez", await d.locator(".hata:has-text('zaten var')").isVisible());
  // Yazilmis pencere sormadan kapanmaz: Vazgec once sorar; sorudaki Vazgec yaziyi korur, "Kaydetmeden kapat" kapatir
  await d.locator("button:has-text('Vazgeç')").click();
  var soru = page.locator("dialog[open]:has-text('Kaydedilmemiş değişiklik')");
  await soru.waitFor();
  await soru.locator("button:has-text('Vazgeç')").click();
  await soru.waitFor({ state: "detached" });
  ok("kaydedilmemis pencere: Vazgec sorar; soruda Vazgec yaziyi korur", (await page.locator("dialog[open]").count()) === 1 && (await alanGirdi(d, "Ad", "input").inputValue()) === "ÖRNEK müşteri a");
  await page.keyboard.press("Escape");
  await soru.waitFor();
  ok("kaydedilmemis pencere: Esc de sorar", (await page.locator("dialog[open]").count()) === 2);
  await soru.locator("button:has-text('Kaydetmeden kapat')").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  // Hicbir sey yazilmamis pencere Esc ve x ile hemen kapanir
  await page.click("text=Müşteri ekle");
  await page.locator("dialog[open]").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog[open]", { state: "detached" });
  await page.click("text=Müşteri ekle");
  await page.locator("dialog[open] button.kapat").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  ok("bos pencere Esc ve x ile sormadan kapanir", true);
  // Yazilmis pencere acikken sayfa yenilenirse tarayici sorar (beforeunload); yazilmamisken sormaz
  await page.click("text=Müşteri ekle");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Not", "textarea").fill("yarım kalan not");
  var bosaltSorusu = null;
  var bosaltDinle = function (dl) { bosaltSorusu = dl.type(); dl.dismiss().catch(function () {}); };
  page.on("dialog", bosaltDinle);
  await page.reload().catch(function () {});
  await bekle(300);
  ok("yazilmis pencere acikken yenileme: tarayici sorar (beforeunload) ve vazgecilince yazi durur", bosaltSorusu === "beforeunload" && (await alanGirdi(d, "Not", "textarea").inputValue()) === "yarım kalan not", bosaltSorusu);
  page.off("dialog", bosaltDinle);
  await d.locator("button.kapat").click();
  await page.locator("dialog[open] button:has-text('Kaydetmeden kapat')").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });

  // Stok girisi
  await page.click("a:has-text('Örnek Müşteri A')");
  await page.click("button:has-text('Stok girişi yap')");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Yayına hazır (onaylı, yayınlanmamış)", "textarea").fill("Hazır video 1\nHazır video 2");
  await alanGirdi(d, "Hazırlıkta olanlar", "textarea").fill("Kurgudaki video");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("text=Hazır video 2", { state: "attached" });
  var stokMetni = await page.locator(".bolum:has-text('Stok ve yayın ihtiyacı')").textContent();
  ok("stok girisi: hazir video 2 = atanmis 0 + atanmamis 2, hazirlikta 1", /Hazır video 2/.test(stokMetni) && /tarihe atanmış 0/.test(stokMetni) && /atanmamış 2/.test(stokMetni) && /hazırlıkta 1/.test(stokMetni), stokMetni);
  // 20 Ekim Sali: 7 gunde Sal 20, Cum 23, Sal 27 hmm -> 20..26: Sal 20, Cum 23 = 2 gun
  ok("haftalik tahmin: 7 gunde 2 paylasim gunu, ikisi oneriyle karsilanabilir", /2 paylaşım günü/.test(stokMetni) && /2 atanmamış ya da tarihi geçmiş hazır içerikle karşılanabilir/.test(stokMetni), stokMetni);
  // Oneriyi plana cevir
  await page.locator(".slot.oneri").first().click();
  await page.locator("dialog[open] button:has-text('Bu tarihe ata')").click();
  await page.waitForSelector("text=tarihine atandı");
  stokMetni = await page.locator(".bolum:has-text('Stok ve yayın ihtiyacı')").textContent();
  ok("oneri yalniz tiklaninca plana doner: atanmis 1 + atanmamis 1 (toplam yine 2)", /Hazır video 2/.test(stokMetni) && /tarihe atanmış 1/.test(stokMetni) && /atanmamış 1/.test(stokMetni), stokMetni);

  // Tek gunun beklenen turu (istisna): bir paylasim gununu "Post" yap
  var slotSayisiOnce = await page.locator(".slot").count();
  await page.locator(".slot").last().click();
  await alanGirdi(page.locator("dialog[open]"), "Bu gün beklenen paylaşım türü", "select").selectOption("post");
  await page.locator("dialog[open] button:has-text('Türü kaydet')").click();
  await page.waitForSelector("text=için beklenen tür: Post");
  ok("tek gunun beklenen turu degistirilebilir (slot etiketi post)", (await page.locator(".slot").count()) === slotSayisiOnce && /post/.test(await page.locator(".slot").last().textContent()), await page.locator(".slot").last().textContent());
  await page.click(".toast:has-text('için beklenen tür') button:has-text('Geri al')");
  await page.waitForSelector("text=Geri alındı.");

  // Cekim ekle + cakisma
  await page.click("button:has-text('Çekim ekle')");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Başlık", "input").fill("Örnek çekim 1");
  await alanGirdi(d, "Başlangıç saati", "input").fill("10:00");
  await alanGirdi(d, "Bitiş saati", "input").fill("12:00");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector(".satir:has-text('Örnek çekim 1')");
  ok("yeni cekimin tarihi Istanbul bugunu", await page.locator(".satir:has-text('Örnek çekim 1')").first().textContent().then(function (t) { return /20 Ekim Sal/.test(t); }));
  await page.click("button:has-text('Çekim ekle')");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Başlık", "input").fill("Örnek çekim 2");
  await alanGirdi(d, "Başlangıç saati", "input").fill("11:00");
  await alanGirdi(d, "Bitiş saati", "input").fill("13:00");
  await alanGirdi(d, "Bitiş saati", "input").dispatchEvent("change");
  ok("kaydetmeden once cakisma uyarisi", await d.locator(".uyari-kutu:has-text('Çakışma')").isVisible());
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("text=Dikkat: 1 etkinlikle çakışıyor");
  await page.click(".yan-menu a[data-rota=cekim]");
  await page.waitForSelector(".tk h1:has-text('Takvim')");
  await page.click(".tk-secim button:has-text('Hafta')");
  await page.waitForSelector(".tk-kart");
  ok("takvimde cakisma isareti (2 etkinlik)", (await page.locator(".tk-kart[aria-label*='çakışma var']").count()) === 2);
  // Tum gun, iki gunluk musterisiz etkinlik
  await page.click("text=+ Ekle");
  await page.click("dialog >> text=Çekim / etkinlik");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Başlık", "input").fill("Örnek organizasyon");
  await d.locator("label:has-text('Tüm gün') input").check();
  await alanGirdi(d, "Başlangıç tarihi", "input").fill("2099-10-24");
  await alanGirdi(d, "Bitiş tarihi", "input").fill("2099-10-25");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector(".tk-serit.etk:has-text('Örnek organizasyon')");
  ok("iki gunluk tum gun etkinlik haftada iki gunde (tum gun seridinde) gorunur", (await page.locator(".tk-serit.etk:has-text('Örnek organizasyon')").count()) === 2);
  await page.click(".tk-secim button:has-text('Ay')");
  await page.waitForSelector(".tk-ay");
  ok("ay gorunumu: Ekim 2099", await page.locator(".tk-donem:has-text('Ekim 2099')").isVisible() && (await page.locator(".tk-ay .tk-hucre").count()) % 7 === 0);
  await page.click(".tk-secim button:has-text('Gün')");
  await page.waitForSelector(".tk-donem:has-text('20 Ekim 2099')");
  ok("gun gorunumu: 20 Ekim", await page.locator(".tk-donem:has-text('20 Ekim 2099')").isVisible());

  // Cekimden toplu icerik (takvim kartindan ayrinti, oradan tam pencere)
  await page.click(".tk-kart:has-text('Örnek çekim 1')");
  await page.click(".tk-acilir button:has-text('Düzenle')");
  d = page.locator("dialog[open]");
  await d.locator("button:has-text('Bu çekimden içerik ekle')").click();
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Başlıklar", "textarea").fill("Çekimden reels 1\nÇekimden reels 2\nÇekimden reels 3");
  ok("planlanan cekimden eklenen icerik 'Çekim planlandı' durumunda baslar", (await alanGirdi(d, "Durum", "select").inputValue()) === "cekim_planlandi");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("text=3 içerik eklendi.");

  // Icerikler: toplu durum + geri al
  await menuyeGit(page, "İçerikler", "İçerikler");
  await page.click(".gorunum >> text=Liste");
  ok("icerik listesi: 6 icerik", /6 içerik/.test(await page.locator(".sayfa-bas .soluk").first().textContent()));
  await page.locator(".satir:has-text('Çekimden reels 1') input[type=checkbox]").check();
  await page.locator(".satir:has-text('Çekimden reels 2') input[type=checkbox]").check();
  await page.locator(".toplu-cubuk select").selectOption("kurguda");
  await page.click("button:has-text('Durumu değiştir')");
  await page.waitForSelector("text=2 içerik → Kurguda");
  var kurguda = await page.locator(".satir:has(.d-kurguda)").count();
  ok("toplu durum degisimi: 2 + onceki 1 = 3 kurguda", kurguda === 3, kurguda);
  // eylemli bildirimler (onceki "Geri al"lar) eylemsizlerden once kalkmaz: dogru bildirimin dugmesine bas
  await page.click(".toast:has-text('2 içerik → Kurguda') button:has-text('Geri al')");
  await page.waitForSelector("text=Geri alındı.");
  kurguda = await page.locator(".satir:has(.d-kurguda)").count();
  ok("geri al: yine 1 kurguda", kurguda === 1, kurguda);

  // Pano surukle-birak
  await page.click(".gorunum >> text=Pano");
  var kart = page.locator(".kart:has-text('Çekimden reels 3')");
  var hedefKolon = page.locator(".kolon[data-durum=onayda]");
  await hedefKolon.scrollIntoViewIfNeeded();
  var kb = await kart.boundingBox(), hb = await hedefKolon.boundingBox();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  for (var adim = 1; adim <= 8; adim++) await page.mouse.move(kb.x + kb.width / 2 + (hb.x + hb.width / 2 - kb.x - kb.width / 2) * adim / 8, kb.y + kb.height / 2 + (hb.y + 60 - kb.y - kb.height / 2) * adim / 8);
  await page.mouse.up();
  // kart, sunucu kaydi bitip pano yeniden cizilince tasinir: sabit bekleme yerine yeni kolonda gorunmesini bekle
  await page.waitForSelector(".kolon[data-durum=onayda] .kart", { timeout: 5000 }).catch(function () {});
  var panoDurum = await page.evaluate(function () {
    return [].map.call(document.querySelectorAll(".kolon"), function (k) { return k.getAttribute("data-durum") + ":" + k.querySelectorAll(".kart").length; }).join(" ") +
      " | " + [].map.call(document.querySelectorAll(".toast span"), function (t) { return t.textContent; }).join(" / ") + " | dialog:" + !!document.querySelector("dialog[open]");
  });
  ok("pano: surukle-birak ile durum degisti", (await page.locator(".kolon[data-durum=onayda] .kart").count()) === 1, panoDurum);

  // Icerik detay: yerel yol uyarisi + yayinlandi + stok
  await page.click(".kart:has-text('Hazır video 1')");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Proje dosyası bağlantısı", "input").fill("C:\\Kurgu\\ornek.prproj");
  ok("yerel dosya yolu uyarisi", await d.locator("text=başka cihazda ya da tarayıcıda açılmaz").isVisible());
  await alanGirdi(d, "Final bağlantısı", "input").fill("javascript:alert(1)");
  ok("javascript: baglantisi tiklanabilir olmaz", (await d.locator("a[href^='javascript']").count()) === 0 && await d.locator("text=Tıklanabilir bağlantı değil").isVisible());
  await alanGirdi(d, "Final bağlantısı", "input").fill("https://depo.ornek.test/final");
  await alanGirdi(d, "Durum", "select").selectOption("yayinlandi");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("text=Kaydedildi.");
  await page.goto(URL_ + "#/musteriler");
  await page.click("a:has-text('Örnek Müşteri A')");
  stokMetni = await page.locator(".bolum:has-text('Stok ve yayın ihtiyacı')").textContent();
  ok("yayinlanan stoktan duser (2 -> 1), kayit durur", /Hazır video 1/.test(stokMetni), stokMetni);

  // Yenileme ve kalicilik
  await page.reload();
  await page.waitForSelector("h1:has-text('Örnek Müşteri A')");
  ok("sayfa yenilenince oturum ve veri kalir", /Hazır video 1/.test(await page.locator(".bolum:has-text('Stok ve yayın ihtiyacı')").textContent()));

  // Genel bakis
  await menuyeGit(page, "Genel Bakış", "Bugün ne yapmalıyım?");
  var gb = await page.locator(".sayfa").textContent();
  ok("genel bakis: bugunku cekimler, onayda ve yayin duzeni eksik musteri", /Bugün: çekim ve etkinlikler/.test(gb) && /Müşteri onayında/.test(gb) && /Yayın düzeni kurulmalı/.test(gb), gb.slice(0, 400));
  ok("yedek hatirlatmasi: hic JSON yedegi indirilmediyse Genel Bakis'ta", await page.locator(".yedek-hatirlatma:has-text('Henüz JSON yedeği indirmedin')").isVisible());
  // Ust ozet: bos olmayan her bolum icin bir dugme; sayisi bolum basligindakiyle ayni
  var cipler = await page.evaluate(function () {
    return [].map.call(document.querySelectorAll(".ozet-cipler .cip"), function (c) {
      var b = document.getElementById(c.getAttribute("data-hedef"));
      return { ad: c.firstChild.textContent, n: c.querySelector(".sayi").textContent, bolum: b ? b.querySelector(".bolum-bas .sayi").textContent : null };
    }).concat([{ bolumSayisi: document.querySelectorAll(".bolum[id^=gb-]").length }]);
  });
  var bolumSayisi = cipler.pop().bolumSayisi;
  ok("genel bakis ozeti: her bos olmayan bolum icin dugme, sayilar bolumle ayni", cipler.length > 3 && cipler.length === bolumSayisi &&
    cipler.every(function (c) { return c.n === c.bolum; }) && cipler.some(function (c) { return c.ad === "Onayda" && c.n === "1"; }), JSON.stringify(cipler));
  await page.click(".cip:has-text('Düzen eksik')");
  // bolum ust cubugun hemen altina gelir; sayfa sonundaki kisa bolumde sayfa en alta kayar
  var kaydirma = function () {
    var r = document.getElementById("gb-duzen").getBoundingClientRect(), enAlt = window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 1;
    return { ust: r.top, y: window.scrollY, tamam: window.scrollY > 0 && r.top > 40 && (r.top < 110 || (enAlt && r.bottom <= window.innerHeight)) };
  };
  await page.waitForFunction(function (f) { return (new Function("return (" + f + ")()"))().tamam; }, kaydirma.toString(), { timeout: 3000 }).catch(function () {});
  var duzenKaydirma = await page.evaluate(kaydirma);
  ok("ozet dugmesi bolume kaydirir (ust cubugun altinda)", duzenKaydirma.tamam, JSON.stringify(duzenKaydirma));
  await page.click(".bolum:has-text('Müşteri onayında') >> text=Listeyi aç →");
  await page.waitForSelector(".sayfa h1:has-text('İçerikler')");
  var filtreSatir = await page.locator(".sayfa .satir, .sayfa .kart").allTextContents(); // son secilen gorunum (pano) hatirlanir
  ok("genel bakis karti filtreli listeyi acar", /durum=onayda/.test(page.url()) && filtreSatir.length === 1, page.url() + " " + filtreSatir.join(" / "));

  // Arama (Turkce harf katlama)
  await page.fill("input.ara", "cekimden");
  await page.waitForSelector("h1:has-text('Arama: cekimden')");
  ok("hizli arama: 'cekimden' -> 3 icerik", (await page.locator(".bolum:has-text('İçerikler') .satir").count()) === 3);

  // Yedek indir + onizleme (mukerrer yok)
  await menuyeGit(page, "Ayarlar", "Ayarlar");
  ok("yedekte ozel veri uyarisi", await page.locator("text=Yedek dosyaları müşteri, ücret ve takvim bilgisi içerir").isVisible());
  var gunlukSatir = page.locator(".bolum:has-text('Otomatik kopyalar') .satir:has-text('Günlük kopya')").first();
  await gunlukSatir.waitFor();
  var gunlukMetin = await gunlukSatir.textContent();
  ok("otomatik kopyalar: gunun ilk degisikliginden onceki kopya 'Günlük kopya' etiketli, ozeti Turkce", /\d+ müşteri, \d+ içerik, \d+ çekim \/ etkinlik/.test(gunlukMetin), gunlukMetin);
  ok("ayarlar: henuz JSON yedegi indirilmedi yazar", /henüz JSON yedeği indirilmedi/.test(await page.locator(".son-yedek").textContent()));
  var indirme = page.waitForEvent("download");
  await page.click("button:has-text('JSON yedeği indir')");
  var dl = await indirme;
  var sonYedekMetin = await page.locator(".son-yedek").textContent();
  ok("yedek indirince son yedek gunu sunucuya yazilir ve gosterilir (bugun)", sonYedekMetin === "Son JSON yedeği: 20 Ekim 2099 (bugün)." &&
    (await page.evaluate(function () {
      return fetch("/studio/v1/index.php", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Studio": "1" }, body: JSON.stringify({ islem: "veri" }) })
        .then(function (r) { return r.json(); }).then(function (j) { return j.veri.ayar && j.veri.ayar.sonYedek; });
    })) === "2099-10-20", sonYedekMetin);
  var yedekYolu = path.join(TMP, "yedek.json");
  await dl.saveAs(yedekYolu);
  var yedek = JSON.parse(fs.readFileSync(yedekYolu, "utf8"));
  ok("JSON yedek: bicim ve kayitlar", yedek.format === "suflo-studio-yedek" && yedek.veriler.musteriler.length === 2 && yedek.veriler.icerikler.length === 6 && yedek.veriler.etkinlikler.length === 3);
  var csvIndirme = page.waitForEvent("download");
  await page.click("button:has-text('İçerikler (CSV)')");
  var csvYolu = path.join(TMP, "icerik.csv");
  await (await csvIndirme).saveAs(csvYolu);
  var csv = fs.readFileSync(csvYolu, "utf8");
  ok("icerik CSV: BOM + baslik satiri + 6 satir", csv.charCodeAt(0) === 0xFEFF && csv.trim().split(/\r\n/).length === 7, csv.slice(0, 200));
  await page.setInputFiles("input[type=file]", yedekYolu);
  await page.waitForSelector("text=Atlanacak");
  var oniz = await page.locator(".bolum:has-text('İçe aktar / geri yükle')").textContent();
  ok("ayni yedek ice aktarma onizlemesi: 0 eklenecek, 11 atlanacak; ekle dugmesi kapali", /0 müşteri, 0 içerik, 0 çekim/.test(oniz) && /11 kayıt/.test(oniz) &&
    await page.locator("button:has-text('Yalnız yenileri ekle')").isDisabled(), oniz);
  // Onizlemeden sonra veri degisirse ekleme yapilmaz; onizleme yenilenir, ikinci denemede eklenir
  var yeniYedek = JSON.parse(JSON.stringify(yedek));
  yeniYedek.veriler.musteriler.push({ ad: "Örnek Müşteri D", kurum: "", ucret: null, siklik: { tur: "belirsiz" }, slotTuru: "video", stokGirisi: false, not: "", arsiv: false });
  var yeniYedekYolu = path.join(TMP, "yedek-yeni.json");
  fs.writeFileSync(yeniYedekYolu, JSON.stringify(yeniYedek));
  await page.setInputFiles("input[type=file]", yeniYedekYolu);
  await page.waitForSelector(".bolum:has-text('İçe aktar / geri yükle') dd:text-is('1 müşteri, 0 içerik, 0 çekim / etkinlik')");
  var araKayit = (await apiCagir({ islem: "veri" })).veri.musteriler.filter(function (x) { return x.ad === "Örnek Müşteri B"; })[0];
  var araVeri = Object.assign({}, araKayit, { not: "önizleme sonrası değişiklik" });
  ["id", "surum", "olusturma", "guncelleme"].forEach(function (k) { delete araVeri[k]; });
  await apiCagir({ islem: "kaydet", tur: "musteri", id: araKayit.id, surum: araKayit.surum, veri: araVeri });
  await page.click("button:has-text('Yalnız yenileri ekle')");
  await page.waitForSelector(".toast:has-text('önizleme yenilendi')");
  await page.waitForSelector(".bolum:has-text('İçe aktar / geri yükle') dd:text-is('1 müşteri, 0 içerik, 0 çekim / etkinlik')");
  var eskiOnizlemeSayisi = (await apiCagir({ islem: "veri" })).veri.musteriler.length;
  await page.click("button:has-text('Yalnız yenileri ekle')");
  await page.waitForSelector(".toast:has-text('İçe aktarma tamamlandı: 1 müşteri')");
  var sonMusteriSayisi = (await apiCagir({ islem: "veri" })).veri.musteriler.length;
  ok("eski onizlemeyle ice aktarma yapilmaz; yenilenen onizlemeyle tek sefer eklenir", eskiOnizlemeSayisi === 2 && sonMusteriSayisi === 3, eskiOnizlemeSayisi + " -> " + sonMusteriSayisi);

  // Cakisma: pencere acikken kayit baska cihazda degisir -> pencere acik kalir; ikinci kaydetmede yalniz
  // kullanicinin degistirdigi alan yazilir, diger cihazin degisikligi korunur
  await page.goto(URL_ + "#/icerikler?gorunum=liste");
  await page.waitForSelector(".sayfa h1:has-text('İçerikler')");
  await page.click(".satir-ad:has-text('Kurgudaki video')");
  d = page.locator("dialog[open]");
  async function apiCagir(g) {
    return page.evaluate(function (g) {
      return fetch("/studio/v1/index.php", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Studio": "1" }, body: JSON.stringify(g) })
        .then(function (r) { return r.json(); });
    }, g);
  }
  async function icerikAl(baslik) { return (await apiCagir({ islem: "veri" })).veri.icerikler.filter(function (x) { return x.baslik === baslik; })[0]; }
  var disKayit = await icerikAl("Kurgudaki video");
  var disVeri = Object.assign({}, disKayit, { not: "başka cihaz notu" });
  ["id", "surum", "olusturma", "guncelleme"].forEach(function (k) { delete disVeri[k]; });
  var dis = await apiCagir({ islem: "kaydet", tur: "icerik", id: disKayit.id, surum: disKayit.surum, veri: disVeri });
  await alanGirdi(d, "Revizyon notu", "textarea").fill("pencereden revizyon notu");
  await d.locator("button[type=submit]").click();
  await d.locator(".hata:has-text('başka bir yerde değişti')").waitFor();
  ok("cakisma: pencere acik kalir, uyari gorunur (sessiz ezme yok)", dis.ok === true && await d.isVisible());
  ok("cakisma: dokunulmamis alan guncel degerle doldu, benim alanim duruyor", (await alanGirdi(d, "Not", "textarea").inputValue()) === "başka cihaz notu" &&
    (await alanGirdi(d, "Revizyon notu", "textarea").inputValue()) === "pencereden revizyon notu");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  var birlesik = await icerikAl("Kurgudaki video");
  ok("cakismadan sonra kaydetme: benim alanim yazildi, diger cihazin notu korundu", birlesik.revizyonNotu === "pencereden revizyon notu" && birlesik.not === "başka cihaz notu", JSON.stringify(birlesik));

  // Cakisma, bu sekmenin bilmedigi (baska cihazda eklenen) musteriye baglanmis kayitla: musteri secimde gorunur, kayit o musteride kalir
  await page.click(".satir-ad:has-text('Kurgudaki video')");
  d = page.locator("dialog[open]");
  var yeniMus = await apiCagir({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek Müşteri C", kurum: "", ucret: null, siklik: { tur: "belirsiz" }, slotTuru: "video", stokGirisi: false, not: "", arsiv: false } });
  var k2 = await icerikAl("Kurgudaki video");
  var v2 = Object.assign({}, k2, { musteriId: yeniMus.kayit.id, cekimId: null });
  ["id", "surum", "olusturma", "guncelleme"].forEach(function (k) { delete v2[k]; });
  await apiCagir({ islem: "kaydet", tur: "icerik", id: k2.id, surum: k2.surum, veri: v2 });
  await alanGirdi(d, "Not", "textarea").fill("yeni müşteriye taşındıktan sonra not");
  await d.locator("button[type=submit]").click();
  await d.locator(".hata:has-text('başka bir yerde değişti')").waitFor();
  var secilenMusteri = await alanGirdi(d, "Müşteri", "select").inputValue();
  ok("cakisma: baska cihazda eklenen musteri secimde gorunur ve secili", secilenMusteri === yeniMus.kayit.id, secilenMusteri + " / " + yeniMus.kayit.id);
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  var tasinan = await icerikAl("Kurgudaki video");
  ok("cakismadan sonra kayit yeni musteride kalir, not yazilir", tasinan.musteriId === yeniMus.kayit.id && tasinan.not === "yeni müşteriye taşındıktan sonra not", JSON.stringify(tasinan));

  // Kaydetme surerken pencere kapatilirsa hata kaybolmaz: bildirim gorunur
  await page.click(".satir-ad:has-text('Kurgudaki video')");
  d = page.locator("dialog[open]");
  var k3 = await icerikAl("Kurgudaki video");
  var v3 = Object.assign({}, k3, { not: "üçüncü cihaz" });
  ["id", "surum", "olusturma", "guncelleme"].forEach(function (k) { delete v3[k]; });
  await apiCagir({ islem: "kaydet", tur: "icerik", id: k3.id, surum: k3.surum, veri: v3 });
  var geciktir = async function (route) { if (/"islem":"toplu"/.test(route.request().postData() || "")) await bekle(900); await route.continue(); };
  await page.route("**/studio/v1/index.php", geciktir);
  await alanGirdi(d, "Revizyon notu", "textarea").fill("kapanan pencereden");
  await d.locator("button[type=submit]").click();
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog[open]", { state: "detached" });
  await page.waitForSelector(".toast:has-text('Kaydedilmedi')");
  await page.unroute("**/studio/v1/index.php", geciktir);
  ok("istek surerken kapanan pencerede hata bildirimle gosterilir", (await icerikAl("Kurgudaki video")).revizyonNotu !== "kapanan pencereden");

  // Pencere acikken kayit baska cihazda arsivlenir; cakismada form tazelenir. "Arşivle" dugmesi yine arsivler (tersini yapmaz)
  await page.click(".satir-ad:has-text('Kurgudaki video')");
  d = page.locator("dialog[open]");
  var k4 = await icerikAl("Kurgudaki video");
  var v4 = Object.assign({}, k4, { arsiv: true });
  ["id", "surum", "olusturma", "guncelleme"].forEach(function (k) { delete v4[k]; });
  await apiCagir({ islem: "kaydet", tur: "icerik", id: k4.id, surum: k4.surum, veri: v4 });
  await alanGirdi(d, "Not", "textarea").fill("arşivlenmeden önce not");
  await d.locator("button[type=submit]").click();
  await d.locator(".hata:has-text('başka bir yerde değişti')").waitFor();
  var arsivEtiketi = await d.locator("button.sol").textContent();
  await d.locator("button.sol").click();
  await page.waitForSelector(".toast:has-text('Kayıt zaten arşivde')");
  var arsivSonrasi = await icerikAl("Kurgudaki video");
  ok("cakismadan sonra 'Arşivle' etiketin tersini yapmaz (kayit arsivde kalir)", arsivEtiketi === "Arşivle" && arsivSonrasi.arsiv === true, arsivEtiketi + " " + JSON.stringify(arsivSonrasi.arsiv));
  var v5 = Object.assign({}, arsivSonrasi, { arsiv: false });
  ["id", "surum", "olusturma", "guncelleme"].forEach(function (k) { delete v5[k]; });
  await apiCagir({ islem: "kaydet", tur: "icerik", id: arsivSonrasi.id, surum: arsivSonrasi.surum, veri: v5 });
  await page.reload();
  await page.waitForSelector(".sayfa h1:has-text('İçerikler')");

  // Geri al, aradaki duzenlemeyi ezmez
  await page.locator(".satir:has-text('Çekimden reels 1') input[type=checkbox]").check();
  await page.locator(".toplu-cubuk select").selectOption("kurguda");
  await page.click("button:has-text('Durumu değiştir')");
  var ilkToast = page.locator(".toast:has-text('“Çekimden reels 1” → Kurguda')");
  await ilkToast.waitFor();
  await page.click(".satir-ad:has-text('Çekimden reels 1')");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Öncelik", "select").selectOption("yuksek");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  await ilkToast.locator("button:has-text('Geri al')").click();
  await page.waitForSelector(".toast:has-text('Geri alınamadı')");
  var korunan = await icerikAl("Çekimden reels 1");
  ok("geri al, aradaki duzenleme varsa yapilmaz (oncelik ve durum korunur)", korunan.oncelik === "yuksek" && korunan.durum === "kurguda", JSON.stringify(korunan));

  // Cift tiklama tek kayit olusturur
  var oncekiSayi = (await apiCagir({ islem: "veri" })).veri.icerikler.length;
  await page.click("text=+ Ekle");
  await page.click("dialog >> text=İçerik");
  d = page.locator("dialog[open]");
  var pk = await d.boundingBox();
  ok("pencere ekranin ortasinda (sol ust koseye yapisik degil)", pk && Math.abs(pk.x - (1280 - pk.width) / 2) < 4, JSON.stringify(pk));
  await alanGirdi(d, "Müşteri", "select").selectOption({ label: "Örnek Müşteri A" });
  await alanGirdi(d, "Başlık", "input").fill("Çift tık örneği");
  await d.locator("button[type=submit]").dblclick();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  await bekle(500);
  var sonrakiSayi = (await apiCagir({ islem: "veri" })).veri.icerikler.length;
  ok("cift tiklama: tek icerik olusur", sonrakiSayi === oncekiSayi + 1, oncekiSayi + " -> " + sonrakiSayi);

  // Yaniti kaybolan kaydetme: sunucu yazar ama yanit tarayiciya ulasmaz (zayif mobil baglanti). Yeniden "Kaydet"e
  // basmak ikinci kayit olusturmaz, yanlis "zaten var" / "baska yerde degisti" uyarisi da cikmaz.
  async function birYanitiKaybet() {
    var kullanildi = false;
    var isleyici = async function (route) {
      if (kullanildi || !/"islem":"(toplu|kaydet)"/.test(route.request().postData() || "")) return route.continue();
      kullanildi = true;
      await route.fetch(); // sunucu istegi isler ve yazar
      await route.abort("connectionreset");
      await page.unroute("**/studio/v1/index.php", isleyici);
    };
    await page.route("**/studio/v1/index.php", isleyici);
  }
  async function kayitSay(liste, alan, deger) { return (await apiCagir({ islem: "veri" })).veri[liste].filter(function (x) { return x[alan] === deger; }).length; }
  async function hizliPencere(secenek) {
    await page.click("text=+ Ekle");
    await page.click("dialog >> text=" + secenek);
    return page.locator("dialog[open]");
  }
  d = await hizliPencere("İçerik");
  await alanGirdi(d, "Müşteri", "select").selectOption({ label: "Örnek Müşteri A" });
  await alanGirdi(d, "Başlık", "input").fill("Kayıp yanıt içerik");
  await birYanitiKaybet();
  await d.locator("button[type=submit]").click();
  await d.locator(".hata:has-text('Sunucuya ulaşılamadı')").waitFor();
  var kayipIlk = await kayitSay("icerikler", "baslik", "Kayıp yanıt içerik");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  ok("yaniti kaybolan icerik: sunucu yazmisti, yeniden Kaydet ikinci kayit olusturmaz", kayipIlk === 1 && await kayitSay("icerikler", "baslik", "Kayıp yanıt içerik") === 1);

  d = await hizliPencere("İçerik");
  await alanGirdi(d, "Müşteri", "select").selectOption({ label: "Örnek Müşteri A" });
  await alanGirdi(d, "Başlık", "input").fill("Kayıp yanıt sonra not");
  await birYanitiKaybet();
  await d.locator("button[type=submit]").click();
  await d.locator(".hata:has-text('Sunucuya ulaşılamadı')").waitFor();
  await alanGirdi(d, "Not", "textarea").fill("ikinci denemede yazılan not");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  var sonNot = (await apiCagir({ islem: "veri" })).veri.icerikler.filter(function (x) { return x.baslik === "Kayıp yanıt sonra not"; });
  ok("yaniti kaybolan icerik, arada degisen alan: tek kayit, son hali yazilir", sonNot.length === 1 && sonNot[0].not === "ikinci denemede yazılan not", JSON.stringify(sonNot));

  d = await hizliPencere("Toplu içerik");
  await alanGirdi(d, "Müşteri", "select").selectOption({ label: "Örnek Müşteri A" });
  await alanGirdi(d, "Başlıklar", "textarea").fill("Kayıp toplu A\nKayıp toplu B\nKayıp toplu B");
  await birYanitiKaybet();
  await d.locator("button[type=submit]").click();
  await page.waitForSelector(".toast:has-text('Sunucuya ulaşılamadı')");
  // ikinci deneme bir dakika sonra: gecmis satirinin zamani degisir, sunucu ayni tekrari tanimaz (409); arayuz veriyi tazeler
  await page.clock.setFixedTime(new Date("2099-10-19T22:31:00Z"));
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  await page.clock.setFixedTime(new Date("2099-10-19T22:30:00Z"));
  ok("yaniti kaybolan toplu icerik: her satir bir kez (ayni baslikli iki satir iki kayit)", await kayitSay("icerikler", "baslik", "Kayıp toplu A") === 1 &&
    await kayitSay("icerikler", "baslik", "Kayıp toplu B") === 2 && await page.locator(".toast:has-text('3 içerik eklendi')").count() === 1);

  d = await hizliPencere("Müşteri");
  await alanGirdi(d, "Ad", "input").fill("Kayıp yanıt müşteri");
  await birYanitiKaybet();
  await d.locator("button[type=submit]").click();
  await d.locator(".hata:has-text('Sunucuya ulaşılamadı')").waitFor();
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("h1:has-text('Kayıp yanıt müşteri')");
  ok("yaniti kaybolan musteri: 'zaten var' hatasi yok, tek kayit", await kayitSay("musteriler", "ad", "Kayıp yanıt müşteri") === 1);

  await page.click("button:has-text('Stok girişi yap')");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Yayına hazır (onaylı, yayınlanmamış)", "textarea").fill("Kayıp stok 1\nKayıp stok 2");
  await birYanitiKaybet();
  await d.locator("button[type=submit]").click();
  await page.waitForSelector(".toast:has-text('Sunucuya ulaşılamadı')");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector(".toast:has-text('stok girişi tamamlandı')");
  ok("yaniti kaybolan stok girisi (musteri guncellemesiyle): tek seferde tamamlanir, ikinci kayit yok", await kayitSay("icerikler", "baslik", "Kayıp stok 1") === 1 &&
    await kayitSay("icerikler", "baslik", "Kayıp stok 2") === 1 && await page.locator("dialog[open]").count() === 0);

  d = await hizliPencere("Çekim / etkinlik");
  await alanGirdi(d, "Başlık", "input").fill("Kayıp yanıt çekim");
  await birYanitiKaybet();
  await d.locator("button[type=submit]").click();
  await d.locator(".hata:has-text('Sunucuya ulaşılamadı')").waitFor();
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  ok("yaniti kaybolan cekim: tek kayit", await kayitSay("etkinlikler", "baslik", "Kayıp yanıt çekim") === 1);

  await page.goto(URL_ + "#/icerikler?gorunum=liste");
  await page.waitForSelector(".sayfa h1:has-text('İçerikler')");
  await page.click(".satir-ad:has-text('Kayıp yanıt içerik')");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Not", "textarea").fill("düzenleme tekrarı");
  await birYanitiKaybet();
  await d.locator("button[type=submit]").click();
  await d.locator(".hata:has-text('Sunucuya ulaşılamadı')").waitFor();
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  ok("yaniti kaybolan duzenleme: yeniden Kaydet 'baska yerde degisti' demeden kapanir", (await page.locator(".toast:has-text('Kaydedildi')").count()) > 0 &&
    (await apiCagir({ islem: "veri" })).veri.icerikler.filter(function (x) { return x.baslik === "Kayıp yanıt içerik"; })[0].not === "düzenleme tekrarı");

  // Gune ozel paylasim turu (Cuma post)
  await page.goto(URL_ + "#/musteriler");
  await page.click("a:has-text('Örnek Müşteri B')");
  await page.click("button:has-text('Düzenle')");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Yayın sıklığı", "select").selectOption("haftalik");
  ok("gun secilmeden tur secimi gizli", !(await d.locator(".gun-secim:has-text('Cum') select").isVisible()));
  await d.locator(".gun-secim:has-text('Pzt') input").check();
  await d.locator(".gun-secim:has-text('Cum') input").check();
  await d.locator(".gun-secim:has-text('Cum') select").selectOption("post");
  await alanGirdi(d, "Haftada kaç paylaşım", "input").fill("3");
  await d.locator("button[type=submit]").click();
  await d.locator(".hata:has-text('en az 3 gün seç')").waitFor();
  ok("haftada 3 paylasim icin 2 gun secili: kaydetmeden once uyari", await d.isVisible());
  await alanGirdi(d, "Haftada kaç paylaşım", "input").fill("2");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("text=Haftada 2: Pzt, Cum (post)");
  ok("gune ozel tur kaydedildi ve gosterildi", true);

  // Ay gorunumunde ekleme: varsayilan tarih izgaranin onceki aydan gelen ilk hucresi degil, ayin 1'i
  await page.goto(URL_ + "#/cekim?g=ay&t=2031-05-15");
  await page.waitForSelector(".tk-donem:has-text('2031')");
  await page.click(".tk-arac button:has-text('Yeni')");
  var ayVarsayilan = await page.locator(".tk-acilir .soluk").first().textContent();
  ok("ay gorunumu: yeni isin tarihi o ayin 1'i", /^Perşembe, 1 Mayıs 2031/.test(ayVarsayilan), ayVarsayilan);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".tk-acilir", { state: "detached" });

  // Genel Bakis kartlarinin acacagi gorunumler: bugunden baslayan 7 gun; Stok sayfasi suzgeci
  await page.goto(URL_ + "#/cekim?g=hafta&t=2031-05-15&kayan=1");
  await page.waitForSelector(".tk-donem:has-text('2031')");
  var kayanIlk = await page.locator(".tk-gun-bas").first().textContent();
  ok("kayan hafta: verilen gunden baslar (pazartesiden degil)", /15/.test(kayanIlk) && (await page.locator(".tk-kolon").count()) === 7, kayanIlk);
  await page.goto(URL_ + "#/stok?f=giris");
  await page.waitForSelector(".sayfa h1:has-text('Stok')");
  ok("stok suzgeci: yalniz istenen musteriler ve 'Tüm müşteriler' baglantisi", await page.locator("text=Gösterilen: Stok girişi yapılmayanlar").isVisible() &&
    await page.locator(".sayfa a:has-text('Tüm müşteriler')").isVisible());

  // Gec isaretlenen yayin: dun planlanmis hazir icerik bugun "yayınlandı" yapilirken planlanan gun secilebilir, bugun sessizce yazilmaz
  var mAKayit = (await apiCagir({ islem: "veri" })).veri.musteriler.filter(function (x) { return x.ad === "Örnek Müşteri A"; })[0];
  function hazirIcerik(baslik, tur, plan) {
    return apiCagir({ islem: "kaydet", tur: "icerik", veri: { musteriId: mAKayit.id, baslik: baslik, tur: tur, durum: "hazir", oncelik: "normal", cekimId: null, teslimTarihi: null,
      planTarihi: plan, yayinTarihi: null, revizyonNotu: "", dosyalar: { ham: "", proje: "", final: "" }, not: "", gecmis: [], arsiv: false } });
  }
  await hazirIcerik("Dün paylaşılan reels", "reels", "2099-10-19");
  await hazirIcerik("Dün unutulan reels", "reels", "2099-10-19");
  await hazirIcerik("Cuma postu", "post", "2099-10-23"); // Cuma video gunu: post o gunu karsilamaz
  await page.goto(URL_ + "#/genel");
  await page.reload();
  var gecBolum = page.locator(".bolum:has-text('Planlanan tarihi geçti')");
  var gecSatir = gecBolum.locator(".satir:has-text('Dün paylaşılan reels')");
  await gecSatir.waitFor();
  ok("gecikmis plan satirinda 'Planlanan günde yayınlandı (19 Ekim)' ve 'Bugün yayınlandı' dugmeleri", await gecSatir.locator("button:has-text('Planlanan günde yayınlandı (19 Ekim)')").isVisible() &&
    await gecSatir.locator("button:has-text('Bugün yayınlandı')").isVisible());
  await gecSatir.locator("button:has-text('Planlanan günde yayınlandı')").click();
  var planToast = page.locator(".toast:has-text('“Dün paylaşılan reels” → Yayınlandı (19 Ekim Pzt)')");
  await planToast.waitFor();
  var planKayit = await icerikAl("Dün paylaşılan reels");
  ok("planlanan gunde yayinlandi: yayin tarihi planlanan gun (dun), bugun degil", planKayit.durum === "yayinlandi" && planKayit.yayinTarihi === "2099-10-19", JSON.stringify(planKayit));
  await planToast.locator("button:has-text('Geri al')").click();
  await page.waitForSelector(".toast:has-text('Geri alındı.')");
  planKayit = await icerikAl("Dün paylaşılan reels");
  ok("geri al: yine yayina hazir, yayin tarihi bos", planKayit.durum === "hazir" && !planKayit.yayinTarihi, JSON.stringify(planKayit));
  // Pencerede: Yayınlandı secilince gecmis planlanan gun tek tikla yayin tarihi olur
  await gecBolum.locator(".satir-ad:has-text('Dün paylaşılan reels')").click();
  d = page.locator("dialog[open]");
  var planGunDugme = d.locator("button:has-text('Planlanan gün: 19 Ekim 2099')");
  var gizliOnce = !(await planGunDugme.isVisible());
  await alanGirdi(d, "Durum", "select").selectOption("yayinlandi");
  var gorunur = await planGunDugme.isVisible();
  await planGunDugme.click();
  var secilenYayin = await alanGirdi(d, "Yayınlandığı tarih", "input").inputValue();
  ok("pencere: 'Planlanan gün' dugmesi yalniz Yayınlandı'da gorunur, tiklayinca yayin tarihini doldurur ve gizlenir", gizliOnce && gorunur && secilenYayin === "2099-10-19" && !(await planGunDugme.isVisible()), secilenYayin);
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("dialog[open]", { state: "detached" });
  ok("pencereden kaydedilen yayin tarihi planlanan gun", (await icerikAl("Dün paylaşılan reels")).yayinTarihi === "2099-10-19");
  await page.goto(URL_ + "#/yayin?g=gun&t=2099-10-19");
  await page.waitForSelector(".donem:has-text('19 Ekim 2099')");
  var dunYayinda = await page.locator(".t-oge.t-yayinlandi:has-text('Dün paylaşılan reels')").count();
  await page.goto(URL_ + "#/yayin?g=gun&t=2099-10-20");
  await page.waitForSelector(".donem:has-text('20 Ekim 2099')");
  ok("yayin takvimi: gec isaretlenen icerik paylasildigi gunde (19) gorunur, bugunde (20) gorunmez", dunYayinda === 1 && (await page.locator(".t-oge:has-text('Dün paylaşılan reels')").count()) === 0);
  // Toplu / surukleme yolu: bugun yazilir ama bildirim bunu soyler
  await page.goto(URL_ + "#/genel");
  await gecBolum.locator(".satir:has-text('Dün unutulan reels') button:has-text('Bugün yayınlandı')").click();
  var bugunToast = page.locator(".toast:has-text('“Dün unutulan reels” → Yayınlandı (yayın tarihi: bugün)')");
  await bugunToast.waitFor();
  ok("planlanan gunu gecmis icerik bugunle isaretlenince bildirim 'yayın tarihi: bugün' der", (await icerikAl("Dün unutulan reels")).yayinTarihi === "2099-10-20");
  await bugunToast.locator("button:has-text('Geri al')").click();
  await page.waitForSelector(".toast:has-text('Geri alındı.')");
  // Stok aciklamasi ve takvim metni: video gunune planli post sessizce kaybolmaz
  await page.goto(URL_ + "#/musteri/" + mAKayit.id);
  await page.waitForSelector("h1:has-text('Örnek Müşteri A')");
  var stokAciklama = await page.locator(".bolum:has-text('Stok ve yayın ihtiyacı')").textContent();
  ok("stok: video gunune planli hazir post aciklanir ('başka türde beklenen bir paylaşım gününe planlı')", /1 hazır içerik başka türde beklenen bir paylaşım gününe planlı \(o günü karşılamaz\)/.test(stokAciklama), stokAciklama);
  await page.goto(URL_ + "#/yayin?g=gun&t=2099-10-30");
  await page.waitForSelector(".donem:has-text('30 Ekim 2099')");
  var ihtiyacMetni = await page.locator(".t-oge.t-ihtiyac").allTextContents();
  ok("yayin takvimi: acik video gunu turuyle yazilir ('video günü, hazır video yok')", ihtiyacMetni.indexOf("Örnek Müşteri A: video günü, hazır video yok") !== -1, ihtiyacMetni.join(" | "));
  await page.goto(URL_ + "#/genel");
  await page.waitForSelector(".sayfa h1:has-text('Bugün ne yapmalıyım?')");
  ok("yedek indirildikten sonra Genel Bakis'ta hatirlatma yok", (await page.locator(".yedek-hatirlatma").count()) === 0);

  // Gunluk akis: tek tik sonraki durum, bugun paylasilacaklar, onay bekleme suresi, 5 satir + "tane daha", musteri basina acik gunler
  function yeniIcerik(o) {
    return apiCagir({ islem: "kaydet", tur: "icerik", veri: Object.assign({ musteriId: mAKayit.id, baslik: "", tur: "reels", durum: "fikir", oncelik: "normal", cekimId: null, teslimTarihi: null,
      planTarihi: null, yayinTarihi: null, revizyonNotu: "", dosyalar: { ham: "", proje: "", final: "" }, not: "", gecmis: [], arsiv: false }, o) });
  }
  await yeniIcerik({ baslik: "Onay bekleyen reels", durum: "onayda", gecmis: [{ z: "2099-10-16 10:00", m: "Kurguda → Müşteri onayında" }] });
  await yeniIcerik({ baslik: "Bugün paylaşılacak reels", durum: "hazir", planTarihi: "2099-10-20" });
  for (var gi = 1; gi <= 7; gi++) await yeniIcerik({ baslik: "Geciken teslim " + gi, durum: "kurguda", teslimTarihi: "2099-10-1" + gi });
  await apiCagir({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek Günlük Müşteri", kurum: "", ucret: null, siklik: { tur: "gunluk", haftalikAdet: null, gunler: [], baslangic: null },
    slotTuru: "video", stokUyari: null, stokGirisi: true, not: "", arsiv: false } });
  await page.reload();
  await page.waitForSelector(".sayfa h1:has-text('Bugün ne yapmalıyım?')");
  var onayBolum = page.locator("#gb-onayda");
  var onayIlk = await onayBolum.locator(".satir").first().textContent();
  ok("onay bekleme suresi: en uzun bekleyen ustte, '4 gündür onayda' (3 gunden itibaren uyari)", /Onay bekleyen reels/.test(onayIlk) && /4 gündür onayda/.test(onayIlk) &&
    (await onayBolum.locator(".satir").first().locator(".uyari:has-text('4 gündür onayda')").count()) === 1, onayIlk);
  ok("onaydaki satirda iki tek tik dugmesi (Onaylandı, Revizyon)", (await onayBolum.locator(".satir").first().locator("button.hizli").allTextContents()).join("|") === "→ Onaylandı|→ Revizyon");
  var gecikenBolum = page.locator("#gb-geciken");
  var gecikenSayi = await gecikenBolum.locator(".bolum-bas .sayi").textContent();
  ok("uzun bolum en cok 5 satir ve tiklanabilir '+N tane daha'", (await gecikenBolum.locator(".satir").count()) === 5 && (await gecikenBolum.locator("a:has-text('+" + (+gecikenSayi - 5) + " tane daha → listeyi aç')").count()) === 1, gecikenSayi);
  var acikBolum = page.locator("#gb-acik");
  var gunlukSatirlar = await acikBolum.locator(".satir:has-text('Örnek Günlük Müşteri')").allTextContents();
  ok("karsilanmayan paylasim gunleri musteri basina tek satir (gunluk musterinin 7 gunu)", gunlukSatirlar.length === 1 && gunlukSatirlar[0].split(",").length === 7 &&
    +(await acikBolum.locator(".bolum-bas .sayi").textContent()) >= 7, gunlukSatirlar.join(" / "));
  // Bugun paylasilacaklar: sayi acilan listeyle ayni; tek tik Yayınlandı + Geri al
  var paylasimBolum = page.locator("#gb-paylasim");
  var paylasimSayi = +(await paylasimBolum.locator(".bolum-bas .sayi").textContent());
  ok("bugun paylasilacaklar bolumu, ustte (bugunku cekimden hemen sonra)", paylasimSayi === 1 && await page.evaluate(function () {
    var b = [].map.call(document.querySelectorAll(".bolum[id^=gb-]"), function (x) { return x.id; });
    return b.indexOf("gb-paylasim") === b.indexOf("gb-bugun") + 1;
  }));
  await paylasimBolum.locator(".satir:has-text('Bugün paylaşılacak reels') button:has-text('→ Yayınlandı')").click();
  var paylasimToast = page.locator(".toast:has-text('“Bugün paylaşılacak reels” → Yayınlandı')");
  await paylasimToast.waitFor();
  var paylasilan = await icerikAl("Bugün paylaşılacak reels");
  ok("tek tik Yayınlandı: pencere acilmaz, yayin tarihi bugun, satir bolumden kalkar", paylasilan.durum === "yayinlandi" && paylasilan.yayinTarihi === "2099-10-20" &&
    (await page.locator("dialog[open]").count()) === 0 && (await page.locator("#gb-paylasim").count()) === 0, JSON.stringify(paylasilan));
  await paylasimToast.locator("button:has-text('Geri al')").click();
  await page.waitForSelector("#gb-paylasim .satir:has-text('Bugün paylaşılacak reels')");
  ok("geri al: yine yayina hazir", (await icerikAl("Bugün paylaşılacak reels")).durum === "hazir");
  await paylasimBolum.locator("text=Listeyi aç →").click();
  await page.waitForSelector(".sayfa h1:has-text('İçerikler')");
  ok("bugun paylasilacaklar listesi ayni sayida icerik acar", (await page.locator(".sayfa .satir, .sayfa .kart").count()) === paylasimSayi && /durum=hazir/.test(page.url()));
  await page.goto(URL_ + "#/genel");
  await page.locator("#gb-geciken a:has-text('tane daha')").click();
  await page.waitForSelector(".sayfa h1:has-text('İçerikler')");
  ok("'+N tane daha' ayni filtreli listeyi acar", /ozel=geciken/.test(page.url()) && (await page.locator(".sayfa .satir, .sayfa .kart").count()) === +gecikenSayi, page.url());
  // Liste: tek tik "Onaya gönder" + Geri al
  await page.goto(URL_ + "#/icerikler?gorunum=liste&q=Geciken teslim 1");
  await page.waitForSelector(".satir:has-text('Geciken teslim 1') button:has-text('→ Onaya gönder')");
  await page.click(".satir:has-text('Geciken teslim 1') button:has-text('→ Onaya gönder')");
  var hizliToast = page.locator(".toast:has-text('“Geciken teslim 1” → Müşteri onayında')");
  await hizliToast.waitFor();
  var hizliKayit = await icerikAl("Geciken teslim 1");
  ok("liste: tek tik sonraki durum (gecmise yazilir, pencere acilmaz)", hizliKayit.durum === "onayda" && hizliKayit.gecmis[hizliKayit.gecmis.length - 1].m === "Kurguda → Müşteri onayında" &&
    (await page.locator("dialog[open]").count()) === 0, JSON.stringify(hizliKayit.gecmis));
  await page.waitForSelector(".satir:has-text('Geciken teslim 1'):has-text('bugün onaya gitti')");
  await hizliToast.locator("button:has-text('Geri al')").click();
  await page.waitForSelector(".toast:has-text('Geri alındı.')");
  ok("liste: tek tik geri alinir", (await icerikAl("Geciken teslim 1")).durum === "kurguda");
  // Pano: kart dugmesi pencere acmaz, kart sutun degistirir
  await page.goto(URL_ + "#/icerikler?gorunum=pano");
  var onayKart = page.locator(".kart:has-text('Onay bekleyen reels')");
  ok("pano karti onay bekleme suresini gosterir", /4 gündür onayda/.test(await onayKart.textContent()));
  await onayKart.locator("button:has-text('→ Onaylandı')").click();
  await page.waitForSelector(".kolon[data-durum=hazir] .kart:has-text('Onay bekleyen reels')");
  ok("pano: kart dugmesi pencere acmadan durumu degistirir", (await page.locator("dialog[open]").count()) === 0 && (await icerikAl("Onay bekleyen reels")).durum === "hazir");

  // Toplu arsiv: 10+ icerikte once sorulur; arsiv gorunumunde toplu "Arşivden çıkar"; toplu geri alma bildirimi kapanana kadar durur
  for (var ai = 1; ai <= 12; ai++) await yeniIcerik({ baslik: "Arşiv örneği " + ai });
  await page.goto(URL_ + "#/icerikler?gorunum=liste&q=Arşiv örneği");
  await page.reload();
  await page.waitForSelector(".sayfa-bas:has-text('12 içerik')");
  await page.locator("label:has-text('Tümünü seç') input").check();
  await page.click(".toplu-cubuk button:has-text('Arşivle')");
  var arsivSoru = page.locator("dialog[open]:has-text('12 içerik arşivlenecek')");
  await arsivSoru.waitFor();
  await arsivSoru.locator("button:has-text('Vazgeç')").click();
  ok("toplu arsiv: 12 icerikte once sorulur, vazgecince arsivlenmez", !(await icerikAl("Arşiv örneği 1")).arsiv);
  await page.click(".toplu-cubuk button:has-text('Arşivle')");
  await arsivSoru.locator("button[type=submit]").click();
  var arsivToast = page.locator(".toast:has-text('12 içerik arşivlendi')");
  await arsivToast.waitFor();
  ok("toplu arsiv onaydan sonra yapilir", (await apiCagir({ islem: "veri" })).veri.icerikler.filter(function (x) { return /^Arşiv örneği/.test(x.baslik) && x.arsiv; }).length === 12);
  await page.goto(URL_ + "#/icerikler?gorunum=liste&arsiv=1&q=Arşiv örneği");
  await page.waitForSelector(".sayfa-bas:has-text('12 içerik')");
  ok("toplu durum: durum secilmeden 'Durumu değiştir' kapali", await page.locator(".toplu-cubuk button:has-text('Durumu değiştir')").isDisabled());
  // 3 yeni (eylemli, kalici olmayan) bildirim: tek icerikte uc durum degisikligi
  var ucDurum = [["kurguda", "Kurguda"], ["onayda", "Müşteri onayında"], ["hazir", "Yayına hazır"]];
  for (var ti = 0; ti < ucDurum.length; ti++) {
    await page.locator(".satir:has-text('Arşiv örneği 2') input[type=checkbox]").check();
    await page.locator(".toplu-cubuk select").selectOption(ucDurum[ti][0]);
    await page.click(".toplu-cubuk button:has-text('Durumu değiştir')");
    await page.waitForSelector(".toast:has-text('“Arşiv örneği 2” → " + ucDurum[ti][1] + "')");
  }
  await page.locator("label:has-text('Tümünü seç') input").check();
  ok("toplu geri alma bildirimi yeni bildirimlerle kalkmaz", await arsivToast.isVisible() && (await page.locator(".toast").count()) === 3);
  ok("arsiv gorunumunde toplu dugme 'Arşivden çıkar'", (await page.locator(".toplu-cubuk button:has-text('Arşivden çıkar')").count()) === 1 && (await page.locator(".toplu-cubuk button:text-is('Arşivle')").count()) === 0);
  await page.click(".toplu-cubuk button:has-text('Arşivden çıkar')");
  await page.waitForSelector(".toast:has-text('12 içerik arşivden çıkarıldı')");
  var cikanlar = (await apiCagir({ islem: "veri" })).veri.icerikler.filter(function (x) { return /^Arşiv örneği/.test(x.baslik); });
  ok("toplu arsivden cikar: hepsi geri geldi, gecmise yazildi", cikanlar.length === 12 && cikanlar.every(function (x) { return !x.arsiv && x.gecmis[x.gecmis.length - 1].m === "Arşivden çıkarıldı"; }));
  await page.goto(URL_ + "#/icerikler?gorunum=liste&q=Arşiv örneği 1");
  await page.waitForSelector(".sayfa-bas:has-text('4 içerik')"); // 1, 10, 11, 12
  await page.locator("label:has-text('Tümünü seç') input").check();
  await page.click(".toplu-cubuk button:has-text('Arşivle')");
  await page.waitForSelector(".toast:has-text('4 içerik arşivlendi')");
  ok("10'dan az icerik sormadan arsivlenir", (await page.locator("dialog[open]").count()) === 0);
  await page.goto(URL_ + "#/genel");
  await page.waitForSelector(".sayfa h1:has-text('Bugün ne yapmalıyım?')");

  // Olcek: uzun liste 200'er satir, secim yerinde guncellenir, Shift ile aralik secimi, eski yayinlananlar varsayilan gizli,
  // pano sutunu en cok 60 kart. Arama: liste sirasi, sessiz kesme yok, tum cekimlere erisilir.
  function icerikVeri(mid, o) {
    return Object.assign({ musteriId: mid, baslik: "", tur: "reels", durum: "fikir", oncelik: "normal", cekimId: null, teslimTarihi: null, planTarihi: null,
      yayinTarihi: null, revizyonNotu: "", dosyalar: { ham: "", proje: "", final: "" }, not: "", gecmis: [], arsiv: false }, o);
  }
  async function topluEkle(kayitlar) {
    for (var bi = 0; bi < kayitlar.length; bi += 400) {
      var j = await apiCagir({ islem: "toplu", kayitlar: kayitlar.slice(bi, bi + 400) });
      if (!j.ok) throw new Error("toplu ekleme: " + JSON.stringify(j).slice(0, 300));
    }
  }
  var olcekM = (await apiCagir({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek Ölçek Müşteri", kurum: "", ucret: null, siklik: { tur: "belirsiz" }, slotTuru: "video", stokGirisi: false, not: "", arsiv: false } })).kayit;
  var olcekK = [];
  for (var oi = 1; oi <= 230; oi++) olcekK.push({ tur: "icerik", veri: icerikVeri(olcekM.id, { baslik: "Ölçek fikir " + oi, planTarihi: "2099-11-" + String(1 + oi % 28).padStart(2, "0") }) });
  for (oi = 1; oi <= 30; oi++) olcekK.push({ tur: "icerik", veri: icerikVeri(olcekM.id, { baslik: "Ölçek eski yayın " + oi, durum: "yayinlandi", yayinTarihi: "2099-09-20" }) });
  for (oi = 1; oi <= 2; oi++) olcekK.push({ tur: "icerik", veri: icerikVeri(olcekM.id, { baslik: "Ölçek yeni yayın " + oi, durum: "yayinlandi", yayinTarihi: "2099-10-17" }) });
  await topluEkle(olcekK);
  await page.goto(URL_ + "#/icerikler?gorunum=liste&musteri=" + olcekM.id);
  await page.reload();
  await page.waitForSelector(".sayfa-bas:has-text('232 içerik')");
  var olcekDurum = await page.evaluate(function () {
    return { satir: document.querySelectorAll(".icerik-liste .satir").length, hepsi: document.querySelector(".icerik-liste > label.secenek").textContent,
      daha: (document.querySelector(".icerik-liste .daha-satir button") || {}).textContent, not: (document.querySelector(".eski-notu") || {}).textContent };
  });
  ok("uzun liste: ilk 200 satir, 'Daha fazla göster (32 içerik daha)', 'Tümünü seç (232)'", olcekDurum.satir === 200 && olcekDurum.daha === "Daha fazla göster (32 içerik daha)" &&
    olcekDurum.hepsi === "Tümünü seç (232)", JSON.stringify(olcekDurum));
  ok("14 gunden eski yayinlananlar varsayilan gizli ve sayisi yazar", /^30 eski yayınlanmış içerik gizli/.test(olcekDurum.not || "") &&
    (await page.locator(".satir:has-text('Ölçek eski yayın')").count()) === 0, olcekDurum.not);
  // Kutu tiklaninca liste yeniden cizilmez: satir dugumu ayni kalir, odak kutuda kalir, cubuk sayiyi gosterir
  await page.evaluate(function () { window.__ilkSatir = document.querySelector(".icerik-liste .satir"); });
  var kutular = page.locator(".icerik-liste .satir input[type=checkbox]");
  await kutular.nth(2).click();
  var yerinde = await page.evaluate(function () {
    var k = document.querySelectorAll(".icerik-liste .satir input[type=checkbox]")[2];
    return { ayni: window.__ilkSatir.isConnected, odak: document.activeElement === k, cubuk: document.querySelector(".toplu-cubuk:not([hidden]) b").textContent };
  });
  ok("secim yerinde guncellenir (liste yeniden cizilmez, odak kutuda)", yerinde.ayni && yerinde.odak && yerinde.cubuk === "1 seçili", JSON.stringify(yerinde));
  await kutular.nth(7).click({ modifiers: ["Shift"] });
  var araSecim = await page.evaluate(function () {
    return { cubuk: document.querySelector(".toplu-cubuk b").textContent, isaretli: [].map.call(document.querySelectorAll(".icerik-liste .satir input[type=checkbox]"), function (k, i) { return k.checked ? i : -1; }).filter(function (i) { return i >= 0; }).join(",") };
  });
  ok("Shift ile tiklama: aradaki satirlar da secilir (3. ile 8. arasi 6 secili)", araSecim.cubuk === "6 seçili" && araSecim.isaretli === "2,3,4,5,6,7", JSON.stringify(araSecim));
  ok("'Tümünü seç' kismi secimde ara durumda", await page.locator(".icerik-liste > label.secenek input").evaluate(function (k) { return k.indeterminate && !k.checked; }));
  await page.click(".toplu-cubuk button[aria-label='Seçimi temizle']");
  ok("Seçimi temizle: cubuk gizlenir, kutular bos", await page.locator(".toplu-cubuk").isHidden() && (await page.locator(".icerik-liste .satir input:checked").count()) === 0);
  await page.click(".icerik-liste .daha-satir button");
  await page.waitForFunction(function () { return document.querySelectorAll(".icerik-liste .satir").length === 232; });
  ok("'Daha fazla göster' kalanlari ekler, dugme kalkar", (await page.locator(".icerik-liste .daha-satir button").count()) === 0);
  await page.click(".eski-notu a:has-text('Göster')");
  await page.waitForSelector(".sayfa-bas:has-text('262 içerik')");
  ok("'Göster' ile eski yayinlananlar da listelenir (yeni filtre: yine ilk 200)", /eski=1/.test(page.url()) && (await page.locator(".eski-notu:has-text('Eski yayınlanmış içerikler de gösteriliyor')").count()) === 1 &&
    (await page.locator(".icerik-liste .daha-satir button").textContent()) === "Daha fazla göster (62 içerik daha)");
  await page.goto(URL_ + "#/icerikler?gorunum=liste&durum=yayinlandi&musteri=" + olcekM.id);
  await page.waitForSelector(".sayfa-bas:has-text('32 içerik')");
  ok("durum filtresi (Yayınlandı) eski yayinlananlari da gosterir", (await page.locator(".eski-notu").count()) === 0);
  await page.goto(URL_ + "#/icerikler?gorunum=pano&musteri=" + olcekM.id);
  await page.waitForSelector(".kolon[data-durum=fikir] .kart");
  var panoOlcek = await page.evaluate(function () {
    var k = document.querySelector(".kolon[data-durum=fikir]"), y = document.querySelector(".kolon[data-durum=yayinlandi]");
    return { kart: k.querySelectorAll(".kart").length, sayi: k.querySelector(".kolon-bas .sayi").textContent, link: (k.querySelector("a.kolon-daha") || {}).textContent, yayin: y.querySelectorAll(".kart").length };
  });
  ok("pano: sutunda en cok 60 kart, sayi gercek toplam, '+170 tane daha · listede aç'; eski yayinlananlar panoda da gizli", panoOlcek.kart === 60 && panoOlcek.sayi === "230" &&
    panoOlcek.link === "+170 tane daha · listede aç" && panoOlcek.yayin === 2, JSON.stringify(panoOlcek));
  await page.click(".kolon[data-durum=fikir] a.kolon-daha");
  await page.waitForSelector(".sayfa-bas:has-text('230 içerik')");
  ok("pano '+N tane daha' ayni filtreli listeyi acar", /gorunum=liste/.test(page.url()) && /durum=fikir/.test(page.url()), page.url());
  // Masaustunde girdiler eski boyutunda (telefondaki 16 px yalniz dar ekranda)
  await page.click(".icerik-liste .satir-ad >> nth=0");
  var masaustuGirdi = await page.evaluate(function () { return getComputedStyle(document.querySelector("dialog[open] .alan input[type=text]")).fontSize; });
  ok("masaustu: pencere girdileri 13 px kalir", masaustuGirdi === "13px", masaustuGirdi);
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog[open]", { state: "detached" });

  var aramaM = (await apiCagir({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek Arama Kafe", kurum: "", ucret: null, siklik: { tur: "belirsiz" }, slotTuru: "video", stokGirisi: false, not: "", arsiv: false } })).kayit;
  var aramaK = [];
  for (oi = 1; oi <= 105; oi++) aramaK.push({ tur: "icerik", veri: icerikVeri(aramaM.id, { baslik: "Kafe yayınlanan " + oi, durum: "yayinlandi", yayinTarihi: "2099-0" + (1 + oi % 9) + "-10" }) });
  for (oi = 1; oi <= 15; oi++) aramaK.push({ tur: "icerik", veri: icerikVeri(aramaM.id, { baslik: "Kafe güncel iş " + oi, durum: "kurguda", teslimTarihi: "2099-10-" + (21 + oi % 8) }) });
  for (oi = 1; oi <= 3; oi++) aramaK.push({ tur: "icerik", veri: icerikVeri(aramaM.id, { baslik: "Kafe arşivlenen " + oi, durum: "hazir", arsiv: true }) });
  function cekimVeri(baslik, tarih, durum) {
    return { tur: "etkinlik", veri: { musteriId: aramaM.id, baslik: baslik, tur: "cekim", tumGun: false, basTarih: tarih, basSaat: "10:00", bitTarih: null, bitSaat: "11:00", konum: "", not: "", durum: durum, arsiv: false } };
  }
  for (oi = 1; oi <= 55; oi++) aramaK.push(cekimVeri("Kafe geçmiş çekim " + oi, "2099-0" + (1 + oi % 9) + "-" + String(1 + oi % 28).padStart(2, "0"), "tamamlandi"));
  for (oi = 1; oi <= 3; oi++) aramaK.push(cekimVeri("Kafe yaklaşan çekim " + oi, "2099-11-0" + oi, "planlandi"));
  await topluEkle(aramaK);
  await page.reload();
  await page.waitForSelector(".sayfa h1");
  await page.fill("input.ara", "Örnek Arama Kafe");
  await page.waitForSelector("h1:has-text('Arama: Örnek Arama Kafe')");
  var aramaDurum = await page.evaluate(function () {
    var b = [].filter.call(document.querySelectorAll(".bolum"), function (x) { return /İçerikler/.test(x.querySelector("h2").textContent); })[0];
    var c = [].filter.call(document.querySelectorAll(".bolum"), function (x) { return /Çekim ve etkinlikler/.test(x.querySelector("h2").textContent); })[0];
    var satirlar = [].map.call(b.querySelectorAll(".satir"), function (x) { return x.textContent; });
    return { n: satirlar.length, ilk15: satirlar.slice(0, 15).every(function (t) { return /Kafe güncel iş/.test(t); }), daha: (b.querySelector(".daha-satir a") || {}).textContent,
      dahaSatir: (b.querySelector(".daha-satir") || {}).textContent, arsivLink: (b.querySelector(".daha-satir a[href*='arsiv=1']") || {}).textContent,
      cekim: c.querySelectorAll(".satir").length, ilkCekim: c.querySelector(".satir").textContent, cekimDaha: (c.querySelector("button.daha-satir") || {}).textContent };
  });
  ok("arama: icerikler liste sirasinda (15 guncel is ustte), 100 satir ve '+23 tane daha' (3'u arsivde)", aramaDurum.n === 100 && aramaDurum.ilk15 && aramaDurum.daha === "İçerikler listesinde aç (120)" &&
    aramaDurum.dahaSatir === "+23 tane daha → İçerikler listesinde aç (120) · arşivde 3", JSON.stringify(aramaDurum));
  ok("arama: arsivdeki eslesmeler ayri 'arşivde N' baglantisiyla erisilir", aramaDurum.arsivLink === "arşivde 3", JSON.stringify(aramaDurum));
  ok("arama: cekimler yaklasanlar once, 50 satir ve kalanlari gosteren dugme", aramaDurum.cekim === 50 && /Kafe yaklaşan çekim 1/.test(aramaDurum.ilkCekim) && aramaDurum.cekimDaha === "+8 tane daha göster", JSON.stringify(aramaDurum));
  await page.click("button.daha-satir:has-text('+8 tane daha göster')");
  ok("arama: 'tane daha göster' tum cekimleri acar", (await page.locator(".bolum:has-text('Çekim ve etkinlikler') .satir").count()) === 58);
  await page.click(".daha-satir a:has-text('arşivde 3')");
  await page.waitForSelector(".sayfa-bas:has-text('3 içerik')");
  ok("arama: 'arşivde 3' arsiv listesini ayni aramayla acar, sayi ayni (3)", /arsiv=1/.test(page.url()) && (await page.locator(".icerik-liste .satir").count()) === 3 &&
    (await page.locator(".icerik-liste .satir:has-text('Kafe arşivlenen')").count()) === 3, page.url());
  await page.goBack();
  await page.waitForSelector("h1:has-text('Arama: Örnek Arama Kafe')");
  await page.click(".daha-satir a:has-text('İçerikler listesinde aç')");
  await page.waitForSelector(".sayfa h1:has-text('İçerikler')");
  await page.waitForSelector(".sayfa-bas:has-text('120 içerik')");
  ok("arama: listede ac ayni aramayla 120 icerigi acar (sayi baglantidakiyle ayni), guncel isler ustte", /Kafe güncel iş/.test(await page.locator(".icerik-liste .satir").first().textContent()), page.url());
  // Satirin bos yerine tiklamak icerigi acar; secim kutusu acmaz
  var ilkSatir = page.locator(".icerik-liste .satir").first();
  var sk = await ilkSatir.boundingBox();
  await page.mouse.click(sk.x + sk.width / 2, sk.y + sk.height - 3); // satirin alt boslugu (dugme ya da baglanti degil)
  await page.waitForSelector("dialog[open]");
  ok("satirin bos yerine tiklamak icerigi acar", /Kafe güncel iş/.test(await alanGirdi(page.locator("dialog[open]"), "Başlık", "input").inputValue()));
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog[open]", { state: "detached" });
  await ilkSatir.locator(".sec-kutu").click();
  ok("secim kutusu cevresi yalniz secer, pencere acmaz", (await page.locator("dialog[open]").count()) === 0 && await ilkSatir.locator("input[type=checkbox]").isChecked());
  await page.click(".toplu-cubuk button[aria-label='Seçimi temizle']");
  // Takvim: masaustunde musteri secimi katlanmadan gorunur; ay hucresinin bos yerine tiklamak o gunu acar
  await page.goto(URL_ + "#/cekim?g=ay&t=2099-10-20");
  await page.waitForSelector(".tk-donem:has-text('Ekim 2099')");
  ok("masaustu takvim: musteri secimi katlanmadan gorunur", await page.locator(".tk-arac select[aria-label='Müşteri']").isVisible());
  var hucre = page.locator(".tk-ay .tk-hucre:not(.disari)").nth(14);
  var hk = await hucre.boundingBox();
  await page.mouse.click(hk.x + hk.width - 6, hk.y + hk.height - 6);
  await page.waitForFunction(function () { return /g=gun/.test(location.hash); });
  ok("ay hucresinin bos yerine tiklamak o gunu acar", /t=2099-10-15/.test(page.url()), page.url());

  // Cikis
  await page.click(".yan >> text=Çıkış");
  await page.waitForSelector("#studio-sifre");
  var yetkisiz = await page.evaluate(function () {
    return fetch("/studio/v1/index.php", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Studio": "1" }, body: JSON.stringify({ islem: "veri" }) })
      .then(function (r) { return r.status; });
  });
  ok("cikistan sonra API veri vermez (401)", yetkisiz === 401, yetkisiz);
  await page.goto(URL_ + "#/musteriler");
  await page.waitForSelector("#studio-sifre");
  ok("cikistan sonra adrese gitmek giris ister", !(await page.locator("text=Örnek Müşteri A").count()));
  ok("masaustu: konsol / sayfa hatasi yok", hatalar.length === 0, hatalar.join(" | "));
  await ctx.close();

  /* ================= Telefon ================= */
  var mctx = await tarayici.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, timezoneId: "Europe/Istanbul", locale: "tr-TR" });
  var mp = await mctx.newPage();
  var mhatalar = [];
  mp.on("pageerror", function (e) { mhatalar.push(String(e)); });
  await mp.clock.setFixedTime(new Date("2099-10-20T09:00:00Z"));
  await mp.goto(URL_);
  await mp.fill("#studio-sifre", SIFRE);
  await mp.click("button[type=submit]");
  await mp.waitForSelector(".menu-dugme");
    ok("telefon: menu dugmesi gorunur, yan menu kapali", await mp.locator(".menu-dugme").isVisible() && !(await mp.locator(".yan-menu").isVisible()));
  var tasmalar = [];
  for (var sayfa of ["genel", "musteriler", "icerikler", "cekim", "yayin", "stok", "ayarlar"]) {
    if (sayfa === "genel") await mp.goto(URL_ + "#/genel");
    else {
      await mp.click(".menu-dugme");
      await mp.locator(".yan-menu a[data-rota=" + sayfa + "]").click();
    }
    await mp.waitForFunction(function (r) { return location.hash.indexOf("#/" + r) === 0 && document.querySelector(".sayfa h1"); }, sayfa);
    await mp.waitForTimeout(150);
    var t = await mp.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; });
    if (t > 1) tasmalar.push(sayfa + ":" + t);
    if (EKRAN) await mp.screenshot({ path: path.join(EKRAN, "telefon-" + sayfa + ".png"), fullPage: true });
  }
  ok("telefon: 7 sayfada yatay tasma yok", tasmalar.length === 0, tasmalar.join(","));
  await mp.goto(URL_ + "#/genel");
  await mp.waitForSelector(".bolum:has-text('Planlanan tarihi geçti') .satir .sag button");
  var sagTasma = await mp.evaluate(function () {
    return [].filter.call(document.querySelectorAll(".satir .sag button"), function (b) { return b.getBoundingClientRect().right > 390; }).length; // telefon gorunumu 390 px (innerWidth tasan icerikle buyuyebilir)
  });
  ok("telefon: satir dugmeleri (Planlanan günde / Bugün yayınlandı) ekrana sigar, alt satira iner", sagTasma === 0, sagTasma);
  var hizliBoy = await mp.evaluate(function () {
    return [].map.call(document.querySelectorAll(".satir button.hizli"), function (b) { return Math.round(b.getBoundingClientRect().height); });
  });
  ok("telefon: tek tik durum dugmeleri parmak boyunda (en az 40 px)", hizliBoy.length > 3 && Math.min.apply(null, hizliBoy) >= 40, hizliBoy.join(","));
  ok("telefon: ozet dugmeleri var; yedek masaustunde indirildigi icin hatirlatma yok", (await mp.locator(".ozet-cipler .cip").count()) > 3 && (await mp.locator(".yedek-hatirlatma").count()) === 0);
  // acik menude, gosterilen sayfanin kendi baglantisina dokununca menu kapanir
  await mp.click(".menu-dugme");
  await mp.locator(".yan-menu a[data-rota=ayarlar]").click();
  // menu kapanirken .yan 0,18 sn kayar, gorunurluk ancak gecis bitince kalkar (studio.css): sabit 200 ms yerine gizlenmesini bekle
  await mp.locator(".yan-menu").waitFor({ state: "hidden", timeout: 5000 }).catch(function () {});
  ok("telefon: ayni sayfanin menu baglantisi menuyu kapatir", !(await mp.locator(".kabuk.menu-acik").count()) && !(await mp.locator(".yan-menu").isVisible()));
  await mp.click(".menu-dugme");
  await mp.locator(".yan-menu a[data-rota=musteriler]").click();
  await mp.waitForSelector(".sayfa h1:has-text('Müşteriler')");
  ok("telefon: masaustunde eklenen musteriler gorunur", await mp.locator("a:has-text('Örnek Müşteri A')").isVisible() && await mp.locator("a:has-text('Örnek Müşteri B')").isVisible());
  await mp.tap("text=+ Ekle");
  await mp.tap("dialog >> text=İçerik");
  var md = mp.locator("dialog[open]");
  await alanGirdi(md, "Müşteri", "select").selectOption({ label: "Örnek Müşteri B" });
  await alanGirdi(md, "Başlık", "input").fill("Telefondan içerik");
  var kutu = await md.boundingBox();
  ok("telefon: pencere ekrana sigar", kutu && kutu.width <= 390 && kutu.x >= 0, JSON.stringify(kutu));
  await md.locator("button[type=submit]").tap();
  await mp.waitForSelector("text=İçerik eklendi.");
  ok("telefon: icerik eklendi", true);

  // iPhone cilasi: 16 px girdiler (dokununca buyutme yok), pencere gorunur yukseklige sigar, parmak boyunda hedefler
  await mp.goto(URL_ + "#/icerikler?gorunum=liste&musteri=" + olcekM.id);
  await mp.waitForSelector(".sayfa-bas:has-text('232 içerik')");
  ok("telefon: arama kutusu 16 px", (await mp.locator(".ust .ara").evaluate(function (e) { return getComputedStyle(e).fontSize; })) === "16px");
  await mp.locator(".icerik-liste .satir-ad").first().tap();
  var mdlg = mp.locator("dialog[open]");
  await mdlg.waitFor();
  var mGirdi = await mp.evaluate(function () {
    var d = document.querySelector("dialog[open]");
    var boy = function (s) { return getComputedStyle(d.querySelector(s)).fontSize; };
    return { input: boy(".alan input[type=text]"), select: boy(".alan select"), textarea: boy(".alan textarea"), maks: parseFloat(getComputedStyle(d).maxHeight), ic: window.innerHeight,
      kapat: d.querySelector(".kapat").getBoundingClientRect().height };
  });
  ok("telefon: pencere girdileri 16 px, pencere gorunur yukseklige sigar, kapat dugmesi en az 40 px", mGirdi.input === "16px" && mGirdi.select === "16px" && mGirdi.textarea === "16px" &&
    mGirdi.maks <= mGirdi.ic - 24 && mGirdi.kapat >= 40, JSON.stringify(mGirdi));
  await mdlg.locator(".kapat").tap();
  await mp.waitForSelector("dialog[open]", { state: "detached" });
  var hedefBoy = await mp.evaluate(function () {
    var en = function (s) { return Math.min.apply(null, [].map.call(document.querySelectorAll(s), function (e) { return e.getBoundingClientRect().height; })); };
    return { menu: en(".menu-dugme"), kutu: en(".icerik-liste .sec-kutu"), hizli: en(".icerik-liste .btn.hizli") };
  });
  ok("telefon: menu dugmesi, secim kutusu alani ve satir dugmeleri en az 40 px", hedefBoy.menu >= 40 && hedefBoy.kutu >= 40 && hedefBoy.hizli >= 40, JSON.stringify(hedefBoy));
  // satirin bos yerine dokunmak icerigi acar
  var msk = await mp.locator(".icerik-liste .satir").nth(1).boundingBox();
  await mp.touchscreen.tap(msk.x + msk.width / 2, msk.y + msk.height - 3);
  await mp.waitForSelector("dialog[open]");
  ok("telefon: satirin bos yerine dokunmak icerigi acar", true);
  await mp.locator("dialog[open] .kapat").tap();
  await mp.waitForSelector("dialog[open]", { state: "detached" });
  // Toplu secim cubugu altta sabit: dokunulan satir yerinden oynamaz; durum secilmeden "Durumu değiştir" kapali
  var kutu15 = mp.locator(".icerik-liste .sec-kutu").nth(14);
  await kutu15.scrollIntoViewIfNeeded();
  var yOnce = (await kutu15.boundingBox()).y;
  await kutu15.tap();
  await mp.locator(".toplu-cubuk").waitFor();
  var cubukDurum = await mp.evaluate(function () {
    var c = document.querySelector(".toplu-cubuk"), r = c.getBoundingClientRect();
    return { konum: getComputedStyle(c).position, alt: r.bottom, ic: window.innerHeight, kapali: c.querySelector("button.birincil").disabled,
      x: getComputedStyle(c.querySelector(".secim-temizle .kisa-ad")).display !== "none" && getComputedStyle(c.querySelector(".secim-temizle .uzun-ad")).display === "none" };
  });
  var ySonra = (await kutu15.boundingBox()).y;
  ok("telefon: toplu cubuk altta sabit, secilen satir kaymaz, dar ekranda yalniz ×", Math.abs(ySonra - yOnce) <= 2 && cubukDurum.konum === "fixed" && cubukDurum.alt <= cubukDurum.ic &&
    cubukDurum.x && await kutu15.locator("input").isChecked(), yOnce + " -> " + ySonra + " " + JSON.stringify(cubukDurum));
  await mp.locator(".toplu-cubuk select").selectOption("kurguda");
  ok("telefon: 'Durumu değiştir' durum secilmeden kapali, secilince acik", cubukDurum.kapali && !(await mp.locator(".toplu-cubuk button.birincil").isDisabled()));
  await mp.locator(".toplu-cubuk button[aria-label='Seçimi temizle']").tap();
  ok("telefon: × secimi temizler, cubuk kalkar", await mp.locator(".toplu-cubuk").isHidden());
  // Geri tusu kalinan yere doner; yeni acilan sayfa en ustten baslar
  await mp.evaluate(function () { window.scrollTo(0, 3000); });
  var yGit = await mp.evaluate(function () { return window.scrollY; });
  await mp.evaluate(function () {
    var a = [].filter.call(document.querySelectorAll(".icerik-liste a[href^='#/musteri/']"), function (x) { var r = x.getBoundingClientRect(); return r.top > 120 && r.bottom < window.innerHeight - 160; })[0];
    a.setAttribute("data-test-hedef", "1");
  });
  await mp.locator("[data-test-hedef]").tap();
  await mp.waitForSelector(".sayfa h1:has-text('Örnek Ölçek Müşteri')");
  var yMusteri = await mp.evaluate(function () { return window.scrollY; });
  await mp.goBack();
  await mp.waitForSelector(".sayfa-bas:has-text('232 içerik')");
  var yDonus = await mp.evaluate(function () { return window.scrollY; });
  await mp.goForward();
  await mp.waitForSelector(".sayfa h1:has-text('Örnek Ölçek Müşteri')");
  var yIleri = await mp.evaluate(function () { return window.scrollY; });
  ok("telefon: geri tusu kalinan yere doner (yeni sayfa ve ileri en ustte)", yGit > 2000 && yMusteri === 0 && Math.abs(yDonus - yGit) <= 5 && yIleri === 0, [yGit, yMusteri, yDonus, yIleri].join(","));
  // Musteriler: tablo kart olur (Hazır video / Açık işler yana kaydirmadan gorunur); satira dokunup geri donunce konum kalir
  await mp.goto(URL_ + "#/musteriler");
  await mp.waitForSelector(".sayfa h1:has-text('Müşteriler')");
  var kartTablo = await mp.evaluate(function () {
    var k = document.querySelector(".tablo-kap"), hz = document.querySelectorAll("td[data-etiket='Hazır video']");
    return { tasma: k.scrollWidth - k.clientWidth, n: hz.length, icinde: [].every.call(hz, function (td) { return td.getBoundingClientRect().right <= window.innerWidth; }),
      baslik: getComputedStyle(document.querySelector("table.kartli thead")).display, metin: k.textContent };
  });
  ok("telefon: musteri tablosu kart: yana tasma yok, 'Hazır video' ekranda, 'Stok girişi yapılmadı' / 'Belirlenmedi' korunur", kartTablo.tasma <= 0 && kartTablo.n > 3 && kartTablo.icinde &&
    kartTablo.baslik === "none" && /Stok girişi yapılmadı/.test(kartTablo.metin) && /Belirlenmedi/.test(kartTablo.metin), JSON.stringify(kartTablo).slice(0, 300));
  await mp.evaluate(function () { window.scrollTo(0, document.documentElement.scrollHeight); });
  var yListe = await mp.evaluate(function () { return window.scrollY; });
  var sonHucre = mp.locator("tr.tik td[data-etiket='Açık işler']").last();
  await sonHucre.tap();
  await mp.waitForFunction(function () { return /#\/musteri\//.test(location.hash); });
  await mp.goBack();
  await mp.waitForSelector(".sayfa h1:has-text('Müşteriler')");
  var yListeDonus = await mp.evaluate(function () { return window.scrollY; });
  ok("telefon: musteri satirina dokunup geri donunce konum kalir", yListe > 100 && Math.abs(yListeDonus - yListe) <= 5, yListe + " -> " + yListeDonus);
  // Genel Bakis: musteri bazinda durum tablosu da kart
  await mp.goto(URL_ + "#/genel");
  await mp.waitForSelector(".tablo-katla");
  await mp.locator(".tablo-katla > summary").tap();
  var genelKart = await mp.evaluate(function () {
    var td = document.querySelectorAll(".tablo-katla td[data-etiket='Yayına hazır']");
    return { n: td.length, icinde: [].every.call(td, function (x) { var r = x.getBoundingClientRect(); return r.right <= window.innerWidth && r.width > 0; }), tire: /—/.test(document.querySelector(".tablo-katla table").textContent) };
  });
  ok("telefon: 'Müşteri bazında durum' kart, 'Yayına hazır' ekranda, stok bilinmeyende '—' korunur", genelKart.n > 0 && genelKart.icinde && genelKart.tire, JSON.stringify(genelKart));
  // Takvim: filtreler katlanir, icerik ustte baslar; ay hucresine dokunmak o gunu acar
  await mp.goto(URL_ + "#/yayin?g=gun");
  await mp.waitForSelector(".gun-liste");
  var takvimUst = await mp.evaluate(function () {
    return { liste: Math.round(document.querySelector(".gun-liste").getBoundingClientRect().top + window.scrollY), filtreAcik: document.querySelector(".takvim-filtre").open };
  });
  ok("telefon takvim: filtreler katli, liste ustte (320 px'ten once)", !takvimUst.filtreAcik && takvimUst.liste < 320, JSON.stringify(takvimUst));
  await mp.locator(".takvim-filtre > summary").tap();
  await mp.locator(".takvim-filtre select").selectOption({ label: "Örnek Müşteri A" });
  await mp.waitForFunction(function () { return /musteri=/.test(location.hash); });
  ok("telefon takvim: musteri secilince filtreler acik kalir", await mp.evaluate(function () { return document.querySelector(".takvim-filtre").open && /\(1\)/.test(document.querySelector(".takvim-filtre summary").textContent); }));
  await mp.goto(URL_ + "#/cekim?g=ay&t=2099-10-20");
  await mp.waitForSelector(".tk-tel-ust h1:has-text('Ekim 2099')");
  var mh = await mp.locator(".tk-ay .tk-hucre:not(.disari)").nth(14).boundingBox();
  await mp.touchscreen.tap(mh.x + mh.width / 2, mh.y + mh.height - 6);
  await mp.waitForFunction(function () { return /g=gun/.test(location.hash); }, null, { timeout: 5000 }).catch(function () {});
  ok("telefon takvim: ay hucresinin herhangi bir yerine dokunmak o gunu acar", /g=gun/.test(mp.url()) && /t=2099-10-15/.test(mp.url()), mp.url());
  // Stok: acil olanlar ustte (uyari > stok girisi yok > digerleri)
  await mp.goto(URL_ + "#/stok");
  await mp.waitForSelector(".stok-musteri");
  var stokSira = await mp.evaluate(function () {
    return [].map.call(document.querySelectorAll(".stok-musteri"), function (b) {
      return b.querySelector(".uyari-rozet") ? 0 : /Stok girişi yapılmadı/.test(b.textContent) ? 1 : 2;
    });
  });
  ok("stok sayfasi: acil olanlar ustte (uyari, sonra stok girisi yok, sonra digerleri)", stokSira[0] === 0 && stokSira.indexOf(2) !== -1 && stokSira.indexOf(1) !== -1 &&
    stokSira.every(function (x, i) { return !i || stokSira[i - 1] <= x; }), stokSira.join(","));
  ok("telefon: sayfa hatasi yok", mhatalar.length === 0, mhatalar.join(" | "));
  await mctx.close();

  /* ================= Metin, dogrulama, cekim sonrasi ve revizyon (masaustu, Istanbul 12:00) ================= */
  var tctx = await tarayici.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: "Europe/Istanbul", locale: "tr-TR" });
  var tp = await tctx.newPage();
  var thatalar = [];
  tp.on("pageerror", function (e) { thatalar.push(String(e)); });
  await tp.clock.setFixedTime(new Date("2099-10-20T09:00:00Z"));
  await tp.goto(URL_);
  await tp.waitForSelector("#studio-sifre");
  // Sifremi unuttum yardimi ve kilit mesaji (kilit sunucu yaniti taklit edilir: gercek kilit sonraki girisleri bozardi)
  await tp.click(".giris-kart summary:has-text('Şifreni mi unuttun?')");
  ok("giris: 'Şifreni mi unuttun?' acilir, verinin silinmedigini ve kurulum notunu soyler", await tp.locator(".sifre-yardim:has-text('Verilerin silinmez')").isVisible() &&
    /e-postayla sıfırlanmaz/.test(await tp.locator(".sifre-yardim").textContent()));
  await tp.route("**/studio/v1/index.php", function (rt) {
    var g = JSON.parse(rt.request().postData() || "{}");
    if (g.islem === "giris") return rt.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, hata: "kilit", mesaj: "Çok fazla hatalı deneme. Biraz sonra yeniden dene." }) });
    return rt.continue();
  });
  await tp.fill("#studio-sifre", "yanlis-sifre-111");
  await tp.click("button[type=submit]");
  await tp.waitForSelector(".giris-kart .hata:has-text('Çok fazla')");
  ok("kilit mesaji ne kadar beklenecegini soyler (15 dakika)", /15 dakika/.test(await tp.locator(".giris-kart .hata").textContent()), await tp.locator(".giris-kart .hata").textContent());
  await tp.unroute("**/studio/v1/index.php");
  await tp.fill("#studio-sifre", SIFRE);
  await tp.click("button[type=submit]");
  await tp.waitForSelector(".yan-menu");
  async function tApi(g) {
    return tp.evaluate(function (g) {
      return fetch("/studio/v1/index.php", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Studio": "1" }, body: JSON.stringify(g) })
        .then(function (r) { return r.json(); });
    }, g);
  }
  // Takvimde gun gorunumunde kaydin kartina (ya da tum gun seridine) tiklar, ayrintidan tam pencereyi acar; gece saatindeki is icin gece acilir
  async function takvimdeAc(gun, baslik) {
    await tp.goto(URL_ + "#/cekim?g=gun&t=" + gun);
    await tp.waitForSelector(".tk-kaydirma");
    var sec = ".tk-kart:has-text('" + baslik + "'), .tk-serit.etk:has-text('" + baslik + "')";
    if (!(await tp.locator(sec).count()) && await tp.locator(".tk-gece-ipucu").count()) await tp.locator(".tk-gece-ipucu").first().click();
    await tp.locator(sec).first().click();
    await tp.click(".tk-acilir button:has-text('Düzenle')");
    await tp.waitForSelector("dialog[open]");
  }
  async function tKayit(liste, baslik) { return (await tApi({ islem: "veri" })).veri[liste].filter(function (x) { return (x.baslik || x.ad) === baslik; })[0]; }
  var tid = function (k) { return (k + "metintest000000").slice(0, 16); };
  var tMus = function (id, ad) { return { tur: "musteri", id: id, veri: { ad: ad, kurum: "", ucret: null, siklik: { tur: "belirsiz" }, slotTuru: "video", stokGirisi: false, not: "", arsiv: false } }; };
  var tEtk = function (id, o) {
    return { tur: "etkinlik", id: id, veri: Object.assign({ musteriId: tid("mx"), tur: "cekim", tumGun: false, basSaat: "10:00", bitSaat: "12:00", konum: "", not: "", durum: "planlandi", arsiv: false }, o) };
  };
  var tIc = function (o) {
    return { tur: "icerik", veri: Object.assign({ musteriId: tid("mx"), tur: "reels", durum: "fikir", oncelik: "normal", cekimId: null, teslimTarihi: null, planTarihi: null, yayinTarihi: null,
      revizyonNotu: "", dosyalar: { ham: "", proje: "", final: "" }, not: "", gecmis: [], arsiv: false }, o) };
  };
  var tk = await tApi({ islem: "toplu", kayitlar: [tMus(tid("mx"), "Metin Müşteri X"), tMus(tid("my"), "Metin Müşteri Y")] });
  var tk2 = await tApi({ islem: "toplu", kayitlar: [
    tEtk(tid("ebagli"), { baslik: "Metin bağlı çekim", basTarih: "2099-10-28", bitTarih: "2099-10-28" }),
    tEtk(tid("earsiv"), { baslik: "Arşiv bağlı çekim", basTarih: "2099-10-29", bitTarih: "2099-10-29" }),
    tEtk(tid("eiki"), { baslik: "İki günlük metin çekimi", tumGun: true, basSaat: null, bitSaat: null, basTarih: "2099-11-02", bitTarih: "2099-11-03" }),
    tEtk(tid("etek"), { baslik: "Tek günlük metin çekimi", basTarih: "2099-11-10", bitTarih: "2099-11-10" }),
    tEtk(tid("egece"), { baslik: "Gece metin çekimi", basTarih: "2099-11-05", basSaat: "22:00", bitTarih: "2099-11-06", bitSaat: "02:00" }),
    tEtk(tid("edun"), { baslik: "Dünkü metin çekimi", basTarih: "2099-10-19", bitTarih: "2099-10-19" }),
    tEtk(tid("etop"), { baslik: "Dünkü metin toplantısı", tur: "toplanti", basTarih: "2099-10-19", basSaat: "13:00", bitTarih: "2099-10-19", bitSaat: "14:00" }),
    tEtk(tid("edig"), { baslik: "Dünkü metin etkinliği", tur: "diger", basTarih: "2099-10-19", basSaat: "15:00", bitTarih: "2099-10-19", bitSaat: "16:00" }),
    tEtk(tid("esabah"), { baslik: "Sabah metin çekimi", basTarih: "2099-10-20", basSaat: "08:00", bitTarih: "2099-10-20", bitSaat: "10:00" })] });
  var tk3 = await tApi({ islem: "toplu", kayitlar: [
    tIc({ baslik: "Metin bağlı içerik", durum: "cekim_planlandi", cekimId: tid("ebagli") }),
    tIc({ baslik: "Arşivdeki bağlı içerik", durum: "cekim_planlandi", cekimId: tid("earsiv"), arsiv: true }),
    tIc({ baslik: "Unutulan metin içeriği", durum: "cekim_planlandi", cekimId: tid("edun") }),
    tIc({ baslik: "Revizyon metin içeriği", durum: "onayda", teslimTarihi: "2099-10-14" })] });
  ok("metin testi verisi kuruldu", tk.ok && tk2.ok && tk3.ok, JSON.stringify([tk, tk2, tk3]).slice(0, 300));
  await tp.reload();
  await tp.waitForSelector(".yan-menu");

  // Icerigin musterisi degisince baska musterinin cekimine bag kalmaz (eskiden sunucu reddederdi)
  await tp.goto(URL_ + "#/icerikler?gorunum=liste&q=Metin bağlı");
  await tp.click(".satir-ad:has-text('Metin bağlı içerik')");
  var td = tp.locator("dialog[open]");
  await alanGirdi(td, "Müşteri", "select").selectOption(tid("my"));
  ok("icerik: musteri degisince baska musterinin cekimi secimden duser, nedeni yazar", (await alanGirdi(td, "Bağlı çekim", "select").inputValue()) === "" &&
    await td.locator("small.uyari:has-text('bağ kaldırıldı')").isVisible());
  await td.locator("button[type=submit]").click();
  await tp.waitForSelector("dialog[open]", { state: "detached", timeout: 5000 }).catch(function () {});
  var tBagli = await tKayit("icerikler", "Metin bağlı içerik");
  ok("icerik: yeni musteriyle kaydedilir, bag kaldirilir (sunucu hatasi yok)", tBagli.musteriId === tid("my") && tBagli.cekimId === null, JSON.stringify(tBagli));

  // Cekimin musterisi: arsivdeki bagli icerik de engeller; ne yapilacagi Turkce ve icerik adiyla yazar
  await takvimdeAc("2099-10-29", "Arşiv bağlı çekim");
  td = tp.locator("dialog[open]");
  await alanGirdi(td, "Müşteri", "select").selectOption(tid("my"));
  await td.locator("button[type=submit]").click();
  await td.locator(".hata:has-text('Bağlı çekim')").waitFor({ timeout: 5000 }).catch(function () {});
  var tHata = await td.locator(".hata").textContent();
  ok("cekim: baska musterinin (arsivdeki) icerigi bagliyken musteri degismez; ad ve '(arşivde)' yazar", /Arşivdeki bağlı içerik/.test(tHata) && /arşivde/.test(tHata) &&
    (await tKayit("etkinlikler", "Arşiv bağlı çekim")).musteriId === tid("mx"), tHata);
  await td.locator("button:has-text('Vazgeç')").click();
  await tp.locator("dialog[open] button:has-text('Kaydetmeden kapat')").click();
  await tp.waitForSelector("dialog[open]", { state: "detached" });

  // Musteri stok esigi 999'dan buyuk: sunucuya gitmeden anlasilir uyari
  await tp.goto(URL_ + "#/musteri/" + tid("mx"));
  await tp.click(".sayfa-bas button:has-text('Düzenle')");
  td = tp.locator("dialog[open]");
  await alanGirdi(td, "Stok uyarı eşiği (beklenen türde hazır içerik)", "input").fill("1500");
  await td.locator("button[type=submit]").click();
  ok("musteri: esik 1500 -> '0 ile 999 arasında olmalı (boş = varsayılan)'", /0 ile 999 arasında olmalı \(boş = varsayılan\)/.test(await td.locator(".hata").textContent()));
  await td.locator("button.kapat").click();
  await tp.locator("dialog[open] button:has-text('Kaydetmeden kapat')").click();
  await tp.waitForSelector("dialog[open]", { state: "detached" });

  // Cekimin baslangic gunu degisince sure korunur
  async function cekimTasi(gun, baslik, yeniBas) {
    await takvimdeAc(gun, baslik);
    var d_ = tp.locator("dialog[open]");
    await alanGirdi(d_, "Başlangıç tarihi", "input").fill(yeniBas);
    var bit = await alanGirdi(d_, "Bitiş tarihi", "input").inputValue();
    await d_.locator("button[type=submit]").click();
    await tp.waitForSelector("dialog[open]", { state: "detached", timeout: 5000 }).catch(function () {});
    var k = await tKayit("etkinlikler", baslik);
    return { formBit: bit, bas: k.basTarih, bit: k.bitTarih, hata: (await tp.locator("dialog[open] .hata").count()) ? await tp.locator("dialog[open] .hata").textContent() : "" };
  }
  var tasi = await cekimTasi("2099-11-02", "İki günlük metin çekimi", "2099-11-03");
  ok("iki gunluk tum gun cekim bir gun ileri: yine iki gun (3-4 Kasım)", tasi.formBit === "2099-11-04" && tasi.bas === "2099-11-03" && tasi.bit === "2099-11-04", JSON.stringify(tasi));
  tasi = await cekimTasi("2099-11-10", "Tek günlük metin çekimi", "2099-11-09");
  ok("tek gunluk saatli cekim bir gun geri: 26 saate uzamaz", tasi.bas === "2099-11-09" && tasi.bit === "2099-11-09", JSON.stringify(tasi));
  await tp.goto(URL_ + "#/cekim?g=hafta&t=2099-11-09&kayan=1");
  await tp.waitForSelector(".tk-kart");
  ok("haftada tek gunde gorunur", (await tp.locator(".tk-kart:has-text('Tek günlük metin çekimi')").count()) === 1);
  tasi = await cekimTasi("2099-11-05", "Gece metin çekimi", "2099-11-06");
  ok("gece yarisini asan cekim baska gune tasinir (bitis ertesi gun)", tasi.bas === "2099-11-06" && tasi.bit === "2099-11-07" && !tasi.hata, JSON.stringify(tasi));
  await tp.click("text=+ Ekle");
  await tp.click("dialog >> text=Çekim / etkinlik");
  td = tp.locator("dialog[open]");
  await alanGirdi(td, "Başlık", "input").fill("Yeni gece çekimi");
  await alanGirdi(td, "Başlangıç saati", "input").fill("22:00");
  await alanGirdi(td, "Bitiş saati", "input").fill("02:00");
  await td.locator("button[type=submit]").click();
  ok("yeni 22:00-02:00 cekim: bitis tarihini ertesi gun yapma ipucu", /ertesi gün \(21 Ekim\)/.test(await td.locator(".hata").textContent()), await td.locator(".hata").textContent());
  // Masaustunde yili iki haneli yazilan tarih (0026) kaydedilmez
  await alanGirdi(td, "Bitiş saati", "input").fill("23:00");
  await alanGirdi(td, "Başlangıç tarihi", "input").evaluate(function (e) { e.value = "0026-10-20"; });
  await td.locator("button[type=submit]").click();
  ok("cekim: yili iki haneli baslangic tarihi icin acik uyari", /yıl 4 haneli/.test(await td.locator(".hata").textContent()), await td.locator(".hata").textContent());
  await td.locator("button.kapat").click();
  await tp.locator("dialog[open] button:has-text('Kaydetmeden kapat')").click();
  await tp.waitForSelector("dialog[open]", { state: "detached" });
  await tp.click("text=+ Ekle");
  await tp.click("dialog >> text=Tek içerik kartı");
  td = tp.locator("dialog[open]");
  await alanGirdi(td, "Müşteri", "select").selectOption(tid("mx"));
  await alanGirdi(td, "Başlık", "input").fill("İki haneli yıl içeriği");
  await alanGirdi(td, "Planlanan yayın tarihi", "input").evaluate(function (e) { e.value = "0026-10-21"; });
  await td.locator("button[type=submit]").click();
  await bekle(300);
  ok("icerik: 0026 yilli tarih kaydedilmez, uyari gorunur", /yıl 4 haneli/.test(await td.locator(".hata").textContent()) && !(await tKayit("icerikler", "İki haneli yıl içeriği")),
    await td.locator(".hata").textContent());
  await td.locator("button.kapat").click();
  await tp.locator("dialog[open] button:has-text('Kaydetmeden kapat')").click();
  await tp.waitForSelector("dialog[open]", { state: "detached" });

  // Toplanti / diger etkinlik "Tamamlandı": icerik cikmaz, "İçerik ekle" / "Çekildi yap" teklifi gosterilmez (yalniz geri al bildirimi)
  await tp.goto(URL_ + "#/genel");
  for (var tTur of [["Dünkü metin toplantısı", "toplanti"], ["Dünkü metin etkinliği", "diger"]]) {
    await tp.locator(".bolum:has-text('Durumu güncellenmemiş geçmiş çekim ve etkinlikler') .satir:has-text('" + tTur[0] + "') button:has-text('Tamamlandı')").click();
    await tp.waitForSelector(".toast:has-text('" + tTur[0] + "” → Tamamlandı')");
    await bekle(300);
    ok("tur " + tTur[1] + " tamamlandi: 'İçerik ekle' / 'Çekildi yap' teklifi yok, geri al var", (await tp.locator(".toast:has-text('" + tTur[0] + "” tamamlandı.')").count()) === 0 &&
      (await tp.locator(".toast:has-text('" + tTur[0] + "') button:has-text('İçerik ekle')").count()) === 0 && (await tp.locator(".toast:has-text('" + tTur[0] + "') button:has-text('Geri al')").count()) === 1);
    var tKay = await tKayit("etkinlikler", tTur[0]);
    ok("tur " + tTur[1] + " tamamlandi: tamamlanma ani yazilir", tKay.durum === "tamamlandi" && /^2099-10-20 \d\d:\d\d$/.test(tKay.tamamZaman || ""), JSON.stringify(tKay));
  }
  // Cekim "Tamamlandı": bagli icerigi tek tikla "Çekildi" yapma teklifi; unutulursa Genel Bakis'ta gorunur
  await tp.goto(URL_ + "#/genel");
  var dunSatir = tp.locator(".bolum:has-text('Durumu güncellenmemiş geçmiş çekim ve etkinlikler') .satir:has-text('Dünkü metin çekimi')");
  await dunSatir.locator("button:has-text('Tamamlandı')").click();
  var cekToast = tp.locator(".toast:has-text('Dünkü metin çekimi” tamamlandı')");
  await cekToast.waitFor();
  ok("tamamlandi bildirimi: 'Bağlı 1 içeriği “Çekildi” yap' ve 'İçerik ekle'", (await cekToast.locator("button.btn").allTextContents()).join("|") === "Bağlı 1 içeriği “Çekildi” yap|İçerik ekle",
    (await cekToast.locator("button.btn").allTextContents()).join("|"));
  ok("genel bakis: cekimi tamamlanip 'Çekildi' yapilmayan icerik listelenir", await tp.locator("#gb-cekimbitti .satir:has-text('Unutulan metin içeriği')").isVisible());
  await tp.click("#gb-cekimbitti >> text=Listeyi aç →");
  await tp.waitForSelector(".sayfa h1:has-text('İçerikler')");
  ok("liste: ayni filtre ('Çekimi tamamlandı …') yalniz unutulan icerigi acar", /ozel=cekimbitti/.test(tp.url()) && (await tp.locator(".sayfa .satir, .sayfa .kart").count()) === 1);
  await cekToast.locator("button:has-text('Çekildi')").click();
  await tp.waitForSelector(".toast:has-text('Unutulan metin içeriği” → Çekildi')");
  var unut = await tKayit("icerikler", "Unutulan metin içeriği");
  ok("tek tik: bagli icerik 'Çekildi' (gecmise yazilir)", unut.durum === "cekildi" && /Çekim planlandı → Çekildi/.test(unut.gecmis[unut.gecmis.length - 1].m), JSON.stringify(unut));
  await tp.goto(URL_ + "#/genel");
  await tp.waitForSelector(".sayfa h1");
  ok("genel bakis: 'Çekildi' yapilinca bolum kalkar", (await tp.locator("#gb-cekimbitti").count()) === 0);
  var sabah = tp.locator(".bolum:has-text('Bugün: çekim ve etkinlikler') .satir:has-text('Sabah metin çekimi')");
  ok("bugun bitmis cekimde 'Tamamlandı' dugmesi (yarini beklemez)", (await sabah.locator("button:has-text('Tamamlandı')").count()) === 1);
  await sabah.locator("button:has-text('Tamamlandı')").click();
  await tp.locator(".toast:has-text('Sabah metin çekimi” tamamlandı') button:has-text('İçerik ekle')").click();
  td = tp.locator("dialog[open]");
  await td.waitFor();
  ok("'İçerik ekle' cekimden toplu ekleme penceresini acar (cekim secili, durum Çekildi)", (await alanGirdi(td, "Bağlı çekim", "select").inputValue()) === tid("esabah") &&
    (await alanGirdi(td, "Durum", "select").inputValue()) === "cekildi");
  await td.locator("button:has-text('Vazgeç')").click();
  await tp.waitForSelector("dialog[open]", { state: "detached" });

  // Revizyon: not ve yeni teslim tarihi bir kerede; not listede gorunur, eski notlar gecmiste kalir
  await tp.goto(URL_ + "#/icerikler?gorunum=liste&q=Revizyon metin");
  var revSatir = tp.locator(".satir:has-text('Revizyon metin içeriği')");
  await revSatir.locator("button:has-text('→ Revizyon')").click();
  td = tp.locator("dialog[open]");
  await td.waitFor();
  ok("revizyon penceresi: onceki (gecmis) teslim tarihi gosterilir, yeni tarih bos", /Önceki teslim tarihi: 14 Ekim 2099 \(geçti\)/.test(await td.textContent()) &&
    (await alanGirdi(td, "Revizyon teslim tarihi", "input").inputValue()) === "");
  await td.locator("button:has-text('Vazgeç')").click();
  await tp.waitForSelector("dialog[open]", { state: "detached" });
  ok("revizyon: Vazgeç durumu degistirmez", (await tKayit("icerikler", "Revizyon metin içeriği")).durum === "onayda");
  await revSatir.locator("button:has-text('→ Revizyon')").click();
  td = tp.locator("dialog[open]");
  await alanGirdi(td, "Ne düzeltilecek?", "textarea").fill("Müzik değişsin");
  await alanGirdi(td, "Revizyon teslim tarihi", "input").fill("2099-10-22");
  await td.locator("button[type=submit]").click();
  await tp.waitForSelector(".toast:has-text('Revizyon metin içeriği” → Revizyonda')");
  var rev = await tKayit("icerikler", "Revizyon metin içeriği");
  ok("revizyon: durum, not ve yeni teslim tarihi tek seferde; not gecmise metniyle", rev.durum === "revizyonda" && rev.revizyonNotu === "Müzik değişsin" && rev.teslimTarihi === "2099-10-22" &&
    rev.gecmis.some(function (x) { return x.m === "Revizyon notu: Müzik değişsin"; }), JSON.stringify(rev));
  ok("revizyon notu listede gorunur", await tp.locator(".satir:has-text('Revizyon metin içeriği') .rev-not:has-text('Revizyon: Müzik değişsin')").isVisible());
  await tp.goto(URL_ + "#/genel");
  await tp.waitForSelector(".sayfa h1");
  ok("yeni teslim tarihiyle revizyon 'Geciken kurgu teslimleri'ne dusmez", (await tp.locator(".bolum:has-text('Geciken kurgu teslimleri') .satir:has-text('Revizyon metin içeriği')").count()) === 0 &&
    (await tp.locator("#gb-revizyon .satir:has-text('Revizyon metin içeriği')").count()) === 1);
  await tp.goto(URL_ + "#/icerikler?gorunum=liste&q=Revizyon metin");
  await tp.locator(".satir:has-text('Revizyon metin içeriği') button:has-text('→ Onaya gönder')").click();
  await tp.waitForSelector(".toast:has-text('→ Müşteri onayında')");
  await tp.locator(".satir:has-text('Revizyon metin içeriği') button:has-text('→ Revizyon')").click();
  td = tp.locator("dialog[open]");
  await alanGirdi(td, "Ne düzeltilecek?", "textarea").fill("Logo büyüsün");
  await td.locator("button[type=submit]").click();
  await tp.waitForSelector("dialog[open]", { state: "detached" });
  rev = await tKayit("icerikler", "Revizyon metin içeriği");
  ok("ikinci revizyon: yeni not kayitta, ilk not gecmiste; tarih bos birakilinca degismez", rev.revizyonNotu === "Logo büyüsün" && rev.teslimTarihi === "2099-10-22" &&
    rev.gecmis.some(function (x) { return x.m === "Revizyon notu: Müzik değişsin"; }) && rev.gecmis.some(function (x) { return x.m === "Revizyon notu: Logo büyüsün"; }), JSON.stringify(rev.gecmis));

  // Sifre degistirme: hangi sifrenin yanlis oldugu yazar; tanimadigi islem kodu Turkce aciklanir
  await tp.goto(URL_ + "#/ayarlar");
  await tp.click("button:has-text('Şifreyi değiştir')");
  td = tp.locator("dialog[open]");
  await alanGirdi(td, "Mevcut şifre", "input").fill("yanlis-mevcut-sifre");
  await alanGirdi(td, "Yeni şifre", "input").fill("yeni-ornek-sifre-123");
  await alanGirdi(td, "Yeni şifre (tekrar)", "input").fill("yeni-ornek-sifre-123");
  await td.locator("button[type=submit]").click();
  await td.locator(".hata:has-text('şifre')").waitFor();
  ok("sifre degistirme: 'Mevcut şifre yanlış.'", (await td.locator(".hata").textContent()) === "Mevcut şifre yanlış.", await td.locator(".hata").textContent());
  await td.locator("button.kapat").click();
  await tp.locator("dialog[open] button:has-text('Kaydetmeden kapat')").click();
  await tp.waitForSelector("dialog[open]", { state: "detached" });
  await tp.route("**/studio/v1/index.php", function (rt) {
    var g = JSON.parse(rt.request().postData() || "{}");
    if (g.islem === "anliklar") return rt.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, hata: "islem", mesaj: "Bilinmeyen islem." }) });
    return rt.continue();
  });
  await tp.reload();
  await tp.waitForSelector(".bolum:has-text('Otomatik kopyalar') .hata");
  ok("bilinmeyen islem kodu: ham sunucu metni yerine Turkce aciklama", /Sunucu bu işlemi tanımıyor/.test(await tp.locator(".bolum:has-text('Otomatik kopyalar') .hata").textContent()));
  await tp.unroute("**/studio/v1/index.php");
  ok("ice aktarma yardimi teknik yazi icermez", await tp.locator("text=Suflo Studio’dan indirdiğin JSON yedeğini").isVisible() && !(await tp.locator("text={ musteriler").count()));
  var bolumYolu = path.join(TMP, "bolumlu.json");
  fs.writeFileSync(bolumYolu, JSON.stringify({ musteriler: [{ ad: "İçe aktarma Örnek Z", kurum: "", ucret: null, siklik: { tur: "belirsiz" } }], cekimler: [] }));
  await tp.setInputFiles("input[type=file]", bolumYolu);
  await tp.waitForSelector("text=Uyarılar (içe aktarma yine yapılabilir):");
  var oniz2 = await tp.locator(".bolum:has-text('İçe aktar / geri yükle')").textContent();
  ok("ice aktarma onizlemesi: tanınmayan bolum ve ucret belirlenmedi sade yazilir", /Tanınmayan bölüm 'cekimler': içe aktarılmayacak/.test(oniz2) && /ücret belirlenmedi/.test(oniz2), oniz2);

  // Kopyaya donus: su anki ve kopyadaki sayilar; 'geri yükle' (kucuk harf, Turkce) kabul, eksik metin ret
  await tp.reload();
  var kopyaSatir = tp.locator(".bolum:has-text('Otomatik kopyalar') .satir").first();
  await kopyaSatir.waitFor();
  ok("kopya listesi sayilari Turkce harfli", /\d+ müşteri, \d+ içerik, \d+ çekim \/ etkinlik/.test(await kopyaSatir.textContent()), await kopyaSatir.textContent());
  await kopyaSatir.locator("button:has-text('Bu kopyaya dön')").click();
  td = tp.locator("dialog[open]");
  var donusMetni = await td.textContent();
  var suAn = await tApi({ islem: "veri" });
  ok("kopyaya donus onayi: su an ve kopyadaki sayilar, sonradan eklenenlerin geri alinacagi; GERİ YÜKLE", donusMetni.indexOf("Şu an: " + suAn.veri.musteriler.length + " müşteri, " + suAn.veri.icerikler.length + " içerik") !== -1 &&
    /Kopyada: \d+ müşteri/.test(donusMetni) && /eklenen ve değiştirilen her şey geri alınır/.test(donusMetni) && /Onaylamak için GERİ YÜKLE yaz/.test(donusMetni), donusMetni);
  await td.locator("input[aria-label='Onay metni']").fill("GERI");
  await td.locator("button[type=submit]").click();
  ok("eksik onay metni kabul edilmez", /eşleşmedi/.test(await td.locator(".hata").textContent()));
  await td.locator("input[aria-label='Onay metni']").fill("geri yükle");
  await td.locator("button[type=submit]").click();
  await tp.waitForSelector(".toast:has-text('Kopyaya dönüldü.')");
  ok("'geri yükle' (kucuk harf) ile kopyaya donulur", true);
  ok("metin testi: sayfa hatasi yok", thatalar.length === 0, thatalar.join(" | "));
  await tctx.close();

  /* ================= Takvim (saatli izgara): masaustu 1440 ve telefon 390. Istanbul 2099-10-20 12:00; is haftasi 7-13 Aralik 2099 ================= */
  var kctx = await tarayici.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Europe/Istanbul", locale: "tr-TR" });
  // Tamamlama sesi varsayilan kapali: AudioContext kurulumlari sayilir (ses cikmaz, yalniz sayac)
  await kctx.addInitScript(function () {
    window.__ses = 0;
    var A = window.AudioContext;
    if (A) window.AudioContext = function () { window.__ses++; return new A(); };
  });
  var kp = await kctx.newPage();
  var khatalar = [];
  kp.on("pageerror", function (e) { khatalar.push(String(e)); });
  kp.on("console", function (m) { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) khatalar.push(m.text()); });
  await kp.clock.setFixedTime(new Date("2099-10-20T09:00:00Z"));
  await kp.goto(URL_);
  await kp.fill("#studio-sifre", SIFRE);
  await kp.click("button[type=submit]");
  await kp.waitForSelector(".yan-menu");
  async function kApi(g, sayfa) {
    return (sayfa || kp).evaluate(function (g) {
      return fetch("/studio/v1/index.php", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Studio": "1" }, body: JSON.stringify(g) })
        .then(function (r) { return r.json(); });
    }, g);
  }
  var kid = function (k) { return (k + "takvimtest000000").slice(0, 16); };
  async function kKayit(liste, id, sayfa) { return (await kApi({ islem: "veri" }, sayfa)).veri[liste].filter(function (x) { return x.id === id; })[0]; }
  // sunucudaki kayit kosulu saglayana kadar bekler (en cok 6 sn); son hali doner
  async function kBekle(liste, id, f, sayfa) {
    var k;
    for (var n = 0; n < 60; n++) { k = await kKayit(liste, id, sayfa); if (k && f(k)) return k; await bekle(100); }
    return k;
  }
  var kMus = function (k, ad) { return { tur: "musteri", id: kid(k), veri: { ad: ad, kurum: "", ucret: null, siklik: { tur: "belirsiz" }, slotTuru: "video", stokGirisi: false, not: "", arsiv: false } }; };
  var kEtk = function (k, o) { return { tur: "etkinlik", id: kid(k), veri: Object.assign({ musteriId: kid("ta"), tur: "cekim", tumGun: false, konum: "", not: "", durum: "planlandi", arsiv: false }, o) }; };
  var kIc = function (k, o) {
    return { tur: "icerik", id: kid(k), veri: Object.assign({ musteriId: kid("ta"), tur: "reels", durum: "kurguda", oncelik: "normal", cekimId: null, teslimTarihi: null, planTarihi: null, yayinTarihi: null,
      revizyonNotu: "", dosyalar: { ham: "", proje: "", final: "" }, not: "", gecmis: [], arsiv: false }, o) };
  };
  var kBlok = function (k, o) { return { tur: "blok", id: kid(k), veri: Object.assign({ icerikIdler: [], baslik: "", durum: "planlandi", not: "" }, o) }; };
  var ks1 = await kApi({ islem: "toplu", kayitlar: [kMus("ta", "Takvim Müşteri A"), kMus("tb", "Takvim Müşteri B"), kMus("tc", "Takvim Müşteri C"),
    kEtk("ea", { baslik: "Takvim çekimi A", basTarih: "2099-12-08", basSaat: "10:00", bitTarih: "2099-12-08", bitSaat: "12:00", not: "Işık ve tripod bizde." }),
    kEtk("eb", { musteriId: kid("tb"), baslik: "Takvim çekimi B", basTarih: "2099-12-08", basSaat: "13:00", bitTarih: "2099-12-08", bitSaat: "14:00" }),
    kEtk("egece", { musteriId: kid("tc"), baslik: "Gece konseri", basTarih: "2099-12-09", basSaat: "22:00", bitTarih: "2099-12-10", bitSaat: "01:00" }),
    kEtk("etop", { musteriId: kid("tb"), tur: "toplanti", baslik: "Takvim toplantısı", basTarih: "2099-12-10", basSaat: "10:00", bitTarih: "2099-12-10", bitSaat: "11:00" }),
    kEtk("etel", { musteriId: kid("tb"), baslik: "Telefon çekimi", basTarih: "2099-12-08", basSaat: "15:00", bitTarih: "2099-12-08", bitSaat: "16:00" }),
    kEtk("etas", { musteriId: kid("tc"), baslik: "Telefonda taşınan çekim", basTarih: "2099-12-08", basSaat: "17:00", bitTarih: "2099-12-08", bitSaat: "18:00" })] });
  var ks2 = await kApi({ islem: "toplu", kayitlar: [
    kIc("ia1", { baslik: "Takvim reels A1", cekimId: kid("ea"), durum: "cekim_planlandi", teslimTarihi: "2099-12-11" }),
    kIc("ia2", { baslik: "Takvim reels A2", cekimId: kid("ea"), durum: "cekim_planlandi", teslimTarihi: "2099-12-11" }),
    kIc("ib1", { musteriId: kid("tb"), baslik: "Takvim reels B1", teslimTarihi: "2099-12-11" }),
    kIc("ib2", { musteriId: kid("tb"), baslik: "Takvim reels B2", teslimTarihi: "2099-12-11" }),
    kIc("ic1", { musteriId: kid("tc"), baslik: "Takvim reels C1", teslimTarihi: "2099-12-12" })] });
  var ks3 = await kApi({ islem: "toplu", kayitlar: [
    kBlok("ba", { musteriId: kid("ta"), icerikIdler: [kid("ia1")], basTarih: "2099-12-09", basSaat: "14:00", bitTarih: "2099-12-09", bitSaat: "15:00" }),
    kBlok("bc", { musteriId: kid("tc"), icerikIdler: [kid("ic1")], basTarih: "2099-12-11", basSaat: "10:00", bitTarih: "2099-12-11", bitSaat: "12:00" })] });
  ok("takvim testi verisi kuruldu", ks1.ok && ks2.ok && ks3.ok, JSON.stringify([ks1, ks2, ks3]).slice(0, 300));
  var HAFTA = URL_ + "#/cekim?g=hafta&t=2099-12-08";
  await kp.goto(HAFTA);
  await kp.reload();
  await kp.waitForSelector(".tk-kart[data-id='" + kid("ea") + "']");
  var kart = function (k) { return ".tk-kart[data-id='" + kid(k) + "']"; };
  var kartA = await kp.evaluate(function (s) {
    var e = document.querySelector(s);
    return { sinif: e.className, sira: [].map.call(e.querySelectorAll(".mus, .is, .zaman"), function (x) { return x.textContent; }), bilgi: (e.querySelector(".bilgi") || {}).textContent,
      ikon: !!e.querySelector(".ust-s svg circle"), gun: e.closest(".tk-kolon").getAttribute("data-gun") };
  }, kart("ea"));
  ok("takvim: masaustu varsayilan hafta, 7 gun kolonu; menu 'Takvim' etkin", (await kp.locator(".tk-kolon").count()) === 7 && await kp.locator(".yan-menu a.aktif:has-text('Takvim')").count() === 1);
  ok("cekim karti: mavi + kamera, musteri / is adi / saat sirasi, '2 video bağlı'", /\bcekim\b/.test(kartA.sinif) && kartA.ikon && kartA.sira.join("|") === "Takvim Müşteri A|Takvim çekimi A|10:00–12:00" &&
    kartA.bilgi === "2 video bağlı" && kartA.gun === "2099-12-08", JSON.stringify(kartA));
  ok("edit blogu mor (makas), toplanti gri kendi siniflariyla", /\bedit\b/.test(await kp.locator(kart("bc")).getAttribute("class")) && /\btoplanti\b/.test(await kp.locator(kart("etop")).getAttribute("class")) &&
    (await kp.locator(kart("bc") + " .is").textContent()) === "Takvim reels C1");
  ok("tum gun seridi: teslim bayragi (11 Aralık) ince serit, calisma zamani degil", await kp.locator(".tk-tumgun .hucre[data-gun='2099-12-11'] .tk-serit.teslim:has-text('Takvim Müşteri B')").count() === 1);
  var simdiCizgi = await kp.locator(".tk-simdi").count();
  ok("simdi cizgisi yalniz bugunu iceren haftada", simdiCizgi === 0);
  // Filtre: Edit yalniz bloklar; Cekim etkinlikler (toplanti dahil); tercih saklanir
  await kp.click(".tk-secim button:has-text('Edit')");
  await kp.waitForSelector(kart("ea"), { state: "detached" });
  ok("filtre Edit: cekim kartlari gizli, bloklar gorunur", (await kp.locator(".tk-kart.cekim").count()) === 0 && (await kp.locator(kart("bc")).count()) === 1);
  await kp.click(".tk-secim button:has-text('Çekim')");
  await kp.waitForSelector(kart("ea"));
  ok("filtre Çekim: bloklar gizli, toplanti gorunur, cekmece edit islerini gizler", (await kp.locator(".tk-kart.edit").count()) === 0 && (await kp.locator(kart("etop")).count()) === 1 &&
    await kp.locator(".tk-cekmece:has-text('Çekim filtresinde edit işleri gizli')").count() === 1);
  await kp.reload();
  await kp.waitForSelector(kart("ea"));
  ok("filtre tercihi yenilemede kalir (localStorage)", (await kp.locator(".tk-kart.edit").count()) === 0 && await kp.evaluate(function () { return localStorage.getItem("suflo-studio.takvimFiltre"); }) === "cekim");
  await kp.click(".tk-secim button:has-text('Birlikte')");
  await kp.waitForSelector(kart("bc"));

  // Gece yarisini asan is: calisma saatleri disinda ipucu; gece acilinca iki gunde iki parca
  var ipucu = { alt: await kp.locator(".tk-kolon[data-gun='2099-12-09'] .tk-gece-ipucu").textContent(), ust: await kp.locator(".tk-kolon[data-gun='2099-12-10'] .tk-gece-ipucu").textContent() };
  ok("gece isi: calisma saatlerinde '↓ 1 iş · 22:00' ve ertesi gun '↑ 1 iş gece'", ipucu.alt === "↓ 1 iş · 22:00" && ipucu.ust === "↑ 1 iş gece", JSON.stringify(ipucu));
  await kp.click(".tk-kolon[data-gun='2099-12-09'] .tk-gece-ipucu");
  await kp.waitForSelector(kart("egece"));
  var gece = await kp.evaluate(function (s) {
    return [].map.call(document.querySelectorAll(s), function (e) { return e.closest(".tk-kolon").getAttribute("data-gun") + " " + e.querySelector(".zaman").textContent; });
  }, kart("egece"));
  ok("gece yarisini asan cekim iki gunde: '22:00–01:00 (ertesi gün)' ve '…–01:00'", gece.join("|") === "2099-12-09 22:00–01:00 (ertesi gün)|2099-12-10 …–01:00", gece.join("|"));
  await kp.click(".tk-gece-dugme:has-text('gizle')");
  await kp.waitForSelector(kart("egece"), { state: "detached" });

  // Koordinat yardimcilari: calisma 09-19 -> gorunen 08:00'den baslar, saat 52 px
  var VBAS = 480, PP = 52 / 60;
  async function kolonY(gun, dk) { var b = await kp.locator(".tk-kolon[data-gun='" + gun + "']").boundingBox(); return { x: b.x + b.width / 2, y: b.y + (dk - VBAS) * PP, b: b }; }
  async function surukle(x0, y0, x1, y1, birak) {
    await kp.mouse.move(x0, y0);
    await kp.mouse.down();
    await kp.mouse.move(x0 + 4, y0 + 4, { steps: 2 });
    await kp.mouse.move(x1, y1, { steps: 10 });
    if (birak !== false) await kp.mouse.up();
  }
  async function kartTut(k) { var b = await kp.locator(kart(k)).first().boundingBox(); return { x: b.x + b.width / 3, y: b.y + 10 }; }

  // Surukle-tasi (gunler arasi, 15 dk) + yenilemede kalicilik + geri al
  var t0 = await kartTut("eb"), hedef = await kolonY("2099-12-10", 15 * 60);
  await surukle(t0.x, t0.y, hedef.x, hedef.y + 10);
  await kp.waitForSelector(".toast:has-text('Taşındı') button:has-text('Geri al')");
  var eb = await kBekle("etkinlikler", kid("eb"), function (k) { return k.basTarih === "2099-12-10"; });
  ok("surukle-tasi: Persembe 15:00-16:00 (sure korunur), sunucuya yazildi", eb.basTarih === "2099-12-10" && eb.basSaat === "15:00" && eb.bitTarih === "2099-12-10" && eb.bitSaat === "16:00", JSON.stringify(eb));
  ok("kaydetme gostergesi: ✓ Kaydedildi; tek geri al bildirimi", (await kp.locator(".tk-kayit").first().textContent()) === "✓ Kaydedildi" && (await kp.locator(".toast").count()) === 1);
  await kp.reload();
  await kp.waitForSelector(kart("eb"));
  ok("yenilemeden sonra yeni yerinde (kalicilik)", (await kp.locator(".tk-kolon[data-gun='2099-12-10'] " + kart("eb")).count()) === 1);
  t0 = await kartTut("eb");
  hedef = await kolonY("2099-12-11", 14 * 60);
  await surukle(t0.x, t0.y, hedef.x, hedef.y + 10);
  await kp.waitForSelector(".toast:has-text('Taşındı: Takvim Müşteri B, Cum')");
  await kBekle("etkinlikler", kid("eb"), function (k) { return k.basTarih === "2099-12-11"; });
  // yanlislikla tasindi: tek dokunusla geri al -> onceki yer (Persembe 15:00)
  await kp.click(".toast button:has-text('Geri al')");
  eb = await kBekle("etkinlikler", kid("eb"), function (k) { return k.basTarih === "2099-12-10"; });
  ok("geri al: onceki degerlerle yeni kaydetme (Persembe 15:00'e doner)", eb.basTarih === "2099-12-10" && eb.basSaat === "15:00" && eb.bitSaat === "16:00", JSON.stringify(eb));

  // Cakisma hayaleti: suruklerken cakisan is yazilir; birakinca hicbir is kaydirilmaz
  var eaOnce = await kKayit("etkinlikler", kid("ea"));
  t0 = await kartTut("eb");
  hedef = await kolonY("2099-12-08", 10 * 60 + 30);
  await surukle(t0.x, t0.y, hedef.x, hedef.y + 10, false);
  var hayalet = await kp.locator(".tk-hayalet").first().textContent();
  ok("suruklerken cakisma hayaleti: cakisan musteri ve 'diğer işler kaydırılmaz'", (await kp.locator(".tk-hayalet.cakisma").count()) === 1 && /Çakışıyor: Takvim Müşteri A/.test(hayalet) &&
    /diğer işler kaydırılmaz/.test(hayalet) && /^10:30–11:30/.test(hayalet), hayalet);
  await kp.mouse.up();
  await kp.waitForSelector(".toast:has-text('çakışma: Takvim Müşteri A (kaydırılmadı)')");
  eb = await kBekle("etkinlikler", kid("eb"), function (k) { return k.basSaat === "10:30"; });
  var eaSonra = await kKayit("etkinlikler", kid("ea"));
  ok("cakisan yere birakildi; diger is kaydirilmadi (ayni surum ve saat)", eb.basTarih === "2099-12-08" && eb.basSaat === "10:30" && eaSonra.surum === eaOnce.surum && eaSonra.basSaat === "10:00",
    JSON.stringify([eb.basSaat, eaOnce.surum, eaSonra.surum]));
  ok("cakisan kartlar yan yana, ikisi de 'çakışma var' etiketli", (await kp.locator(".tk-kart[aria-label*='çakışma var']").count()) >= 2);
  await kp.click(".toast button:has-text('Geri al')");
  await kBekle("etkinlikler", kid("eb"), function (k) { return k.basTarih === "2099-12-10"; });
  // Alt kenardan sure: 12:00 -> 13:00
  await kp.waitForSelector(".tk-kayit.tamam");
  var kb = await kp.locator(kart("ea")).boundingBox();
  hedef = await kolonY("2099-12-08", 13 * 60);
  await surukle(kb.x + kb.width / 2, kb.y + kb.height - 3, kb.x + kb.width / 2, hedef.y);
  var ea = await kBekle("etkinlikler", kid("ea"), function (k) { return k.bitSaat === "13:00"; });
  ok("alt kenardan sure degisir (10:00-13:00), baslangic ayni", ea.basSaat === "10:00" && ea.bitSaat === "13:00", JSON.stringify(ea));
  await kp.click(".toast button:has-text('Geri al')");
  await kBekle("etkinlikler", kid("ea"), function (k) { return k.bitSaat === "12:00"; });

  // Klavye: oklar 15 dk, Shift sure, Enter ayrinti; ekran okuyucu duyurusu; odak kartta kalir
  await kp.waitForSelector(".tk-kayit.tamam");
  await kp.focus(kart("ea"));
  // tus basmadan once odak kartta (kayittan sonra yeniden cizilen kart odagi geri alir)
  var odakEA = function () { return kp.waitForFunction(function (id) { return document.activeElement && document.activeElement.getAttribute("data-id") === id; }, kid("ea"), { timeout: 5000 }); };
  await odakEA(); await kp.keyboard.press("ArrowDown");
  ea = await kBekle("etkinlikler", kid("ea"), function (k) { return k.basSaat === "10:15"; });
  await kp.waitForSelector(".tk-kayit.tamam");
  await bekle(100);
  var duyuru = await kp.locator("#tk-duyuru").textContent();
  var odak = await kp.evaluate(function () { return document.activeElement && document.activeElement.getAttribute("data-id"); });
  // kayit donunce ayni degisiklik ikinci kez duyurulmaz (bildirim bolgesi metni zaten okur): duyuru yer bilgisi olarak kalir
  ok("klavye: asagi ok 15 dk tasir (10:15-12:15), bir kez duyurulur, odak kartta", ea.bitSaat === "12:15" && /10:15/.test(duyuru) && !/^Taşındı/.test(duyuru) && odak === kid("ea"),
    JSON.stringify([ea.basSaat, duyuru, odak]));
  await odakEA(); await kp.keyboard.press("Shift+ArrowUp");
  ea = await kBekle("etkinlikler", kid("ea"), function (k) { return k.bitSaat === "12:00"; });
  await kp.waitForSelector(".tk-kayit.tamam");
  await odakEA(); await kp.keyboard.press("ArrowUp");
  ea = await kBekle("etkinlikler", kid("ea"), function (k) { return k.basSaat === "10:00"; });
  ok("klavye: Shift+yukari sureyi kisaltir, yukari geri tasir (10:00-11:45)", ea.basSaat === "10:00" && ea.bitSaat === "11:45", JSON.stringify(ea));
  await kp.waitForSelector(".tk-kayit.tamam");
  await odakEA(); await kp.keyboard.press("Shift+ArrowDown");
  await kBekle("etkinlikler", kid("ea"), function (k) { return k.bitSaat === "12:00"; });
  await kp.waitForSelector(".tk-kayit.tamam");
  await bekle(100);
  await odakEA(); await kp.keyboard.press("Enter");
  await kp.waitForSelector(".tk-acilir[role=dialog]");
  var ayr = await kp.locator(".tk-acilir").textContent();
  ok("Enter: ayrinti (not, bagli videolar, tamamlamanin edit'i bitirmedigi)", /Işık ve tripod bizde\./.test(ayr) && /Takvim reels A1/.test(ayr) && /Çekimi tamamlamak videoların editini tamamlamaz/.test(ayr), ayr.slice(0, 300));
  // Suruklemeden ertele: bagli bloklar ve teslimler listelenir, degistirilmez
  await kp.click(".tk-acilir button:has-text('Ertele / taşı')");
  var ertele = await kp.locator(".tk-acilir .tk-uyari:has-text('ertelenirse')").textContent();
  ok("ertele formu: etkilenecek edit blogu ve teslimler listelenir", /Edit bloğu: Takvim reels A1/.test(ertele) && /Teslim: Takvim reels A1 · 11 Aralık/.test(ertele) && /tarihleri değişmez/.test(ertele), ertele);
  var baOnce = await kKayit("bloklar", kid("ba"));
  await alanGirdi(kp.locator(".tk-acilir"), "Gün", "input").fill("2099-12-12");
  await kp.click(".tk-acilir button:has-text('Uygula')");
  ea = await kBekle("etkinlikler", kid("ea"), function (k) { return k.basTarih === "2099-12-12"; });
  var baSonra = await kKayit("bloklar", kid("ba")), iaSonra = await kKayit("icerikler", kid("ia1"));
  ok("ertele: cekim 12 Aralık 10:00-12:00; bagli blok ve teslim degismedi", ea.basSaat === "10:00" && ea.bitSaat === "12:00" && baSonra.surum === baOnce.surum && iaSonra.teslimTarihi === "2099-12-11", JSON.stringify(ea));
  await kp.keyboard.press("Escape");
  await kp.click(".toast button:has-text('Geri al')");
  await kBekle("etkinlikler", kid("ea"), function (k) { return k.basTarih === "2099-12-08"; });

  // Planlanacaklar cekmecesinden surukle: gruplu icerik idleriyle blok
  await kp.waitForSelector(".tk-kayit.tamam");
  var cekKart = kp.locator(".tk-cek-kart:has-text('Takvim Müşteri B — 2 reels')");
  await cekKart.scrollIntoViewIfNeeded();
  var ck = await cekKart.boundingBox();
  hedef = await kolonY("2099-12-11", 14 * 60);
  var bloklarOnce = (await kApi({ islem: "veri" })).veri.bloklar.length;
  await surukle(ck.x + 30, ck.y + 12, hedef.x, hedef.y + 15 * PP);
  await kp.waitForSelector(".toast:has-text('Edit zamanı ayrıldı: Takvim Müşteri B')");
  var yeniBlok, kv;
  for (var bn = 0; bn < 50 && !yeniBlok; bn++) {
    kv = (await kApi({ islem: "veri" })).veri;
    yeniBlok = kv.bloklar.filter(function (b) { return b.musteriId === kid("tb") && b.basTarih === "2099-12-11"; })[0];
    if (!yeniBlok) await bekle(100);
  }
  ok("cekmeceden surukle: blok musteri B, iki icerigin idleri, Cuma 14:00-16:00 (tahmini 2 sa)", !!yeniBlok && kv.bloklar.length === bloklarOnce + 1 &&
    yeniBlok.icerikIdler.slice().sort().join(",") === [kid("ib1"), kid("ib2")].sort().join(",") && yeniBlok.basSaat === "14:00" && yeniBlok.bitSaat === "16:00", JSON.stringify(yeniBlok));
  await kp.reload();
  await kp.waitForSelector(".tk-kart[data-id='" + yeniBlok.id + "']");
  ok("cekmece: zaman ayrilan grup listeden kalkar; blok yenilemeden sonra takvimde", (await kp.locator(".tk-cek-kart:has-text('Takvim Müşteri B — 2 reels')").count()) === 0 &&
    (await kp.locator(".tk-kolon[data-gun='2099-12-11'] .tk-kart[data-id='" + yeniBlok.id + "']").count()) === 1);
  ok("blok karti icerik ozeti ve en yakin teslim", (await kp.locator(".tk-kart[data-id='" + yeniBlok.id + "'] .is").textContent()) === "2 reels · edit" &&
    (await kp.locator(".tk-kart[data-id='" + yeniBlok.id + "'] .bilgi").textContent()) === "Teslim Cum 11 Aralık");

  // Bos araligi secip hizli olusturma: musteri zorunlu (tahminle atanmaz)
  var a0 = await kolonY("2099-12-12", 10 * 60), a1 = await kolonY("2099-12-12", 11 * 60 + 30);
  await surukle(a0.x, a0.y + 2, a1.x, a1.y);
  await kp.waitForSelector(".tk-acilir:has-text('Yeni iş')");
  ok("aralik secimi: 'Yeni iş' Cumartesi 10:00–11:30, varsayilan Edit, musteri bos", /Cumartesi, 12 Aralık 2099 · 10:00–11:30/.test(await kp.locator(".tk-acilir").textContent()) &&
    (await kp.locator(".tk-acilir select[aria-label='Müşteri']").inputValue()) === "" && (await kp.locator(".tk-acilir .tk-secim button[aria-pressed=true]").textContent()) === "Edit");
  await kp.click(".tk-acilir button:has-text('Kaydet')");
  ok("hizli olusturma: musteri secilmeden kaydedilmez", /Müşteri seç; takvim müşteriyi tahminle atamaz/.test(await kp.locator(".tk-acilir .tk-hata").textContent()));
  await kp.selectOption(".tk-acilir select[aria-label='Müşteri']", kid("tc"));
  await kp.fill(".tk-acilir input[aria-label='İş adı']", "Hızlı edit");
  await kp.click(".tk-acilir button:has-text('Kaydet')");
  await kp.waitForSelector(".toast:has-text('Edit zamanı ayrıldı: Takvim Müşteri C')");
  var hizliB;
  for (bn = 0; bn < 50 && !hizliB; bn++) { hizliB = (await kApi({ islem: "veri" })).veri.bloklar.filter(function (b) { return b.baslik === "Hızlı edit"; })[0]; if (!hizliB) await bekle(100); }
  ok("hizli Edit: blok olusur (musteri C, 10:00-11:30)", !!hizliB && hizliB.musteriId === kid("tc") && hizliB.basTarih === "2099-12-12" && hizliB.basSaat === "10:00" && hizliB.bitSaat === "11:30", JSON.stringify(hizliB));
  a0 = await kolonY("2099-12-13", 10 * 60);
  await kp.mouse.click(a0.x, a0.y + 2);
  await kp.waitForSelector(".tk-acilir:has-text('Yeni iş')");
  await kp.click(".tk-acilir .tk-secim button:has-text('Çekim')");
  await kp.selectOption(".tk-acilir select[aria-label='Müşteri']", kid("tb"));
  await kp.fill(".tk-acilir input[aria-label='İş adı']", "Hızlı çekim");
  await kp.click(".tk-acilir button:has-text('Kaydet')");
  await kp.waitForSelector(".toast:has-text('Çekim eklendi: Takvim Müşteri B')");
  var hizliE;
  for (bn = 0; bn < 50 && !hizliE; bn++) { hizliE = (await kApi({ islem: "veri" })).veri.etkinlikler.filter(function (e) { return e.baslik === "Hızlı çekim"; })[0]; if (!hizliE) await bekle(100); }
  ok("hizli Çekim: etkinlik tur cekim (musteri B, Pazar 10:00-11:00)", !!hizliE && hizliE.tur === "cekim" && hizliE.musteriId === kid("tb") && hizliE.basTarih === "2099-12-13" && hizliE.basSaat === "10:00" && hizliE.bitSaat === "11:00", JSON.stringify(hizliE));
  a0 = await kolonY("2099-12-13", 14 * 60);
  await kp.mouse.click(a0.x, a0.y + 2);
  await kp.waitForSelector(".tk-acilir:has-text('Yeni iş')");
  await kp.click(".tk-acilir .tk-secim button:has-text('Çekim')");
  await kp.click(".tk-acilir button:has-text('Ayrıntılı form')");
  var td2 = kp.locator("dialog[open]");
  await td2.waitFor();
  ok("'Ayrıntılı form' mevcut cekim penceresini tarih ve saatle acar", /Çekim \/ etkinlik ekle/.test(await td2.locator("h2").textContent()) &&
    (await alanGirdi(td2, "Başlangıç tarihi", "input").inputValue()) === "2099-12-13" && (await alanGirdi(td2, "Başlangıç saati", "input").inputValue()) === "14:00" &&
    (await alanGirdi(td2, "Müşteri", "select").inputValue()) === "");
  await td2.locator("button:has-text('Vazgeç')").click();
  await kp.waitForSelector("dialog[open]", { state: "detached" });

  // Kaydetme hatasi (sunucu kesin reddetti: 503 mesgul): ekran sunucudaki hale doner, acik hata + "Tekrar dene"
  await kp.route("**/studio/v1/index.php", function (rt) {
    var g = JSON.parse(rt.request().postData() || "{}");
    if (g.islem === "toplu") return rt.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, hata: "mesgul", mesaj: "Meşgul" }) });
    return rt.continue();
  });
  t0 = await kartTut("eb");
  hedef = await kolonY("2099-12-09", 11 * 60);
  await surukle(t0.x, t0.y, hedef.x, hedef.y + 10);
  await kp.waitForSelector(".toast.hata:has-text('Değişiklik geri alındı') button:has-text('Tekrar dene')");
  ok("kaydetme hatasi: kart eski yerine doner, 'Kaydedilemedi' gostergesi", (await kp.locator(".tk-kolon[data-gun='2099-12-10'] " + kart("eb")).count()) === 1 &&
    (await kp.locator(".tk-kolon[data-gun='2099-12-09'] " + kart("eb")).count()) === 0 && (await kp.locator(".tk-kayit").first().textContent()) === "Kaydedilemedi");
  ok("kaydetme hatasi: sunucudaki kayit degismedi", (await kKayit("etkinlikler", kid("eb"))).basTarih === "2099-12-10");
  await kp.unroute("**/studio/v1/index.php");
  await kp.click(".toast button:has-text('Tekrar dene')");
  eb = await kBekle("etkinlikler", kid("eb"), function (k) { return k.basTarih === "2099-12-09"; });
  ok("'Tekrar dene' ayni degisikligi kaydeder", eb.basSaat === "11:00" && (await kp.locator(".tk-kayit").first().textContent()) === "✓ Kaydedildi", JSON.stringify(eb));

  // Yaniti kaybolan kaydetme: sunucu yazdi, baglanti koptu. "Değişiklik geri alındı" denmez; sunucudaki hal yuklenir
  // (kart yeni yerinde kalir); "Tekrar dene" ikinci kez yazmaz.
  var kopuk = 0;
  await kp.route("**/studio/v1/index.php", async function (rt) {
    var g = JSON.parse(rt.request().postData() || "{}");
    if (g.islem === "toplu" && !kopuk++) { await rt.fetch(); return rt.abort("connectionreset"); }
    return rt.continue();
  });
  t0 = await kartTut("eb");
  hedef = await kolonY("2099-12-09", 13 * 60);
  await surukle(t0.x, t0.y, hedef.x, hedef.y + 10);
  await kp.waitForSelector(".toast.hata:has-text('kaydedilip kaydedilmediği bilinmiyor') button:has-text('Tekrar dene')", { timeout: 8000 }).catch(function () {});
  eb = await kKayit("etkinlikler", kid("eb"));
  var kopukRozet = await kp.locator(".tk-kayit").first().evaluate(function (e) { return e.textContent + "|" + e.title; });
  ok("yaniti kaybolan kaydetme: 'geri alındı' denmez, sunucudaki hal (13:00) ekranda; gosterge sonucun bilinmedigini yazar",
    eb.basSaat === "13:00" && (await kp.locator(".toast:has-text('Değişiklik geri alındı')").count()) === 0 &&
    (await kp.locator(".tk-kolon[data-gun='2099-12-09'] " + kart("eb")).count()) === 1 && /^Kaydedilemedi\|.*bilinmiyor/.test(kopukRozet) &&
    /13:00/.test(await kp.locator(kart("eb") + " .zaman").textContent()), JSON.stringify([eb.basSaat, kopukRozet]));
  await kp.unroute("**/studio/v1/index.php");
  var ebSurum = eb.surum;
  await kp.click(".toast button:has-text('Tekrar dene')");
  await kp.waitForSelector(".tk-kayit.tamam");
  eb = await kKayit("etkinlikler", kid("eb"));
  ok("yaniti kaybolan kaydetmede 'Tekrar dene' ikinci kez yazmaz (ayni surum), gosterge ✓", eb.surum === ebSurum && eb.basSaat === "13:00" &&
    (await kp.locator(".tk-kayit").first().textContent()) === "✓ Kaydedildi", JSON.stringify(eb));
  // Kaydetme surerken sayfa kapatilir / yenilenirse tarayici sorar (kuyruktaki degisiklik kaybolmasin)
  var tutulan = null;
  await kp.route("**/studio/v1/index.php", function (rt) {
    var g = JSON.parse(rt.request().postData() || "{}");
    if (g.islem === "toplu" && !tutulan) { tutulan = rt; return; }
    return rt.continue();
  });
  var ayrilSor = function () { return kp.evaluate(function () { var e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }); };
  await kp.focus(kart("eb"));
  await kp.keyboard.press("ArrowDown");
  await kp.waitForSelector(".tk-kayit.surer");
  var surerkenSorar = await ayrilSor();
  while (!tutulan) await bekle(20);
  await tutulan.continue();
  await kp.unroute("**/studio/v1/index.php");
  await kp.waitForSelector(".tk-kayit.tamam");
  ok("kaydetme surerken ayrilmak sorulur; bitince sorulmaz", surerkenSorar === true && (await ayrilSor()) === false);

  // Eszamanli degisiklik: ikinci sayfa ayni kaydi degistirir; bu sayfadaki eski surum sessizce ezmez
  var kp2 = await kctx.newPage();
  await kp2.clock.setFixedTime(new Date("2099-10-20T09:00:00Z"));
  await kp2.goto(HAFTA);
  await kp2.waitForSelector(kart("eb"));
  var b2 = await kp2.locator(kart("eb")).boundingBox(), h2 = await kp2.locator(".tk-kolon[data-gun='2099-12-07']").boundingBox();
  await kp2.mouse.move(b2.x + b2.width / 3, b2.y + 10);
  await kp2.mouse.down();
  await kp2.mouse.move(b2.x + b2.width / 3 + 4, b2.y + 14, { steps: 2 });
  await kp2.mouse.move(h2.x + h2.width / 2, h2.y + (9 * 60 - VBAS) * PP + 10, { steps: 10 });
  await kp2.mouse.up();
  await kBekle("etkinlikler", kid("eb"), function (k) { return k.basTarih === "2099-12-07"; });
  await kp2.close();
  t0 = await kartTut("eb");
  hedef = await kolonY("2099-12-11", 16 * 60);
  await surukle(t0.x, t0.y, hedef.x, hedef.y + 10);
  await kp.waitForSelector(".toast.hata:has-text('başka bir yerde')");
  await kp.waitForSelector(".tk-kolon[data-gun='2099-12-07'] " + kart("eb"));
  eb = await kKayit("etkinlikler", kid("eb"));
  ok("409: bu sayfanin degisikligi yazilmaz, guncel veri yuklenir ve soylenir (Pazartesi 09:00)", eb.basTarih === "2099-12-07" && eb.basSaat === "09:00" &&
    (await kp.locator(".tk-kolon[data-gun='2099-12-07'] " + kart("eb")).count()) === 1 && (await kp.locator(".tk-kolon[data-gun='2099-12-11'] " + kart("eb")).count()) === 0, JSON.stringify(eb));

  // Tamamlama: blok bitince icerik durumu degismez; "Edit işini tamamla" icerigi hazir yapar (geri alinabilir)
  async function bugunSayi() { var t = await kp.locator(".tk-ilerleme").first().textContent(); var m = /Bugün (\d+) iş/.exec(t); return m ? +m[1] : 0; }
  var sayi0 = await bugunSayi();
  await kp.click(kart("bc") + " .tk-tik");
  var bc = await kBekle("bloklar", kid("bc"), function (k) { return k.durum === "tamamlandi"; });
  await kp.waitForSelector(kart("bc") + ".tamam .tk-tik.dolu.cizil");
  ok("blok tamamlandi (tamamlanma ani yazildi); icerik durumu degismedi (kurguda)", /^2099-10-20 12:\d\d$/.test(bc.tamamZaman || "") && (await kKayit("icerikler", kid("ic1"))).durum === "kurguda", JSON.stringify(bc));
  ok("tik animasyonu ve 'Bugün N iş tamamladın' bir artar", (await bugunSayi()) === sayi0 + 1 &&
    await kp.locator(kart("bc") + " .tk-tik.cizil").evaluate(function (e) { return getComputedStyle(e).animationName; }) === "tkTikBuyu");
  ok("ses varsayilan kapali (AudioContext kurulmadi)", await kp.evaluate(function () { return window.__ses; }) === 0);
  // "Edit işini tamamla" tkKaydet disindan kaydeder: basarisizsa gosterge "Kaydedilemedi" olur (✓ kalmaz)
  await kp.route("**/studio/v1/index.php", function (rt) {
    var g = JSON.parse(rt.request().postData() || "{}");
    if (g.islem === "toplu") return rt.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, hata: "mesgul", mesaj: "Meşgul" }) });
    return rt.continue();
  });
  await kp.click(kart("bc"));
  await kp.click(".tk-acilir button:has-text('Edit işini tamamla')");
  await kp.waitForSelector(".toast.hata:has-text('meşgul')");
  ok("'Edit işini tamamla' kaydedilemezse gosterge 'Kaydedilemedi'", (await kp.locator(".tk-kayit").first().textContent()) === "Kaydedilemedi" &&
    (await kKayit("icerikler", kid("ic1"))).durum === "kurguda");
  await kp.unroute("**/studio/v1/index.php");
  await kp.click(kart("bc"));
  await kp.click(".tk-acilir button:has-text('Edit işini tamamla')");
  await kp.waitForSelector(".toast:has-text('→ Yayına hazır') button:has-text('Geri al')");
  ok("'Edit işini tamamla': bagli icerik 'Yayına hazır' (mevcut durum akisi), sayac artar; gosterge yeniden ✓", (await kBekle("icerikler", kid("ic1"), function (k) { return k.durum === "hazir"; })).durum === "hazir" &&
    (await bugunSayi()) === sayi0 + 2 && (await kp.locator(".tk-kayit").first().textContent()) === "✓ Kaydedildi");
  await kp.click(".toast button:has-text('Geri al')");
  ok("geri al: icerik yeniden 'Kurguda'", (await kBekle("icerikler", kid("ic1"), function (k) { return k.durum === "kurguda"; })).durum === "kurguda");
  // Cekimi tamamlamak icerikleri degistirmez; bildirimde acik secim olarak teklif
  await kp.click(kart("ea") + " .tk-tik");
  var cekT = kp.locator(".toast:has-text('Çekim tamamlandı: Takvim çekimi A')");
  await cekT.waitFor();
  ea = await kBekle("etkinlikler", kid("ea"), function (k) { return k.durum === "tamamlandi"; });
  var iaD = [(await kKayit("icerikler", kid("ia1"))).durum, (await kKayit("icerikler", kid("ia2"))).durum];
  ok("cekim tamamlandi: bagli icerikler degismedi; bildirimde '2 video edit bekliyor', Geri al ve acik teklif", ea.durum === "tamamlandi" && iaD.join() === "cekim_planlandi,cekim_planlandi" &&
    /2 video edit bekliyor/.test(await cekT.textContent()) && (await cekT.locator("button.btn").allTextContents()).join("|") === "Geri al|Bağlı 2 içeriği “Çekildi” yap|İçerik ekle", JSON.stringify(iaD));
  ok("tamamlanan cekim karti: '2 video edit bekliyor'", (await kp.locator(kart("ea") + " .bilgi").textContent()) === "2 video edit bekliyor");
  await cekT.locator("button:has-text('Geri al')").click();
  await kBekle("etkinlikler", kid("ea"), function (k) { return k.durum === "planlandi" && !k.tamamZaman; });
  // Toplanti tamamlaninca icerik teklifi yok
  await kp.waitForSelector(".tk-kayit.tamam");
  await kp.click(kart("etop") + " .tk-tik");
  await kp.waitForSelector(".toast:has-text('Tamamlandı: Takvim toplantısı')");
  ok("toplanti tamamlaninca 'İçerik ekle' teklifi yok", (await kp.locator(".toast button:has-text('İçerik ekle')").count()) === 0);

  // Ayarlar: calisma saatleri + haftalik hedef sunucuya; katman ve ses bu cihazda; Google esitlemesi yok notu
  var ayarOnce = (await kApi({ islem: "veri" })).veri.ayar || {};
  await kp.click(".tk-arac button[aria-label='Takvim ayarları']");
  await kp.waitForSelector(".tk-acilir:has-text('Takvim ayarları')");
  ok("ayarlar: Google esitlemesi olmadigi yazar", /Google Takvim eşitlemesi yok/.test(await kp.locator(".tk-acilir").textContent()));
  await kp.selectOption(".tk-acilir select[aria-label='Çalışma başı']", "600");
  await kp.selectOption(".tk-acilir select[aria-label='Çalışma sonu']", "1080");
  await kp.fill(".tk-acilir input[aria-label='Haftalık hedef']", "99");
  await kp.click(".tk-acilir button:has-text('Kaydet')");
  await kp.waitForSelector(".toast:has-text('Takvim ayarları kaydedildi.')");
  var ayar = (await kApi({ islem: "veri" })).veri.ayar;
  ok("ayarlar sunucuda: calisma 10:00-18:00, hedef 99; esik ve son yedek korunur", ayar.calismaBas === 600 && ayar.calismaBit === 1080 && ayar.haftalikHedef === 99 &&
    ayar.varsayilanStokUyari === (ayarOnce.varsayilanStokUyari === undefined ? null : ayarOnce.varsayilanStokUyari) && ayar.sonYedek === (ayarOnce.sonYedek || null), JSON.stringify(ayar));
  ok("calisma saatleri izgaraya yansir (gorunen 09:00'dan, ilk etiket 10:00)", (await kp.locator(".tk-saatler span").first().textContent()) === "10:00");
  var hedefMetni = await kp.locator(".tk-hedef").first().textContent(), haftaN = +(/Hafta (\d+)\/99/.exec(hedefMetni) || [0, -1])[1];
  ok("haftalik hedef cubugu", haftaN >= 0, hedefMetni);
  await kp.click(".tk-arac button[aria-label='Takvim ayarları']");
  await kp.selectOption(".tk-acilir select[aria-label='Çalışma başı']", "540");
  await kp.selectOption(".tk-acilir select[aria-label='Çalışma sonu']", "1140");
  await kp.fill(".tk-acilir input[aria-label='Haftalık hedef']", String(haftaN + 1));
  await kp.click(".tk-acilir button:has-text('Kaydet')");
  await kp.waitForSelector(".toast:has-text('Takvim ayarları kaydedildi.')");
  // hedef bu tamamlamayla dolar: tek, sakin bildirim (konfeti / puan yok)
  await kp.waitForSelector(kart("etel"));
  await kp.click(kart("etel") + " .tk-tik");
  await kp.waitForSelector(".toast.kutlama:has-text('Haftalık hedefin tamam: bu hafta " + (haftaN + 1) + " iş bitirdin.')");
  ok("haftalik hedef dolunca tek sakin bildirim", (await kp.locator(".toast.kutlama").count()) === 1);
  // ses tercihi (varsayilan kapali) acilinca tamamlamada calar
  await kp.click(".tk-arac button[aria-label='Takvim ayarları']");
  await kp.check(".tk-acilir label:has-text('Tamamlama sesi') input");
  ok("ses acilinca deneme sesi calar, tercih localStorage'da", await kp.evaluate(function () { return window.__ses === 1 && localStorage.getItem("suflo-studio.takvimSes") === "1"; }));
  await kp.uncheck(".tk-acilir label:has-text('Resmî tatiller') input");
  await bekle(150);
  ok("katman kapatilinca bayram notu kalkar, tercih localStorage'da", (await kp.locator(".tk-not").count()) === 0 &&
    await kp.evaluate(function () { return JSON.parse(localStorage.getItem("suflo-studio.takvimKatman")).tatil === false; }));
  await kp.check(".tk-acilir label:has-text('Resmî tatiller') input");
  // Ozel gun ekle (her yil), seritte gorunur; duzenle ile arsivlenir
  await kp.click(".tk-acilir button:has-text('Özel gün ekle')");
  var od = kp.locator("dialog[open]");
  await alanGirdi(od, "Başlık", "input").fill("Takvim bakım günü");
  await alanGirdi(od, "Tarih", "input").fill("2099-12-09");
  await od.locator("label:has-text('Her yıl tekrar et') input").check();
  await od.locator("button[type=submit]").click();
  await kp.waitForSelector(".tk-tumgun .hucre[data-gun='2099-12-09'] .tk-serit.ozel:has-text('Takvim bakım günü')");
  await kp.goto(URL_ + "#/cekim?g=hafta&t=2100-12-09");
  await kp.waitForSelector(".tk-tumgun .hucre[data-gun='2100-12-09'] .tk-serit.ozel:has-text('Takvim bakım günü')");
  ok("ozel gun: her yil tekrari ertesi yil da gorunur", true);
  await kp.click(".tk-serit.ozel:has-text('Takvim bakım günü')");
  await kp.click(".tk-acilir button:has-text('Düzenle')");
  await kp.locator("dialog[open] button:has-text('Arşivle')").click();
  await kp.waitForSelector(".tk-serit.ozel:has-text('Takvim bakım günü')", { state: "detached" });
  ok("ozel gun arsivlenir (silinmez)", (await kApi({ islem: "veri" })).veri.ozelgunler.filter(function (o) { return o.baslik === "Takvim bakım günü" && o.arsiv; }).length === 1);
  // "Simdi ne yapayim?": tek oneri ve nedenleri; yalniz basinca ekler
  await kp.goto(HAFTA);
  await kp.waitForSelector(kart("ea"));
  var blokSayi = (await kApi({ islem: "veri" })).veri.bloklar.length;
  await kp.click("button:has-text('Şimdi ne yapayım?')");
  await kp.waitForSelector(".tk-acilir .tk-oneri b");
  await bekle(300);
  ok("simdi ne yapayim: tek oneri + nedenler; kendiliginden eklemez", (await kp.locator(".tk-acilir .tk-oneri").count()) === 1 && (await kp.locator(".tk-acilir .tk-oneri li").count()) >= 2 &&
    (await kApi({ islem: "veri" })).veri.bloklar.length === blokSayi);
  await kp.click(".tk-acilir button:has-text('yerleştir')");
  await kp.waitForSelector(".toast:has-text('Edit zamanı ayrıldı')");
  for (bn = 0; bn < 50 && (await kApi({ islem: "veri" })).veri.bloklar.length === blokSayi; bn++) await bekle(100);
  ok("simdi ne yapayim: basinca blok eklenir", (await kApi({ islem: "veri" })).veri.bloklar.length === blokSayi + 1);
  // Takvim ayarlari yalniz degisen alani yazar: dokunulmayan saat yuvarlanmaz (08:30 kalir), baska cihazin degistirdigi
  // saatler hedefi degistiren kaydetmeyle geri donmez; ayni alan iki yerde degistiyse sessizce ezilmez.
  async function ayarYaz(ek) {
    var a = (await kApi({ islem: "veri" })).veri.ayar;
    return kApi({ islem: "kaydet", tur: "ayar", id: "ayar", surum: a.surum, veri: Object.assign({ varsayilanStokUyari: a.varsayilanStokUyari === undefined ? null : a.varsayilanStokUyari }, ek) });
  }
  var ayarIlk = (await kApi({ islem: "veri" })).veri.ayar;
  await ayarYaz({ calismaBas: 510, calismaBit: 1140 });
  await kp.goto(HAFTA);
  await kp.reload();
  await kp.waitForSelector(kart("ea"));
  var toastSil = function () { return kp.evaluate(function () { document.querySelectorAll(".toast").forEach(function (t) { t.remove(); }); }); };
  await kp.click(".tk-arac button[aria-label='Takvim ayarları']");
  var basSecim = await kp.locator(".tk-acilir select[aria-label='Çalışma başı']").evaluate(function (e) { return e.value + "|" + e.options[e.selectedIndex].textContent; });
  await kp.fill(".tk-acilir input[aria-label='Haftalık hedef']", "41");
  await toastSil();
  await kp.click(".tk-acilir button:has-text('Kaydet')");
  await kp.waitForSelector(".toast:has-text('Takvim ayarları kaydedildi.')");
  var ay = (await kApi({ islem: "veri" })).veri.ayar;
  ok("takvim ayarlari: kayitli 08:30 secili gorunur; yalniz hedef degisince 510 yuvarlanmaz", basSecim === "510|08:30" && ay.calismaBas === 510 && ay.calismaBit === 1140 && ay.haftalikHedef === 41,
    JSON.stringify([basSecim, ay]));
  await ayarYaz({ calismaBas: 480, calismaBit: 1260 }); // baska cihaz saatleri degistirir; bu sayfa eski surumu biliyor
  await kp.click(".tk-arac button[aria-label='Takvim ayarları']");
  await kp.fill(".tk-acilir input[aria-label='Haftalık hedef']", "42");
  await toastSil();
  await kp.click(".tk-acilir button:has-text('Kaydet')");
  await kp.waitForSelector(".toast:has-text('Takvim ayarları kaydedildi.')");
  ay = (await kApi({ islem: "veri" })).veri.ayar;
  ok("takvim ayarlari 409: baska cihazin saatleri (480/1260) korunur, yalniz hedef yazilir", ay.calismaBas === 480 && ay.calismaBit === 1260 && ay.haftalikHedef === 42, JSON.stringify(ay));
  await ayarYaz({ haftalikHedef: 7 }); // baska cihaz ayni alani (hedef) degistirir
  await kp.click(".tk-arac button[aria-label='Takvim ayarları']");
  await kp.fill(".tk-acilir input[aria-label='Haftalık hedef']", "9");
  await toastSil();
  await kp.click(".tk-acilir button:has-text('Kaydet')");
  await kp.waitForSelector(".tk-acilir .tk-hata:has-text('başka bir yerde')", { timeout: 8000 }).catch(function () {});
  ay = (await kApi({ islem: "veri" })).veri.ayar;
  var ayPen = (await kp.locator(".tk-acilir input[aria-label='Haftalık hedef']").count()) ? [await kp.locator(".tk-acilir input[aria-label='Haftalık hedef']").inputValue(),
    await kp.locator(".tk-acilir select[aria-label='Çalışma sonu']").inputValue()] : ["pencere kapandı"];
  ok("takvim ayarlari: ayni alan baska yerde de degistiyse ustune yazilmaz; guncel deger yuklenir ve soylenir", ay.haftalikHedef === 7 && ayPen.join() === "7,1260", JSON.stringify([ay, ayPen]));
  if (await kp.locator(".tk-acilir .tk-kapat").count()) await kp.click(".tk-acilir .tk-kapat");
  await ayarYaz({ calismaBas: 540, calismaBit: 1140, haftalikHedef: ayarIlk.haftalikHedef === undefined ? null : ayarIlk.haftalikHedef });

  // Eski (tamamZaman'i olmayan) tamamlanmis cekimin baska alani duzenlenince bugun tamamlanmis sayilmaz
  await kApi({ islem: "kaydet", tur: "etkinlik", id: kid("eleg"), veri: { musteriId: kid("ta"), tur: "cekim", baslik: "Eski tamamlanmış çekim", tumGun: false, konum: "", not: "",
    durum: "tamamlandi", basTarih: "2099-12-12", basSaat: "16:00", bitTarih: "2099-12-12", bitSaat: "17:00", arsiv: false } });
  await kp.goto(HAFTA);
  await kp.reload();
  await kp.waitForSelector(kart("eleg"));
  var bugunOnce = await bugunSayi();
  await kp.click(kart("eleg") + " .is");
  await kp.click(".tk-acilir button:has-text('Düzenle')");
  var ld = kp.locator("dialog[open]");
  await alanGirdi(ld, "Konum", "input").fill("Yeni stüdyo");
  await ld.locator("button[type=submit]").click();
  await kp.waitForSelector("dialog[open]", { state: "detached" });
  var leg = await kBekle("etkinlikler", kid("eleg"), function (k) { return k.konum === "Yeni stüdyo"; });
  ok("eski tamamlanmis cekim duzenlenince tamamZaman uydurulmaz; 'Bugün' sayisi degismez", leg.konum === "Yeni stüdyo" && leg.tamamZaman === null && (await bugunSayi()) === bugunOnce,
    JSON.stringify([leg.tamamZaman, bugunOnce]));
  await kApi({ islem: "kaydet", tur: "blok", id: kid("bleg"), veri: { musteriId: kid("ta"), icerikIdler: [], baslik: "Eski tamamlanmış blok", basTarih: "2099-12-12", basSaat: "18:00",
    bitTarih: "2099-12-12", bitSaat: "19:00", durum: "tamamlandi", not: "" } });
  await kp.reload();
  await kp.waitForSelector(kart("bleg"));
  await kp.click(kart("bleg") + " .is");
  await kp.click(".tk-acilir button:has-text('Düzenle')");
  ld = kp.locator("dialog[open]");
  await alanGirdi(ld, "Not", "textarea").fill("Not eklendi");
  await ld.locator("button[type=submit]").click();
  await kp.waitForSelector("dialog[open]", { state: "detached" });
  var blg = await kBekle("bloklar", kid("bleg"), function (k) { return k.not === "Not eklendi"; });
  ok("eski tamamlanmis blok duzenlenince de tamamZaman uydurulmaz", blg.not === "Not eklendi" && blg.tamamZaman === null && (await bugunSayi()) === bugunOnce, JSON.stringify(blg));

  // Takvimde tek "Geri al" bildirimi: tasima sonrasi pencereden kaydetme onceki geri almayi kaldirir; kalan geri al calisir
  var eaOnce = await kKayit("etkinlikler", kid("ea"));
  await kp.focus(kart("ea"));
  await kp.keyboard.press("ArrowDown");
  await kp.waitForSelector(".toast:has-text('Taşındı') button:has-text('Geri al')");
  await kp.waitForSelector(".tk-kayit.tamam");
  await kp.click(kart("ea") + " .is");
  await kp.click(".tk-acilir button:has-text('Düzenle')");
  ld = kp.locator("dialog[open]");
  await alanGirdi(ld, "Konum", "input").fill("Pencereden konum");
  await ld.locator("button[type=submit]").click();
  await kp.waitForSelector("dialog[open]", { state: "detached" });
  await kp.waitForSelector(".toast:has-text('Kaydedildi.') button:has-text('Geri al')");
  ok("takvimde pencereden kaydetme: tek 'Geri al' bildirimi kalir", (await kp.locator(".toast button:has-text('Geri al')").count()) === 1 &&
    (await kp.locator(".toast:has-text('Taşındı')").count()) === 0);
  await kp.click(".toast button:has-text('Geri al')");
  var eaG = await kBekle("etkinlikler", kid("ea"), function (k) { return k.konum !== "Pencereden konum"; });
  ok("kalan 'Geri al' pencere degisikligini geri alir (409 yok, tasima yerinde kalir)", eaG.konum === eaOnce.konum && eaG.basSaat !== eaOnce.basSaat &&
    eaG.basTarih === eaOnce.basTarih && (await kp.locator(".toast.hata").count()) === 0, JSON.stringify([eaOnce, eaG]));
  await kp.focus(kart("ea"));
  await kp.keyboard.press("ArrowUp");
  await kBekle("etkinlikler", kid("ea"), function (k) { return k.basSaat === eaOnce.basSaat; });
  await kp.waitForSelector(".tk-kayit.tamam");

  // Eski baglantilar: #/takvim de ayni sayfa; masaustunde yatay tasma yok
  await kp.goto(URL_ + "#/takvim?g=hafta&t=2099-12-08");
  await kp.waitForSelector(kart("ea"));
  ok("#/takvim ve eski #/cekim adresleri ayni takvimi acar", await kp.locator(".yan-menu a.aktif[data-rota=cekim]").count() === 1);
  ok("masaustu 1440: yatay tasma yok", await kp.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; }) <= 1);
  // Gezinme: sonraki hafta, kucuk tarih secici, Bugün; simdi cizgisi (Istanbul 12:00); resmi tatil seridi
  await kp.goto(HAFTA);
  await kp.waitForSelector(kart("ea"));
  await kp.click(".tk-arac button[aria-label='Sonraki']");
  await kp.waitForSelector(".tk-donem:has-text('14–20 Aralık 2099')");
  await kp.click(".tk-donem");
  await kp.click(".tk-acilir .tk-mini-ay button[aria-label='Çarşamba 2 Aralık 2099']");
  await kp.waitForSelector(".tk-donem:has-text('30 Kasım – 6 Aralık 2099')");
  ok("onceki / sonraki ve kucuk tarih secici haftayi degistirir", /t=2099-12-02/.test(kp.url()), kp.url());
  await kp.click(".tk-arac button:has-text('Bugün')");
  await kp.waitForSelector(".tk-kolon[data-gun='2099-10-20'] .tk-simdi");
  var simdiTop = await kp.locator(".tk-simdi").evaluate(function (e) { return parseFloat(e.style.top); });
  ok("Bugün: bu hafta; simdi cizgisi Istanbul 12:00'de (cihaz saat diliminden bagimsiz)", Math.abs(simdiTop - (12 * 60 - VBAS) * PP) < 1 && await kp.locator(".tk-gun-bas.bugun:has-text('20')").count() === 1, simdiTop);
  await kp.goto(URL_ + "#/cekim?g=hafta&t=2099-10-29");
  await kp.waitForSelector(".tk-tumgun .hucre[data-gun='2099-10-29'] .tk-serit.tatil:has-text('Cumhuriyet Bayramı')");
  ok("resmi tatil seridi: 28 Ekim yarim gun (13.00'ten sonra), 29 Ekim Cumhuriyet Bayramı",
    await kp.locator(".tk-tumgun .hucre[data-gun='2099-10-28'] .tk-serit.tatil:has-text('13.00')").count() === 1);
  // Hareket azaltma: tik animasyonu oynamaz
  await kp.goto(HAFTA);
  await kp.waitForSelector(kart("ea"));
  await kp.emulateMedia({ reducedMotion: "reduce" });
  await kp.click(kart("ea") + " .tk-tik");
  await kp.waitForSelector(kart("ea") + " .tk-tik.cizil");
  ok("hareket azaltma: tik animasyonu kapali", await kp.locator(kart("ea") + " .tk-tik.cizil").evaluate(function (e) { return getComputedStyle(e).animationName; }) === "none");
  await kp.click(".toast button:has-text('Geri al')");
  await kBekle("etkinlikler", kid("ea"), function (k) { return k.durum === "planlandi"; });
  ok("takvim masaustu: sayfa hatasi yok", khatalar.length === 0, khatalar.join(" | "));
  if (EKRAN) await kp.screenshot({ path: path.join(EKRAN, "masaustu-takvim-hafta.png") });
  await kctx.close();

  /* ---------- Takvim telefonda (390) ---------- */
  var tctx2 = await tarayici.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, timezoneId: "Europe/Istanbul", locale: "tr-TR" });
  var tp2 = await tctx2.newPage();
  var t2hatalar = [];
  tp2.on("pageerror", function (e) { t2hatalar.push(String(e)); });
  await tp2.clock.setFixedTime(new Date("2099-10-20T09:00:00Z"));
  await tp2.goto(URL_);
  await tp2.fill("#studio-sifre", SIFRE);
  await tp2.click("button[type=submit]");
  await tp2.waitForSelector(".menu-dugme");
  await tp2.goto(URL_ + "#/cekim?t=2099-12-08");
  await tp2.waitForSelector(".tk-tel " + kart("etas"));
  ok("telefon: varsayilan gun gorunumu (Salı, 8 Aralık), alt cubuk ve + dugmesi", (await tp2.locator(".tk-tel-ust h1 .uzun").textContent()) === "Salı, 8 Aralık" &&
    (await tp2.locator(".tk-kolon").count()) === 1 && await tp2.locator(".tk-tel-alt .tk-fab").isVisible());
  var telOlcu = await tp2.evaluate(function () {
    var dugme = [].slice.call(document.querySelectorAll(".tk-tel-ust button, .tk-tel-alt button")).filter(function (b) { return b.offsetParent; });
    return { tasma: document.documentElement.scrollWidth - window.innerWidth, enKucuk: Math.min.apply(null, dugme.map(function (b) { return Math.round(b.getBoundingClientRect().height); })) };
  });
  ok("telefon: yatay tasma yok, dokunma hedefleri en az 44 px", telOlcu.tasma <= 1 && telOlcu.enKucuk >= 44, JSON.stringify(telOlcu));
  await tp2.locator(kart("etas")).evaluate(function (e) { e.scrollIntoView({ block: "center" }); }); // alttaki sabit cubugun altinda kalmasin
  await tp2.locator(kart("etas")).tap();
  await tp2.waitForSelector(".tk-acilir.tk-alt button[aria-label='15 dakika sonra']");
  var adimBoy = await tp2.evaluate(function () {
    return Math.min.apply(null, [].filter.call(document.querySelectorAll(".tk-acilir .btn"), function (b) { return b.offsetParent; }).map(function (b) { return b.getBoundingClientRect().height; }));
  });
  ok("telefon: ayrinti alttan acilir, adim dugmeleri en az 44 px", adimBoy >= 44, adimBoy);
  await tp2.locator(".tk-acilir button[aria-label='15 dakika sonra']").tap();
  var etas = await kBekle("etkinlikler", kid("etas"), function (k) { return k.basSaat === "17:15"; }, tp2);
  ok("telefon: '+15' dugmesiyle suruklemeden tasinir (17:15-18:15)", etas && etas.basSaat === "17:15" && etas.bitSaat === "18:15", JSON.stringify(etas));
  await tp2.reload();
  await tp2.waitForSelector(kart("etas"));
  ok("telefon: yenilemeden sonra yeni saatte", /^17:15–18:15/.test(await tp2.locator(kart("etas") + " .zaman").textContent()));
  await tp2.locator(".tk-hafta-serit button[aria-label^='Perşembe']").tap();
  await tp2.waitForSelector(".tk-tel-ust h1:has-text('Perşembe, 10 Aralık')");
  ok("telefon: hafta seridinden gun secilir", /t=2099-12-10/.test(tp2.url()));
  await tp2.goto(URL_ + "#/cekim?g=gun&t=2099-12-14");
  await tp2.waitForSelector(".tk-tel-ust h1:has-text('Pazartesi, 14 Aralık')");
  var ky = await tp2.locator(".tk-kaydirma").boundingBox();
  await tp2.mouse.move(ky.x + ky.width - 20, ky.y + 200);
  await tp2.mouse.down();
  await tp2.mouse.move(ky.x + 40, ky.y + 210, { steps: 6 });
  await tp2.mouse.up();
  await tp2.waitForSelector(".tk-tel-ust h1:has-text('Salı, 15 Aralık')", { timeout: 5000 }).catch(function () {});
  ok("telefon: yana kaydirinca sonraki gun", /t=2099-12-15/.test(tp2.url()), tp2.url());
  var kol = await tp2.locator(".tk-kolon").boundingBox();
  await tp2.touchscreen.tap(kol.x + kol.width / 2, kol.y + (11 * 60 - VBAS) * (56 / 60) + 5);
  await tp2.waitForSelector(".tk-acilir.tk-alt:has-text('Yeni iş')", { timeout: 5000 }).catch(function () {});
  ok("telefon: bos saate dokununca 'Yeni iş' (bir saat, musteri zorunlu)", /11:00–12:00/.test(await tp2.locator(".tk-acilir").textContent().catch(function () { return ""; })));
  await tp2.locator(".tk-acilir .tk-kapat").tap();
  await tp2.waitForSelector(".tk-acilir", { state: "detached" });
  // Dokunmanin ardindan gelen click yeni alt sayfaya dusmez: gorunur izgaranin ustunde (perde), ortasinda (tur dugmeleri)
  // ve altinda (girdiler) dokununca pencere acik kalir, tur Edit kalir, klavye acan girdiye odaklanilmaz
  var hayalet = [];
  var kyG = await tp2.locator(".tk-kaydirma").boundingBox(), kolG = await tp2.locator(".tk-kolon").boundingBox();
  var ustY = Math.max(kyG.y, kolG.y) + 12, altY = Math.min(kyG.y + kyG.height, 844 - 100);
  for (var hf of [0, 0.25, 0.45, 0.6, 0.75, 0.9]) {
    var hy = Math.round(ustY + (altY - ustY) * hf), hx = Math.round(kolG.x + kolG.width * 0.6);
    var hedefEl = await tp2.evaluate(function (n) { var e = document.elementFromPoint(n[0], n[1]); return e ? e.className : ""; }, [hx, hy]);
    if (!/tk-kolon|tk-dilim|tk-disari/.test(hedefEl)) continue;
    await tp2.touchscreen.tap(hx, hy);
    await bekle(400);
    hayalet.push(await tp2.evaluate(function (y) {
      var a = document.querySelector(".tk-acilir"), ed = a && a.querySelector(".tk-secim button[aria-pressed=true]"), od = document.activeElement;
      return y + ":" + (a ? "acik" : "kapali") + "," + (ed ? ed.textContent : "-") + "," + (od ? od.tagName : "-");
    }, hy));
    if (await tp2.locator(".tk-acilir").count()) { await tp2.locator(".tk-acilir .tk-kapat").tap(); await tp2.waitForSelector(".tk-acilir", { state: "detached" }); }
  }
  ok("telefon: bos saate dokunmanin ardindaki click alt sayfayi kapatmaz, turu degistirmez, klavyeyi acmaz", hayalet.length >= 4 &&
    hayalet.every(function (x) { return /:acik,Edit,(DIV)$/.test(x); }), JSON.stringify(hayalet));
  await tp2.locator(".tk-tel-alt button:has-text('Planlanacaklar')").tap();
  await tp2.waitForSelector(".tk-acilir.tk-alt:has-text('Planlanacaklar') .tk-cek-kart");
  ok("telefon: Planlanacaklar alttan, 'Zaman ayır' dugmeli", (await tp2.locator(".tk-acilir .tk-cek-kart button:has-text('Zaman ayır')").count()) > 0);
  var tasma2 = await tp2.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; });
  ok("telefon: acik alt pencereyle de yatay tasma yok", tasma2 <= 1, tasma2);
  if (EKRAN) await tp2.screenshot({ path: path.join(EKRAN, "telefon-takvim-gun.png") });
  ok("takvim telefon: sayfa hatasi yok", t2hatalar.length === 0, t2hatalar.join(" | "));
  await tctx2.close();

  /* ===== Takvim: telefon genislikleri, masaustu genislikleri, klavye, ekran okuyucu, hareket azaltma, saglamlik, saat dilimi ===== */
  async function oturumAc(secenek, an) {
    var c = await tarayici.newContext(Object.assign({ timezoneId: "Europe/Istanbul", locale: "tr-TR" }, secenek));
    var p = await c.newPage(), hata = [];
    p.on("pageerror", function (e) { hata.push(String(e)); });
    p.on("console", function (m) { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) hata.push(m.text()); });
    await p.clock.setFixedTime(new Date(an || "2099-10-20T09:00:00Z"));
    await p.goto(URL_);
    await p.fill("#studio-sifre", SIFRE);
    await p.click("button[type=submit]");
    await p.waitForSelector(".yan-menu", { state: "attached" });
    return { c: c, p: p, hata: hata };
  }
  var eid = function (k) { return (k + "erisimtest000000").slice(0, 16); };
  var UZUN_AD = "Erişim Kafe Uzun Adlı Örnek Müşteri Limited Şirketi Ve Ortakları Yapım Hizmetleri";
  var eMus = function (k, ad, ek) { return { tur: "musteri", id: eid(k), veri: Object.assign({ ad: ad, kurum: "", ucret: null, siklik: { tur: "belirsiz" }, slotTuru: "video", stokGirisi: false, not: "", arsiv: false }, ek) }; };
  var eEtk = function (k, o) { return { tur: "etkinlik", id: eid(k), veri: Object.assign({ musteriId: eid("ma"), tur: "cekim", tumGun: false, konum: "", not: "", durum: "planlandi", arsiv: false }, o) }; };
  var eBlok = function (k, o) { return { tur: "blok", id: eid(k), veri: Object.assign({ musteriId: eid("ma"), icerikIdler: [], baslik: "", durum: "planlandi", not: "" }, o) }; };
  var eIc = function (k, o) {
    return { tur: "icerik", id: eid(k), veri: Object.assign({ musteriId: eid("mb"), tur: "reels", durum: "kurguda", oncelik: "normal", cekimId: null, teslimTarihi: null, planTarihi: null, yayinTarihi: null,
      revizyonNotu: "", dosyalar: { ham: "", proje: "", final: "" }, not: "", gecmis: [], arsiv: false }, o) };
  };
  var gun15 = function (o) { return Object.assign({ basTarih: "2099-12-15", bitTarih: "2099-12-15" }, o); };
  var es = await oturumAc({ viewport: { width: 1440, height: 900 } });
  var es1 = await kApi({ islem: "toplu", kayitlar: [eMus("ma", UZUN_AD), eMus("mb", "Erişim Butik"), eMus("mc", "Erişim Klinik"), eMus("md", "Erişim Arşiv Müşterisi", { arsiv: true })] }, es.p);
  var es2 = await kApi({ islem: "toplu", kayitlar: [
    eEtk("x1", gun15({ baslik: "Erişim çekimi 1", basSaat: "10:00", bitSaat: "12:00" })),
    eEtk("x2", gun15({ musteriId: eid("mb"), baslik: "Erişim çekimi 2", basSaat: "10:30", bitSaat: "11:30" })),
    eEtk("x3", gun15({ musteriId: eid("mc"), baslik: "Erişim çekimi 3", basSaat: "11:00", bitSaat: "12:30" })),
    eEtk("xtas", gun15({ musteriId: eid("mb"), baslik: "Erişim taşınan çekim", basSaat: "17:00", bitSaat: "18:00" })),
    eEtk("xars", { musteriId: eid("md"), baslik: "Arşiv müşterisinin çekimi", basTarih: "2099-12-16", basSaat: "10:00", bitTarih: "2099-12-16", bitSaat: "11:00" }),
    eEtk("xarsk", { musteriId: eid("mb"), baslik: "Arşivlenmiş çekim", basTarih: "2099-12-16", basSaat: "13:00", bitTarih: "2099-12-16", bitSaat: "14:00", arsiv: true }),
    eEtk("xgec", { musteriId: eid("mc"), baslik: "Uzak geçmiş çekimi", basTarih: "1990-03-06", basSaat: "10:00", bitTarih: "1990-03-06", bitSaat: "11:00" }),
    eEtk("xgel", { musteriId: eid("mc"), baslik: "Uzak gelecek çekimi", basTarih: "2150-06-10", basSaat: "22:00", bitTarih: "2150-06-11", bitSaat: "02:00" }),
    eEtk("xcok", { musteriId: eid("mc"), baslik: "Üç günlük çekim", basTarih: "2099-12-22", basSaat: "10:00", bitTarih: "2099-12-24", bitSaat: "12:00" }),
    eBlok("bk1", gun15({ musteriId: eid("mb"), basSaat: "15:00", bitSaat: "15:30", baslik: "Kısa blok B" })),
    eBlok("bk2", gun15({ musteriId: eid("mc"), basSaat: "15:00", bitSaat: "15:30", baslik: "Kısa blok C" }))] }, es.p);
  var es3 = await kApi({ islem: "toplu", kayitlar: [
    eIc("igec", { baslik: "Gecikmiş reels", teslimTarihi: "2099-10-19" }),
    eIc("iars", { musteriId: eid("md"), baslik: "Arşiv müşteri reels", teslimTarihi: "2099-12-17" })] }, es.p);
  ok("erisim testi verisi kuruldu", es1.ok && es2.ok && es3.ok, JSON.stringify([es1, es2, es3]).slice(0, 400));
  var ekart = function (k) { return ".tk-kart[data-id='" + eid(k) + "']"; };

  // Kolondaki kartlar: kolon icinde, birbiriyle ust uste binmez; musteri adi gorunur (en az 28 px, bos degil)
  async function kolonDenetle(p, gun) {
    return p.evaluate(function (gun) {
      var kol = document.querySelector(".tk-kolon[data-gun='" + gun + "']"), kr = kol.getBoundingClientRect(), sorun = [];
      // gizli kart: dar kolonda sigmayan serit ("+N" listesinde); gorunenler denetlenir
      var kartlar = [].slice.call(kol.querySelectorAll(".tk-kart, .tk-fazla")).filter(function (e) { return !e.hidden; }).map(function (e) { return { e: e, r: e.getBoundingClientRect() }; });
      kartlar.forEach(function (a, i) {
        if (a.r.left < kr.left - 1 || a.r.right > kr.right + 1) sorun.push("kolon disi " + a.e.getAttribute("data-id"));
        kartlar.slice(i + 1).forEach(function (b) {
          var x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (x > 1 && y > 1) sorun.push("cakisan kutu " + a.e.getAttribute("data-id") + "/" + b.e.getAttribute("data-id"));
        });
        var m = a.e.querySelector(".mus");
        if (m && (getComputedStyle(m).display === "none" || m.getBoundingClientRect().width < 28 || m.getBoundingClientRect().height < 8 || !m.textContent.trim())) sorun.push("ad gorunmuyor " + a.e.getAttribute("data-id") + " " + Math.round(m.getBoundingClientRect().width));
      });
      return { sorun: sorun, kartlar: kartlar.filter(function (a) { return a.e.classList.contains("tk-kart"); }).map(function (a) { return a.e.getAttribute("data-id"); }),
        fazla: [].map.call(kol.querySelectorAll(".tk-fazla"), function (e) { return e.getAttribute("aria-label"); }).join(" | ") };
    }, gun);
  }

  /* ---- Masaustu 1280 / 1440 / 1920: tasma yok, cakisma seritlerinde musteri adi okunur, sigmayanlar "+N" ---- */
  for (var mg of [1280, 1440, 1920]) {
    await es.p.setViewportSize({ width: mg, height: mg === 1920 ? 1080 : 860 });
    await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-12-15");
    await es.p.reload();
    await es.p.waitForSelector(ekart("xtas"));
    var md = await kolonDenetle(es.p, "2099-12-15");
    var ucu = ["x1", "x2", "x3"].map(function (k) { return md.kartlar.indexOf(eid(k)) !== -1 || md.fazla.indexOf(["Erişim Kafe", "Erişim Butik", "Erişim Klinik"][+k.slice(1) - 1]) !== -1; });
    ok("masaustu " + mg + ": yatay tasma yok; kartlar kolonda, ust uste binmez, musteri adi okunur", (await es.p.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; })) <= 1 &&
      !md.sorun.length, JSON.stringify(md));
    ok("masaustu " + mg + ": uc cakisan isin her biri ya kart ya da '+N iş daha' icinde", ucu.every(Boolean), JSON.stringify([ucu, md]));
    if (EKRAN) await es.p.screenshot({ path: path.join(EKRAN, "takvim-masaustu-" + mg + ".png") });
  }
  ok("1920'de uc serit sigar ('+N' yok); 1280'de '+N iş daha' dugmesi", md.fazla === "" && md.kartlar.length >= 3, JSON.stringify(md));
  await es.p.setViewportSize({ width: 1280, height: 860 });
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-12-15");
  await es.p.reload();
  await es.p.waitForSelector(".tk-kolon[data-gun='2099-12-15'] .tk-fazla");
  var fz = es.p.locator(".tk-kolon[data-gun='2099-12-15'] .tk-fazla").first();
  ok("'+N iş daha': gorunur metin ve isimleri sayan ekran okuyucu etiketi", /^\+\d iş daha$/.test(await fz.textContent()) &&
    /iş daha bu saatlerde: .*Erişim/.test(await fz.getAttribute("aria-label")), await fz.getAttribute("aria-label"));
  await fz.click();
  await es.p.waitForSelector(".tk-acilir:has-text('Aynı saatlerde')");
  var fzListe = await es.p.locator(".tk-acilir li").allTextContents();
  await es.p.locator(".tk-acilir li button").first().click();
  await es.p.waitForSelector(".tk-acilir .eylem button:has-text('Çekimi tamamla')");
  ok("'+N' listesi sigmayan isleri sayar; birine basinca ayrintisi acilir", fzListe.length >= 1 && fzListe.every(function (t) { return /Erişim/.test(t); }) &&
    /Erişim/.test(await es.p.locator(".tk-acilir h3").textContent()), JSON.stringify(fzListe));
  await es.p.keyboard.press("Escape");

  /* ---- Renk tek isaret degil: cakisma isareti, gecikmis teslim metni, filtre noktalarinin bicimi, tamamlanan cizili ---- */
  await es.p.setViewportSize({ width: 1440, height: 900 });
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-12-15");
  await es.p.waitForSelector(ekart("bk1"));
  var renk = await es.p.evaluate(function (a) {
    var k1 = document.querySelector(a[0]), sec = document.querySelectorAll(".tk-secim[aria-label='Gösterilen işler'] button");
    return { kisaCak: k1.classList.contains("kucuk-kart") && /⚠/.test(k1.textContent) && /çakışma var/.test(k1.getAttribute("aria-label")),
      buyukCak: /⚠ Çakışma/.test(document.querySelector(a[1]).textContent),
      nokta: !!sec[0].querySelector("svg.tk-ikon circle") && !!sec[1].querySelector("svg.tk-ikon path") && sec[0].textContent === "Çekim" && sec[1].textContent === "Edit" };
  }, [ekart("bk1"), ekart("x1")]);
  ok("cakisma renkten bagimsiz: kisa kartta ⚠ isareti, buyuk kartta '⚠ Çakışma' yazisi; filtrede tur simgesi (kamera / makas) ve yazisi", renk.kisaCak && renk.buyukCak && renk.nokta, JSON.stringify(renk));
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-10-19");
  await es.p.waitForSelector(".tk-serit.teslim.gecikti");
  ok("gecikmis teslim renkten bagimsiz: 'Gecikti · Erişim Butik' yazar", /^Gecikti · Erişim Butik/.test(await es.p.locator(".tk-serit.teslim.gecikti").first().textContent()) &&
    (await es.p.locator(".tk-cek-kart:has-text('Erişim Butik') .gecikti").textContent()).indexOf("(gecikti)") !== -1);

  /* ---- Arsivli musteri ve arsivli kayit: eski takvimdeki gibi (cekim gorunur; icerik / teslim / planlanacaklar gizli) ---- */
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-12-16");
  await es.p.waitForSelector(ekart("xars"));
  ok("arsivli kayit gizli; arsivli musterinin teslim bayragi, cekmece grubu ve musteri secimi yok (cekim eskisi gibi gorunur)",
    (await es.p.locator(ekart("xarsk")).count()) === 0 && (await es.p.locator(".tk-serit.teslim:has-text('Erişim Arşiv')").count()) === 0 &&
    (await es.p.locator(".tk-cek-kart:has-text('Erişim Arşiv')").count()) === 0 && (await es.p.locator(".tk-arac select[aria-label='Müşteri'] option:has-text('Erişim Arşiv')").count()) === 0);

  /* ---- Ekran okuyucu etiketleri ---- */
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-12-15");
  await es.p.waitForSelector(ekart("x1"));
  var etiket = await es.p.evaluate(function () {
    var adsiz = [].filter.call(document.querySelectorAll(".tk button, .tk [role=button], .tk select, .tk input"), function (b) {
      return b.offsetParent && !((b.getAttribute("aria-label") || "").trim() || (b.textContent || "").trim() || (b.closest("label") && b.closest("label").textContent.trim()));
    }).map(function (b) { return b.outerHTML.slice(0, 80); });
    var kartlar = [].map.call(document.querySelectorAll(".tk-kart"), function (k) { return k.getAttribute("aria-label"); });
    var kol = document.querySelector(".tk-kolon[data-gun='2099-12-15']");
    return { adsiz: adsiz, kartlar: kartlar, kolon: kol.getAttribute("role") + "|" + kol.getAttribute("aria-label"),
      kayit: document.querySelector(".tk-kayit").getAttribute("role") + "|" + document.querySelector(".tk-kayit").getAttribute("aria-live"),
      kartRol: [].map.call(document.querySelectorAll(".tk-kart"), function (k) { return k.getAttribute("role"); }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(),
      icIce: document.querySelectorAll(".tk [role=button] button, .tk button button").length,
      gruplar: [].map.call(document.querySelectorAll(".tk-secim"), function (g) { return g.getAttribute("role") + ":" + g.getAttribute("aria-label"); }).join(",") };
  });
  ok("ekran okuyucu: her dugme / girdi adli; kart etiketi tur, musteri, is, gun ve saat icerir; kolon 'Salı 15 Aralık' grubu; kart role=group (tamamla dugmesi ayri denetim, dugme icinde dugme yok); kayit gostergesi canli bolge degil",
    !etiket.adsiz.length && etiket.kartlar.every(function (l) { return /^(Çekim|Edit bloğu|Toplantı|Etkinlik): .+, .+, \S+ \d\d:\d\d–\d\d:\d\d/.test(l); }) &&
    etiket.kolon === "group|Salı 15 Aralık" && etiket.kayit === "null|off" && etiket.kartRol === "group" && etiket.icIce === 0 &&
    etiket.gruplar === "group:Gösterilen işler,group:Görünüm", JSON.stringify(etiket).slice(0, 600));

  /* ---- Yalniz klavye: Yeni -> musteri sec -> kaydet -> ok ile tasi -> Enter ayrinti -> bloku tamamla -> Esc odak kartta ---- */
  async function tabla(p, kosul, en) {
    for (var i = 0; i < (en || 90); i++) { if (await p.evaluate(kosul)) return true; await p.keyboard.press("Tab"); }
    return p.evaluate(kosul);
  }
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-12-15");
  await es.p.reload();
  await es.p.waitForSelector(ekart("x1"));
  var kl = [];
  kl.push(await tabla(es.p, function () { var a = document.activeElement; return !!a && a.matches(".tk-arac button") && a.textContent.trim() === "Yeni"; }));
  await es.p.keyboard.press("Enter");
  await es.p.waitForSelector(".tk-acilir:has-text('Yeni iş')");
  kl.push(await es.p.evaluate(function () { return !!document.activeElement.closest(".tk-acilir"); }));
  kl.push(await tabla(es.p, function () { return document.activeElement && document.activeElement.matches(".tk-acilir select[aria-label='Müşteri']"); }, 6));
  // musteri listede ok tuslariyla secilir (kapali secim kutusunda asagi ok degeri degistirir)
  for (var kn = 0; kn < 80 && (await es.p.evaluate(function () { return document.activeElement.value; })) !== eid("mb"); kn++) await es.p.keyboard.press("ArrowDown");
  kl.push(await es.p.evaluate(function (id) { return document.activeElement.value === id; }, eid("mb")));
  kl.push(await tabla(es.p, function () { return document.activeElement && document.activeElement.matches(".tk-acilir input[aria-label='İş adı']"); }, 4));
  await es.p.keyboard.type("Klavye edit");
  kl.push(await tabla(es.p, function () { return document.activeElement && document.activeElement.textContent.trim() === "Kaydet"; }, 8));
  await es.p.keyboard.press("Enter");
  await es.p.waitForSelector(".toast:has-text('Edit zamanı ayrıldı: Erişim Butik')");
  var kb1;
  for (bn = 0; bn < 50 && !kb1; bn++) { kb1 = (await kApi({ islem: "veri" }, es.p)).veri.bloklar.filter(function (b) { return b.baslik === "Klavye edit"; })[0]; if (!kb1) await bekle(100); }
  ok("klavye: Tab ile 'Yeni', Enter, musteri oklarla secilir, Kaydet (pazartesi 09:00-10:00 blok)", kl.every(Boolean) && !!kb1 && kb1.musteriId === eid("mb") && kb1.basTarih === "2099-12-14" && kb1.basSaat === "09:00", JSON.stringify([kl, kb1]));
  var odakKb = function () { return es.p.waitForFunction(function (id) { return document.activeElement && document.activeElement.getAttribute("data-id") === id; }, kb1.id, { timeout: 5000 }).then(function () { return true; }, function () { return false; }); };
  var kOdak = await odakKb();
  ok("klavye: yeni kart kaydedilince odak kartta ve odak gorunur (focus-visible)", kOdak && await es.p.evaluate(function () { return document.activeElement.matches(":focus-visible"); }));
  await es.p.waitForSelector(".tk-kayit.tamam");
  await es.p.keyboard.press("ArrowDown");
  var kb2 = await kBekle("bloklar", kb1.id, function (k) { return k.basSaat === "09:15"; }, es.p);
  await es.p.waitForSelector(".tk-kayit.tamam");
  await odakKb();
  await es.p.keyboard.press("Enter");
  await es.p.waitForSelector(".tk-acilir .eylem button:has-text('Bloğu tamamla')");
  var tamamOdak = await tabla(es.p, function () { return document.activeElement && document.activeElement.textContent.trim() === "Bloğu tamamla"; }, 15);
  await es.p.keyboard.press("Enter");
  var kb3 = await kBekle("bloklar", kb1.id, function (k) { return k.durum === "tamamlandi"; }, es.p);
  ok("klavye: ok ile 15 dk tasindi, Enter ayrinti, Tab + Enter ile blok tamamlandi", kb2.basSaat === "09:15" && tamamOdak && kb3.durum === "tamamlandi", JSON.stringify([kb2.basSaat, tamamOdak, kb3.durum]));
  await es.p.waitForSelector(".tk-kayit.tamam");
  await odakKb();
  await es.p.keyboard.press("Enter");
  await es.p.waitForSelector(".tk-acilir[role=dialog]");
  await es.p.keyboard.press("Escape");
  ok("klavye: Esc pencereyi kapatir, odak karta doner", (await es.p.locator(".tk-acilir").count()) === 0 && await odakKb());

  /* ---- Saglamlik: bir haftada 300 is (hiz), uzun adlar, cok uzak gecmis / gelecek, cok gunlu is ---- */
  var yuk = [];
  for (var yn = 0; yn < 300; yn++) {
    var yg = "2099-11-0" + (2 + yn % 7), ys = 6 + yn % 15, yd = (yn * 7) % 4 * 15, yo = { musteriId: eid(["ma", "mb", "mc"][yn % 3]), basTarih: yg, bitTarih: yg,
      basSaat: (ys < 10 ? "0" : "") + ys + ":" + (yd < 10 ? "0" : "") + yd, bitSaat: (ys + 1 < 10 ? "0" : "") + (ys + 1) + ":" + (yd < 10 ? "0" : "") + yd };
    yuk.push(yn % 2 ? eEtk("y" + yn, Object.assign({ baslik: "Yük çekimi " + yn }, yo)) : eBlok("y" + yn, Object.assign({ baslik: "Yük bloğu " + yn }, yo)));
  }
  var yukS = await kApi({ islem: "toplu", kayitlar: yuk }, es.p);
  ok("300 is tek toplu istekle yazildi", yukS.ok, JSON.stringify(yukS).slice(0, 300));
  await es.p.goto(URL_ + "#/genel");
  await es.p.reload();
  await es.p.waitForSelector(".sayfa h1");
  var y0 = Date.now();
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-11-04");
  await es.p.waitForSelector(".tk-kolon[data-gun='2099-11-08'] .tk-kart");
  var ySure = Date.now() - y0;
  var yOlcu = await es.p.evaluate(function () { return { kart: document.querySelectorAll(".tk-kart").length, fazla: document.querySelectorAll(".tk-fazla").length, tasma: document.documentElement.scrollWidth - window.innerWidth }; });
  var yDen = await kolonDenetle(es.p, "2099-11-04");
  ok("300 is bir haftada: " + ySure + " ms'de cizilir (< 3000), tasma yok, kartlar ust uste binmez ve adlar okunur, sigmayanlar '+N'", yukS.ok && ySure < 3000 && yOlcu.tasma <= 1 && yOlcu.fazla > 0 &&
    !yDen.sorun.length, JSON.stringify([yukS.ok, ySure, yOlcu, yDen.sorun.slice(0, 5)]));
  var yKart = es.p.locator(".tk-kolon[data-gun='2099-11-04'] .tk-kart").first(), yId = await yKart.getAttribute("data-id");
  var yListe = parseInt(yId.slice(1), 10) % 2 ? "etkinlikler" : "bloklar", yOnce = await kKayit(yListe, yId, es.p);
  await yKart.focus();
  y0 = Date.now();
  await es.p.keyboard.press("ArrowRight");
  var ySonra = await kBekle(yListe, yId, function (k) { return k.basTarih === "2099-11-05"; }, es.p);
  ySure = Date.now() - y0;
  ok("300 is varken klavyeyle tasima " + ySure + " ms'de kaydedilir (< 3000)", ySonra.basTarih === "2099-11-05" && ySonra.basSaat === yOnce.basSaat && ySure < 3000, JSON.stringify([yOnce.basTarih, ySonra.basTarih, ySure]));
  await es.p.goto(URL_ + "#/takvim?g=ay&t=2099-11-04");
  await es.p.waitForSelector(".tk-hucre[data-gun='2099-11-04'] .daha");
  ok("300 is: ay gorunumunde gun basina 3 cip ve '+N daha'", (await es.p.locator(".tk-hucre[data-gun='2099-11-04'] .tk-cip").count()) === 3);
  // uzun ad: kart ve ayrinti tasmaz
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-12-15");
  await es.p.waitForSelector(ekart("x1"));
  await es.p.click(ekart("x1"));
  await es.p.waitForSelector(".tk-acilir h3");
  var uzun = await es.p.evaluate(function () { var a = document.querySelector(".tk-acilir"); return { tasma: a.scrollWidth - a.clientWidth, sayfa: document.documentElement.scrollWidth - window.innerWidth, h3: a.querySelector("h3").textContent }; });
  ok("uzun musteri adi: ayrinti penceresinde tam yazilir, yatay tasma yok", uzun.h3.indexOf(UZUN_AD) !== -1 && uzun.tasma <= 1 && uzun.sayfa <= 1, JSON.stringify(uzun));
  await es.p.keyboard.press("Escape");
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=1990-03-06");
  await es.p.waitForSelector(ekart("xgec"));
  await es.p.focus(ekart("xgec"));
  await es.p.keyboard.press("ArrowDown");
  var xg = await kBekle("etkinlikler", eid("xgec"), function (k) { return k.basSaat === "10:15"; }, es.p);
  ok("cok eski is (1990): gorunur ve klavyeyle tasinir", xg.basTarih === "1990-03-06" && xg.basSaat === "10:15", JSON.stringify(xg));
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2150-06-10");
  await es.p.waitForSelector(".tk-kolon[data-gun='2150-06-10'] .tk-gece-ipucu");
  ok("cok ileri is (2150, gece yarisini asar): ipucu '↓ 1 iş · 22:00' ve ertesi gun '↑ 1 iş gece'", (await es.p.locator(".tk-kolon[data-gun='2150-06-10'] .tk-gece-ipucu").textContent()) === "↓ 1 iş · 22:00" &&
    (await es.p.locator(".tk-kolon[data-gun='2150-06-11'] .tk-gece-ipucu").textContent()) === "↑ 1 iş gece");
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-12-23");
  await es.p.waitForSelector(ekart("xcok"));
  var cok3 = await es.p.evaluate(function (s) { return [].map.call(document.querySelectorAll(s), function (e) { return e.closest(".tk-kolon").getAttribute("data-gun") + " " + e.querySelector(".zaman").textContent; }).join("|"); }, ekart("xcok"));
  ok("uc gunluk is uc kolonda: ilk gun saatli, ortada 'devam ediyor', son gun '…–12:00'", cok3 === "2099-12-22 10:00–12:00 (24 Aralık)|2099-12-23 devam ediyor|2099-12-24 …–12:00", cok3);

  /* ---- Bozuk / eksik baglantilar: sunucu yanitina eklenen kayitlar sayfayi dusurmez ---- */
  await es.p.route("**/studio/v1/index.php", async function (rt) {
    var g = JSON.parse(rt.request().postData() || "{}");
    if (g.islem !== "veri") return rt.continue();
    var yan = await rt.fetch(), j = await yan.json();
    var bos = { surum: 1, arsiv: false, not: "", tamamZaman: null };
    j.veri.bloklar.push(Object.assign({ id: "kayipblok0000000", musteriId: "yokmusteri000000", icerikIdler: ["yokicerik0000000"], baslik: "", basTarih: "2099-12-17", basSaat: "10:00", bitTarih: "2099-12-17", bitSaat: "11:00", durum: "planlandi" }, bos));
    j.veri.bloklar.push(Object.assign({ id: "bozuksaat0000000", musteriId: eid("mb"), icerikIdler: [], baslik: "Bozuk saat", basTarih: "2099-12-17", basSaat: "99:99", bitTarih: "2099-12-17", bitSaat: "11:00", durum: "planlandi" }, bos));
    j.veri.etkinlikler.push(Object.assign({ id: "sahipsiz00000000", musteriId: null, baslik: "Sahipsiz çekim", tur: "cekim", tumGun: false, basTarih: "2099-12-17", basSaat: "13:00", bitTarih: "2099-12-17", bitSaat: "14:00", konum: "", durum: "planlandi" }, bos));
    j.veri.etkinlikler.push(Object.assign({ id: "terscekim0000000", musteriId: eid("mb"), baslik: "Ters çekim", tur: "cekim", tumGun: false, basTarih: "2099-12-18", basSaat: "13:00", bitTarih: "2099-12-17", bitSaat: "14:00", konum: "", durum: "planlandi" }, bos));
    j.veri.etkinlikler.push(Object.assign({ id: "bozuktarih000000", musteriId: eid("mb"), baslik: "Bozuk tarih", tur: "cekim", tumGun: false, basTarih: "2099-02-31", basSaat: "13:00", bitTarih: "2099-02-31", bitSaat: "14:00", konum: "", durum: "planlandi" }, bos));
    j.veri.icerikler.push(Object.assign({ id: "kayipicerik00000", musteriId: "yokmusteri000000", cekimId: "yokcekim00000000", baslik: "Kayıp içerik", tur: "reels", durum: "kurguda", teslimTarihi: "2099-12-17", gecmis: [] }, bos));
    j.veri.icerikler.push(Object.assign({ id: "kayipcekimli0000", musteriId: eid("mb"), cekimId: "yokcekim00000000", baslik: "Çekimi kayıp içerik", tur: "reels", durum: "cekim_planlandi", teslimTarihi: "2099-12-17", gecmis: [] }, bos));
    j.veri.ozelgunler.push(Object.assign({ id: "bozukozel0000000", baslik: "Bozuk gün", tarih: "bozuk", tur: "ozel", herYil: true }, bos));
    return rt.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
  });
  es.hata.length = 0;
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-12-17");
  await es.p.reload();
  await es.p.waitForSelector(".tk-kart[data-id='kayipblok0000000']");
  var kayip = await es.p.evaluate(function () {
    var b = document.querySelector(".tk-kart[data-id='kayipblok0000000']");
    return { mus: b.querySelector(".mus").textContent, is: b.querySelector(".is").textContent, sahipsiz: !!document.querySelector(".tk-kart[data-id='sahipsiz00000000']"),
      bozuk: !!document.querySelector(".tk-kart[data-id='bozuksaat0000000'], .tk-kart[data-id='terscekim0000000'], .tk-kart[data-id='bozuktarih000000']") };
  });
  await es.p.click(".tk-kart[data-id='kayipblok0000000']");
  await es.p.waitForSelector(".tk-acilir:has-text('Bu bloğa bağlı içerik yok.')");
  await es.p.keyboard.press("Escape");
  await es.p.goto(URL_ + "#/takvim?g=ay&t=2099-12-17");
  await es.p.waitForSelector(".tk-hucre[data-gun='2099-12-17'] .tk-cip");
  await es.p.goto(URL_ + "#/genel");
  await es.p.waitForSelector(".sayfa h1");
  ok("eksik musteri / icerik / cekim baglantisi ve bozuk kayitlar: sayfa hatasi yok; kart 'Müşterisiz · Edit', bozuk zamanli kayit cizilmez",
    es.hata.length === 0 && kayip.mus === "Müşterisiz" && kayip.is === "Edit" && kayip.sahipsiz && !kayip.bozuk, JSON.stringify([kayip, es.hata]));
  await es.p.unroute("**/studio/v1/index.php");

  /* ---- Hareket azaltma (masaustu): kart gecisleri ve hedef cubugu kapali ---- */
  await es.p.goto(URL_ + "#/takvim?g=hafta&t=2099-12-15");
  await es.p.waitForSelector(ekart("x1"));
  var hareketVar = await es.p.locator(ekart("x1")).evaluate(function (e) { return getComputedStyle(e).transitionDuration; });
  await es.p.emulateMedia({ reducedMotion: "reduce" });
  var hareketYok = await es.p.locator(ekart("x1")).evaluate(function (e) { return getComputedStyle(e).transitionDuration; });
  ok("hareket azaltma: kart gecisi normalde var, azaltilinca 0s", /0\.35s/.test(hareketVar) && hareketYok === "0s", hareketVar + " / " + hareketYok);
  await es.p.emulateMedia({ reducedMotion: "no-preference" });
  ok("erisim / saglamlik masaustu: sayfa hatasi yok", es.hata.length === 0, es.hata.join(" | "));
  await es.c.close();

  /* ---- Telefon 360 / 430 / 390: tasma ve kirpilma yok, hedefler 44 px, alt sayfa, cekmece, bildirim alt cubugun ustunde ---- */
  for (var tg of [360, 430, 390]) {
    var tt = await oturumAc({ viewport: { width: tg, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    var tq = tt.p;
    await tq.goto(URL_ + "#/takvim?t=2099-12-15");
    await tq.waitForSelector(".tk-tel " + ekart("x1"));
    var to = await tq.evaluate(function () {
      var gor = function (b) { return b.offsetParent && getComputedStyle(b).visibility !== "hidden"; };
      var kucuk = [].filter.call(document.querySelectorAll(".tk-tel-ust button, .tk-tel-alt button, .tk-gece-dugme"), gor).filter(function (b) {
        var r = b.getBoundingClientRect();
        return r.height < 44 || (r.width < (b.closest(".tk-hafta-serit") ? 30 : 44));
      }).map(function (b) { var r = b.getBoundingClientRect(); return (b.getAttribute("aria-label") || b.textContent).slice(0, 20) + " " + Math.round(r.width) + "x" + Math.round(r.height); });
      return { tasma: document.documentElement.scrollWidth - window.innerWidth, kucuk: kucuk };
    });
    var td_ = await kolonDenetle(tq, "2099-12-15");
    ok("telefon " + tg + ": tasma yok, butun hedefler en az 44 px (hafta seridi en az 30x44)", to.tasma <= 1 && !to.kucuk.length, JSON.stringify(to));
    // Izgaradaki hedefler (gercek dokunma alani, elementFromPoint ile): tamamla dugmesi, tum gun seritleri (gun ve hafta),
    // "+N" ve gece ipuclari en az 44 px; haftada 7 kolon dar oldugundan genislik kolonun izin verdigi kadar
    var hedefler = [];
    var olc = async function (adres, bekleSecici, secici) {
      await tq.goto(URL_ + adres);
      await tq.waitForSelector(bekleSecici);
      await bekle(150);
      if (secici === ".tk-kart .tk-tik") await tq.locator(ekart("x1")).evaluate(function (e) { e.scrollIntoView({ block: "center" }); });
      else await tq.evaluate(function (secici) { var e = document.querySelector(secici); if (e) e.scrollIntoView({ block: "center" }); }, secici);
      await bekle(100);
      return tq.evaluate(function (secici) {
        return [].filter.call(document.querySelectorAll(secici), function (el) {
          var r = el.getBoundingClientRect();
          return el.offsetParent && getComputedStyle(el).display !== "none" && r.top >= 0 && r.bottom <= window.innerHeight - 100 && r.width > 0;
        }).map(function (el) {
          var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
          for (var y = Math.round(cy - 40); y <= cy + 40; y++) for (var x = Math.round(cx - 40); x <= cx + 40; x++) {
            var e = document.elementFromPoint(x, y);
            if (e && (e === el || el.contains(e))) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
          }
          var kap = el.closest(".tk-kolon, .hucre"), sinir = kap ? Math.min(44, kap.getBoundingClientRect().width - 8) : 44;
          return { ad: secici + " " + (el.getAttribute("aria-label") || el.textContent).slice(0, 18), w: x1 - x0 + 1, h: y1 - y0 + 1, sinir: Math.floor(sinir) };
        });
      }, secici);
    };
    hedefler = hedefler.concat(await olc("#/takvim?g=gun&t=2099-12-15", ".tk-tel " + ekart("x1"), ".tk-kart .tk-tik"));
    hedefler = hedefler.concat(await olc("#/takvim?g=gun&t=2099-10-29", ".tk-tumgun .tk-serit.tatil", ".tk-tumgun .tk-serit"));
    hedefler = hedefler.concat(await olc("#/takvim?g=hafta&t=2099-10-29", ".tk-tumgun .tk-serit.tatil", ".tk-tumgun .tk-serit"));
    hedefler = hedefler.concat(await olc("#/takvim?g=gun&t=2150-06-11", ".tk-gece-ipucu", ".tk-gece-ipucu"));
    hedefler = hedefler.concat(await olc("#/takvim?g=hafta&t=2099-12-15", ".tk-fazla", ".tk-fazla"));
    var kucukHedef = hedefler.filter(function (x) { return x.h < 44 || x.w < x.sinir; });
    ok("telefon " + tg + ": izgara hedefleri (tamamla, tum gun seritleri, '+N', gece ipucu) en az 44 px", hedefler.length >= 5 && !kucukHedef.length &&
      // 360'ta uc cakisan kart dar seride duser (tamamla dugmesi gizli, ayrinti penceresinden); 390 ve 430'da olculur
      (tg === 360 ? [] : ["tk-tik"]).concat(["tk-serit", "tk-fazla", "tk-gece-ipucu"]).every(function (c) { return hedefler.some(function (x) { return x.ad.indexOf(c) !== -1; }); }),
      JSON.stringify(kucukHedef.length ? kucukHedef : hedefler).slice(0, 600));
    var haftaFazla = await tq.evaluate(function () {
      var l = [].map.call(document.querySelectorAll(".tk-kolon[data-gun='2099-12-15'] .tk-fazla"), function (b) { return b.textContent; });
      var gorunenKart = [].filter.call(document.querySelectorAll(".tk-kolon[data-gun='2099-12-15'] .tk-kart"), function (k) { return !k.hidden && k.getBoundingClientRect().width < 30; }).length;
      return { l: l, ince: gorunenKart };
    });
    ok("telefon " + tg + " hafta: cakisan isler ince serit yerine tek dugmede ('3 iş'), ince kart yok", haftaFazla.l.indexOf("3 iş") !== -1 && haftaFazla.ince === 0, JSON.stringify(haftaFazla));
    ok("telefon " + tg + ": cakisan uc kart yan yana, ust uste binmez, musteri adlari okunur; kisa cakisan kartta ⚠", !td_.sorun.length && ["x1", "x2", "x3"].every(function (k) { return td_.kartlar.indexOf(eid(k)) !== -1; }) &&
      /⚠/.test(await tq.locator(ekart("bk1")).textContent()), JSON.stringify(td_));
    if (EKRAN) await tq.screenshot({ path: path.join(EKRAN, "takvim-telefon-" + tg + ".png") });
    // en uzun gun basligi (telefonda "Pzt 31 Ağustos"; uzun hali ekran okuyucuda) "Bugün" dugmesiyle ayni satirda kirpilmaz
    await tq.goto(URL_ + "#/takvim?t=2099-08-31");
    await tq.waitForSelector(".tk-tel-ust h1:has-text('Pazartesi, 31 Ağustos')");
    var bas_ = await tq.evaluate(function () {
      var e = document.querySelector(".tk-tel-ust h1"), g = [].filter.call(e.children, function (x) { return getComputedStyle(x).position !== "absolute"; })[0];
      return { kirpik: e.scrollWidth - e.clientWidth, gorunen: g && g.textContent, bugun: !!document.querySelector(".tk-tel-ust button:not([aria-label])"), kayit: document.querySelector(".tk-tel .tk-kayit").textContent };
    });
    ok("telefon " + tg + ": gun basligi kirpilmaz (" + bas_.gorunen + "), kayit durumu ekran okuyucuya yazili", bas_.kirpik <= 0 && bas_.bugun && bas_.gorunen === "Pzt 31 Ağustos" &&
      /Kaydedildi/.test(bas_.kayit), JSON.stringify(bas_));
    await tq.goto(URL_ + "#/takvim?t=2099-12-15");
    await tq.waitForSelector(".tk-tel " + ekart("x1"));
    await tq.locator(ekart("xtas")).evaluate(function (e) { e.scrollIntoView({ block: "center" }); });
    await tq.locator(ekart("xtas")).tap();
    await tq.waitForSelector(".tk-acilir.tk-alt button[aria-label='Süreyi 15 dakika uzat']");
    var alt = await tq.evaluate(function () {
      var a = document.querySelector(".tk-acilir.tk-alt"), r = a.getBoundingClientRect();
      var adim = ["15 dakika önce", "15 dakika sonra", "Önceki gün", "Sonraki gün", "Süreyi 15 dakika kısalt", "Süreyi 15 dakika uzat"].map(function (l) {
        var b = a.querySelector("button[aria-label='" + l + "']").getBoundingClientRect(); return Math.min(b.width, b.height);
      });
      return { sol: r.left, sag: Math.round(r.right), alt: Math.round(r.bottom), ust: r.top, tasma: a.scrollWidth - a.clientWidth, adim: Math.min.apply(null, adim), odak: document.activeElement === a,
        modal: a.getAttribute("aria-modal"), rol: a.getAttribute("role") };
    });
    ok("telefon " + tg + ": ayrinti alt sayfa (tam genislik, altta, kirpilmaz); ±15 / ‹gün› / süre dugmeleri en az 44x44; odak pencerede", alt.sol === 0 && alt.sag === tg && alt.alt === 800 &&
      alt.ust > 0 && alt.tasma <= 1 && alt.adim >= 44 && alt.odak && alt.modal === "true" && alt.rol === "dialog", JSON.stringify(alt));
    if (EKRAN) await tq.screenshot({ path: path.join(EKRAN, "takvim-telefon-" + tg + "-alt-sayfa.png") });
    // alt sayfa modal: Tab ile odak pencereden arkadaki takvime kacmaz
    var tabDisari = 0;
    for (var tn = 0; tn < 25; tn++) {
      await tq.keyboard.press(tn % 5 === 4 ? "Shift+Tab" : "Tab");
      if (!(await tq.evaluate(function () { return !!document.activeElement.closest(".tk-acilir.tk-alt"); }))) tabDisari++;
    }
    ok("telefon " + tg + ": alt sayfada Tab / Shift+Tab odagi pencere icinde tutar", tabDisari === 0, tabDisari);
    if (tg === 360) {
      // Hareket azaltma (telefon): tik animasyonu ve kart gecisi yok
      await tq.locator(".tk-acilir .tk-kapat").tap();
      await tq.emulateMedia({ reducedMotion: "reduce" });
      await tq.goto(URL_ + "#/takvim?t=2099-12-15");
      await tq.waitForSelector(ekart("x2"));
      await tq.locator(ekart("x2")).evaluate(function (e) { e.scrollIntoView({ block: "center" }); });
      await tq.locator(ekart("x2")).tap();
      await tq.locator(".tk-acilir button:has-text('Çekimi tamamla')").tap();
      await tq.waitForSelector(ekart("x2") + " .tk-tik.cizil", { state: "attached" });
      var az = await tq.evaluate(function (s) { var t = document.querySelector(s + " .tk-tik.cizil"), k = document.querySelector(s); return getComputedStyle(t).animationName + "," + getComputedStyle(k).transitionDuration; }, ekart("x2"));
      ok("telefon hareket azaltma: tik animasyonu ve kart gecisi kapali", az === "none,0s", az);
      await tq.locator(".toast button:has-text('Geri al')").tap();
      await kBekle("etkinlikler", eid("x2"), function (k) { return k.durum === "planlandi"; }, tq);
      await tq.emulateMedia({ reducedMotion: "no-preference" });
    }
    if (tg === 390) {
      await tq.locator(".tk-acilir button[aria-label='Süreyi 15 dakika uzat']").tap();
      var xt = await kBekle("etkinlikler", eid("xtas"), function (k) { return k.bitSaat === "18:15"; }, tq);
      await tq.waitForSelector(".toast:has-text('Süre değişti')");
      var tb = await tq.evaluate(function () { var t = document.querySelector(".toast").getBoundingClientRect(), f = document.querySelector(".tk-fab").getBoundingClientRect(), b = document.querySelector(".tk-tel-alt .btn").getBoundingClientRect(); return { toast: t.bottom, fab: f.top, dugme: b.top, sol: t.left, sag: t.right }; });
      ok("telefon: 'süre +15' kaydedilir (17:00-18:15); bildirim alt cubugun ustunde ve ekranda", xt.basSaat === "17:00" && xt.bitSaat === "18:15" && tb.toast <= Math.min(tb.fab, tb.dugme) && tb.sol >= 0 && tb.sag <= 390, JSON.stringify([xt, tb]));
      await tq.waitForSelector(".tk-kayit.tamam");
      await tq.locator(ekart("xtas")).evaluate(function (e) { e.scrollIntoView({ block: "center" }); });
      await tq.locator(ekart("xtas")).tap();
      await tq.locator(".tk-acilir button[aria-label='Sonraki gün']").tap();
      xt = await kBekle("etkinlikler", eid("xtas"), function (k) { return k.basTarih === "2099-12-16"; }, tq);
      ok("telefon: '›' (sonraki gun) dugmesiyle bir gun ileri", xt.basTarih === "2099-12-16" && xt.basSaat === "17:00" && xt.bitSaat === "18:15", JSON.stringify(xt));
      await tq.waitForSelector(".tk-kayit.tamam");
      await tq.locator(".tk-tel-alt button:has-text('Planlanacaklar')").tap();
      await tq.waitForSelector(".tk-acilir.tk-alt:has-text('Planlanacaklar')");
      var cek = await tq.evaluate(function () { var r = document.querySelector(".tk-acilir.tk-alt").getBoundingClientRect(); return [r.left, Math.round(r.right), Math.round(r.bottom)].join(); });
      ok("telefon: Planlanacaklar cekmecesi alt sayfa olarak acilir", cek === "0,390,800", cek);
      await tq.locator(".tk-acilir .tk-kapat").tap();
      // Dokunmatik: izgarada dikey kaydirma calisir (touch-action), gun degismez, yeni is penceresi acilmaz; yatay kaydirma gun degistirir
      await tq.goto(URL_ + "#/takvim?t=2099-12-17");
      await tq.waitForSelector(".tk-tel-ust h1:has-text('Perşembe, 17 Aralık')");
      var cdp = await tt.c.newCDPSession(tq);
      var dokun = async function (x0, y0, x1, y1, ara) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
        for (var s = 1; s <= 8; s++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (x1 - x0) * s / 8, y: y0 + (y1 - y0) * s / 8 }] }); await bekle(16); }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        if (ara) await ara();
      };
      await tq.evaluate(function () { var t = document.querySelector(".toastlar"); if (t) t.textContent = ""; }); // bildirim dokunma noktasini ortmesin
      var ky2 = await tq.locator(".tk-kaydirma").boundingBox();
      var st0 = await tq.locator(".tk-kaydirma").evaluate(function (e) { e.scrollTop = 0; return e.scrollTop; });
      var sx = ky2.x + ky2.width - 40, sy = ky2.y + Math.min(260, ky2.height - 90);
      // bos saatten baslayan dokunmatik kaydirma: hemen ardindan ayni noktada gelen birakma "Yeni iş" acmamali (eski dinleyici kalmaz)
      await dokun(sx, sy, sx, sy - 200, function () {
        return tq.evaluate(function (a) {
          var kol = document.querySelector(".tk-kolon");
          kol.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: a[0], clientY: a[1], pointerType: "touch", isPrimary: true }));
        }, [sx, sy]);
      });
      await bekle(300);
      var st1 = await tq.locator(".tk-kaydirma").evaluate(function (e) { return e.scrollTop; });
      ok("telefon: dokunarak dikey kaydirma izgarayi kaydirir; gun degismez, 'Yeni iş' acilmaz", st1 > st0 + 50 && /t=2099-12-17/.test(tq.url()) && (await tq.locator(".tk-acilir").count()) === 0,
        JSON.stringify([st0, st1, tq.url(), await tq.locator(".tk-acilir").count()]));
      ky2 = await tq.locator(".tk-kaydirma").boundingBox();
      await dokun(ky2.x + ky2.width - 30, ky2.y + 150, ky2.x + 40, ky2.y + 160);
      await tq.waitForSelector(".tk-tel-ust h1:has-text('Cuma, 18 Aralık')", { timeout: 5000 }).catch(function () {});
      ok("telefon: dokunarak yana kaydirinca sonraki gun", /t=2099-12-18/.test(tq.url()), tq.url());
    }
    ok("telefon " + tg + ": sayfa hatasi yok", tt.hata.length === 0, tt.hata.join(" | "));
    await tt.c.close();
  }

  /* ---- Saat dilimi: cihaz New York'ta; bugun kolonu, simdi cizgisi ve tamamlanma ani Istanbul'a gore ---- */
  // 2099-12-15 21:30 UTC = New York'ta 15 Aralık 16:30, Istanbul'da 16 Aralık 00:30
  var ny = await oturumAc({ viewport: { width: 1440, height: 900 }, timezoneId: "America/New_York" }, "2099-12-15T21:30:00Z");
  await ny.p.evaluate(function () { localStorage.setItem("suflo-studio.takvimGece", "1"); });
  await ny.p.goto(URL_ + "#/takvim?g=hafta");
  await ny.p.reload();
  await ny.p.waitForSelector(".tk-kolon[data-gun='2099-12-16'] .tk-simdi");
  var nyS = await ny.p.evaluate(function () {
    var s = document.querySelector(".tk-simdi");
    return { kolon: s.closest(".tk-kolon").getAttribute("data-gun"), top: parseFloat(s.style.top), baslik: s.title, bugun: document.querySelector(".tk-gun-bas.bugun b").textContent,
      etiket: document.querySelector(".tk-gun-bas.bugun").getAttribute("aria-label") };
  });
  ok("New York cihazinda: bugun kolonu 16 Aralık (Istanbul), simdi cizgisi 00:30'da", nyS.kolon === "2099-12-16" && Math.abs(nyS.top - 30 * 52 / 60) < 1 && nyS.baslik === "Şimdi 00:30 (Türkiye)" &&
    nyS.bugun === "16" && /bugün/.test(nyS.etiket), JSON.stringify(nyS));
  await ny.p.click(ekart("x1"));
  await ny.p.click(".tk-acilir button:has-text('Çekimi tamamla')");
  var nyT = await kBekle("etkinlikler", eid("x1"), function (k) { return k.durum === "tamamlandi"; }, ny.p);
  ok("New York cihazinda tamamlanma ani Istanbul saatiyle yazilir (2099-12-16 00:30)", nyT.tamamZaman === "2099-12-16 00:30", JSON.stringify(nyT));
  await ny.p.click(".toast button:has-text('Geri al')");
  await kBekle("etkinlikler", eid("x1"), function (k) { return k.durum === "planlandi"; }, ny.p);
  await ny.p.goto(URL_ + "#/takvim?g=gun");
  await ny.p.waitForSelector(".tk-donem:has-text('Çarşamba, 16 Aralık 2099')");
  ok("New York cihazinda gun gorunumu Istanbul'un bugunu (Çarşamba, 16 Aralık)", (await ny.p.locator(".tk-kolon").count()) === 1 &&
    (await ny.p.locator(".tk-kolon").getAttribute("data-gun")) === "2099-12-16" && (await ny.p.locator(".tk-kolon .tk-simdi").count()) === 1);
  ok("saat dilimi testi: sayfa hatasi yok", ny.hata.length === 0, ny.hata.join(" | "));
  await ny.c.close();

  if (EKRAN) {
    var sctx = await tarayici.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: "Europe/Istanbul" });
    var sp = await sctx.newPage();
    await sp.clock.setFixedTime(new Date("2099-10-20T09:00:00Z"));
    await sp.goto(URL_);
    await sp.fill("#studio-sifre", SIFRE);
    await sp.click("button[type=submit]");
    await sp.waitForSelector(".yan-menu");
    for (var r of ["genel", "musteriler", "icerikler?gorunum=pano", "icerikler?gorunum=liste", "cekim?g=hafta", "yayin?g=ay", "stok", "ayarlar"]) {
      await sp.goto(URL_ + "#/" + r);
      await sp.waitForTimeout(200);
      await sp.screenshot({ path: path.join(EKRAN, "masaustu-" + r.replace(/[?=&]/g, "-") + ".png"), fullPage: true });
    }
    await sctx.close();
  }
}

calis().catch(function (e) { ok("kosum hatasiz", false, e && e.stack ? e.stack : e); }).then(async function () {
  try { if (tarayici) await tarayici.close(); } catch (e) {}
  try { if (phpSurec) phpSurec.kill(); } catch (e) {}
  await bekle(100);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e3) {}
  console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
  process.exit(kalan ? 1 : 0);
});
