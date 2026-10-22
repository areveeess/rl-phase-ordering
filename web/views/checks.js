/* Stub for the checks view. Plan 08-08 replaces this whole file. */
(function () {
  'use strict';
  App.register('checks', {
    title: 'Checks',
    render: function () {
      return App.h('div', null,
        App.h('h1', null, 'Checks'),
        App.h('div', { class: 'empty' }, 'This view is not built yet.'));
    }
  });
})();
