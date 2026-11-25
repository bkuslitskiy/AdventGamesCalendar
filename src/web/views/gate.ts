import { h, mount } from '../dom.ts';

export function renderGate(root: HTMLElement, choose: (role: 'babe' | 'guest') => void): void {
  mount(
    root,
    h(
      'section',
      { class: 'gate' },
      h('h1', null, 'Are you babe?'),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => choose('babe') }, 'Yes'),
        h('button', { class: 'btn ghost', onclick: () => choose('guest') }, 'No'),
      ),
      h(
        'p',
        { class: 'fine' },
        'Say no to play any open day from scratch. Your progress stays in this browser and never touches babe’s.',
      ),
    ),
  );
}
