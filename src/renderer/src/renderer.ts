function init(): void {
  window.addEventListener('DOMContentLoaded', () => {
    addButtonAnimation()
  })
}

function addButtonAnimation(): void {
  const buttons = document.querySelectorAll("button");
  for (let i = 0; i < buttons.length; i++) {
    let button = buttons[i];

    if (!button.classList.contains('button-disabled'))
      continue;

    button.addEventListener('click', (e) => {
      const disabledText = document.createElement('div');
      disabledText.className = 'unhappy-text';
      disabledText.textContent = ':(';
      document.body.appendChild(disabledText);

      const x = e.clientX;
      const y = e.clientY;
      disabledText.style.left = `${x}px`;
      disabledText.style.top = `${y}px`;

      setTimeout(() => {
        disabledText.classList.add('show');
      }, 10);

      setTimeout(() => {
        disabledText.remove();
      }, 1500);

      setTimeout(() => {
        disabledText.classList.add('out');
      }, 1000);

    })
  }
}

init()
