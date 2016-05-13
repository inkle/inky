const exec = require('child_process').exec;
const fs = require('fs');
const electron = require('electron');
const ipc = electron.ipcMain;
const util = require('util');

var mainWindow = null;

function compile(inkString) {
  console.log("Compiling "+inkString);

  fs.writeFileSync("/tmp/inklecatetemp.ink", inkString);

  exec('ink/inklecate -o /tmp/inklecatetemp.json /tmp/inklecatetemp.ink', function callback(error, stdout, stderr){
    console.log("Compile process complete");
    if( error ) {
      console.log("ERR"+error);
      console.log("ERR2"+stderr);
    } else {
      var outputContents = fs.readFileSync("/tmp/inklecatetemp.json", "utf8");
      console.log("Got output: "+outputContents);
      console.log("Sending result back to main window");
      mainWindow.webContents.send("did-compile", outputContents);
    }
  });
}

ipc.on("compile-ink", (event, inkStr) => {
  console.log("inklecate received compile instruction. Compiling...");
  compile(inkStr);
});

exports.compile = compile;
exports.setMainWindow = function(w) {
  mainWindow = w;
}