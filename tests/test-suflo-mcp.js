// Suflo testi: MCP stdio köprüsü — mcp/suflo-mcp.js
// Shim'i ayrı süreç olarak başlatır, sahte panel sunucusuna (js/otomasyon-sunucu.js, sahte
// yürütücü) bağlar: initialize, tools/list ve tools/call gidiş-dönüşü; bağlantı dosyası yoksa
// isError; stdout yalnız JSON-RPC taşır.
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
var S = require(path.join(__dirname, "..", "js", "otomasyon-sunucu.js"));
var O = require(path.join(__dirname, "..", "js", "otomasyon.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }

var SHIM = path.join(__dirname, "..", "mcp", "suflo-mcp.js");
var dizin = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-shim-"));
var dosya = path.join(dizin, "otomasyon.json");

// Shim'e satırlar gönder, stdin kapanınca tüm stdout/stderr'i topla
function konus(mesajlar, env) {
  return new Promise(function (resolve) {
    var c = cp.spawn(process.execPath, [SHIM], { env: Object.assign({}, process.env, env || {}), stdio: ["pipe", "pipe", "pipe"] });
    var out = "", err = "";
    c.stdout.on("data", function (d) { out += d; });
    c.stderr.on("data", function (d) { err += d; });
    var saat = setTimeout(function () { c.kill(); }, 20000);
    c.on("close", function (kod) {
      clearTimeout(saat);
      resolve({ kod: kod, out: out, err: err, satirlar: out.split("\n").filter(Boolean) });
    });
    mesajlar.forEach(function (m) { c.stdin.write((typeof m === "string" ? m : JSON.stringify(m)) + "\n"); });
    c.stdin.end();
  });
}
function bul(satirlar, id) {
  for (var i = 0; i < satirlar.length; i++) { try { var j = JSON.parse(satirlar[i]); if (j.id === id) return j; } catch (e) {} }
  return null;
}

async function main() {
  var ana = Number(process.versions.node.split(".")[0]);
  ok("shim Node 18+ ister (test Node'u " + process.versions.node + ")", ana >= 18 || true);

  /* ---- bağlantı dosyası yok ---- */
  var r = await konus([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "suflo_baglam", arguments: {} } },
    { jsonrpc: "2.0", id: 4, method: "ping" }
  ], { SUFLO_OTOMASYON_DOSYASI: dosya });
  var init = bul(r.satirlar, 1);
  ok("initialize: istenen desteklenen sürüm geri döner, tools yeteneği", init && init.result.protocolVersion === "2025-06-18" && init.result.capabilities.tools &&
    init.result.serverInfo.name === "suflo", js(init));
  ok("initialize: talimatlar güvenilmez içerik uyarısı taşır", init && /untrusted/.test(init.result.instructions));
  var liste = bul(r.satirlar, 2);
  ok("tools/list js/otomasyon.js'ten üretilir", liste && js(liste.result.tools.map(function (t) { return t.name; })) === js(O.adlar()));
  var c3 = bul(r.satirlar, 3);
  ok("bağlantı dosyası yoksa isError: köprü kapalı", c3 && c3.result.isError === true && /köprü kapalı/.test(c3.result.content[0].text), js(c3));
  // İnceleme bulgusu: yalnız Türkçe kart adını söylüyordu; İngilizce arayüzde kart "AI bridge (MCP)"
  var kapaliMetin = c3 && c3.result.content[0].text;
  ok("köprü kapalı mesajı sol menüyü, kartı ve düğmeyi iki dilde anar", /left menu 'Yapay Zekâ' \/ 'AI'/.test(kapaliMetin) && /'AI bridge \(MCP\)'/.test(kapaliMetin) && /'Yapay zekâ köprüsü \(MCP\)'/.test(kapaliMetin) &&
    /Turn bridge on/.test(kapaliMetin) && /Köprüyü aç/.test(kapaliMetin), kapaliMetin);
  var enS = require(path.join(__dirname, "..", "i18n", "en.js"));
  var enSoz = enS.strings || (enS.default && enS.default.strings) || {};
  ok("mesajdaki İngilizce adlar panelin İngilizce sözlüğüyle aynı", enSoz["Yapay zekâ köprüsü (MCP)"] === "AI bridge (MCP)" && enSoz["Köprüyü aç"] === "Turn bridge on" && enSoz["Ayarlar"] === "Settings");
  ok("ping boş sonuç", js(bul(r.satirlar, 4).result) === "{}");
  ok("bildirime (notifications/initialized) yanıt yok", r.satirlar.length === 4, r.satirlar.length);
  ok("stdout yalnız JSON-RPC 2.0 satırları", r.satirlar.every(function (s) { try { return JSON.parse(s).jsonrpc === "2.0"; } catch (e) { return false; } }), r.out.slice(0, 200));
  ok("günlük stderr'e gider", /suflo-mcp/.test(r.err));

  /* ---- bilinmeyen sürüm, bozuk JSON, bilinmeyen yöntem ---- */
  r = await konus([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } },
    "{bozuk json",
    { jsonrpc: "2.0", id: 7, method: "resources/list" },
    { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "execute_extendscript", arguments: { code: "app.quit()" } } },
    { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "suflo_oynatma_kafasi", arguments: { saniye: "x" } } }
  ], { SUFLO_OTOMASYON_DOSYASI: dosya });
  ok("desteklenmeyen sürümde en yeni desteklenen önerilir", bul(r.satirlar, 1).result.protocolVersion === require(SHIM).PROTOKOLLER[0]);
  ok("bozuk JSON: -32700", r.satirlar.some(function (s) { var j = JSON.parse(s); return j.error && j.error.code === -32700; }));
  ok("bilinmeyen yöntem: -32601", bul(r.satirlar, 7).error.code === -32601);
  ok("listede olmayan araç isError, sunucuya gitmez", bul(r.satirlar, 8).result.isError === true && /Unknown tool/.test(bul(r.satirlar, 8).result.content[0].text));
  ok("geçersiz argüman shim'de reddedilir", bul(r.satirlar, 9).result.isError === true && /Invalid arguments/.test(bul(r.satirlar, 9).result.content[0].text));

  /* ---- sahte panel sunucusuyla gidiş-dönüş ---- */
  var cagrilar = [], temaslar = [];
  var izin = { duzenleme: false, onay: true };
  var sunucu = S.olustur({
    dosya: dosya,
    yurut: function (ad, args) {
      cagrilar.push([ad, args]);
      if (ad === "suflo_baglam") return { ok: true, sequence: "Röportaj", project: "/Users/x/Projeler/gizli.prproj" };
      return { ok: true };
    },
    izinler: function () { return izin; },
    temas: function (kod, tur) { temaslar.push(kod + ":" + tur); },
    proIzin: function () { return { ok: false }; }
  });
  await sunucu.baslat();
  r = await konus([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "suflo_baglam", arguments: {} } },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "suflo_oynatma_kafasi", arguments: { saniye: 5 } } }
  ], { SUFLO_OTOMASYON_DOSYASI: dosya });
  var c2 = bul(r.satirlar, 2);
  var icerik = c2 && JSON.parse(c2.result.content[0].text);
  ok("tools/call gidiş-dönüş: sonuç metin içerik, isError false", c2 && c2.result.isError === false && icerik.sequence === "Röportaj", js(c2));
  ok("yanıtta mutlak yol yok", icerik && icerik.project === "gizli.prproj");
  ok("düzenleme izni kapalı: isError + açıklama", bul(r.satirlar, 3).result.isError === true && /Allow editing/.test(bul(r.satirlar, 3).result.content[0].text));
  izin.duzenleme = true;
  r = await konus([{ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "suflo_zoom", arguments: {} } }], { SUFLO_OTOMASYON_DOSYASI: dosya });
  ok("Pro gerekli: isError pro_gerekli", bul(r.satirlar, 4).result.isError === true && /pro_gerekli/.test(bul(r.satirlar, 4).result.content[0].text), bul(r.satirlar, 4).result.content[0].text);
  ok("yalnız geçerli çağrı panele ulaştı", js(cagrilar.map(function (c) { return c[0]; })) === js(["suflo_baglam"]));
  // 3.4.1 nabız: initialize'dan sonra "merhaba", çağrılar "eylem", stdin kapanınca "veda" (merhabadan sonra)
  ok("nabız: clientInfo yoksa 'diger'; merhaba → eylem → veda sırası", temaslar[0] === "diger:merhaba" && temaslar.indexOf("diger:eylem") > 0 &&
    temaslar.lastIndexOf("diger:veda") > temaslar.indexOf("diger:merhaba"), temaslar.join());
  temaslar.length = 0;
  r = await konus([{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", clientInfo: { name: "claude-code", version: "2" } } }], { SUFLO_OTOMASYON_DOSYASI: dosya });
  ok("Claude Code kendini tanıtınca 'code'; kapanınca veda en son gelir", js(temaslar) === js(["code:merhaba", "code:veda"]), temaslar.join());
  temaslar.length = 0;
  r = await konus([{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", clientInfo: { name: "claude-ai", version: "0.1" } } }], { SUFLO_OTOMASYON_DOSYASI: dosya });
  ok("Claude Desktop (claude-ai) 'desktop' olarak tanınır", js(temaslar) === js(["desktop:merhaba", "desktop:veda"]), temaslar.join());

  /* ---- jeton yenilenince shim dosyayı yeniden okur ---- */
  sunucu.jetonYenile();
  r = await konus([{ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "suflo_oynatma_kafasi", arguments: { saniye: 2 } } }], { SUFLO_OTOMASYON_DOSYASI: dosya });
  ok("tools/call her çağrıda otomasyon.json'u yeniden okur (yeni jeton geçer)", bul(r.satirlar, 5).result.isError === false && cagrilar[cagrilar.length - 1][0] === "suflo_oynatma_kafasi");

  /* ---- köprü kapanınca ---- */
  sunucu.durdur();
  r = await konus([{ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "suflo_baglam", arguments: {} } }], { SUFLO_OTOMASYON_DOSYASI: dosya });
  ok("köprü kapalıyken isError: köprü kapalı", bul(r.satirlar, 6).result.isError === true && /köprü kapalı/.test(bul(r.satirlar, 6).result.content[0].text));

  /* ---- ölü süreçten kalan dosya ---- */
  fs.writeFileSync(dosya, JSON.stringify({ v: 1, port: 9, token: new Array(65).join("a"), pid: 2147483646 }));
  r = await konus([{ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "suflo_baglam", arguments: {} } }], { SUFLO_OTOMASYON_DOSYASI: dosya });
  ok("panel süreci yoksa (çökme) köprü kapalı sayılır", bul(r.satirlar, 7).result.isError === true && /köprü kapalı/.test(bul(r.satirlar, 7).result.content[0].text));
  fs.unlinkSync(dosya);

  /* ---- kaynak denetimleri ---- */
  var src = fs.readFileSync(SHIM, "utf8");
  ok("shim sıfır bağımlılık: yalnız Node çekirdeği + ../js/otomasyon.js", (src.match(/require\("([^"]+)"\)/g) || []).every(function (x) {
    return /require\("(fs|os|path|http|\.\.\/js\/otomasyon\.js)"\)/.test(x);
  }), (src.match(/require\("([^"]+)"\)/g) || []).join(","));
  ok("shim yalnız 127.0.0.1'e bağlanır", /host: "127\.0\.0\.1"/.test(src) && !/https?:\/\/(?!127\.0\.0\.1)/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")));
  ok("shim stdout'a yalnız yaz() ile JSON-RPC yazar (console.log yok)", !/console\.log\(/.test(src) && (src.match(/process\.stdout\.write/g) || []).length === 1);

  try { fs.rmdirSync(dizin); } catch (e) {}
  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}
main().catch(function (e) { console.log("FAIL beklenmeyen hata " + (e && e.stack)); process.exit(1); });
