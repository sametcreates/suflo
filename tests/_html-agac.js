// Ortak: index.html parçaları için küçük HTML ağacı (bağımlılıksız). "_" ile başlayan dosyaları test koşucusu
// çalıştırmaz. Yalnız Suflo'nun kendi, kapanışları açık yazılmış işaretlemesi için: yorumlar atılır, boş öğeler
// (input, img, br…) kapanış beklemez, script / style / textarea içeriği ham metindir.
var BOS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
var HAM = { script: 1, style: 1, textarea: 1 };

function nitelikler(s) {
  var out = {}, re = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, m;
  while ((m = re.exec(s))) out[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ""));
  return out;
}

function agac(html) {
  var kok = { tag: "#kok", attrs: {}, children: [], parent: null, text: "" };
  var yigin = [kok], i = 0, n = html.length;
  function ust() { return yigin[yigin.length - 1]; }
  while (i < n) {
    if (html.startsWith("<!--", i)) { var k = html.indexOf("-->", i + 4); i = k < 0 ? n : k + 3; continue; }
    if (html.startsWith("<!", i)) { i = html.indexOf(">", i) + 1; continue; }
    if (html[i] === "<" && html[i + 1] === "/") {
      var e = html.indexOf(">", i), ad = html.slice(i + 2, e).trim().toLowerCase();
      for (var j = yigin.length - 1; j > 0; j--) if (yigin[j].tag === ad) { yigin.length = j; break; }
      i = e + 1; continue;
    }
    if (html[i] === "<" && /[a-zA-Z]/.test(html[i + 1] || "")) {
      // niteliklerde ">" tırnak içinde olabilir (onclick="…&lt;…")
      var p = i + 1, q = null;
      while (p < n) { var c = html[p]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === ">") break; p++; }
      var ic = html.slice(i + 1, p), m = /^([a-zA-Z0-9-]+)/.exec(ic), etiket = m[1].toLowerCase();
      var dugum = { tag: etiket, attrs: nitelikler(ic.slice(m[1].length).replace(/\/$/, "")), children: [], parent: ust(), text: "" };
      ust().children.push(dugum);
      i = p + 1;
      if (HAM[etiket]) {
        var son = html.toLowerCase().indexOf("</" + etiket, i);
        dugum.text = html.slice(i, son < 0 ? n : son);
        i = son < 0 ? n : html.indexOf(">", son) + 1;
        continue;
      }
      if (!BOS[etiket] && !/\/$/.test(ic)) yigin.push(dugum);
      continue;
    }
    var t = html.indexOf("<", i); if (t < 0) t = n;
    var metin = html.slice(i, t);
    if (metin.trim()) ust().children.push({ tag: "#metin", text: metin, attrs: {}, children: [], parent: ust() });
    i = t;
  }
  return kok;
}

function gez(d, f) { f(d); (d.children || []).forEach(function (c) { gez(c, f); }); }
function bul(kok, id) { var r = null; gez(kok, function (d) { if (!r && d.attrs && d.attrs.id === id) r = d; }); return r; }
function hepsi(kok, f) { var r = []; gez(kok, function (d) { if (d.tag[0] !== "#" && f(d)) r.push(d); }); return r; }
function ata(d, f) { for (var p = d.parent; p; p = p.parent) if (f(p)) return p; return null; }
function siniflar(d) { return " " + String((d.attrs && d.attrs["class"]) || "") + " "; }
function sinifVar(d, s) { return siniflar(d).indexOf(" " + s + " ") !== -1; }
function metni(d) { var out = ""; gez(d, function (x) { if (x.tag === "#metin") out += x.text; }); return out.replace(/\s+/g, " ").trim(); }

module.exports = { agac: agac, gez: gez, bul: bul, hepsi: hepsi, ata: ata, sinifVar: sinifVar, metni: metni };
