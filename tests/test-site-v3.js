/* Static storefront regression checks. Run with: node tests/test-site-v3.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..', 'docs');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'premium.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'premium.css'), 'utf8');
let checks = 0;
function check(name, action) { action(); checks++; console.log('PASS ' + name); }
check('storefront JavaScript parses', () => new vm.Script(js));
check('one main heading and Turkish document', () => {
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert(html.includes('<html lang="tr">'));
});
check('all anchor targets exist and IDs are unique', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of html.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(m[1]), m[1]);
});
check('local HTML assets and navigation exist', () => {
  for (const m of html.matchAll(/(?:src|poster|href)="(\/[^"?#]*)(?:\?[^"#]*)?"/g)) {
    const rel = decodeURIComponent(m[1]);
    const target = path.join(root, rel);
    assert(fs.existsSync(target), 'Missing ' + rel);
  }
});
check('real gallery thumbnails and animations exist', () => {
  const folders = {text:'mogrt', captions:'caption-styles', backgrounds:'motionbg', buttons:'buton'};
  for (const [key, folder] of Object.entries(folders)) {
    const block = js.match(new RegExp('const ' + key + ' = \\[([\\s\\S]*?)\\];'))[1];
    const entries = [...block.matchAll(/\['([^']+)',\s*'([^']+)'(?:,\s*(false))?\]/g)];
    if (key === 'captions') assert.equal(entries.length, 17);
    for (const entry of entries) {
      assert(fs.existsSync(path.join(root, 'gorseller', folder, entry[1] + '.webp')), entry[1]);
      if ((key === 'text' || key === 'captions') && !entry[3])
        assert(fs.existsSync(path.join(root, 'gorseller', folder, entry[1] + '.webm')), entry[1]);
    }
  }
});
check('749 TRY preserved and checkout points to existing product', () => {
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const pro = schema['@graph'].find(x => x.name === 'Suflo Pro');
  assert.equal(pro.offers.price, '749');
  assert.equal(pro.offers.priceCurrency, 'TRY');
  const links = [...html.matchAll(/href="(https:\/\/suflo\.lemonsqueezy\.com[^\"]+)"/g)];
  assert(links.length >= 3);
  for (const m of links) {
    const url = new URL(m[1]);
    assert.equal(url.pathname, '/checkout/buy/e33dda31-8e47-46c3-be1d-e047ab1b2dd1');
    assert.equal(url.searchParams.get('discount'), '0');
  }
});
check('gallery keyboard controls and motion safeguards', () => {
  assert(js.includes("event.key === 'ArrowRight'"));
  assert(js.includes("event.key === 'ArrowLeft'"));
  assert(js.includes("document.hidden"));
  assert(js.includes("IntersectionObserver"));
  assert(css.includes('prefers-reduced-motion:reduce'));
  assert(!html.includes('autoplay'));
});
check('required product, price, installation and support sections retained', () => {
  for (const id of ['kutuphane','pro','ozellikler','nasil','fiyat','sss','kurulum'])
    assert(html.includes(`id="${id}"`));
  assert(html.includes('/hesap.html'));
  assert(html.includes('/blog/'));
  assert(html.includes('github.com/sametcreates/suflo/releases/latest'));
  assert(html.includes('Suflo Doctor'));
});
console.log(`\n${checks}/${checks} passed`);
