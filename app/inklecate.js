const child_process = require('child_process');
const exec = child_process.exec;
const spawn = child_process.spawn;
const fs = require('fs');
const electron = require('electron');
const ipc = electron.ipcMain;
const util = require('util');

const forceQuitDetect = require('./forceQuitDetect');

const inklecatePath = __dirname + "/ink/inklecate";
const tempInkPath = "/tmp/inklecatetemp.ink";
const tempJsonPath = "/tmp/inklecatetemp.json";

var sessions = {};

function play(inkString, requester, sessionId) {
    console.log("Playing "+sessionId);

    fs.writeFileSync(tempInkPath, inkString);

    const playProcess = spawn(inklecatePath, ['-p', tempInkPath]);

    sessions[sessionId] = {
        process:playProcess,
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

function killAllSessions() {
    console.log("Kill all sessions");
    for(var session in sessions)
        stop(session.sessionId);
}


ipc.on("compile-ink", (event, inkStr) => {
    console.log("inklecate received compile instruction. Compiling...");
    compile(inkStr, event.sender);
});

ipc.on("play-ink", (event, inkStr, sessionId) => {
    play(inkStr, event.sender, sessionId);
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

forceQuitDetect.onForceQuit(killAllSessions);
electron.app.on("will-quit", killAllSessions);