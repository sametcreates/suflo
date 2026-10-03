// Suflo testi: js/auto-emoji.js — altyaziya anlamina gore emoji
var path = require("path");
var fs = require("fs");
var E = require(path.join(__dirname, "..", "js", "auto-emoji.js"));
var esleme = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "emoji", "esleme.json"), "utf8"));

var gecen = 0, toplam = 0;
function chk(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : ""));
}

chk("Turkce ek: 'paraları' -> 💰", E.pick("Bütün paraları harcadım", "tr") === "💰", E.pick("Bütün paraları harcadım", "tr"));
chk("Buyuk harf + I: 'İPUCU' -> 💡", E.pick("BU İPUCU ÇOK ÖNEMLİ", "tr") === "💡", E.pick("BU İPUCU ÇOK ÖNEMLİ", "tr"));
chk("sozcuk basi: 'kamera' -> 🎥 ama 'sakamera' degil", E.pick("yeni kamera aldım", "tr") === "🎥" && E.pick("sakameralar", "tr") === null);
chk("sik kelimeler yanlis eslesmez (artik, seviye, duvar, tamam, evet)",
  ["artık bitti", "bu seviye zor", "duvara bak", "tamam evet"].every(function (t) { return E.pick(t, "tr") === null; }),
  ["artık bitti", "bu seviye zor", "duvara bak", "tamam evet"].map(function (t) { return E.pick(t, "tr"); }).join(","));
chk("tam sozcuk koku: 'dua' -> 🙏", E.pick("bir dua et", "tr") === "🙏");
chk("anlamsiz satir emoji almaz", E.pick("bunu sonra konuşuruz", "tr") === null);
chk("Ingilizce", E.pick("This tip will save you money", "en") === "💰");
chk("hasEmoji", E.hasEmoji("harika 🔥") && !E.hasEmoji("harika"));
chk("append bosluk birakir", E.append("Çok güzel!", "😍") === "Çok güzel! 😍");

chk("tum emojilerin cevrimdisi SVG'si var", E.emojis().every(function (e) { return esleme[e]; }),
  E.emojis().filter(function (e) { return !esleme[e]; }).join(" "));

var segs = [
  { text: "para kazanmanın yolu" },   // 0 💰
  { text: "para para para" },          // 1 minGap ile atlanir
  { text: "bir fikir vereyim" },       // 2 minGap ile atlanir
  { text: "harika bir video" },        // 3 🔥
  { text: "sıradan satır" },           // 4
  { text: "sıradan satır" },           // 5
  { text: "yine para konusu" },        // 6 💰 repeatGap(6) ile dogrudan 6 satir sonra -> izin
  { text: "zaten emoji var 🎉" },      // 7 dokunulmaz
  { text: "dikkat edin" }              // 8 minGap: 7'de emoji var -> atlanir
];
var s = E.suggest(segs, { lang: "tr", density: 1, minGap: 2, repeatGap: 6 });
chk("suggest: secilen satirlar", JSON.stringify(s.map(function (x) { return x.index; })) === "[0,3,6]", JSON.stringify(s));
var az = E.suggest(segs, { lang: "tr", density: 0.12 });
chk("suggest: yogunluk siniri", az.length === 1, az.length);
chk("suggest: girdiyi degistirmez", segs[0].text === "para kazanmanın yolu");

/* inceleme duzeltmeleri */
chk("hasEmoji: ⏰ ve ⭐ (BMP disi olmayan semboller) taninir", E.hasEmoji("o zaman ⏰") && E.hasEmoji("⭐"));
chk("ayni satira ikinci kez emoji eklenmez", E.suggest([{ text: "saat kaçta ⏰" }], { density: 1 }).length === 0);
chk("gevsek kokler eslesmez (yapmak, büyük, o zaman)", ["yapmak istiyorum", "büyük ev", "o zaman gel"].every(function (t) { return E.pick(t, "tr") === null; }));
chk("Ingilizce gevsek kokler eslesmez (later, apple, window, hotel)", ["see you later", "apple", "window", "hotel"].every(function (t) { return E.pick(t, "en") === null; }));
chk("olu kurallar calisir: don't -> ❌, won -> 🏆", E.pick("don't do it", "en") === "❌" && E.pick("I won the race", "en") === "🏆");
chk("para kazandim hala 💰", E.pick("para kazandım", "tr") === "💰");
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
