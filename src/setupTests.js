import '@testing-library/jest-dom/vitest';

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

if (!window.scrollIntoView) {
  window.scrollIntoView = () => {};
}
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
