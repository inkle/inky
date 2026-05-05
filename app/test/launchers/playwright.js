const { _electron: electron } = require('playwright-core');
const path = require('path');

const electronBinary = path.join(__dirname, '..', '..', 'node_modules', 'electron', 'dist', 'electron');
const mainScript = path.join(__dirname, '..', '..', 'main-process', 'main.js');

class PlaywrightLauncher {
    constructor() {
        this._electronApp = null;
        this._window = null;
    }

    async launch() {
        const args = ['--no-sandbox', mainScript];

        this._electronApp = await electron.launch({
            executablePath: electronBinary,
            args: args,
            env: { ...process.env, NODE_ENV: 'test' }
        });

        this._window = await this._electronApp.firstWindow();
        await this._window.waitForSelector('#editor .ace_content', { timeout: 15000 });
        return this;
    }

    async stop() {
        if (!this._electronApp) return;
        try {
            await this._electronApp.evaluate(({ app }) => { app.exit(0); });
        } catch (e) {
            // App already closed
        }
        this._electronApp = null;
        this._window = null;
    }

    async getWindowCount() {
        return this._electronApp.windows().length;
    }

    async getText(selector) {
        const text = await this._window.textContent(selector);
        return text ? text.trim() : '';
    }

    async click(selector) {
        await this._window.click(selector, { force: true });
    }

    async elementExists(selector) {
        const el = await this._window.$(selector);
        return el !== null;
    }

    async waitForSelector(selector, opts) {
        await this._window.waitForSelector(selector, opts);
    }

    async setEditorContent(text) {
        await this._window.evaluate((t) => {
            var editor = ace.edit('editor');
            editor.setValue(t, 1);
        }, text);
    }

    async pause(ms) {
        await new Promise(r => setTimeout(r, ms));
    }

    async waitForStoryText(timeout) {
        timeout = timeout || 10000;
        await this._window.waitForSelector(
            '#player .innerText.active .storyText',
            { state: 'attached', timeout: timeout }
        );
    }

    async waitForChoice(timeout) {
        timeout = timeout || 10000;
        await this._window.waitForSelector(
            '#player .innerText.active .choice',
            { state: 'attached', timeout: timeout }
        );
    }

    async getStoryTextAt(index) {
        return await this._window.evaluate((idx) => {
            var texts = document.querySelectorAll('#player .innerText.active .storyText');
            return texts[idx] ? texts[idx].textContent.trim() : null;
        }, index);
    }

    async clickChoiceAndWaitForText(expectedCount, timeout) {
        timeout = timeout || 20000;
        // Wait for compilation to stabilize
        await this._window.waitForFunction(() => {
            var spinner = document.querySelector('.busySpinner');
            return !spinner || !spinner.classList.contains('active');
        }, { timeout: 5000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 1500));

        await this._window.click('#player .innerText.active .choice a', { force: true });
        await this._window.waitForFunction((count) => {
            var texts = document.querySelectorAll('#player .innerText.active .storyText');
            return texts.length >= count;
        }, expectedCount, { timeout: timeout });
    }

    async waitForIssues(timeout) {
        timeout = timeout || 15000;
        await this._window.waitForFunction(() => {
            var summary = document.querySelector('.issuesSummary');
            return summary && !summary.classList.contains('hidden');
        }, { timeout: timeout });
    }

    async getIssuesText() {
        return await this.getText('.issuesMessage');
    }

    async isTodoVisible() {
        return await this._window.evaluate(() => {
            var todoEl = document.querySelector('.issueCount.todo');
            return todoEl && todoEl.style.display !== 'none';
        });
    }
}

module.exports = PlaywrightLauncher;
