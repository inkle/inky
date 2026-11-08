const assert = require('assert');
const fs = require('fs');
const path = require('path');
describe('Ink full-story snippets', function () {
    it('ships Before Dawn as a project template, not an inserted text snippet', function () {
        const source = fs.readFileSync(path.join(__dirname, '../main-process/inkSnippets.js'), 'utf8');
        assert.match(source, /name: "Before Dawn",\s*projectTemplate: "before-dawn"/);
        assert(fs.existsSync(path.join(__dirname, '../resources/showcase/before-dawn/Before Dawn.ink')));
        // Original Ink examples are part of the inherited menu and must remain available.
        for (const original of ['murder_scene.ink', 'swindlestones.ink', 'pontoon_example.ink', 'theintercept.ink']) {
            const file = path.join(__dirname, '../main-process/ink/longer-ink-snippets', original);
            assert(fs.existsSync(file), `Original Ink example missing: ${original}`);
            assert(fs.statSync(file).size > 0);
        }
        // The separate custom story The Village is intentionally not bundled.
        assert(!fs.existsSync(path.join(__dirname, '../../examples/screen-mode-village')));
    });
});
