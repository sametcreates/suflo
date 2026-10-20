/*
 * Suflo Studio uctan uca (gercek tarayici + gercek php -S sunucusu + gecici SQLite). Yalniz anonim ornek veri.
 * Masaustu ve telefon boyutunda: giris, musteri / stok girisi / cekim / icerik akislari, toplu durum + geri al,
 * pano surukle-birak, cakisma uyarisi, yenilemede kalicilik, cikis, yedek indirme + mukerrersiz ice aktarma onizlemesi,
 * cihaz saat dilimi farkli olsa da Istanbul tarihi, telefonda yatay tasma yok.
 * php ya da Playwright yoksa ATLA.
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
  process.exit(0);
}

var SIFRE = "ornek-e2e-sifresi-123";
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-studio-e2e-"));
var PUB = path.join(TMP, "public_html"), PRIV = path.join(TMP, "private", "studio-v1");
var EKRAN = process.env.STUDIO_EKRAN || null; // ekran goruntusu klasoru (istege bagli, repo disinda)
fs.mkdirSync(path.join(PUB, "studio", "v1"), { recursive: true });
fs.mkdirSync(PRIV, { recursive: true });
["index.html", "studio.css", "studio-core.js", "studio.js"].forEach(function (f) { fs.copyFileSync(path.join(ROOT, "docs", "studio", f), path.join(PUB, "studio", f)); });
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
  // 2026-10-19 22:30 UTC = New York'ta 19 Ekim, Istanbul'da 20 Ekim 01:30
  await page.clock.setFixedTime(new Date("2026-10-19T22:30:00Z"));
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
  ok("genel bakis tarihi Istanbul'a gore (cihaz New York'ta 19 Ekim)", tarihMetni === "20 Ekim 2026, Salı", tarihMetni);
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
  await d.locator("button:has-text('Vazgeç')").click();

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
  ok("haftalik tahmin: 7 gunde 2 paylasim gunu, ikisi oneriyle karsilanabilir", /2 paylaşım günü/.test(stokMetni) && /2 atanmamış hazırla karşılanabilir/.test(stokMetni), stokMetni);
  // Oneriyi plana cevir
  await page.locator(".slot.oneri").first().click();
  await page.waitForSelector("text=tarihine atandı");
  stokMetni = await page.locator(".bolum:has-text('Stok ve yayın ihtiyacı')").textContent();
  ok("oneri yalniz tiklaninca plana doner: atanmis 1 + atanmamis 1 (toplam yine 2)", /Hazır video 2/.test(stokMetni) && /tarihe atanmış 1/.test(stokMetni) && /atanmamış 1/.test(stokMetni), stokMetni);

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
  await alanGirdi(d, "Başlangıç tarihi", "input").fill("2026-10-24");
  await alanGirdi(d, "Bitiş tarihi", "input").fill("2026-10-25");
  await d.locator("button[type=submit]").click();
  await page.waitForSelector(".t-oge:has-text('Örnek organizasyon')");
  ok("iki gunluk tum gun etkinlik haftada iki gunde gorunur", (await page.locator(".t-oge:has-text('Örnek organizasyon')").count()) === 2);
  await page.click(".gorunum >> text=Ay");
  ok("ay gorunumu: Ekim 2026", await page.locator(".donem:has-text('Ekim 2026')").isVisible() && (await page.locator(".ay .hucre").count()) % 7 === 0);
  await page.click(".gorunum >> text=Gün");
  ok("gun gorunumu: 20 Ekim", await page.locator(".donem:has-text('20 Ekim 2026')").isVisible());

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
  await page.click(".toast button:has-text('Geri al')");
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
  await page.waitForTimeout(800);
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
  var indirme = page.waitForEvent("download");
  await page.click("button:has-text('JSON yedeği indir')");
  var dl = await indirme;
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
  await d.locator("button[type=submit]").click();
  await page.waitForSelector("text=Haftalık: Pzt, Cum (post)");
  ok("gune ozel tur kaydedildi ve gosterildi", true);

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
  await mp.clock.setFixedTime(new Date("2026-10-20T09:00:00Z"));
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
  ok("telefon: sayfa hatasi yok", mhatalar.length === 0, mhatalar.join(" | "));
  await mctx.close();

  if (EKRAN) {
    var sctx = await tarayici.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: "Europe/Istanbul" });
    var sp = await sctx.newPage();
    await sp.clock.setFixedTime(new Date("2026-10-20T09:00:00Z"));
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
