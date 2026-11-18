(() => {
  'use strict';
  const canvas = document.getElementById('premium-map');
  const context = canvas.getContext('2d');
  const layer = document.createElement('canvas');
  layer.width = canvas.width; layer.height = canvas.height;
  const base = layer.getContext('2d');
  const motionButton = document.getElementById('page-motion');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = preference.matches, visible = true, frame = 0, last = 0, time = 0, geography;
  function project(point) {
    const bounds = geography.bounds, aspect = Math.cos((bounds[1] + bounds[3]) / 2 * Math.PI / 180);
    const scale = Math.min(435 / ((bounds[2] - bounds[0]) * aspect), 470 / (bounds[3] - bounds[1]));
    return [455 + (point[0] - (bounds[0] + bounds[2]) / 2) * aspect * scale, 300 - (point[1] - (bounds[1] + bounds[3]) / 2) * scale];
  }
  function geometryPath(geometry, target) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    target.beginPath();
    polygons.forEach(polygon => polygon.forEach(ring => {
      ring.forEach((point, index) => { const p = project(point); index ? target.lineTo(...p) : target.moveTo(...p); });
      target.closePath();
    }));
  }
  function buildLayer() {
    const background = base.createRadialGradient(450, 290, 15, 440, 320, 560);
    background.addColorStop(0, '#0b3267'); background.addColorStop(.5, '#071e45'); background.addColorStop(1, '#030e24');
    base.fillStyle = background; base.fillRect(0, 0, 840, 630);
    base.save(); base.translate(430, 320); base.rotate(-.25);
    for (let i = 0; i < 7; i++) {
      base.strokeStyle = `rgba(54,120,233,${.15 - i * .013})`; base.lineWidth = 1.5;
      base.beginPath(); base.ellipse(0, 0, 130 + i * 52, 85 + i * 35, 0, 0, Math.PI * 2); base.stroke();
    }
    base.restore();
    base.fillStyle = '#6e9cdd36';
    for (let x = 24; x < 840; x += 32) for (let y = 20; y < 630; y += 32) {base.beginPath(); base.arc(x, y, .75, 0, Math.PI * 2); base.fill();}
    if (geography) {
      base.save(); base.shadowColor = '#28a4ff'; base.shadowBlur = 22;
      geometryPath(geography.outline, base); base.fillStyle = '#2389ff'; base.fill();
      base.shadowBlur = 0;
      base.save(); geometryPath(geography.outline, base); base.clip();
      const fill = base.createLinearGradient(200, 100, 650, 550); fill.addColorStop(0, '#5bc6ff'); fill.addColorStop(.45, '#187df1'); fill.addColorStop(1, '#1445bd');
      geography.states.forEach((state, index) => {
        geometryPath(state.geometry, base); base.fillStyle = index % 7 === 0 ? '#278ff9' : fill; base.fill(); base.lineWidth = .85; base.strokeStyle = '#a8dcff90'; base.stroke();
      });
      base.restore(); geometryPath(geography.outline, base); base.lineWidth = 2.4; base.strokeStyle = '#b5e8ff'; base.stroke();
      base.restore();
    }
    canvas.dataset.ready = geography ? 'true' : 'loading';
  }
  function render() {
    context.clearRect(0, 0, 840, 630); context.drawImage(layer, 0, 0);
    const orbitX = 440 + Math.cos(time * .3) * 305, orbitY = 330 + Math.sin(time * .3) * 190;
    context.save(); context.shadowBlur = 17; context.shadowColor = '#33bfff'; context.fillStyle = '#91dbff';
    context.beginPath(); context.arc(orbitX, orbitY, 4, 0, Math.PI * 2); context.fill(); context.restore();
    if (!geography) return;
    const start = project([77.209, 28.6139]), end = project([77.5946, 12.9716]), bend = [start[0] - 145, (start[1] + end[1]) / 2];
    context.save(); context.strokeStyle = '#d9b7ff'; context.lineWidth = 2.2; context.shadowColor = '#a45aff'; context.shadowBlur = 10;
    context.beginPath(); context.moveTo(...start); context.quadraticCurveTo(...bend, ...end); context.stroke();
    const progress = (time * .16) % 1, position = [(1 - progress) ** 2 * start[0] + 2 * (1 - progress) * progress * bend[0] + progress ** 2 * end[0], (1 - progress) ** 2 * start[1] + 2 * (1 - progress) * progress * bend[1] + progress ** 2 * end[1]];
    [start, end, position].forEach((point, index) => {
      context.fillStyle = index === 2 ? '#fff' : '#d4a3ff'; context.beginPath(); context.arc(...point, index === 2 ? 4 : 5, 0, Math.PI * 2); context.fill();
      if (index < 2) for (let ring = 0; ring < 3; ring++) {context.beginPath(); context.arc(...point, 10 + ring * 13 + (time * 6) % 13, 0, Math.PI * 2);context.strokeStyle = `rgba(186,114,255,${.35 - ring * .08})`;context.lineWidth = 1.2;context.stroke();}
    });
    context.shadowBlur = 0; context.font = '600 11px sans-serif'; context.fillStyle = '#dceaff'; context.fillText('DELHI', start[0] + 13, start[1] - 8); context.fillText('BENGALURU', end[0] + 12, end[1] + 20); context.restore();
  }
  function tick(now) {
    if (now - last > 32) {time += Math.min((now - last) / 1000, .1); last = now; render();}
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); last = performance.now();
    document.documentElement.dataset.motion = paused || document.hidden ? 'paused' : 'running';
    motionButton.setAttribute('aria-pressed', String(paused)); motionButton.setAttribute('aria-label', paused ? 'Play page motion' : 'Pause page motion');
    motionButton.firstElementChild.textContent = paused ? '▶' : 'Ⅱ'; motionButton.lastElementChild.textContent = paused ? 'Motion off' : 'Motion on';
    if (!paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
    render();
  }
  motionButton.addEventListener('click', () => {paused = !paused; sync();});
  preference.addEventListener('change', event => {paused = event.matches; sync();});
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(entries => {visible = entries[0].isIntersecting; sync();}).observe(canvas);
  buildLayer(); sync();
  fetch('./assets/india-map.json.gz').then(response => {if (!response.ok) throw new Error('Map unavailable'); return response.arrayBuffer();}).then(buffer => {
    const bytes = new Uint8Array(buffer);
    return bytes[0] === 31 && bytes[1] === 139 ? new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).json() : JSON.parse(new TextDecoder().decode(buffer));
  }).then(data => {geography = data; buildLayer(); render();}).catch(() => {canvas.dataset.ready = 'fallback'; canvas.setAttribute('aria-label', 'Animated orbital design preview. India map is temporarily unavailable.');});
  const search = document.getElementById('tool-search'), cards = [...document.querySelectorAll('.tool-card')], filters = [...document.querySelectorAll('[data-filter]')];
  let category = 'all';
  function filterTools() {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean); let count = 0;
    cards.forEach(card => {card.hidden = !((category === 'all' || card.dataset.category === category) && terms.every(term => card.textContent.toLocaleLowerCase().includes(term))); if (!card.hidden) count++;});
    document.getElementById('tool-count').textContent = `${count} ${count === 1 ? 'tool' : 'tools'}${search.value.trim() ? ` for “${search.value.trim()}”` : ' to explore'}`;
    document.getElementById('no-tools').hidden = count > 0; filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === category)));
  }
  filters.forEach(button => button.addEventListener('click', () => {category = button.dataset.filter; filterTools();}));
  search.addEventListener('input', filterTools); search.addEventListener('search', filterTools);
  document.getElementById('clear-search').addEventListener('click', () => {search.value = ''; category = 'all'; filterTools(); search.focus();});
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {if (entry.isIntersecting) {entry.target.classList.add('is-visible'); observer.unobserve(entry.target);}}), {threshold:.08});
  document.querySelectorAll('.overview-heading,.overview-card,.new-studios .section-heading,.studio-card,.tool-section .section-heading,.tool-card,.workflow-grid article,.closing-inner').forEach((element, index) => {element.classList.add('premium-reveal'); element.style.setProperty('--reveal-delay', `${index % 4 * 60}ms`); observer.observe(element);});
  document.documentElement.classList.add('premium-ready');
})();
