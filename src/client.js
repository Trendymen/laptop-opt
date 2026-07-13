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
  }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
  revealItems.forEach((item) => observer.observe(item));
}
