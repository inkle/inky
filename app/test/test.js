const Application = require('spectron').Application
const assert = require('assert')
const chai = require('chai');

const chaiAsPromised = require('chai-as-promised');

const inkyPathsByPlatform = {
  "darwin": "../Inky-darwin-x64/Inky.app/Contents/MacOS/Inky",
  "linux": "../Inky-linux-x64/Inky",
  "win32": "../Inky-win32-x64/Inky.exe"
};

chai.should();
chai.use(chaiAsPromised);

describe('application launch tests', function () {
  this.timeout(10000)

  beforeEach(function () {
    this.app = new Application({
      path: inkyPathsByPlatform[process.platform]
    })
    return this.app.start().then(function (app) {
        chaiAsPromised.transferPromiseness = app.transferPromiseness;
        return app;
    });
  })

  afterEach(function () {
    if (this.app && this.app.isRunning()) {
      return this.app.stop()
    }
  })

  it('shows an initial window', function () {
    return this.app.client.getWindowCount().then(function (count) {
      assert.equal(count, 1)
    })
  })

  it('reads the title', function () {
    const title = "Untitled.ink";
    return this.app.client.getText('.title')
      .should.eventually.equal(title);
  })

  it('opens the menu', function () {
    return this.app.client.click('.icon-menu')
      .element('.sidebar')
      .should.eventually.exist
  })
})

describe('compiles hello world game', function () {
  this.timeout(10000)

  beforeEach(function () {
    this.app = new Application({
      path: inkyPathsByPlatform[process.platform]
    })
    return this.app.start().then(function (app) {
        chaiAsPromised.transferPromiseness = app.transferPromiseness;
        return app;
    });
  })

  afterEach(function () {
    if (this.app && this.app.isRunning()) {
      return this.app.stop()
    }
  })

  it('writes and reads hello world', function () {
    const input = "Hello World!";
    return this.app.client
      .setValue('.ace_text-input', input)
      .pause(2000)
      .getText('.storyText')
      .should.eventually.equal(input)
  })

  it('writes and selects a choice', function () {
    const input = "Hello World! \n * Hello back \n Nice to hear from you! \n -> END";
    const resultChoice = "Hello back";
    const resultAnswer = "Nice to hear from you!";

    return this.app.client
      .setValue('.ace_text-input', input)
      .pause(2000)
      .click('.choice')
      .pause(2000)
      .getText('.storyText:nth-of-type(2)')
      .should.eventually.equal(resultChoice)
      .getText('.storyText:nth-of-type(3)')
      .should.eventually.equal(resultAnswer)
  })

  it('suppresses choice text', function () {
    const input = "Hello World! \n * [Hello back] \n Nice to hear from you! \n -> END";
    const resultAnswer = "Nice to hear from you!";

    return this.app.client
      .setValue('.ace_text-input', input)
      .pause(2000)
      .click('.choice')
      .pause(2000)
      .getText('.storyText:nth-of-type(2)')
      .should.eventually.equal(resultAnswer)
  })

  it('shows TODOs', function() {
    const input = "-\n * Rock\n * Paper\n * Scissors\nTODO: Make this more interesting"

    return this.app.client
      .setValue('.ace_text-input', input)
      .pause(2000)
      .getText('.issuesMessage')
      .should.eventually.not.equal('No issues.')
  })
})

