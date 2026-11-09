'use strict';
const { test } = global.it ? { test: global.it } : require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { GameStyle } = require('../renderer/gameStyle');
const { TitleScreen } = require('../renderer/titleScreen');
const { createOriginalStoryProject } = require('../main-process/originalStoryProject');
const { buildWebExport } = require('../renderer/webExporter');

const base = GameStyle.parseText('titles:\n  story: "Swindlestones"\n');

test('default Title Screen size is 56 px, without extra markup or YAML key', () => {
    assert.deepEqual(base.warnings, []);
    assert.equal(base.model.titles.storySize, 56);
    assert.equal(base.style.titles.storySize, 56);
    assert.doesNotMatch(GameStyle.toYaml(base.model), /story_size/);
    assert.match(TitleScreen.html({ title: 'Swindlestones', titleSize: 56 }),
        /<h1 class="title-screen-title">Swindlestones<\/h1>/);
});

test('config round-trips custom pixel size independently of scene title settings', () => {
    const data = GameStyle.parseText('titles:\n  story: "Swindlestones"\n  story_size_px: 44\n  scene_style:\n    size: 33.3\n');
    assert.deepEqual(data.warnings, []);
    assert.equal(data.model.titles.storySize, 44);
    assert.equal(data.model.titles.sceneStyle.size, 33.3);
    assert.equal(data.style.titles.storySize, 44);
    const yaml = GameStyle.toYaml(data.model);
    assert.match(yaml, /  story_size_px: 44/);
    assert.doesNotMatch(yaml, /  story_size: /);
    assert.equal(GameStyle.parseText(yaml).model.titles.storySize, 44);
    assert.match(TitleScreen.html({ title: 'Swindlestones', titleSize: 44 }),
        /<h1 class="title-screen-title" style="--title-screen-title-size: 44px">Swindlestones<\/h1>/);
});

test('r105 percent settings migrate to pixel value without confusing 78% and 78px', () => {
    const old = GameStyle.parseText('titles:\n  story_size: 78\n');
    assert.deepEqual(old.warnings, []);
    assert.equal(old.model.titles.storySize, 44);
    const migrated = GameStyle.toYaml(old.model);
    assert.match(migrated, /story_size_px: 44/);
    assert.doesNotMatch(migrated, /  story_size: 78/);
    assert.equal(GameStyle.parseText(migrated).model.titles.storySize, 44);
    const both = GameStyle.parseText('titles:\n  story_size: 78\n  story_size_px: 70\n');
    assert.equal(both.model.titles.storySize, 70);
});

test('invalid pixel sizes reset to 56 px with warnings and cannot inject markup', () => {
    for (const bad of [-4, 0, 15, 101, 9999, '80px', '1; color: red']) {
        const data = GameStyle.parseText(`titles:\n  story_size_px: ${JSON.stringify(bad)}\n`);
        assert.equal(data.model.titles.storySize, 56);
        assert.match(data.warnings.join(' '), /titles\.story_size_px/);
        const html = TitleScreen.html({ title: 'T', titleSize: bad });
        assert.match(html, /<h1 class="title-screen-title">T<\/h1>/);
        assert.doesNotMatch(html, /style=/);
    }
});

test('both Advanced panels show Size first with Title and Author adjacent', () => {
    for (const name of ['gameSettings.html', 'gameSettings/gameSettings.html']) {
        const html = fs.readFileSync(path.join(__dirname, '../renderer', name), 'utf8');
        assert.match(html, /id="story-title-size" min="16" max="100" step="1"/);
        assert.match(html, /id="story-title-size-number" min="16" max="100" step="1"/);
        const title = html.indexOf('id="story-title"');
        const size = html.indexOf('id="story-title-size"');
        const author = html.indexOf('id="story-author"');
        const cover = html.indexOf('id="story-cover"');
        assert(size < title && title < author && author < cover);
        assert.match(html.slice(size, title), /class="unit">px/);
        // No controls may separate the Title and Author rows.
        const authorRow = html.lastIndexOf('<div class="row"', author);
        assert.doesNotMatch(html.slice(title, authorRow), /<div class="row/);
        const css = fs.readFileSync(path.join(__dirname, '../renderer/titleScreen.css'), 'utf8');
        assert.match(css, /font-size: var\(--title-screen-title-size, 56px\)/);
    }
});

test('new Swindlestones copies begin at 44px, other original stories retain 56px', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'inky-title-size-'));
    try {
        for (const [id, expected] of [['swindlestones', 44], ['crime-scene', 56], ['pontoon-game', 56], ['the-intercept', 56]]) {
            const entry = createOriginalStoryProject(temp, id);
            const gameYaml = fs.readFileSync(path.join(path.dirname(entry), 'game.yaml'), 'utf8');
            assert.equal(GameStyle.parseText(gameYaml).model.titles.storySize, expected);
        }
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('web export carries over pixel size and includes the shared CSS', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'inky-title-web-'));
    try {
        const compiled = path.join(temp, 'story.json');
        const inkjs = require('inkjs');
        fs.writeFileSync(compiled, new inkjs.Compiler('Hello world.\n-> END').Compile().ToJson());
        const target = path.join(temp, 'exported');
        await buildWebExport({
            compiledJsonPath: compiled, targetDirectory: target,
            templateDirectory: path.join(__dirname, '../export-for-web-template'),
            inkRuntimePath: require.resolve('inkjs/dist/ink.js'),
            javascriptFilename: 'story.js', storyTitle: 'Swindlestones', storyTitleSize: 44
        });
        const html = fs.readFileSync(path.join(target, 'index.html'), 'utf8');
        const css = fs.readFileSync(path.join(target, 'style.css'), 'utf8');
        assert.match(html, /class="title-screen-title" style="--title-screen-title-size: 44px"/);
        assert.match(css, /font-size: var\(--title-screen-title-size, 56px\)/);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
