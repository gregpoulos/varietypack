import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';

function fit(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

// A textarea that grows with its text, so long clues stay visible. It fits again when its
// width changes (a resized window or column rewraps the text); a change of height alone,
// including its own, is ignored, so fitting can't feed back into itself.
export function AutoTextarea({ value, onInput, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (ref.current) fit(ref.current);
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit(el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <textarea ref={ref} rows={1} value={value} onInput={onInput} {...rest} />;
}
