const assert = require('assert');
const { createLauncher } = require('./launchers');

describe('application launch tests', function () {
    this.timeout(30000);

    let app;

    beforeEach(async function () {
        app = createLauncher();
        await app.launch();
    });

    afterEach(async function () {
        await app.stop();
    });

    it('shows an initial window', async function () {
        const count = await app.getWindowCount();
        assert.strictEqual(count, 1);
    });

    it('reads the title', async function () {
        const title = await app.getText('.title');
        assert.strictEqual(title, 'Untitled.ink');
    });

    it('opens the menu', async function () {
        await app.click('.icon-menu');
        await app.waitForSelector('.sidebar:not(.hidden)', { timeout: 5000 });
        const exists = await app.elementExists('.sidebar');
        assert.ok(exists, 'sidebar should be visible after clicking menu');
    });
});

describe('compiles hello world game', function () {
    this.timeout(30000);

    let app;

    beforeEach(async function () {
        app = createLauncher();
        await app.launch();
    });

    afterEach(async function () {
        await app.stop();
    });

    it('writes and reads hello world', async function () {
        const input = 'Hello World!';
        await app.setEditorContent(input);
        await app.waitForStoryText();
        const text = await app.getStoryTextAt(0);
        assert.strictEqual(text, input);
    });

    it('writes and selects a choice', async function () {
        const input = 'Hello World!\n* Hello back\n  Nice to hear from you!\n-> END';
        await app.setEditorContent(input);
        await app.waitForChoice();

        await app.clickChoiceAndWaitForText(3);

        const choiceText = await app.getStoryTextAt(1);
        assert.strictEqual(choiceText, 'Hello back');

        const answerText = await app.getStoryTextAt(2);
        assert.strictEqual(answerText, 'Nice to hear from you!');
    });

    it('suppresses choice text', async function () {
        const input = 'Hello World!\n* [Hello back]\n  Nice to hear from you!\n-> END';
        await app.setEditorContent(input);
        await app.waitForChoice();

        await app.clickChoiceAndWaitForText(2);

        const answerText = await app.getStoryTextAt(1);
        assert.strictEqual(answerText, 'Nice to hear from you!');
    });

    it('shows TODOs', async function () {
        const input = '-\n* Rock\n* Paper\n* Scissors\nTODO: Make this more interesting';
        await app.setEditorContent(input);
        await app.waitForIssues();

        const visible = await app.isTodoVisible();
        assert.ok(visible, 'TODO issue count should be visible');
    });
});
