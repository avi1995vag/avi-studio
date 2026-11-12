const photos = {
  dancer: {
    src: './assets/landing-dancer.webp',
    alt: { en: 'Dancer in motion with a red scarf on a rooftop at dusk', kn: 'ಮುಸ್ಸಂಜೆಯಲ್ಲಿ ಛಾವಣಿಯ ಮೇಲೆ ಕೆಂಪು ದುಪಟ್ಟಾದೊಂದಿಗೆ ನರ್ತಕಿ' },
  },
  runner: {
    src: './assets/landing-runner.webp',
    alt: { en: 'Runner in an orange jacket on a blue stadium track', kn: 'ನೀಲಿ ಓಟದ ಪಥದಲ್ಲಿ ಕಿತ್ತಳೆ ಬಣ್ಣದ ಜಾಕೆಟ್ ಧರಿಸಿದ ಓಟಗಾರ್ತಿ' },
  },
  market: {
    src: './assets/landing-market.webp',
    alt: { en: 'Red umbrella in a Bengaluru market after rain', kn: 'ಮಳೆಯ ನಂತರ ಬೆಂಗಳೂರಿನ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಕೆಂಪು ಕೊಡೆ' },
  },
};

const formats = {
  poster: {
    name: 'Poster Studio',
    photo: 'dancer',
    frames: [
      { en: ['Bengaluru / Arts', 'Afterglow.', 'A city in motion after dark.'], kn: ['ಬೆಂಗಳೂರು / ಕಲೆ', 'ಮುಸ್ಸಂಜೆ', 'ಸಂಜೆಯ ನಂತರ ನಗರದ ಚಲನೆ.'] },
    ],
  },
  carousel: {
    name: 'Carousel Studio',
    photo: 'runner',
    frames: [
      { en: ['Bengaluru / Sport', 'Find your stride.', 'Start where you are.'], kn: ['ಬೆಂಗಳೂರು / ಕ್ರೀಡೆ', 'ಓಟದ ಲಯ', 'ಇರುವಲ್ಲಿಂದಲೇ ಆರಂಭಿಸಿ.'] },
      { en: ['Bengaluru / Sport', 'Keep moving.', 'Small steps become habits.'], kn: ['ಬೆಂಗಳೂರು / ಕ್ರೀಡೆ', 'ಮುಂದೆ ಸಾಗಿರಿ', 'ಚಿಕ್ಕ ಹೆಜ್ಜೆಗಳು ಅಭ್ಯಾಸವಾಗುತ್ತವೆ.'] },
      { en: ['Bengaluru / Sport', 'The city is yours.', 'Take the long way home.'], kn: ['ಬೆಂಗಳೂರು / ಕ್ರೀಡೆ', 'ನಗರ ನಿಮ್ಮದು', 'ಮನೆಗೆ ದೂರದ ದಾರಿಯಲ್ಲಿ ಹೋಗಿ.'] },
    ],
  },
  news: {
    name: 'News Desk',
    photo: 'market',
    frames: [
      { en: ['City desk / Sample brief', 'After the rain.', 'A morning at the market.'], kn: ['ನಗರ ಸುದ್ದಿ / ಮಾದರಿ', 'ಮಳೆಯ ನಂತರ', 'ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಒಂದು ಬೆಳಗ್ಗೆ.'] },
    ],
  },
};

const shell = document.querySelector('.hero-shell');
const stage = document.querySelector('.exhibit-stage');
const artwork = stage.querySelector('.preview-art');
const photo = document.getElementById('art-photo');
const sourcePhoto = document.getElementById('source-photo');
const category = document.getElementById('art-category');
const title = document.getElementById('art-title');
const description = document.getElementById('art-description');
const series = document.getElementById('art-series');
const frameControls = stage.querySelector('.frame-controls');
const frameCount = document.getElementById('frame-count');
const status = document.getElementById('preview-status');
const workspaceLink = document.getElementById('workspace-link');
const workspaceLabel = document.getElementById('workspace-label');
const layoutControl = document.getElementById('preview-layout');
const languageControl = document.getElementById('preview-language');
const compare = document.getElementById('compare');
const formatButtons = [...document.querySelectorAll('button[data-format]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let format = 'poster';
let frameIndex = 0;
let animation;

function renderPreview({ animate = true, announce = true } = {}) {
  const language = languageControl.value;
  const sample = formats[format];
  const [section, headline, summary] = sample.frames[frameIndex][language];
  const image = photos[sample.photo];
  const frameTotal = sample.frames.length;

  shell.dataset.format = format;
  stage.dataset.frame = String(frameIndex);
  stage.dataset.layout = layoutControl.value;
  artwork.lang = language;
  title.textContent = headline;
  category.textContent = section;
  description.textContent = summary;
  if (photo.getAttribute('src') !== image.src) {
    photo.src = image.src;
    sourcePhoto.src = image.src;
  }
  photo.alt = image.alt[language];
  frameControls.hidden = frameTotal < 2;
  frameCount.textContent = `${frameIndex + 1} / ${frameTotal}`;
  series.textContent = frameTotal > 1 ? frameCount.textContent : 'AvI Studio';
  workspaceLink.href = `./studio.html?view=${format}`;
  workspaceLabel.textContent = `Open ${sample.name}`;

  for (const button of formatButtons) button.setAttribute('aria-pressed', String(button.dataset.format === format));

  animation?.cancel();
  if (animate && !reducedMotion.matches) {
    animation = artwork.animate(
      [{ opacity: .72, transform: 'translateY(7px) scale(.985)' }, { opacity: 1, transform: 'none' }],
      { duration: 280, easing: 'cubic-bezier(.19,.72,.3,1)' },
    );
  }
  if (announce) {
    status.lang = language;
    status.textContent = frameTotal > 1 ? `${frameCount.textContent} · ${headline}` : headline;
  }
}

function updateComparison() {
  const designShare = compare.valueAsNumber;
  stage.style.setProperty('--design-share', `${designShare}%`);
  stage.toggleAttribute('data-endpoint', designShare === 0 || designShare === 100);
  compare.setAttribute('aria-valuetext', `${designShare}% design, ${100 - designShare}% original`);
}

function moveFrame(step) {
  const count = formats[format].frames.length;
  frameIndex = (frameIndex + step + count) % count;
  renderPreview();
}

for (const button of formatButtons) {
  button.addEventListener('click', () => {
    if (format === button.dataset.format) return;
    format = button.dataset.format;
    frameIndex = 0;
    renderPreview();
  });
}
document.getElementById('previous-frame').addEventListener('click', () => moveFrame(-1));
document.getElementById('next-frame').addEventListener('click', () => moveFrame(1));
layoutControl.addEventListener('change', () => renderPreview({ announce: false }));
languageControl.addEventListener('change', () => renderPreview());
compare.addEventListener('input', updateComparison);

function compareAtPointer(event) {
  const { left, width } = artwork.getBoundingClientRect();
  const position = (event.clientX - left) / width;
  compare.value = String(Math.max(0, Math.min(100, Math.round(position * 100))));
  updateComparison();
}

artwork.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  artwork.setPointerCapture(event.pointerId);
  compareAtPointer(event);
});
artwork.addEventListener('pointermove', event => {
  if (artwork.hasPointerCapture(event.pointerId)) compareAtPointer(event);
});
reducedMotion.addEventListener('change', () => animation?.cancel());

updateComparison();
renderPreview({ animate: false, announce: false });
