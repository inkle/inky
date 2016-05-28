const child_process = require('child_process');
const exec = child_process.exec;
const spawn = child_process.spawn;
const fs = require('fs');
const path = require("path");
const electron = require('electron');
const ipc = electron.ipcMain;
const util = require('util');
const mkdirp = require('mkdirp');

const inklecatePath = __dirname + "/ink/inklecate";

// TODO: Customise this for different projects
const tempInkPath = "/tmp/inklecatetemp/";

var sessions = {};


function play(compileInstruction, requester, sessionId) {
    console.log("Playing "+sessionId);

    // TODO: handle errors
    mkdirp.sync(tempInkPath);

    for(var relativePath in compileInstruction.updatedFiles) {

        console.log("Relative path: "+relativePath);

        var fullInkPath = path.join(tempInkPath, relativePath);
        var inkFileContent = compileInstruction.updatedFiles[relativePath];

        if( path.dirname(relativePath) != "." ) {
            var fullDir = path.dirname(fullInkPath);
            console.log("MAKING DIR: "+fullDir);
            mkdirp.sync(fullDir);
        }


        console.log("WRITING TO: "+fullInkPath);

        fs.writeFileSync(fullInkPath, inkFileContent);
    }

    var mainInkPath = path.join(tempInkPath, compileInstruction.mainName);
    const playProcess = spawn(inklecatePath, ['-cp', mainInkPath]);

    sessions[sessionId] = {
        process:playProcess,
        requesterWebContents: requester,
        stopped: false
    };

    playProcess.stderr.setEncoding('utf8');
    playProcess.stderr.on('data', (data) => {
        console.log(`stderr: ${data}`);
    });

    playProcess.stdin.setEncoding('utf8');

    playProcess.stdout.setEncoding('utf8');
    playProcess.stdout.on('data', (text) => {

        var lines = text.split('\n');

        for(var i=0; i<lines.length; ++i) {
            var line = lines[i].trim();

            var choiceMatches = line.match(/^(\d+):\s+(.*)/);
            var errorMatches = line.match(/^(ERROR|WARNING|RUNTIME ERROR|TODO): '([^']+)' line (\d+): (.+)/);
            var promptMatches = line.match(/^\?>/);

            if( errorMatches ) {
                requester.send('play-generated-error', {
                    type: errorMatches[1],
                    filename: errorMatches[2],
                    lineNumber: parseInt(errorMatches[3]),
                    message: errorMatches[4]
                }, sessionId);
            } else if( choiceMatches ) {
                requester.send("play-generated-choice", {
                    number: parseInt(choiceMatches[1]),
                    text: choiceMatches[2]
                }, sessionId);
            } else if( promptMatches ) {
                requester.send('play-requires-input', sessionId);
            } else if( line.length > 0 ) {
                requester.send('play-generated-text', line, sessionId);
            }

        }

        console.log("STORY DATA (sesssion "+sessionId+"): "+text);
    })

    var processCloseExit = (code) => {

        if( !sessions[sessionId] )
            return;

        var forceStoppedByPlayer = sessions[sessionId].stopped;
        if( !forceStoppedByPlayer ) {
            if( code == 0 ) {
                console.log("Completed story successfully");
                requester.send('play-story-completed', sessionId);
            }
            else {
                console.log("Story exited unexpectedly with error code "+code+" (session "+sessionId+")");
                requester.send('play-story-unexpected-exit', code, sessionId);
            }
        }

        delete sessions[sessionId];
    };

    playProcess.on('close', processCloseExit);
    playProcess.on('exit', processCloseExit);
}

function stop(sessionId) {
    const processObj = sessions[sessionId];
    if( processObj ) {
        processObj.stopped = true;
        processObj.process.kill('SIGTERM');
        return true;
    } else {
        console.log("Could not find process to stop");
        return false;
    }
}

function killSessions(optionalBrowserWindow) {
    if( optionalBrowserWindow )
        console.log("Kill sessions for window");
    else
        console.log("Kill all sessions");

    for(var sessionId in sessions) {

        if( !optionalBrowserWindow || sessions[sessionId] &&
            sessions[sessionId].requesterWebContents == optionalBrowserWindow.webContents ) {

            if( optionalBrowserWindow )
                console.log("Found session to stop: "+sessionId);

            stop(sessionId);
        }
    }
}

ipc.on("play-ink", (event, compileInstruction, sessionId) => {
    play(compileInstruction, event.sender, sessionId);
});

ipc.on("play-stop-ink", (event, sessionId) => {
    console.log("got request to stop "+sessionId);
    const requester = event.sender;
    if( stop(sessionId) )
        requester.send('play-story-stopped', sessionId);
});

ipc.on("play-continue-with-choice-number", (event, choiceNumber, sessionId) => {
    console.log("inklecate received play choice number: "+choiceNumber+" for session "+sessionId);
    if( sessions[sessionId] ) {
        const playProcess = sessions[sessionId].process;
        if( playProcess )
            playProcess.stdin.write(""+choiceNumber+"\n");
    }
    
});


exports.Inklecate = {
    killSessions: killSessions
}