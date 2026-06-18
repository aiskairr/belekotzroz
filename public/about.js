const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealItems = document.querySelectorAll('.reveal');

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
