export function setHtml(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.innerHTML = value;
}

export function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

export function setControlLabel(selectElement, value) {
  const label = selectElement && selectElement.closest("label");
  if (label && label.firstChild) {
    label.firstChild.textContent = `${value}\n              `;
  }
}

export function setCheckboxLabel(inputElement, value) {
  const label = inputElement && inputElement.closest("label");
  const text = label && label.querySelector("span");
  if (text) text.textContent = value;
}
