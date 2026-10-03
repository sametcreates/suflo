// Suflo testi: HTTP yanitlari cok baytli Turkce harfleri parca sinirinda bozmamali.
// Sunucu yaniti 7 baytlik parcalarla yollar; "ş" gibi 2 baytlik harfler bolunur.
// Eskiden her parca ayri toString() edildigi icin metne U+FFFD (�) siziyordu.
var http = require("http"), vm = require("vm"), fs = require("fs"), path = require("path");

var beklenen = JSON.stringify({ text: "şğüİıçö Türkçe altyazı ".repeat(3000) });
var govde = Buffer.from(beklenen, "utf8");
var gecen = 0, toplam = 0;
function check(ad, kosul) { toplam++; if (kosul) gecen++; console.log((kosul ? "PASS " : "FAIL ") + ad); }

var srv = http.createServer(function (q, r) {
  var i = 0;
  r.writeHead(200);
  (function yaz() {
    if (i >= govde.length) return r.end();
    r.write(govde.subarray(i, i + 7)); i += 7; setImmediate(yaz);
  })();
});

srv.listen(0, "127.0.0.1", async function () {
  var url = "http://127.0.0.1:" + srv.address().port + "/";
  var ctx = {
    require: require, process: process, Buffer: Buffer, console: console, URL: URL,
    setTimeout: setTimeout, clearTimeout: clearTimeout, navigator: { platform: "Linux" },
    CSInterface: function () { this.evalScript = function () {}; this.getSystemPath = function () { return "/tmp"; }; },
    SystemPath: {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "bridge.js"), "utf8"), ctx);
  try {
    var g = await ctx.K.httpGet(url);
    check("httpGet: bozuk karakter yok", g.body.indexOf("�") === -1);
    check("httpGet: metin birebir", g.body === beklenen);
    var j = await ctx.K.httpJson(url, {}, { a: 1 });
    check("httpJson: metin birebir", j.body === beklenen);
  } catch (e) {
    check("istek coktu: " + e.message, false);
  }
  srv.close();
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
});
