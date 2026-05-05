const Application = require('spectron').Application;
const path = require('path');

const inkyPathsByPlatform = (platform, arch) => {
    if (platform === 'darwin') {
        return path.join(__dirname, '..', '..', '..', `Inky-darwin-${arch}`, 'Inky.app', 'Contents', 'MacOS', 'Inky');
    } else if (platform === 'linux') {
        return path.join(__dirname, '..', '..', '..', 'Inky-linux-x64', 'Inky');
    } else if (platform === 'win32') {
        return path.join(__dirname, '..', '..', '..', 'Inky-win32-x64', 'Inky.exe');
    }
};

class SpectronLauncher {
    constructor() {
        this._app = null;
    }

    async launch() {
        const args = [];
        if (process.platform === 'linux') {
            args.push('--no-sandbox', '--disable-gpu');
        }

        this._app = new Application({
            path: inkyPathsByPlatform(process.platform, process.arch),
            args: args
        });

        await this._app.start();
        return this;
    }

    async stop() {
        if (this._app && this._app.isRunning()) {
            await this._app.stop();
        }
        this._app = null;
    }

    async getWindowCount() {
        return await this._app.client.getWindowCount();
    }

    async getText(selector) {
        return await this._app.client.getText(selector);
    }

    async click(selector) {
        await this._app.client.click(selector);
    }

    async elementExists(selector) {
        return await this._app.client.isExisting(selector);
    }

    async waitForSelector(selector, opts) {
        const timeout = (opts && opts.timeout) || 5000;
        await this._app.client.waitForExist(selector, timeout);
    }

    async setEditorContent(text) {
        await this._app.client.setValue('.ace_text-input', text);
    }

    async pause(ms) {
        await this._app.client.pause(ms);
    }

    async waitForStoryText(timeout) {
        timeout = timeout || 10000;
        await this._app.client.waitForExist('.storyText', timeout);
    }

    async waitForChoice(timeout) {
        timeout = timeout || 10000;
        await this._app.client.waitForExist('.choice', timeout);
    }

    async getStoryTextAt(index) {
        const selector = `.storyText:nth-of-type(${index + 1})`;
        return await this._app.client.getText(selector);
    }

    async clickChoiceAndWaitForText(expectedCount, timeout) {
        timeout = timeout || 20000;
        await this._app.client.pause(1500);
        await this._app.client.click('.choice');
        await this._app.client.pause(2000);
    }

    async waitForIssues(timeout) {
        timeout = timeout || 15000;
        await this._app.client.waitForExist('.issuesMessage', timeout);
    }

    async getIssuesText() {
        return await this._app.client.getText('.issuesMessage');
    }

    async isTodoVisible() {
        return await this._app.client.isExisting('.issueCount.todo');
    }
}

module.exports = SpectronLauncher;
