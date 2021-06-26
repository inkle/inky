const Application = require('spectron').Application
const assert = require('assert')
const chai = require('chai');

const chaiAsPromised = require('chai-as-promised');

const inkyPathsByPlatform = {
  "darwin": "../Inky-darwin-x64/Inky.app/Contents/MacOS/Inky",
  "linux": "../Inky-linux-x64/Inky",
  "win32": "../Inky-win32-x64/Inky.exe"
};

const app = new Application({
  path: inkyPathsByPlatform[process.platform]
})

chai.should();
chai.use(chaiAsPromised);

describe('application launch tests', function () {
  this.timeout(10000)

  beforeEach(function () {
    chaiAsPromised.transferPromiseness = app.transferPromiseness;
    return app.start();
  })

  afterEach(function () {
    if (app && app.isRunning()) {
      app.mainProcess.exit(0);
    }
  })

  it('shows an initial window', function () {
    return app.client
      .getWindowCount()
      .should.eventually.equal(1);
  })

  it('reads the title', function () {
    const title = "Untitled.ink";

    return app.client
      .getHTML('.title', false)
      .should.eventually.equal(title);
  })

  it('opens the menu', function () {
    const cssPropValue = "block";

    return app.client
      .click('.icon-menu')
      .getCssProperty('.sidebar','display').then(function (property){
        return property.value;
    }).should.eventually.equal(cssPropValue);
  })

})

describe('compiles hello world game', function () {
  this.timeout(10000)

  beforeEach(function () {
    chaiAsPromised.transferPromiseness = app.transferPromiseness;
    return app.start().then(function () {

      // A bug with setValue() means it doesn't properly clear the element
      // hence the element is cleared by simulating pressing the delete key

      for (let i = 0; i < 125; i++) { 
        app.client.setValue('.ace_text-input', "\ue017").pause(50); 
      };

      return app.client.setValue('.ace_text-input', "\ue017");
    });
  })

  afterEach(function () {
    if (app && app.isRunning()) {
      app.mainProcess.exit(0);
    }
  })

  it('writes and reads hello world', function () {
    const input = "Hello World!";

    return app.client
      .setValue('.ace_text-input', input)
      .pause(2000)
      .getText('.storyText:nth-of-type(1)').then(function(value){
        return value.join('');
      })
      .should.eventually.equal(input);
  })

  it('writes and selects a choice', function () {
    const input = "Hello World! \n * Hello back \n Nice to hear from you! \n -> END";
    const resultChoice = "Hello back";
    const resultAnswer = "Nice to hear from you!";

    return app.client
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

    return app.client
      .setValue('.ace_text-input', input)
      .pause(2000)
      .click('.choice')
      .pause(2000)
      .getText('.storyText:nth-of-type(3)')
      .should.eventually.equal(resultAnswer);
  })

  it('shows TODOs', function() {
    const input = "-\n * Rock\n * Paper\n * Scissors\nTODO: Make this more interesting"

    return app.client
      .setValue('.ace_text-input', input)
      .pause(2000)
      .getText('.issuesMessage')
      .should.eventually.not.equal('No issues.')
  })
})

