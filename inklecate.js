const child_process = require('child_process');
const exec = child_process.exec;
const spawn = child_process.spawn;
const fs = require('fs');
const electron = require('electron');
const ipc = electron.ipcMain;
const util = require('util');

const inklecatePath = "ink/inklecate";
const tempInkPath = "/tmp/inklecatetemp.ink";
const tempJsonPath = "/tmp/inklecatetemp.json";


function compile(inkString, requester) {
  console.log("Compiling "+inkString);

  fs.writeFileSync(tempInkPath, inkString);

  exec(inklecatePath + ' -o ' + tempJsonPath + ' ' + tempInkPath, function callback(error, stdout, stderr){
    console.log("Compile process complete");
    if( error ) {
      console.log("ERR"+error);
      console.log("ERR2"+stderr);
    } else {
      var outputContents = fs.readFileSync(tempJsonPath, "utf8");
      console.log("Got output: "+outputContents);
      console.log("Sending result back to main window");
      requester.send("did-compile", outputContents);
    }
  });
}

function play(inkString, requester) {
  console.log("Playing "+inkString);

  fs.writeFileSync(tempInkPath, inkString);

  const playProcess = spawn(inklecatePath, ['-p', tempInkPath]);


  playProcess.stderr.setEncoding('utf8');
  playProcess.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`);
  });

  playProcess.stdout.setEncoding('utf8');
  playProcess.stdout.on('data', (text) => {

    var choiceMatches = text.match(/(\d+):\s+(.*)/);
    if( choiceMatches ) {
      requester.send("play-generated-choice", {
        number: parseInt(choiceMatches[1]),
        text: choiceMatches[2]
      });
    } else {
      requester.send('play-generated-text', text);
    }

    
  })

  playProcess.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
  });;
}

ipc.on("compile-ink", (event, inkStr) => {
  console.log("inklecate received compile instruction. Compiling...");
  compile(inkStr, event.sender);
});

ipc.on("play-ink", (event, inkStr) => {
  console.log("inklecate received play instruction. Here we go...!");
  play(inkStr, event.sender);
});

ipc.on("play-continue-with-choice-number", (event, choiceNumber) => {
  console.log("inklecate received play choice number: "+choiceNumber);
  
});