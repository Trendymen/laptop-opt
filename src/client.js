document.documentElement.classList.add('js-ready');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const captureMode = document.documentElement.dataset.capture === 'true';
const revealItems = [...document.querySelectorAll('[data-reveal]')];

if (captureMode || reducedMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((item) => item.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  revealItems.forEach((item) => observer.observe(item));
}

const dialog = document.querySelector('#image-dialog');
const dialogImage = dialog.querySelector('img');
const closeButton = dialog.querySelector('button');

document.querySelectorAll('img[data-zoom]').forEach((image) => {
  image.tabIndex = 0;
  image.setAttribute('role', 'button');
  image.setAttribute('aria-label', `${image.alt}，打开完整大图`);

  const open = () => {
    dialogImage.src = image.currentSrc || image.src;
    dialogImage.alt = image.alt;
    dialog.showModal();
  };

  image.addEventListener('click', open);
  image.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
});

closeButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && dialog.open) dialog.close();
});
