const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');
const { remote } = require('webdriverio');
const { listUsableAudioFiles } = require('../renderer/audioTags.js');
const { listUsableImageFiles } = require('../renderer/imageTags.js');

const inkyPathsByPlatform = (platform, arch) => {
  if(platform == "darwin"){
    return `../Inky-darwin-${arch}/Inky.app/Contents/MacOS/Inky`
  }else if (platform == "linux"){
    return `../Inky-linux-x64/Inky`
  }else if (platform == "win32"){
    return `../Inky-win32-x64/Inky.exe`
  }
};

const appBinaryPath = () => inkyPathsByPlatform(process.platform, process.arch);
const hasBuiltApp = () => fs.existsSync(appBinaryPath());
const chromedriverPath = path.join(__dirname, "..", "node_modules", "electron-chromedriver", "bin", "chromedriver");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function waitForDriver(port, attempts = 200) {
  return new Promise((resolve, reject) => {
    const tryOnce = left => {
      http.get(`http://127.0.0.1:${port}/status`, res => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          try { if( JSON.parse(body).value.ready ) return resolve(); } catch(error) {}
          if( left <= 0 ) return reject(new Error("chromedriver did not become ready"));
          setTimeout(() => tryOnce(left - 1), 100);
        });
      }).on("error", () => {
        if( left <= 0 ) return reject(new Error("chromedriver is not reachable"));
        setTimeout(() => tryOnce(left - 1), 100);
      });
    };
    tryOnce(attempts);
  });
}

// Without a story path the editor starts its own new project; a path opens that story instead.
async function startApp(storyPath) {
  const port = await freePort();
  const env = Object.assign({}, process.env);
  // Without this the Electron binary runs as plain Node instead of opening the editor.
  delete env.ELECTRON_RUN_AS_NODE;

  const driver = spawn(chromedriverPath, [`--port=${port}`], { stdio: "ignore", env });
  let browser;
  let story = null;
  try {
    await waitForDriver(port);
    // chromedriver drops positional arguments, so a story is opened by starting the app
    // here and attaching to it.
    let chromeOptions = { binary: appBinaryPath(), args: ["data:,"] };
    if( storyPath ) {
      const debugPort = await freePort();
      story = spawn(appBinaryPath(), [`--remote-debugging-port=${debugPort}`, storyPath], { stdio: "ignore", env });
      chromeOptions = { debuggerAddress: `127.0.0.1:${debugPort}` };
    }
    browser = await remote({
      hostname: "127.0.0.1",
      port,
      path: "/",
      logLevel: "silent",
      capabilities: {
        browserName: "chrome",
        "goog:chromeOptions": chromeOptions
      }
    });
    await browser.waitUntil(async () => (await browser.$(".ace_text-input")).isExisting(),
      { timeout: 30000, interval: 250, timeoutMsg: "the editor never loaded" });
    // Wait for the title screen before editing.
    await browser.waitUntil(async () => (await browser.$("#title-screen .choice-button")).isExisting(),
      { timeout: 30000, interval: 250, timeoutMsg: "the project never finished loading" });
    return { driver, browser, story };
  } catch(error) {
    if( browser ) await browser.deleteSession().catch(() => {});
    if( story ) story.kill();
    driver.kill();
    throw error;
  }
}

async function stopApp(app) {
  if( app.browser ) await app.browser.deleteSession().catch(() => {});
  if( app.story ) app.story.kill();
  if( !app.driver || app.driver.exitCode !== null ) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { app.driver.kill("SIGKILL"); resolve(); }, 5000);
    app.driver.once("exit", () => { clearTimeout(timer); resolve(); });
    app.driver.kill();
  });
}

async function setStory(browser, text) {
  await browser.execute(value => {
    window.ace.edit(document.getElementById("editor")).setValue(value, -1);
  }, text);
}

async function startStory(browser) {
  const start = await browser.$("#title-screen .choice-button");
  if( await start.isExisting() ) await start.click();
}

async function activeParagraphs(browser) {
  return browser.execute(() =>
    Array.from(document.querySelectorAll(".innerText.active p.storyText"), node => node.textContent.trim()));
}

function sameParagraphs(actual, expected) {
  return actual.length === expected.length && actual.every((text, index) => text === expected[index]);
}

async function waitForParagraphs(browser, expected) {
  await browser.waitUntil(async () => sameParagraphs(await activeParagraphs(browser), expected),
    { timeout: 30000, interval: 250, timeoutMsg: `the story never showed ${JSON.stringify(expected)}` });
  assert.deepStrictEqual(await activeParagraphs(browser), expected);
}

async function clickChoice(browser) {
  const choice = await browser.$(".story-choices .choice button");
  await choice.waitForExist({ timeout: 30000, interval: 250, timeoutMsg: "no choice was shown" });
  await choice.click();
}

describe('application launch tests', function () {
  this.timeout(60000);

  beforeEach(async function () {
    if (!hasBuiltApp()) {
      this.skip();
    }
    this.app = await startApp();
  });

  afterEach(function () {
    if (this.app) return stopApp(this.app);
  });

  it('shows an initial window', async function () {
    const handles = await this.app.browser.getWindowHandles();
    assert.strictEqual(handles.length, 1);
  });

  it('reads the title', async function () {
    const title = await this.app.browser.execute(() => document.querySelector(".title").textContent);
    assert.strictEqual(title, "Untitled.ink");
  });

  it('opens the menu', async function () {
    await (await this.app.browser.$(".icon-menu")).click();
    await this.app.browser.waitUntil(async () => (await this.app.browser.$(".sidebar")).isExisting(),
      { timeout: 10000, interval: 250, timeoutMsg: "the sidebar never appeared" });
    assert.strictEqual(await (await this.app.browser.$(".sidebar")).isExisting(), true);
  });
});

describe('compiles hello world game', function () {
  this.timeout(60000);

  beforeEach(async function () {
    if (!hasBuiltApp()) {
      this.skip();
    }
    this.app = await startApp();
  });

  afterEach(function () {
    if (this.app) return stopApp(this.app);
  });

  it('writes and reads hello world', async function () {
    const input = "Hello World!";
    await setStory(this.app.browser, input);
    await startStory(this.app.browser);
    await waitForParagraphs(this.app.browser, [input]);
  });

  it('writes and selects a choice', async function () {
    const input = "Hello World! \n * Hello back \n Nice to hear from you! \n -> END";
    const resultChoice = "Hello back";
    const resultAnswer = "Nice to hear from you!";

    await setStory(this.app.browser, input);
    await startStory(this.app.browser);
    await waitForParagraphs(this.app.browser, ["Hello World!"]);
    await clickChoice(this.app.browser);
    await waitForParagraphs(this.app.browser, [resultChoice, resultAnswer]);
  });

  it('suppresses choice text', async function () {
    const input = "Hello World! \n * [Hello back] \n Nice to hear from you! \n -> END";
    const resultAnswer = "Nice to hear from you!";

    await setStory(this.app.browser, input);
    await startStory(this.app.browser);
    await waitForParagraphs(this.app.browser, ["Hello World!"]);
    await clickChoice(this.app.browser);
    await waitForParagraphs(this.app.browser, ["", resultAnswer]);
  });

  it('shows TODOs', async function () {
    const input = "-\n * Rock\n * Paper\n * Scissors\nTODO: Make this more interesting";

    await setStory(this.app.browser, input);
    await this.app.browser.waitUntil(async () => await this.app.browser.execute(() =>
        !document.querySelector(".issuesSummary").classList.contains("hidden")),
      { timeout: 30000, interval: 250, timeoutMsg: "the issues summary never appeared" });
    const todoCount = await this.app.browser.execute(() =>
      document.querySelector(".issuesSummary .issueCount.todo span").textContent);
    assert.strictEqual(todoCount, "1");
  });
});

describe('file tags show the whole project', function () {
  this.timeout(60000);

  // A throwaway project with a few music and picture files; its files are what the lists must contain.
  let dir;
  const projectDir = () => dir;

  // The music list always starts with "stop" (ends the music), then the project's files.
  const musicOfTheProject = () => ["stop"].concat(listUsableAudioFiles(projectDir(), "music"));
  const picturesOfTheProject = () => listUsableImageFiles(projectDir());

  beforeEach(async function () {
    if (!hasBuiltApp()) {
      this.skip();
    }
    dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "inky-file-tags-"));
    fs.writeFileSync(path.join(dir, "story.ink"), "-> start\n=== start ===\nOlá.\n-> END\n");
    fs.mkdirSync(path.join(dir, "audio"));
    fs.mkdirSync(path.join(dir, "image"));
    ["dark.mp3", "rain.ogg"].forEach(name => fs.writeFileSync(path.join(dir, "audio", name), ""));
    ["capa.jpg", "hero.jpg"].forEach(name => fs.writeFileSync(path.join(dir, "image", name), ""));
    this.app = await startApp(path.join(dir, "story.ink"));
  });

  afterEach(async function () {
    if (this.app) await stopApp(this.app);
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  async function newStoryLine(browser) {
    await browser.execute(() => {
      const editor = window.ace.edit(document.getElementById("editor"));
      editor.focus();
      editor.navigateTo(0, editor.session.getLine(0).length);
    });
    await browser.keys(["Enter"]);
  }

  // What the list on the screen holds: it opens by itself, so nothing has been typed yet.
  async function listed(browser) {
    await browser.waitUntil(async () => await browser.execute(() => {
      const completer = window.ace.edit(document.getElementById("editor")).completer;
      const popup = document.querySelector(".ace_autocomplete");
      return !!(completer && completer.activated && completer.popup && completer.popup.isOpen
        && popup && getComputedStyle(popup).display !== "none");
    }), { timeout: 10000, interval: 100, timeoutMsg: "the list of files never opened" });
    return browser.execute(() => {
      const completer = window.ace.edit(document.getElementById("editor")).completer;
      return { filterText: completer.completions.filterText, items: completer.completions.filtered.map(item => item.value) };
    });
  }

  it('lists every music file after "#music: " and every picture after "#image: "', async function () {
    assert.ok(musicOfTheProject().length > 1, "the sample project has music to list besides stop");
    assert.ok(picturesOfTheProject().length > 1, "the sample project has pictures to list");

    const browser = this.app.browser;
    await setStory(browser, "Você acorda na praia.\n");

    await newStoryLine(browser);
    await browser.keys("#music: ");
    const music = await listed(browser);
    assert.strictEqual(music.filterText, "", "the list opens before the first letter of a name");
    assert.deepStrictEqual(music.items, musicOfTheProject());

    await browser.keys(["Escape"]);
    await newStoryLine(browser);
    await browser.keys("#image: ");
    const pictures = await listed(browser);
    assert.strictEqual(pictures.filterText, "");
    assert.deepStrictEqual(pictures.items, picturesOfTheProject());
  });

  it('lists the files again as soon as the tag is picked from the list', async function () {
    const browser = this.app.browser;
    await setStory(browser, "Você acorda na praia.\n");
    await newStoryLine(browser);
    await browser.keys("#");
    await browser.keys(["Tab"]);
    await browser.execute(() => {
      const editor = window.ace.edit(document.getElementById("editor"));
      const picker = editor.completer;
      picker.popup.setRow(picker.completions.filtered.findIndex(item => item.value === "music: "));
      picker.insertMatch(); // what Enter on the chosen row does
    });
    assert.deepStrictEqual((await listed(browser)).items, musicOfTheProject());
  });
});
