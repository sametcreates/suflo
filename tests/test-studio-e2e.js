/*
 * Suflo Studio uctan uca (gercek tarayici + gercek php -S sunucusu + gecici SQLite). Yalniz anonim ornek veri.
 * Masaustu ve telefon boyutunda: giris, musteri / stok girisi / cekim / icerik akislari, toplu durum + geri al,
 * pano surukle-birak, cakisma uyarisi, yenilemede kalicilik, cikis, yedek indirme + mukerrersiz ice aktarma onizlemesi,
 * yaniti kaybolan kaydetmenin yeniden denenmesinde mukerrer kayit olusmamasi, gunluk otomatik kopya etiketi,
 * cihaz saat dilimi farkli olsa da Istanbul tarihi, telefonda yatay tasma yok; tek tik sonraki durum (liste, pano), Genel Bakis ozeti,
 * bugun paylasilacaklar, onay bekleme suresi, son yedek tarihi ve hatirlatmasi, toplu arsiv onayi / arsivden cikar,
 * kaydedilmemis pencerenin kapatilmadan once sormasi; uzun liste (200'er satir, yerinde secim, Shift ile aralik, eski yayinlananlar gizli),
 * pano sutun siniri, arama sirasi ve "+N tane daha", geri tusunda kaydirma konumu, telefonda 16 px girdi / parmak boyu hedefler /
 * altta toplu cubuk / kart tablolar / katli takvim filtreleri, Stok sayfasinda acil olanlar ustte.
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
  ok("sol menu 7 bolum", menu.join("|") === "Genel Bakış|Müşteriler|İçerikler|Çekim Takvimi|Yayın Takvimi|Stok|Ayarlar", menu.join("|"));
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
  await menuyeGit(page, "Çekim Takvimi", "Çekim Takvimi");
  await page.click(".gorunum >> text=Hafta");
  ok("takvimde cakisma isareti (2 etkinlik)", (await page.locator(".t-oge.cakisma").count()) === 2);
  // Tum gun, iki gunluk musterisiz etkinlik
  await page.click("button:has-text('Çekim / etkinlik ekle')");
  d = page.locator("dialog[open]");
  await alanGirdi(d, "Başlık", "input").fill("Örnek organizasyon");
  await d.locator("label:has-text('Tüm gün') input").check();
  await alanGirdi(d, "Başlangıç tarihi", "input").fill("2099-10-24");
  await alanGirdi(d, "Bitiş tarihi", "input").fill("2099-10-25");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector(".t-oge:has-text('Örnek organizasyon')");
  ok("iki gunluk tum gun etkinlik haftada iki gunde gorunur", (await page.locator(".t-oge:has-text('Örnek organizasyon')").count()) === 2);
  await page.click(".gorunum >> text=Ay");
  ok("ay gorunumu: Ekim 2099", await page.locator(".donem:has-text('Ekim 2099')").isVisible() && (await page.locator(".ay .hucre").count()) % 7 === 0);
  await page.click(".gorunum >> text=Gün");
  ok("gun gorunumu: 20 Ekim", await page.locator(".donem:has-text('20 Ekim 2099')").isVisible());

  // Cekimden toplu icerik
  await page.click(".t-oge:has-text('Örnek çekim 1')");
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
  await page.waitForSelector(".donem:has-text('2031')");
  await page.click("button:has-text('Çekim / etkinlik ekle')");
  d = page.locator("dialog[open]");
  var ayVarsayilan = await alanGirdi(d, "Başlangıç tarihi", "input").inputValue();
  ok("ay gorunumu: yeni cekim tarihi o ayin 1'i", ayVarsayilan === "2031-05-01", ayVarsayilan);
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog[open]", { state: "detached" });

  // Genel Bakis kartlarinin acacagi gorunumler: bugunden baslayan 7 gun; Stok sayfasi suzgeci
  await page.goto(URL_ + "#/cekim?g=hafta&t=2031-05-15&kayan=1");
  await page.waitForSelector(".donem:has-text('2031')");
  var kayanIlk = await page.locator(".gun-kolon .gun-bas").first().textContent();
  ok("kayan hafta: verilen gunden baslar (pazartesiden degil)", /15/.test(kayanIlk) && (await page.locator(".gun-kolon").count()) === 7, kayanIlk);
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
      cekim: c.querySelectorAll(".satir").length, ilkCekim: c.querySelector(".satir").textContent, cekimDaha: (c.querySelector("button.daha-satir") || {}).textContent };
  });
  ok("arama: icerikler liste sirasinda (15 guncel is ustte), 100 satir ve '+20 tane daha'", aramaDurum.n === 100 && aramaDurum.ilk15 && aramaDurum.daha === "+20 tane daha → İçerikler listesinde aç", JSON.stringify(aramaDurum));
  ok("arama: cekimler yaklasanlar once, 50 satir ve kalanlari gosteren dugme", aramaDurum.cekim === 50 && /Kafe yaklaşan çekim 1/.test(aramaDurum.ilkCekim) && aramaDurum.cekimDaha === "+8 tane daha göster", JSON.stringify(aramaDurum));
  await page.click("button.daha-satir:has-text('+8 tane daha göster')");
  ok("arama: 'tane daha göster' tum cekimleri acar", (await page.locator(".bolum:has-text('Çekim ve etkinlikler') .satir").count()) === 58);
  await page.click(".daha-satir a:has-text('İçerikler listesinde aç')");
  await page.waitForSelector(".sayfa h1:has-text('İçerikler')");
  await page.waitForSelector(".sayfa-bas:has-text('120 içerik')");
  ok("arama: listede ac ayni aramayla 120 icerigi acar, guncel isler ustte", /Kafe güncel iş/.test(await page.locator(".icerik-liste .satir").first().textContent()), page.url());
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
  await page.waitForSelector(".donem:has-text('Ekim 2099')");
  ok("masaustu takvim: musteri secimi katlanmadan gorunur", await page.locator(".takvim-ust select[aria-label='Müşteri']").isVisible());
  var hucre = page.locator(".ay .hucre:not(.disari)").nth(14);
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
  await mp.waitForSelector(".donem:has-text('Ekim 2099')");
  var mh = await mp.locator(".ay .hucre:not(.disari)").nth(14).boundingBox();
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
  await tp.goto(URL_ + "#/cekim?g=gun&t=2099-10-29");
  await tp.click(".t-oge:has-text('Arşiv bağlı çekim')");
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
    await tp.goto(URL_ + "#/cekim?g=gun&t=" + gun);
    await tp.click(".t-oge:has-text('" + baslik + "')");
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
  ok("haftada tek gunde gorunur", (await tp.locator(".t-oge:has-text('Tek günlük metin çekimi')").count()) === 1);
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
