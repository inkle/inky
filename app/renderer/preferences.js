const settings = require('electron-settings');

const tagsVisibleKey = 'story.tagsVisible';
const smartQuotesAndDashesKey = 'editor.smartQuotesAndDashes';
const checkSpellingKey = 'editor.spelling.check';

Object.defineProperty(exports, 'tagsVisible', {
    get: function () { return settings.get(tagsVisibleKey, true); },
    set: function (value) { settings.set(tagsVisibleKey, value); }
});

Object.defineProperty(exports, 'smartQuotesAndDashes', {
    get: function () { return settings.get(smartQuotesAndDashesKey, true); },
    set: function (value) { settings.set(smartQuotesAndDashesKey, value); }
});

Object.defineProperty(exports, 'checkSpelling', {
    get: function () { return settings.get(checkSpellingKey, true); },
    set: function (value) { settings.set(checkSpellingKey, value); }
});
