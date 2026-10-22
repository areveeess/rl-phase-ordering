/* Stub for the live run view. Plan 08-09 replaces this whole file. */
(function () {
  'use strict';
  App.register('live', {
    title: 'Live run',
    render: function () {
      return App.h('div', null,
        App.h('h1', null, 'Live run'),
        App.h('div', { class: 'empty' }, 'This view is not built yet.'));
    }
  });
})();
