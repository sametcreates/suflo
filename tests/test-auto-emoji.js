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

/* parti 6: baglam, oncelik, haric, unlu daralmasi, olumsuzluk, secenekler */
function p(t, l) { return E.pick(t, l || "tr"); }
chk("'doğru' edat olarak emoji almaz: 'Eve doğru yürüdük' -> null", p("Eve doğru yürüdük") === null, p("Eve doğru yürüdük"));
chk("'doğru' cevap olarak ✅ ('Doğru!', 'çok doğru', 'doğru mu')",
  p("Doğru!") === "✅" && p("Bu çok doğru") === "✅" && p("Bu doğru mu?") === "✅", [p("Doğru!"), p("Bu çok doğru"), p("Bu doğru mu?")].join(","));
chk("'doğruyu', 'doğrudan' yön/edat: emoji yok", p("doğrudan söyleyeyim") === null && p("eve doğru gidelim") === null);
chk("'Hatay' sehri ⚠️ almaz (hata kokunun haric listesi)", p("Hatay çok güzel bir şehir") !== "⚠️" && p("HATAY") === null, p("Hatay çok güzel bir şehir"));
// Doğrulama: "hatay" dışlaması yalnız TAM sözcük olmalı; önek dışlama "hatayı / hataya / hatayla"yı (çok sık) da yutuyordu
chk("'Hatay'da' ⚠️ almaz ama 'hatayı', 'hataya', 'hatayla', 'hataydı' ⚠️ alır",
  p("Hatay'da çektik") === null && p("Hatay’ın sokakları") === null &&
  ["Bu hatayı herkes yapıyor", "Kimse hataya düşmesin", "Hatayla yüzleşmek lazım", "Bu bir hataydı"].every(function (t) { return p(t) === "⚠️"; }),
  ["Hatay'da çektik", "Bu hatayı herkes yapıyor", "Kimse hataya düşmesin", "Hatayla yüzleşmek lazım", "Bu bir hataydı"].map(p).join(","));
chk("'hata' hala ⚠️, 'hatırladım' ⚠️ degil", p("Büyük bir hata yaptım") === "⚠️" && p("Şimdi hatırladım") === null);
chk("'Kazanan biz olduk' -> 🏆 (ozgul kok genelden once)", p("Kazanan biz olduk") === "🏆" && p("Şampiyon olduk") === "🏆", p("Kazanan biz olduk"));
chk("'para kazandım' hala 💰", p("para kazandım") === "💰" && p("Bütün paraları harcadım") === "💰");
chk("'Bunun sakıncası yok' -> null ('sakın' koku 'sakınca'yi almaz)", p("Bunun sakıncası yok") === null && p("Sakın bunu yapma") === "⚠️", p("Bunun sakıncası yok"));
chk("unlu daralmasi: 'başlıyoruz' -> 🚀", p("Merhaba arkadaşlar, bugün başlıyoruz") === "🚀", p("Merhaba arkadaşlar, bugün başlıyoruz"));
chk("daralt(): başla→başlıyor, bekle→bekliyor, anla→anlıyor, oyna→oynuyor, söyle→söylüyor; ünsüzle biten kök null",
  ["başla", "bekle", "anla", "oyna", "söyle"].map(E.daralt).join(",") === "başlıyor,bekliyor,anlıyor,oynuyor,söylüyor" && E.daralt("git") === null,
  ["başla", "bekle", "anla", "oyna", "söyle", "git"].map(E.daralt).join(","));
chk("'bekliyoruz' -> ⏰ (fiil kokunden daralma)", p("Sizi bekliyoruz") === "⏰", p("Sizi bekliyoruz"));
chk("olumsuzluk: 'güzel değil', 'hiç komik değildi' olumlu emoji almaz",
  p("Bu hiç güzel değil") === null && p("Hiç komik değildi") === null, [p("Bu hiç güzel değil"), p("Hiç komik değildi")].join(","));
chk("onay sorusu 'değil mi' olumsuzluk sayilmaz", p("Çok komik, değil mi?") === "😂" && p("Bu doğru değil mi?") === "✅", [p("Çok komik, değil mi?"), p("Bu doğru değil mi?")].join(","));
chk("olumsuzluk satirin baska bir anahtarini engellemez", p("komik değil ama harika") === "🔥", p("komik değil ama harika"));
chk("Ingilizce olumsuzluk: 'not funny', 'isn't amazing' -> null", p("This is not funny", "en") === null && p("It isn't amazing", "en") === null && p("That was amazing", "en") === "🔥");
chk("Turkce buyuk harf (I/İ) toLocaleLowerCase('tr') ile: 'KAZANAN BİZİZ', 'İNANILMAZ'",
  p("KAZANAN BİZİZ") === "🏆" && p("BU İNANILMAZ") === "😱", [p("KAZANAN BİZİZ"), p("BU İNANILMAZ")].join(","));
chk("haric 'başarısız' ✅ almaz", p("Bu deneme başarısız oldu") === null, p("Bu deneme başarısız oldu"));
var es = E.eslesme("Bu harika, bir video", "tr");
chk("eslesme tetikleyen sozcugu verir", es && es.emoji === "🔥" && es.kelime === 1, JSON.stringify(es));
chk("yerlestir 'kelime': tetikleyen sozcukten sonra, *vurgu* ve noktalama bozulmaz",
  E.yerlestir("Bu *harika*, bir video", "🔥", 1, "kelime") === "Bu *harika*, 🔥 bir video", E.yerlestir("Bu *harika*, bir video", "🔥", 1, "kelime"));
chk("yerlestir 'son' ve son sozcukte satir sonu", E.yerlestir("Bu harika", "🔥", 1, "kelime") === "Bu harika 🔥" && E.yerlestir("a harika b", "🔥", 1, "son") === "a harika b 🔥");
chk("yerlestir satir kirilimini korur", E.yerlestir("bu harika\nbir gün", "🔥", 1, "kelime") === "bu harika 🔥\nbir gün", JSON.stringify(E.yerlestir("bu harika\nbir gün", "🔥", 1, "kelime")));
var cok = [];
for (var ci = 0; ci < 24; ci++) cok.push({ text: ["para kazandık", "harika bir gün", "bir fikir", "dikkat edin", "şarkı çalıyor", "telefon aldım"][ci % 6] });
var sy = E.suggest(cok, { lang: "tr" }), sv = E.suggest(cok, { lang: "tr", yogunluk: "seyrek" });
var or = E.suggest(cok, { lang: "tr", yogunluk: "orta" }), yo = E.suggest(cok, { lang: "tr", yogunluk: "yogun" });
chk("yogunluk: varsayilan = seyrek (bugunku 0.25 / 2 / 6)", JSON.stringify(sy) === JSON.stringify(sv) && sy.length === 6, sy.length);
chk("yogunluk: seyrek < orta < yogun", sv.length < or.length && or.length < yo.length, [sv.length, or.length, yo.length].join("<"));
chk("yogun da tekrar korumasini tutar (ayni emoji 3 satirdan once tekrar etmez)", yo.every(function (o, i) {
  return yo.slice(0, i).every(function (q) { return q.emoji !== o.emoji || o.index - q.index >= 3; });
}));
chk("tum emojilerin cevrimdisi SVG'si var (yeni kurallarla)", E.emojis().every(function (e) { return esleme[e]; }));
chk("YOGUNLUKLAR listesi", JSON.stringify(E.YOGUNLUKLAR) === '["seyrek","orta","yogun"]');

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
