const i18n = require('./i18n.js');

window.addEventListener('DOMContentLoaded', () => {
    // auto-translate everything tagged with the i18n class
    const mustBeTranslated = ['innerText', 'title', 'placeholder'];
    document.querySelectorAll('.i18n').forEach(elem => {
        mustBeTranslated.forEach(key => {
            if (elem[key]) {
                elem[key] = i18n._(elem[key]);
            }
        });
    });
});
