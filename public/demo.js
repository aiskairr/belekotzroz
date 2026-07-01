const navButtons = [...document.querySelectorAll('[data-screen]')];
const panels = [...document.querySelectorAll('[data-screen-panel]')];

for (const button of navButtons) {
  button.addEventListener('click', () => {
    const screen = button.dataset.screen;
    navButtons.forEach((item) => item.classList.toggle('active', item === button));
    panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.screenPanel === screen));
  });
}
