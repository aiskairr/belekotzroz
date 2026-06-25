const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealItems = document.querySelectorAll('.reveal');
const siteHeader = document.querySelector('.site-header');
const sectionLinks = [...document.querySelectorAll('.site-header nav a[href^="#"]')];
const trackedSections = sectionLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

const updateHeader = () => siteHeader?.classList.toggle('scrolled', window.scrollY > 32);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const setActiveSection = (id) => {
  sectionLinks.forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
  });
};

if (reducedMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((item) => item.classList.add('visible'));
  runCounters();
} else {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('visible');
      if (entry.target.classList.contains('metric-strip')) runCounters();
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.14 });
  revealItems.forEach((item) => observer.observe(item));
}

if ('IntersectionObserver' in window && trackedSections.length) {
  const navObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (visible?.target?.id) setActiveSection(visible.target.id);
  }, { rootMargin: '-35% 0px -50% 0px', threshold: [0.1, 0.35, 0.6] });

  trackedSections.forEach((section) => navObserver.observe(section));
}

let countersStarted = false;
function runCounters() {
  if (countersStarted) return;
  countersStarted = true;
  document.querySelectorAll('[data-counter]').forEach((counter) => {
    const target = Number(counter.dataset.counter || 0);
    const duration = 700;
    const startedAt = performance.now();
    const animate = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      counter.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  });
}
