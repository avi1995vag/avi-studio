(() => {
  'use strict';

  const desk = document.getElementById('creative-desk');
  const previewImage = document.getElementById('preview-image');
  const previewTitle = document.getElementById('preview-title');
  const previewCaption = document.getElementById('preview-caption');
  const previewCategory = document.getElementById('preview-category');
  const previewLink = document.getElementById('preview-link');
  const previewLinkLabel = document.getElementById('preview-link-label');
  const previewStatus = document.getElementById('preview-status');
  const modeButtons = Array.from(document.querySelectorAll('.preview-modes [data-mode]'));
  const animationButton = document.getElementById('animation-toggle');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const previews = {
    motion: {
      image: './assets/landing-dancer.webp',
      alt: 'A dancer sends a red scarf through the evening air',
      title: ['Make', 'it move.'],
      caption: 'A little movement. A whole new story.',
      category: 'A STORY IN MOTION',
      link: './assets/apps/motion-studio/',
      label: 'Explore Motion Studio',
    },
    data: {
      image: './assets/landing-infographic.webp',
      alt: 'An infographic showing research, writing, design and review as horizontal bars',
      title: ['Make data', 'tell a story.'],
      caption: 'Find the story behind the numbers.',
      category: 'THE BIG PICTURE',
      link: './assets/apps/infographic-studio/',
      label: 'Explore Infographic Studio',
    },
    maps: {
      image: './assets/landing-map.webp',
      alt: 'An India map with highlighted states and a location pin',
      title: ['Every place.', 'A new story.'],
      caption: 'Put your next idea on the map.',
      category: 'A DIFFERENT PERSPECTIVE',
      link: './assets/apps/india-motion/',
      label: 'Explore India Motion',
    },
  };

  function choosePreview(mode) {
    const preview = previews[mode];
    if (!preview) return;
    desk.dataset.mode = mode;
    previewImage.src = preview.image;
    previewImage.alt = preview.alt;
    previewImage.width = mode === 'motion' ? 760 : 360;
    previewImage.height = mode === 'motion' ? 950 : 450;
    previewTitle.replaceChildren(document.createTextNode(preview.title[0]), document.createElement('br'), document.createTextNode(preview.title[1]));
    previewCaption.textContent = preview.caption;
    previewCategory.textContent = preview.category;
    previewLink.href = preview.link;
    previewLinkLabel.textContent = preview.label;
    modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    previewStatus.textContent = `${preview.title.join(' ')} ${preview.label}.`;
  }

  function setAnimation(paused) {
    desk.dataset.animation = paused ? 'paused' : 'running';
    animationButton.setAttribute('aria-pressed', String(paused));
    animationButton.setAttribute('aria-label', paused ? 'Play decorative bar animation' : 'Pause decorative bar animation');
    animationButton.firstElementChild.textContent = paused ? '▶' : 'Ⅱ';
  }

  modeButtons.forEach(button => button.addEventListener('click', () => choosePreview(button.dataset.mode)));
  animationButton.addEventListener('click', () => setAnimation(desk.dataset.animation !== 'paused'));
  reducedMotion.addEventListener('change', event => setAnimation(event.matches));
  setAnimation(reducedMotion.matches);

  const search = document.getElementById('tool-search');
  const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
  const cards = Array.from(document.querySelectorAll('.tool-card'));
  const count = document.getElementById('tool-count');
  const noTools = document.getElementById('no-tools');
  let activeFilter = 'all';

  function filterTools() {
    const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let visibleCount = 0;
    cards.forEach(card => {
      const text = card.textContent.toLocaleLowerCase();
      const matchesCategory = activeFilter === 'all' || card.dataset.category === activeFilter;
      const matchesSearch = words.every(word => text.includes(word));
      card.hidden = !(matchesCategory && matchesSearch);
      if (!card.hidden) visibleCount += 1;
    });
    noTools.hidden = visibleCount !== 0;
    count.textContent = visibleCount === cards.length && !words.length && activeFilter === 'all'
      ? `${visibleCount} tools on your creative desk`
      : `${visibleCount} ${visibleCount === 1 ? 'tool' : 'tools'} found${words.length ? ` for “${search.value.trim()}”` : ''}`;
    filterButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === activeFilter)));
  }

  filterButtons.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    filterTools();
  }));
  search.addEventListener('input', filterTools);
  search.addEventListener('search', filterTools);
  document.getElementById('clear-search').addEventListener('click', () => {
    search.value = '';
    activeFilter = 'all';
    filterTools();
    search.focus();
  });
})();
