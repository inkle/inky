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

