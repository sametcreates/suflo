/* Small, dependency-free storefront interactions. No private extension code. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const menu = document.querySelector('#main-nav');
  const toggle = document.querySelector('.menu-toggle');
  function closeMenu() {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menüyü aç');
  }
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.classList.contains('open')) {
      closeMenu();
      toggle.focus();
    }
  });

  const text = [
    ['12-slide-collide', 'Slide Collide'], ['26-jitter-shine', 'Jitter Shine', false],
    ['06-gold-text', 'Gold Text'], ['07-futurist', 'Futurist'],
    ['29-cracked', 'Cracked'], ['11-zoom-in', 'Zoom In'],
    ['16-ocean-waves', 'Ocean Waves'], ['08-coovetica-wave', 'Coovetica Wave'],
    ['15-spinning-butter', 'Spinning Butter'], ['13-rock-solidance', 'Rock Solidance'],
    ['10-butter-up', 'Butter Up'], ['02-rainbow-text', 'Trippy Text']
  ];
  const captions = [
    ['11-mr-beast', 'Creator Punch'], ['08-karaoke', 'Karaoke'],
    ['07-glitch', 'Glitch'], ['15-spinning', 'Spinning'],
    ['06-emphasis', 'Emphasis'], ['05-comic', 'Comic'],
    ['02-arch', 'Arch'], ['16-tiktok', 'Social Pop'],
    ['01-akira', 'Akira'], ['03-block', 'Block'], ['04-clean', 'Clean Pop'],
    ['09-marker', 'Marker'], ['10-motion-blur', 'Motion Blur'],
    ['12-obviously', 'Obviously'], ['13-slant', 'Slant'],
    ['14-slide', 'Slide'], ['17-typewriter', 'Typewriter']
  ];
  const backgrounds = [['lightleak', 'Light Leak'], ['pastel', 'Pastel'], ['wavy', 'Gradient Wave'], ['borealis', 'Borealis'], ['film', 'Film Overlay'], ['paper', 'Paper'], ['grid', 'Grid'], ['topo', 'Topography']];
  const buttons = [['Abone Ol', 'Abone Ol'], ['Takip Et', 'Takip Et'], ['Begen', 'Beğen'], ['Indir', 'İndir'], ['Kaydol', 'Kaydol'], ['Paylas', 'Paylaş'], ['Gonder', 'Gönder'], ['Mesaj', 'Mesaj']];
  const videos = [];
  const videoLabels = new Map();
  function pausedLabel(video) {
    const item = videoLabels.get(video);
    if (!item) return;
    item.button.setAttribute('aria-pressed', 'false');
    item.button.setAttribute('aria-label', `${item.name} önizlemesini oynat`);
    item.icon.textContent = '▶';
    if (item.hero) item.button.lastChild.textContent = ' Önizle';
  }
  function pause(video) { video.pause(); pausedLabel(video); }
  async function play(video) {
    videos.forEach(other => { if (other !== video) pause(other); });
    const item = videoLabels.get(video);
    try {
      await video.play();
      item.button.setAttribute('aria-pressed', 'true');
      item.button.setAttribute('aria-label', `${item.name} önizlemesini duraklat`);
      item.icon.textContent = 'Ⅱ';
      if (item.hero) item.button.lastChild.textContent = ' Duraklat';
    } catch (_) { pausedLabel(video); }
  }
  function connectVideo(video, button, icon, name, hero = false) {
    videos.push(video);
    videoLabels.set(video, { button, icon, name, hero });
    button.addEventListener('click', () => video.paused ? play(video) : pause(video));
    if (!hero) {
      button.addEventListener('pointerenter', () => { if (finePointer.matches && !reduced.matches) play(video); });
      button.addEventListener('pointerleave', () => { if (finePointer.matches) pause(video); });
      button.addEventListener('blur', () => pause(video));
    }
  }
  function createGallery(id, entries, folder, animated) {
    const panel = document.getElementById(`gallery-${id}`);
    entries.forEach(([file, name, hasVideo = true]) => {
      const figure = document.createElement('figure');
      figure.className = 'preview-card';
      const src = `/gorseller/${folder}/${encodeURIComponent(file)}`;
      if (animated && hasVideo) {
        const button = document.createElement('button');
        button.className = 'preview-trigger';
        button.type = 'button';
        button.setAttribute('aria-label', `${name} önizlemesini oynat`);
        button.setAttribute('aria-pressed', 'false');
        const video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'none';
        video.poster = `${src}.webp`;
        video.setAttribute('aria-hidden', 'true');
        const source = document.createElement('source');
        source.src = `${src}.webm`;
        source.type = 'video/webm';
        video.append(source);
        const icon = document.createElement('span');
        icon.className = 'preview-play';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '▶';
        button.append(video, icon);
        figure.append(button);
        connectVideo(video, button, icon, name);
      } else {
        const image = document.createElement('img');
        image.src = `${src}.webp`;
        const kind = id === 'backgrounds' ? 'hareketli zemin' : id === 'buttons' ? 'buton' : 'yazı animasyonu';
        image.alt = `${name} ${kind} örneği`;
        image.loading = 'lazy';
        image.width = 640;
        image.height = 360;
        image.className = 'static-preview';
        figure.append(image);
      }
      const caption = document.createElement('figcaption');
      const title = document.createElement('span');
      title.textContent = name;
      const tier = document.createElement('small');
      tier.textContent = 'PRO';
      caption.append(title, tier);
      figure.append(caption);
      panel.append(figure);
    });
  }
  createGallery('text', text, 'mogrt', true);
  createGallery('captions', captions, 'caption-styles', true);
  createGallery('backgrounds', backgrounds, 'motionbg', false);
  createGallery('buttons', buttons, 'buton', false);

  const tabs = [...document.querySelectorAll('[data-gallery]')];
  function selectTab(tab, focus = false) {
    videos.forEach(pause);
    tabs.forEach(other => {
      const active = other === tab;
      other.setAttribute('aria-selected', String(active));
      other.tabIndex = active ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !active;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); selectTab(tabs[next], true); }
    });
  });
  const heroVideo = document.querySelector('.hero-video');
  const heroButton = document.querySelector('.hero-play');
  connectVideo(heroVideo, heroButton, heroButton.firstChild, 'Slide Collide', true);
  // Playback is always opt-in; no autoplay bandwidth or motion surprises.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) pause(entry.target);
    }), { threshold: .05 });
    videos.forEach(video => observer.observe(video));
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) videos.forEach(pause); });
  reduced.addEventListener('change', () => videos.forEach(pause));

  // Preserve the existing non-sensitive checkout attribution, not client identifiers.
  document.querySelectorAll('.buy-link').forEach(link => {
    link.classList.add('lemonsqueezy-button');
    const url = new URL(link.href);
    url.searchParams.set('checkout[custom][source]', 'suflo_website');
    url.searchParams.set('checkout[custom][feature]', link.dataset.source);
    url.searchParams.set('checkout[custom][app_version]', '3.0.0');
    link.href = url.toString();
  });
  // Existing cookieless Cloudflare Web Analytics; local previews are excluded.
  if (location.hostname === 'suflo.app') {
    const beacon = document.createElement('script');
    beacon.defer = true;
    beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    beacon.setAttribute('data-cf-beacon', '{"token":"0e9cbe24552b412d8b1b6e4d34abe34f"}');
    document.body.append(beacon);
  }
})();
