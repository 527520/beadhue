// Lucide 离线雪碧图：启动时内联到页面，之后用 <use href="#i-name"> 引用。
export async function loadIcons() {
  if (document.getElementById('icon-sprite')) return;
  const text = await (await fetch(new URL('../icons.svg', import.meta.url))).text();
  const holder = document.createElement('div');
  holder.id = 'icon-sprite';
  holder.innerHTML = text;
  document.body.prepend(holder);
}

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}
