const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = global.it ? { test: global.it } : require('node:test');
const ink = require('inkjs');
const { STORIES, createOriginalStoryProject, originalFile, adaptOriginalMarkup } = require('../main-process/originalStoryProject');

function isolated(fn) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'inky-original-story-'));
    try { fn(home); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

for (const [id, item] of Object.entries(STORIES)) {
    test('original Ink story opens as an independent traditional project: ' + item.title, () => isolated(parent => {
        const entry = createOriginalStoryProject(parent, id);
        const dir = path.dirname(entry);
        assert.equal(path.basename(entry), item.title + '.ink');
        assert.equal(fs.readFileSync(entry, "utf8"), adaptOriginalMarkup(fs.readFileSync(originalFile(item.file), "utf8")));
        assert(!/<\/?(?:i|b)>|<br\s*\/?>/i.test(fs.readFileSync(entry, "utf8")));
        assert.match(fs.readFileSync(path.join(dir, 'game.yaml'), 'utf8'), /^presentation: traditional$/m);
        assert(fs.readFileSync(path.join(dir, "game.yaml"), "utf8").includes("story: " + JSON.stringify(item.title)));
        const story = new ink.Story(new ink.Compiler(fs.readFileSync(entry, 'utf8')).Compile().ToJson());
        const issues = [];
        story.onError = (message, severity) => issues.push(severity + ': ' + message);
        let steps = 0;
        while (story.canContinue && steps++ < 40) story.Continue();
        assert(steps < 40, 'Initial passage stalled');
        assert(story.currentChoices.length > 0, 'No available first choices');
        assert.deepEqual(issues, []);
        const second = createOriginalStoryProject(parent, id);
        assert.notEqual(second, entry);
        assert.deepEqual(fs.readFileSync(entry), fs.readFileSync(second));
    }));
}

test('unknown story IDs are refused without touching a directory', () => isolated(parent => {
    assert.throws(() => createOriginalStoryProject(parent, '../before-dawn'), /Unknown original story/);
    assert.deepEqual(fs.readdirSync(parent), []);
}));

test('legacy originals are routed to project creation, not editor text insertion', () => {
    const contents = fs.readFileSync(path.join(__dirname, '../main-process/inkSnippets.js'), 'utf8');
    for (const id of Object.keys(STORIES)) assert(contents.includes('originalStory: "' + id + '"'));
    const main = fs.readFileSync(path.join(__dirname, '../main-process/main.js'), 'utf8');
    assert(main.includes('openOriginalStoryProject: (focussedWindow, storyId)'));
});

test('Crime Scene never strands the reader after examining the desk, window and bed', () => {
    const source = fs.readFileSync(originalFile('murder_scene.ink'), 'utf8');
    const story = new ink.Story(new ink.Compiler(source).Compile().ToJson());
    const problems = [];
    story.onError = (message, severity) => problems.push(severity + ': ' + message);
    function choose(fragment) {
        let guard = 0;
        while (story.canContinue && guard++ < 50) story.Continue();
        const index = story.currentChoices.findIndex(item => item.text.includes(fragment));
        assert(index >= 0, `Choice not available: ${fragment}; got ${story.currentChoices.map(x=>x.text).join(', ')}`);
        story.ChooseChoiceIndex(index);
    }
    for (const fragment of ['The desk', 'Look at the in-tray', 'Turn on the lamp',
        'Open a drawer', 'Something else?', 'The window', 'Something else?',
        'The bed', 'Lift the bedcover', 'Remove the cover', 'Something else?', 'Leave the room']) {
        choose(fragment);
    }
    while (story.canContinue) story.Continue();
    assert.equal(problems.length, 0, problems.join('\n'));
    assert(story.currentChoices.length > 0, 'Joe should be ready for the final discussion');
});

test('the four inherited stories export for web without media dependencies', async () => {
    const { buildWebExport } = require('../renderer/webExporter');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'inky-original-web-'));
    try {
        for (const [id, item] of Object.entries(STORIES)) {
            const entry = createOriginalStoryProject(temp, id);
            const dir = path.dirname(entry);
            const json = path.join(dir, 'compiled.json');
            fs.writeFileSync(json, new ink.Compiler(fs.readFileSync(entry, 'utf8')).Compile().ToJson());
            const result = await buildWebExport({
                compiledJsonPath: json,
                targetDirectory: path.join(dir, 'web'),
                templateDirectory: path.join(__dirname, '../export-for-web-template'),
                inkRuntimePath: require.resolve('inkjs/dist/ink.js'),
                projectDirectory: dir,
                storyTitle: item.title
            });
            assert(fs.existsSync(path.join(dir, 'web/index.html')));
            assert.deepEqual(result.images.missing, []);
            assert.deepEqual(result.audio.missing, []);
            assert.equal(result.images.copied.length, 0);
            assert.equal(result.audio.copied.length, 0);
            assert(fs.readFileSync(path.join(dir, 'web/index.html'), 'utf8').includes(item.title));
        }
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});


test('original HTML emphasis becomes safe Ink reader markers without modifying the originals', () => {
    const original = "A <i>quiet</i> <b>night</b><br>in the village.";
    const copy = adaptOriginalMarkup(original);
    assert.equal(copy, "A ⟦i⟧quiet⟦/i⟧ ⟦b⟧night⟦/b⟧⟦br⟧in the village.");
    const preview = require('../renderer/richTextDom');
    assert.equal(preview.plainText(copy), 'A quiet night\nin the village.');
    const source = fs.readFileSync(originalFile('theintercept.ink'), 'utf8');
    assert(source.includes('<i>'), 'The bundled historical Ink should remain unchanged');
});

// The legacy sources have no UI feature for arbitrary Ink tags. In particular,
// Pontoon Game's #thought must not surface as visible '# thought' text.
test('original project copies do not leak unsupported tags', () => isolated(parent => {
    for (const [id, item] of Object.entries(STORIES)) {
        const original = fs.readFileSync(originalFile(item.file), 'utf8');
        const entry = createOriginalStoryProject(parent, id);
        const adapted = fs.readFileSync(entry, 'utf8');
        assert(!/(?:^|[ \t])#\s*thought\b/im.test(adapted), `${item.title} leaked #thought`);
        assert(!/<\/?(?:i|b)>|<br\s*\/?>/i.test(adapted), `${item.title} leaked HTML`);
        if(id === 'pontoon-game') {
            assert.equal((original.match(/#thought\b/g) || []).length, 13);
            assert.equal((adapted.match(/#thought\b/g) || []).length, 0);
            assert(adapted.includes('V:      ... {printHandDescriptively(myCards, true)}.'));
            assert(adapted.includes('⟦br⟧'), 'Keep the card list line break');
        }
        // Ink's compiled representation cannot contain the orphaned tag either.
        const json = new ink.Compiler(adapted).Compile().ToJson();
        assert(!json.includes('#thought') && !json.includes('"thought"'), `${item.title} compiled a leaked tag`);
    }
}));

test('legacy bold, italic and breaks render using the safe native reader in Preview and Export', () => {
    const rich = require('../renderer/richTextDom');
    const source = adaptOriginalMarkup('Some <b>bold</b>, <i>italic</i> text<br>next line.');
    function node(tag, value) {
        return { tag, value, children: [], appendChild(child) { this.children.push(child); } };
    }
    const dom = {
        createDocumentFragment: () => node('fragment'),
        createElement: tag => node(tag),
        createTextNode: value => node('#text', value)
    };
    function serialize(n) {
        if(n.tag === '#text') return n.value;
        return `<${n.tag}>${n.children.map(serialize).join('')}</${n.tag}>`;
    }
    assert.equal(serialize(rich.toNodes(source, dom)),
        '<fragment>Some <strong>bold</strong>, <em>italic</em> text<br></br>next line.</fragment>');
    // Both readers use the shared renderer for narrative paragraphs. The
    // editor's existing plain-choice policy is intentionally unchanged.
    const preview = fs.readFileSync(path.join(__dirname, '../renderer/playerView.js'), 'utf8');
    const web = fs.readFileSync(path.join(__dirname, '../export-for-web-template/main.js'), 'utf8');
    assert(preview.includes('InkRichText.toNodes(text, document,'));
    assert(web.includes('paragraphElement.appendChild(storyTextNode(paragraphText))'));
    assert(preview.includes('InkRichText.plainText(choiceText)'));
    assert(web.includes('choiceButton.appendChild(document.createTextNode(plainStoryText(choice.text)))'));
});

test('legacy emphasis remains in copied Ink and the bundled historical originals are unchanged', () => {
    for(const [id,item] of Object.entries(STORIES)) {
        const original = fs.readFileSync(originalFile(item.file),'utf8');
        const adapted = adaptOriginalMarkup(original);
        for(const tag of ['i','b']) {
            const raw = (original.match(new RegExp(`<${tag}>`, 'g')) || []).length;
            const native = (adapted.match(new RegExp(`⟦${tag}⟧`, 'g')) || []).length;
            assert.equal(raw, native, `${item.title}: ${tag} count changed`);
        }
    }
});
