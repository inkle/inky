const assert = require('node:assert/strict');
const { describe, it } = global.describe ? { describe: global.describe, it: global.it } : require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createShowcaseProject, TITLE, ENTRY, TEMPLATE } = require('../main-process/showcaseProject');
const ink = require('inkjs');
const source = fs.readFileSync(path.join(TEMPLATE, ENTRY), 'utf8');
const compiled = new ink.Compiler(source).Compile().ToJson();
function temporary(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inky-showcase-'));
    try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function snippets() {
    const context = { exports: {}, __dirname: path.join(__dirname, '../main-process'), require: name => name.includes('i18n') ? { _: s => s } : require(name) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../main-process/inkSnippets.js'), 'utf8'), context);
    return context.exports.snippets;
}
describe('Before Dawn showcase', () => {
    it('creates named, independent writable projects with all resource folders', () => temporary(dir => {
        const first = createShowcaseProject(dir);
        assert.equal(first, path.join(dir, TITLE, ENTRY));
        for (const folder of ['audio/music', 'audio/sfx', 'image/background', 'image/scene']) assert(fs.statSync(path.join(path.dirname(first), folder)).isDirectory());
        fs.writeFileSync(first, '// user edits');
        const second = createShowcaseProject(dir);
        assert.notEqual(second, first);
        assert.equal(fs.readFileSync(first, 'utf8'), '// user edits');
        assert.equal(fs.readFileSync(second, 'utf8'), source);
        assert.equal(fs.readFileSync(path.join(TEMPLATE, ENTRY), 'utf8'), source);
    }));
    it('does not damage existing projects if the template is missing', () => temporary(dir => {
        assert.throws(() => createShowcaseProject(dir, path.join(dir, 'missing')), /missing/);
        assert.equal(fs.readdirSync(dir).length, 0);
    }));
    it('cleans up a failed new copy without touching earlier projects', () => temporary(dir => {
        const fake = path.join(dir, 'template');fs.mkdirSync(fake);
        fs.writeFileSync(path.join(fake, ENTRY), source);
        fs.symlinkSync(path.join(fake, ENTRY), path.join(fake, 'unexpected-link'));
        const target = path.join(dir, 'projects');
        assert.throws(() => createShowcaseProject(target, fake), /Unexpected entry/);
        assert.deepEqual(fs.readdirSync(target), []);
    }));
    it('keeps the four original Ink stories, a separator, and the Before Dawn showcase', () => {
        let menu, opened = 0, inserted = 0, originalId;
        const ctx = { exports: {}, process, require: name => {
            if (name === 'electron') return { app: { getName: () => 'Inky' }, Menu: { buildFromTemplate: t => t, setApplicationMenu: t => menu = t } };
            if (name === 'lodash') return { find: (xs, fn) => xs.find(fn) };
            if (name.includes('i18n')) return { _: s => s };
            if (name.includes('inkSnippets')) return { snippets: snippets() };
            if (name.includes('projectWindow')) return { ProjectWindow: {} };
            throw new Error(name);
        }};
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../main-process/appmenus.js'), 'utf8'), ctx);
        ctx.exports.AppMenus.setCallbacks({ openShowcaseProject: () => opened++, openOriginalStoryProject: (_window, id) => { originalId = id; }, insertSnippet: () => inserted++ });
        ctx.exports.AppMenus.refresh();
        const full = menu.find(x => x.id === 'ink').submenu.find(x => x.label === 'Full stories').submenu;
        assert.equal(full.length, 6);
        assert.deepEqual(Array.from(full.slice(0, 4), item => item.label), [
            'Crime Scene (from Writing with Ink)',
            'Swindlestones (from Sorcery!)',
            'Pontoon Game (from Overboard!)',
            'The Intercept'
        ]);
        assert.equal(full[4].type, 'separator');
        assert.equal(full[5].label, TITLE);
        full[5].click(null, {});
        assert.equal(opened, 1);
        assert.equal(inserted, 0);
        full[0].click(null, {});
        assert.equal(originalId, "crime-scene");
        assert.equal(inserted, 0);
        assert.equal(opened, 1);
    });
    it('opens the copied entry in a new ProjectWindow from the menu callback', () => temporary(dir => {
        const main = fs.readFileSync(path.join(__dirname, '../main-process/main.js'), 'utf8');
        const callback = main.match(/openShowcaseProject: ([\s\S]*?),\n        openOriginalStoryProject:/)[1];
        let opened;
        const action = vm.runInNewContext('(' + callback + ')', {
            require: () => ({ createShowcaseProject }), path,
            app: { getPath: name => { assert.equal(name, 'documents');return dir; } },
            ProjectWindow: { open: entry => opened = entry },
            dialog: { showMessageBox: () => assert.fail('Unexpected creation error') }
        });
        action(null);
        assert.equal(opened, path.join(dir, 'Inky Projects', TITLE, ENTRY));
        assert(fs.existsSync(opened));
    }));
    it('resolves every referenced image and audio file without external resources', () => {
        const { resolveImageReference } = require('../renderer/imageTags');
        const { resolveAudioReference } = require('../renderer/audioTags');
        for (const match of source.matchAll(/^#(bg|image|music|sound): (.+)$/gm)) {
            const [, kind, ref] = match;
            if (ref === 'stop') continue;
            const result = /bg|image/.test(kind) ? resolveImageReference(TEMPLATE, ref, kind) : resolveAudioReference(TEMPLATE, ref, kind);
            assert.equal(result.kind, 'ok', ref);
        }
    });
    it('uses scenic images only, and a transparent texture shared by dark and light themes', () => {
        const yaml = fs.readFileSync(path.join(TEMPLATE, 'game.yaml'), 'utf8');
        assert.match(yaml, /theme_mode: dual/);
        assert.match(yaml, /background: "#f6efdf"/);
        assert.match(yaml, /background: "#111c2b"/);
        assert(!source.includes('image/character/'), 'Portraits should not take over the top of a passage');
        assert(!/background\/(?:village|forge|bridge|ridge|dawn|shared|caravan)\.jpg/.test(source), 'No full-frame blurred photograph behind reading text');
        assert.equal([...source.matchAll(/^#bg: image\/background\/reading-texture\.png$/gm)].length, 7);
        const texture = fs.readFileSync(path.join(TEMPLATE, 'image/background/reading-texture.png'));
        assert.equal(texture.toString('ascii', 1, 4), 'PNG');
        assert(source.includes('#image: image/scene/forge-street.jpg'));
        assert(source.includes('#image: image/scene/bridge-bell.jpg'));
    });
    it('uses the approved Mara-and-her-sister narrative', () => {
        assert(source.includes('My sister is out there'));
        assert(source.includes("Mara's sister returns"));
        assert(source.includes('You do not ask the star to choose.'));
        assert(source.includes('#title: The Borrowed Star'));
    });
    it('reaches all three endings, including the earned shared-light ending', () => {
        const paths = [
            [['Climb the hill', 'Bring the star'], 'A Warm Dawn'],
            [['Look for the caravan', 'Climb toward the star', 'Send the star'], 'The Way Home'],
            [['Visit Mara', 'Take the lantern and go to the bridge',
              'Climb toward the star', 'Try to share'], 'The Borrowed Star']
        ];
        for (const [choices, expectedTitle] of paths) {
            const story = new ink.Story(compiled);
            story.onError = error => assert.fail(error);
            let title = '', steps = 0;
            while (true) {
                while (story.canContinue) {
                    story.Continue();
                    const tag = story.currentTags.find(tag => tag.startsWith('title: '));
                    if (tag) title = tag.slice('title: '.length);
                }
                if (!story.currentChoices.length) break;
                assert(steps < choices.length, 'Unexpected choice after final step');
                const expected = choices[steps++].toLowerCase();
                const ix = story.currentChoices.findIndex(choice => choice.text.toLowerCase().includes(expected));
                assert(ix !== -1, `Missing story choice: ${expected}`);
                story.ChooseChoiceIndex(ix);
            }
            assert.equal(steps, choices.length);
            assert.equal(title, expectedTitle);
        }
    });
    it('hides the shared ending until both clues have been collected', () => {
        const story = new ink.Story(compiled);
        const settle = () => { while (story.canContinue) story.Continue(); };
        settle();
        assert(story.currentChoices.some(choice => choice.text.includes('Climb the hill')));
        story.ChooseChoiceIndex(story.currentChoices.findIndex(choice => choice.text.includes('Climb the hill')));
        settle();
        assert(!story.currentChoices.some(choice => choice.text.includes('share the light')));
        const story2 = new ink.Story(compiled);
        const settle2 = () => { while (story2.canContinue) story2.Continue(); };
        const choose = fragment => {
            const index = story2.currentChoices.findIndex(choice => choice.text.includes(fragment));
            assert(index >= 0, `Missing route: ${fragment}`);
            story2.ChooseChoiceIndex(index);
            settle2();
        };
        settle2();
        choose('Visit Mara');
        choose('Take the lantern and climb the hill');
        assert(!story2.currentChoices.some(choice => choice.text.includes('share the light')), 'Lantern alone cannot unlock third ending');
        const story3 = new ink.Story(compiled);
        const settle3 = () => { while (story3.canContinue) story3.Continue(); };
        settle3();
        for (const fragment of ['Look for the caravan', 'Climb toward the star']) {
            const index = story3.currentChoices.findIndex(choice => choice.text.includes(fragment));
            assert(index >= 0);
            story3.ChooseChoiceIndex(index);
            settle3();
        }
        assert(!story3.currentChoices.some(choice => choice.text.includes('share the light')), 'Bridge alone cannot unlock third ending');
    });
    it('exports the complete story with every required media file', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inky-showcase-export-'));
        try {
            const json = path.join(dir, 'story.json');fs.writeFileSync(json, compiled);
            const { buildWebExport } = require('../renderer/webExporter');
            const result = await buildWebExport({
                compiledJsonPath: json, targetDirectory: path.join(dir, 'web'),
                templateDirectory: path.join(__dirname, '../export-for-web-template'),
                inkRuntimePath: require.resolve('inkjs/dist/ink.js'),
                projectDirectory: TEMPLATE, storyTitle: TITLE, storyAuthor: 'Elias Wren',
                coverFilePath: path.join(TEMPLATE, 'image/cover.jpg')
            });
            for (const type of ['audio','images']) {
                assert.deepEqual(result[type].missing, []);
                assert.deepEqual(result[type].ambiguous, []);
                assert.deepEqual(result[type].invalid, []);
                assert.equal(result[type].copied.length, type === 'audio' ? 11 : 8);
            }
            assert(fs.existsSync(path.join(dir, 'web/index.html')));
        } finally {fs.rmSync(dir, {recursive:true,force:true});}
    });
});
