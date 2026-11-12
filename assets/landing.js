const photos = {
  runner: {
    src: './assets/landing-runner.webp',
    alt: { en: 'Runner in an orange jacket on a blue stadium track', kn: 'ನೀಲಿ ಓಟದ ಪಥದಲ್ಲಿ ಕಿತ್ತಳೆ ಬಣ್ಣದ ಜಾಕೆಟ್ ಧರಿಸಿದ ಓಟಗಾರ್ತಿ' },
  },
  market: {
    src: './assets/landing-market.webp',
    alt: { en: 'Red umbrella in a Bengaluru market after the rain', kn: 'ಮಳೆಯ ನಂತರ ಬೆಂಗಳೂರಿನ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಕೆಂಪು ಕೊಡೆ' },
  },
};

const formats = {
  poster: {
    name: 'Single Poster',
    frames: [
      { photo: 'runner', en: ['Bengaluru / Sport', 'City in motion.', 'The streets are yours.'], kn: ['ಬೆಂಗಳೂರು / ಕ್ರೀಡೆ', 'ಚಲನೆಯಲ್ಲಿ ನಗರ', 'ಬೀದಿಗಳು ನಿಮ್ಮವು.'] },
    ],
  },
  carousel: {
    name: 'Carousel',
    frames: [
      { photo: 'market', en: ['Bengaluru / City life', 'After the rain.', 'Three frames from a wet morning.'], kn: ['ಬೆಂಗಳೂರು / ನಗರ ಜೀವನ', 'ಮಳೆಯ ನಂತರ', 'ಮಳೆಯ ಬೆಳಗಿನ ಮೂರು ನೋಟಗಳು.'] },
      { photo: 'market', en: ['Bengaluru / City life', 'Under one roof.', 'At the market, work carries on.'], kn: ['ಬೆಂಗಳೂರು / ನಗರ ಜೀವನ', 'ಒಂದೇ ಸೂರಿನಡಿ', 'ಮಾರುಕಟ್ಟೆಯ ಕೆಲಸ ಸಾಗುತ್ತಲೇ ಇದೆ.'] },
      { photo: 'market', en: ['Bengaluru / City life', 'Back in motion.', 'The streets fill again.'], kn: ['ಬೆಂಗಳೂರು / ನಗರ ಜೀವನ', 'ಮತ್ತೆ ಚಲನೆ', 'ಬೀದಿಗಳು ಮತ್ತೆ ತುಂಬುತ್ತವೆ.'] },
    ],
  },
  news: {
    name: 'News Desk',
    frames: [
      { photo: 'market', en: ['City desk / Sample brief', 'A city after rain.', 'A morning at the market.'], kn: ['ನಗರ ಸುದ್ದಿ / ಮಾದರಿ', 'ಮಳೆಯ ನಂತರ', 'ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಒಂದು ಬೆಳಗ್ಗೆ.'] },
    ],
  },
};

const stage = document.querySelector('.preview-stage');
const artwork = stage.querySelector('.preview-art');
const photo = document.getElementById('art-photo');
const category = document.getElementById('art-category');
const title = document.getElementById('art-title');
const description = document.getElementById('art-description');
const series = document.getElementById('art-series');
const frameControls = stage.querySelector('.frame-controls');
const frameCount = document.getElementById('frame-count');
const status = document.getElementById('preview-status');
const workspaceLink = document.getElementById('workspace-link');
const languageControl = document.getElementById('preview-language');
const formatButtons = [...document.querySelectorAll('[data-format][aria-pressed]')];
const layoutButtons = [...document.querySelectorAll('[data-layout][aria-pressed]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let format = 'poster';
let layout = '0';
let frameIndex = 0;
let animation;

function renderPreview({ animate = true, announce = true } = {}) {
  const language = languageControl.value;
  const { name, frames } = formats[format];
  const frame = frames[frameIndex];
  const [section, headline, summary] = frame[language];
  const image = photos[frame.photo];
  const pageCount = frames.length;

  stage.dataset.format = format;
  stage.dataset.layout = layout;
  stage.dataset.frame = String(frameIndex);
  artwork.lang = language;
  title.lang = language;
  title.textContent = headline;
  category.textContent = section;
  description.textContent = summary;
  if (photo.getAttribute('src') !== image.src) photo.src = image.src;
  photo.alt = image.alt[language];
  frameControls.hidden = pageCount < 2;
  frameCount.textContent = `${frameIndex + 1} / ${pageCount}`;
  series.textContent = pageCount > 1 ? frameCount.textContent : 'AvI Studio';
  workspaceLink.href = `./studio.html?view=${format}`;
  workspaceLink.firstChild.data = `Open ${name} `;

  for (const button of formatButtons) button.setAttribute('aria-pressed', String(button.dataset.format === format));
  for (const button of layoutButtons) button.setAttribute('aria-pressed', String(button.dataset.layout === layout));

  animation?.cancel();
  if (animate && !reducedMotion.matches) {
    animation = artwork.animate(
      [{ opacity: .76, transform: 'translateY(8px) scale(.982)' }, { opacity: 1, transform: 'none' }],
      { duration: 290, easing: 'cubic-bezier(.18,.72,.3,1)' },
    );
  }
  if (announce) {
    status.lang = language;
    status.textContent = pageCount > 1 ? `${frameCount.textContent} · ${headline}` : headline;
  }
}

function selectFormat(nextFormat) {
  if (format === nextFormat) return;
  format = nextFormat;
  layout = '0';
  frameIndex = 0;
  renderPreview();
}

function moveFrame(step) {
  const count = formats[format].frames.length;
  frameIndex = (frameIndex + step + count) % count;
  renderPreview();
}

for (const button of formatButtons) {
  button.addEventListener('click', () => selectFormat(button.dataset.format));
}
for (const button of layoutButtons) {
  button.addEventListener('click', () => {
    layout = button.dataset.layout;
    renderPreview({ announce: false });
  });
}
for (const link of document.querySelectorAll('[data-preview-format]')) {
  link.addEventListener('click', () => selectFormat(link.dataset.previewFormat));
}

document.getElementById('previous-frame').addEventListener('click', () => moveFrame(-1));
document.getElementById('next-frame').addEventListener('click', () => moveFrame(1));
languageControl.addEventListener('change', () => renderPreview());
reducedMotion.addEventListener('change', () => animation?.cancel());
renderPreview({ animate: false, announce: false });
