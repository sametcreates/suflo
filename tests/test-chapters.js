// Suflo testi: js/chapters.js — konusmadan YouTube bolumleri
var path = require("path");
var C = require(path.join(__dirname, "..", "js", "chapters.js"));

var gecen = 0, toplam = 0;
function chk(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : ""));
}

// 6 dakikalik sahte konusma: her 4 sn bir satir; 120 ve 240. sn'de uzun duraksama
var segs = [];
for (var t = 0; t < 360; t += 4) {
  var bosluk = (t === 116 || t === 236) ? 2.5 : 0.3;
  segs.push({ start: t, end: t + 4 - bosluk, text: t === 0 ? "ee merhaba arkadaşlar bugün kamera ayarlarını konuşacağız." :
    t === 120 ? "İkinci konu ışık kurulumu nasıl yapılır." :
    t === 240 ? "Son olarak ses kaydı için ipuçları." : "satır " + t + " burada konuşuyoruz." });
}

chk("tc: dakika", C.tc(83.9) === "1:23", C.tc(83.9));
chk("tc: saat", C.tc(3725) === "1:02:05", C.tc(3725));
chk("titleFrom: dolgu ve 'ee' atilir, ilk harf buyuk", C.titleFrom("ee yani merhaba arkadaşlar bugün çok güzel bir gün", 4) === "Merhaba arkadaşlar bugün çok", C.titleFrom("ee yani merhaba arkadaşlar bugün çok güzel bir gün", 4));
chk("titleFrom: Turkce i -> İ", C.titleFrom("ışık ve ilk ayar", 3) === "Işık ve ilk" && C.titleFrom("ilk ayar", 2) === "İlk ayar");

var s = C.suggest(segs, { every: 120, minGap: 30 });
chk("suggest: 3 bolum", s.length === 3, s.length);
chk("suggest: ilk bolum 0'da", s[0] && s[0].time === 0);
chk("suggest: sinirlar uzun duraksamalarda", s[1] && s[1].time === 120 && s[2] && s[2].time === 240, s.map(function (c) { return c.time; }).join(","));
chk("suggest: basliklar satirdan", s[1] && s[1].title.indexOf("İkinci konu") === 0, s[1] && s[1].title);

var v = C.validate(s, { end: 360 });
chk("validate: gecerli liste", v.ok, v.errors.join(" | "));
var kotu = C.validate([{ time: 5, title: "a" }, { time: 10, title: "" }], { end: 15 });
chk("validate: az bolum, 0:00 degil, kisa, bos baslik", !kotu.ok && kotu.errors.length >= 4, kotu.errors.join(" | "));

var f = C.format([{ time: 100, title: "Giriş" }, { time: 160, title: "Işık" }, { time: 400, title: "Ses" }], { origin: 100 });
chk("format: origin'e gore, ilk 0:00", f === "0:00 Giriş\n1:00 Işık\n5:00 Ses", JSON.stringify(f));

var p = C.buildPrompt(segs, { lang: "tr", maxChars: 800 });
chk("buildPrompt: Turkce istendi", /Turkish/.test(p.system));
chk("buildPrompt: uzun metin seyreltildi", p.user.length < 1200, p.user.length);

var cevap = JSON.stringify({ chapters: [{ t: 3, title: "Giriş" }, { t: 119, title: "Işık kurulumu" }, { t: 125, title: "Çok yakın" }, { t: 241, title: "Ses" }, { t: "x", title: "bozuk" }] });
var pr = C.parseResponse(cevap, segs, {});
chk("parseResponse: ilk bolum 0'a cekildi", pr[0] && pr[0].time === 0, pr[0] && pr[0].time);
chk("parseResponse: satir basina oturtuldu", pr[1] && pr[1].time === 120, pr[1] && pr[1].time);
chk("parseResponse: cok yakin ve bozuk elendi", pr.length === 3, JSON.stringify(pr));
chk("parseResponse: bozuk JSON bos liste", C.parseResponse("{bozuk", segs).length === 0);
chk("suggest: bos girdi", C.suggest([]).length === 0);

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
