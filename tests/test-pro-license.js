/* Pro lisans sahipligi, cache ve private icerik kimligi sozlesmesi. */
var fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm"), events = require("events");
var ROOT = path.join(__dirname, "..");
var TMP = path.join(os.tmpdir(), "suflo-pro-license-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });

var replies = [], requests = [];
function reply(data, status) { replies.push({ status: status || 200, data: data }); }
var fakeHttps = {
  request: function (opts, cb) {
    var req = new events.EventEmitter(), body = "";
    req.setTimeout = function () {};
    req.write = function (chunk) { body += String(chunk); };
    req.end = function () {
      var next = replies.shift();
      if (!next) { req.emit("error", new Error("missing fake response")); return; }
      requests.push({ path: opts.path, body: body });
      var res = new events.EventEmitter();
      res.statusCode = next.status;
      res.setEncoding = function () {};
      cb(res);
      process.nextTick(function () { res.emit("data", JSON.stringify(next.data)); res.emit("end"); });
    };
    req.destroy = function (err) { req.emit("error", err); };
    return req;
  }
};
function owned(extra) {
  var base = {
    activated: true, valid: true, error: null,
    license_key: { status: "active", expires_at: null },
    instance: { id: "instance-owned" },
    meta: { store_id: 454844, product_id: 1302656, variant_id: 1, customer_email: "editor@example.com" }
  };
  Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
  return base;
}
var fakeProcess = { env: { APPDATA: TMP }, platform: "win32" };
var ctx = {
  console: console, Buffer: Buffer, process: fakeProcess,
  setTimeout: function () { return 1; }, clearTimeout: function () {},
  document: { getElementById: function () { return null; }, createElement: function () { return {}; }, body: { appendChild: function () {} }, head: { appendChild: function () {} } },
  require: function (name) {
    if (name === "https") return fakeHttps;
    if (name === "os") return { hostname: function () { return "test-pc"; }, homedir: os.homedir };
    return require(name);
  }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "pro.js"), "utf8"), ctx, { filename: "js/pro.js" });

var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + "   [" + String(evidence) + "]"); }
}
function activate(key) { return new Promise(function (resolve) { ctx.Pro.activate(key, resolve); }); }
function validate() { return new Promise(function (resolve) { ctx.Pro.validate(resolve); }); }

(async function () {
  ok("Lisans yokken private icerik kimligi verilmez", ctx.Pro.contentCredentials() === null);

  var wrong = owned(); wrong.meta.product_id = 999;
  reply(wrong); reply({ deactivated: true });
  var rejected = await activate("WRONG-PRODUCT");
  ok("Baska Lemon urununun anahtari reddedilir", rejected.ok === false && /baska bir urune/i.test(rejected.error), rejected.error);
  ok("Reddedilen aktivasyon koltugu geri birakir", requests.some(function (r) { return /licenses\/deactivate/.test(r.path) && /WRONG-PRODUCT/.test(r.body); }), JSON.stringify(requests));

  reply(owned());
  var accepted = await activate("OWNED-LICENSE");
  ok("Dogru store ve product anahtari Pro'yu acar", accepted.ok === true && ctx.Pro.isPro());
  var creds = ctx.Pro.contentCredentials();
  ok("Icerik bulutu yalniz lisans ve instance kopyasini alir", creds && creds.licenseKey === "OWNED-LICENSE" && creds.instanceId === "instance-owned");
  creds.licenseKey = "mutated";
  ok("Disa verilen kimlik nesnesi ic cache'i degistiremez", ctx.Pro.contentCredentials().licenseKey === "OWNED-LICENSE");
  ok("Public durum nesnesi lisans anahtarini sizdirmaz", !("key" in ctx.Pro.status()) && !("instanceId" in ctx.Pro.status()));

  var validationWrong = owned(); validationWrong.meta.product_id = 777;
  reply(validationWrong);
  var revoked = await validate();
  ok("Periyodik dogrulama da urun sahipligini yeniden kontrol eder", revoked.revoked === true && !ctx.Pro.isPro(), JSON.stringify(revoked));
  ok("Reddedilen lisans cache'i silinir", !fs.existsSync(path.join(TMP, "Suflo", "pro-license.json")));

  console.log("\n" + passed + "/" + (passed + failed) + " gecti");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(failed ? 1 : 0);
})().catch(function (e) {
  console.log("FAIL test kosumu   [" + (e && e.stack ? e.stack : e) + "]");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
