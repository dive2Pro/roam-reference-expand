
export const queryBlockDomFromRefDom = (spanEl: HTMLElement) => {
  const selector = '[id^="block-input"]'
  const closed = spanEl.closest(selector) || spanEl.querySelector(selector);

  if (closed) {
    return closed.getAttribute("id").slice(-9);
  }
  return "";
};

export const queryBlockUidFromCaret = (caret: HTMLElement) => {
  const parent = caret.closest(".rm-block-main.rm-block__self");
  if (parent) {
    return queryBlockDomFromRefDom(parent as HTMLElement)
  }
  return ''
}