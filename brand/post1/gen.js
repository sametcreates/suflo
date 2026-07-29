/* Suflo ilk post — 6 slayt. Çalıştır: node gen.js */
const fs = require("fs");
const path = require("path");
const D = __dirname;

const FOOT = (swipe) => `<div class="footer">
    <div class="brand">
      <svg viewBox="1 1 18 18"><defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b7cf6"/><stop offset="1" stop-color="#5b8cff"/></linearGradient></defs><rect x="1" y="1" width="18" height="18" rx="5" fill="url(#fg)"/><path d="M13.9 7.2 C13.5 5.5 11.9 4.7 10 4.7 C8 4.7 6.3 5.5 6.3 7.1 C6.3 10.7 13.7 9.1 13.7 12.9 C13.7 14.5 12 15.3 10 15.3 C8.1 15.3 6.5 14.5 6.1 12.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>
      <b>suflo.app</b>
    </div>
    ${swipe ? `<div class="swipe">${swipe} <span style="font-size:38px">→</span></div>` : ""}
  </div>`;

const LOGO = (cls) => `<svg class="${cls}" viewBox="1 1 18 18">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b7cf6"/><stop offset="1" stop-color="#5b8cff"/></linearGradient></defs>
    <rect x="1" y="1" width="18" height="18" rx="5" fill="url(#g)"/>
    <path d="M13.9 7.2 C13.5 5.5 11.9 4.7 10 4.7 C8 4.7 6.3 5.5 6.3 7.1 C6.3 10.7 13.7 9.1 13.7 12.9 C13.7 14.5 12 15.3 10 15.3 C8.1 15.3 6.5 14.5 6.1 12.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`;

const page = (body, extraStyle = "") => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><link rel="stylesheet" href="slide.css">${extraStyle ? `<style>${extraStyle}</style>` : ""}</head>
<body>
${body}
</body></html>`;

const TICK = `<svg width="30" height="30" viewBox="0 0 16 16" style="flex:0 0 auto"><path d="M3 8.5 L6.5 12 L13 4.5" stroke="#8b7cf6" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const slides = [

// 1 — kapak
page(`  ${LOGO("logo")}
  <h1 style="margin:56px 0 24px">Altyazı için ne paranı<br>ne de zamanını harca.</h1>
  <h2 class="grad-text" style="font-size:52px">Videonun suflörü geldi.</h2>
  <p class="sub" style="margin-top:40px">Premiere için ücretsiz yapay zekâ altyazı eklentisi</p>
  ${FOOT("kaydır")}`),

// 2 — gerçek panel
page(`  <div class="kicker">TANIŞ</div>
  <h2 style="margin-bottom:36px">Premiere'in içinde<br><span class="grad-text">yaşayan bir panel.</span></h2>
  <div class="shot"><img src="panel.png"></div>
  ${FOOT("nasıl çalışır?")}`,
`  body { justify-content: flex-start; padding-top: 80px; }
   .shot { position: relative; }
   .shot img {
     width: 470px; display:block; border-radius: 20px;
     box-shadow: 0 50px 120px -30px rgba(0,0,0,.9), 0 0 0 2px #262a3a;
   }
   .shot::after {
     content:""; position:absolute; left:0; right:0; bottom:0; height:190px;
     background: linear-gradient(to bottom, transparent, #0e0f15);
     border-radius: 0 0 20px 20px;
   }`),

// 3 — nasıl çalışır
page(`  <div class="kicker">NASIL ÇALIŞIR</div>
  <h2 style="margin-bottom:54px">Üç adım,<br><span class="grad-text">45 saniye.</span></h2>
  <div class="card">
    <div class="step"><div class="num">1</div><div><b>Videonu seç</b><span>Tek klip, işaretlediğin aralık ya da baştan sona hepsi</span></div></div>
    <div class="step"><div class="num">2</div><div><b>Butona bas</b><span>Yapay zekâ konuşmayı dinler ve yazıya döker</span></div></div>
    <div class="step"><div class="num">3</div><div><b>Düzelt, uygula</b><span>Yanlış varsa elle düzelt — tek tıkla videoya işlenir</span></div></div>
  </div>
  <p class="sub" style="margin-top:40px;font-size:31px">Karaoke · BÜYÜK HARF · noktalama · TR AZ EN RU</p>
  ${FOOT("peki fiyatı?")}`),

// 4 — fiyat
page(`  <div class="kicker">FİYAT</div>
  <h1 style="font-size:118px;margin-bottom:16px"><span class="grad-text">0 TL.</span></h1>
  <h2 style="font-size:50px;margin-bottom:52px">Sınırsız. Sonsuza dek.</h2>
  <div class="card" style="width:850px;padding:16px 46px;text-align:left">
    <div style="display:flex;align-items:center;gap:22px;padding:27px 0;font-size:32px">${TICK}<span>Abonelik yok, kredi yok, kota yok</span></div>
    <div style="display:flex;align-items:center;gap:22px;padding:27px 0;font-size:32px;border-top:2px solid #262a3a">${TICK}<span>Sesin bilgisayarından çıkmaz</span></div>
    <div style="display:flex;align-items:center;gap:22px;padding:27px 0;font-size:32px;border-top:2px solid #262a3a">${TICK}<span>İnternet olmadan da çalışır</span></div>
    <div style="display:flex;align-items:center;gap:22px;padding:27px 0;font-size:32px;border-top:2px solid #262a3a">${TICK}<span>Açık kaynak — kodu herkese açık</span></div>
  </div>
  ${FOOT("sırada ne var?")}`),

// 5 — yol haritası
page(`  <div class="kicker">YOL HARİTASI</div>
  <h2 style="margin-bottom:48px">Bu sadece<br><span class="grad-text">başlangıç.</span></h2>
  <div class="road">
    <div class="road-row now">
      <div class="rn">01</div>
      <div class="rt"><b>AI Altyazı</b><span class="badge live">ŞİMDİ</span></div>
      <div class="rc">›</div>
    </div>
    <div class="road-row">
      <div class="rn">02</div>
      <div class="rt"><b>Beat Marker</b><span class="badge soon">YAKINDA</span></div>
      <div class="rc">›</div>
    </div>
    <div class="road-row">
      <div class="rn">03</div>
      <div class="rt"><b>Emoji Picker</b><span class="badge soon">YAKINDA</span></div>
      <div class="rc">›</div>
    </div>
    <div class="road-note">Suflo büyüdükçe kurgu akışın hızlanacak.</div>
  </div>
  ${FOOT("indir")}`,
`  .road { width: 880px; display:flex; flex-direction:column; gap:20px; }
   .road-row {
     display:flex; align-items:center; gap:28px;
     background: linear-gradient(180deg, rgba(255,255,255,.03), transparent 40%), #161822;
     border:2px solid #262a3a; border-radius:24px; padding:28px 34px;
   }
   .road-row.now {
     border-color:#8b7cf6;
     box-shadow: 0 20px 50px -20px rgba(120,108,255,.6);
   }
   .rn {
     flex:0 0 84px; height:84px; border-radius:22px;
     background:#1c1f2b; color:#4c5169;
     display:flex; align-items:center; justify-content:center;
     font-size:36px; font-weight:700;
   }
   .road-row.now .rn {
     background: linear-gradient(135deg,#8b7cf6,#5b8cff); color:#fff;
     box-shadow: 0 12px 30px -10px rgba(120,108,255,.9);
   }
   .rt { flex:1; text-align:left; }
   .rt b { display:block; font-size:40px; margin-bottom:10px; }
   .badge {
     display:inline-block; padding:8px 20px; border-radius:30px;
     font-size:22px; font-weight:700; letter-spacing:1px;
   }
   .badge.live { background:#6fdca0; color:#0b2318; }
   .badge.soon { background:#eac877; color:#2a2210; }
   .rc { font-size:52px; color:#3d4257; }
   .road-note {
     margin-top:8px; padding:30px;
     background: linear-gradient(135deg, rgba(139,124,246,.14), rgba(91,140,255,.07));
     border:2px solid rgba(139,124,246,.28); border-radius:22px;
     font-size:31px; font-weight:600; color:#cfc9ff;
   }`),

// 6 — kapanış
page(`  ${LOGO("logo-sm")}
  <h2 style="margin:44px 0 24px">Ücretsiz indir,<br><span class="grad-text">hemen kullan.</span></h2>
  <p class="sub" style="margin-bottom:56px">Kurulum 2 dakika · Adobe Premiere için</p>
  <div style="padding:30px 76px;border-radius:24px;background:linear-gradient(135deg,#8b7cf6,#5b8cff);color:#fff;font-weight:700;font-size:46px;box-shadow:0 20px 60px -15px rgba(120,108,255,.8)">suflo.app</div>
  <p class="sub" style="margin-top:50px;font-size:32px">Profildeki linkten indirebilirsin ⬇️</p>
  ${FOOT("")}`)
];

slides.forEach((html, i) => fs.writeFileSync(path.join(D, `s${i + 1}.html`), html, "utf8"));
console.log("yazildi: " + slides.length + " slayt");
