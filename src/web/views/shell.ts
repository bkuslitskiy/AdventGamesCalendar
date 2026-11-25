import { h, mount, type Child } from '../dom.ts';
import { clearRole } from '../store.ts';
import type { App } from '../app.ts';

export function exitPreview(): void {
  sessionStorage.removeItem('advent.preview');
  location.hash = '#/admin';
  location.reload();
}

function who(app: App): Child {
  if (app.role === 'preview') return [h('button', { class: 'linkish', onclick: exitPreview }, 'Exit preview')];
  const label = app.role === 'babe' ? 'Playing as babe' : 'Playing as a guest';
  return [
    label,
    h('br'),
    h(
      'button',
      {
        class: 'linkish',
        onclick: () => {
          clearRole();
          location.hash = '#/';
          location.reload();
        },
      },
      app.role === 'babe' ? 'Not babe?' : 'Switch player',
    ),
  ];
}

function notice(app: App, rerender: () => void): Child {
  if (app.role === 'preview') {
    return h('div', { class: 'notice' }, 'Preview: every day is open and nothing is saved.');
  }
  if (app.role === 'guest') {
    return h(
      'div',
      { class: 'notice' },
      h('span', null, "Your progress stays in this browser and doesn't change babe's."),
      h(
        'button',
        {
          class: 'btn ghost small',
          onclick: async () => {
            if (!confirm('Wipe your progress in this browser? Babe’s progress is not affected.')) return;
            app.store.wipe();
            app.solves = await app.store.load();
            rerender();
          },
        },
        'Wipe my progress',
      ),
    );
  }
  const n = app.store.pending();
  return n ? h('div', { class: 'notice' }, `${n === 1 ? 'One solve is' : `${n} solves are`} waiting to sync. They'll send when you're back online.`) : null;
}

export function shell(app: App, rerender: () => void, ...content: Child[]): void {
  mount(
    app.root,
    h('header', { class: 'top' }, h('a', { class: 'wordmark', href: '#/' }, 'Advent'), h('div', { class: 'who' }, who(app))),
    notice(app, rerender),
    content,
  );
  window.scrollTo(0, 0);
}
