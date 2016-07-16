// Ensure you've run 'npm install' within the /app directory to install spectron
// Install mocha: 'npm install -g mocha'
// Run 'mocha' in the project's root directory to run tests.

var Application = require('spectron').Application
var assert = require('assert')

var inkyPathsByPlatform = {
  "darwin": "Inky-darwin-x64/Inky.app/Contents/MacOS/Inky",
  "linux": "Inky-linux-x64/Inky",
  "win32": "Inky-win32-x64/Inky.exe"
};

describe('application launch', function () {
  this.timeout(10000)

  beforeEach(function () {
    this.app = new Application({
      path: inkyPathsByPlatform[process.platform]
    })
    return this.app.start()
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
})
