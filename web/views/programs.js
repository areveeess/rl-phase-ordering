/* Stub for the programs view. Plan 08-07 replaces this whole file. */
(function () {
  'use strict';
  App.register('programs', {
    title: 'Programs',
    render: function () {
      return App.h('div', null,
        App.h('h1', null, 'Programs'),
        App.h('div', { class: 'empty' }, 'This view is not built yet.'));
    }
  });
})();
