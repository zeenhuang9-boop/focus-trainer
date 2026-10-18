type Child = Node | string | null | undefined | false;
type AttrValue = string | number | boolean | EventListener | undefined;
type Attrs = Record<string, AttrValue>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === false) continue;
      if (typeof value === 'function') {
        if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      } else if (key === 'class') {
        el.className = String(value);
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) el.append(child);
  }
  return el;
}
