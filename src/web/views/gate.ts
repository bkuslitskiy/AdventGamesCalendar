import { h, mount } from '../dom.ts';

/**
 * "Are you babe?" Babe mode needs the babe key, which arrives once through the link `/#/babe/<key>`.
 * `hasKey` says whether this device already has it; without it, Yes explains the link instead.
 */
export function renderGate(root: HTMLElement, hasKey: boolean, choose: (role: 'babe' | 'guest') => void): void {
  const ask = () =>
    mount(
      root,
      h(
        'section',
        { class: 'gate' },
        h('h1', null, 'Are you babe?'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', onclick: () => (hasKey ? choose('babe') : needLink()) }, 'Yes'),
          h('button', { class: 'btn ghost', onclick: () => choose('guest') }, 'No'),
        ),
        h(
          'p',
          { class: 'fine' },
          'Say no to play any open day from scratch. Your progress stays in this browser and never touches babe’s.',
        ),
      ),
    );
  const needLink = () =>
    mount(
      root,
      h(
        'section',
        { class: 'gate' },
        h('h1', null, 'Open your link'),
        h('p', null, 'To play as babe, open the link you were sent, on this device. You only need it once.'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: ask }, 'Back'),
          h('button', { class: 'btn ghost', onclick: () => choose('guest') }, 'Play as a guest'),
        ),
      ),
    );
  ask();
}

/** The babe link was turned down by the server. */
export function renderBadLink(root: HTMLElement, back: () => void): void {
  mount(
    root,
    h(
      'section',
      { class: 'gate' },
      h('h1', null, 'That link didn’t work'),
      h('p', { class: 'err' }, 'It may be out of date. Ask for a new one.'),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: back }, 'Back')),
    ),
  );
}
