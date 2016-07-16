// Install Spectron
// npm install --save-dev spectron
// Install mocha
// npm install -g mocha
// in /app run 'mocha' to run tests. Remember to set path to the platform you're testing on

var Application = require('spectron').Application
var assert = require('assert')

describe('application launch', function () {
  this.timeout(10000)

  beforeEach(function () {
    this.app = new Application({
      //Path for testing on Mac
      path: 'Inky-darwin-x64/Inky.app/Contents/MacOS/Inky'
      //Path for testing on Linux
      //path: 'Inky-linux-x64/Inky'
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
