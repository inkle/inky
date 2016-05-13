// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
var $ = window.jQuery = require('./jquery-2.2.3.min.js');
var ipc = require("electron").ipcRenderer;
var util = require('util');
const assert = require('assert');

var editor = ace.edit("editor");
var Range = ace.require("ace/range").Range

editor.setShowPrintMargin(false);
editor.getSession().setUseWrapMode(true);

$(document).ready(function() {

    var sessionId = 0;
    var choiceSequence = [];
    var currentReplayTurnIdx = -1;
    var clearForNextContent = false;
    var editorMarkers = [];
    var editorAnnotations = [];

    function resetErrors() {
        var editorSession = editor.getSession();
        editorSession.clearAnnotations();
        editorAnnotations = [];

        for(var i=0; i<editorMarkers.length; i++) {
            editorSession.removeMarker(editorMarkers[i]);
        }
        editorMarkers = [];
    }

    function clearIfNecessary() {
        if( clearForNextContent ) {

            // Reset text and hide play message
            var $playMsg = $("#player .playMessage");
            if( parseFloat($playMsg.css("opacity")) > 0 )
            $playMsg.fadeOut();
        
            $("#player .innerText").text("");

            clearForNextContent = false;
        }
    }

    function reloadInkForPlaying() {

        lastEditorChange = null;

        stop(sessionId);

        sessionId += 1;

        if( choiceSequence.length > 0 )
            currentReplayTurnIdx = 0;

        console.log("New session id in play(): "+sessionId);

        clearForNextContent = true;
        resetErrors();

        ipc.send("play-ink", editor.getValue(), sessionId);
    }

    function stop(idToStop) {
        ipc.send("play-stop-ink", idToStop);
    }

    // Do first compile
    setTimeout(reloadInkForPlaying, 1000);

    var editorChanges = 1;
    var lastEditorChange = null;
    editor.on("change", () => {
        lastEditorChange = Date.now();
    });

    setInterval(() => {
        if( lastEditorChange != null && Date.now() - lastEditorChange > 500 ) {
            lastEditorChange = null;
            reloadInkForPlaying();
        }
    }, 250);


    var lastFadeTime = 0;
    function fadeIn($jqueryElement) {

        const minimumTimeSeparation = 200;
        const animDuration = 1000;

        var currentTime = Date.now();
        var timeSinceLastFade = currentTime - lastFadeTime;

        var delay = 0;
        if( timeSinceLastFade < minimumTimeSeparation )
            delay = minimumTimeSeparation - timeSinceLastFade;

        $jqueryElement.css("opacity", 0);
        $jqueryElement.delay(delay).animate({opacity: 1.0}, animDuration);

        lastFadeTime = currentTime + delay;
    }

    function scrollToBottom() {

        var $lastObj = $(".innerText").children().last();
        var bottomEdge = $lastObj.position().top + $lastObj.height();
        var newHeight = bottomEdge + 100;
        if( $(".innerText").height() < newHeight )
            $(".innerText").height(bottomEdge + 100);

        var offset = newHeight - $("#main").height();
        if( offset > 0 && offset > $("#player").scrollTop() ) {
            $("#player").animate({
                scrollTop: offset
            }, 500);
        }
    }

    ipc.on("play-generated-text", (event, result, fromSessionId) => {

        if( fromSessionId != sessionId )
            return;

        clearIfNecessary();

        var $paragraph = $("<p class='storyText'></p>");
        $paragraph.text(result);
        $("#player .innerText").append($paragraph);

        scrollToBottom();

        var replaying = currentReplayTurnIdx != -1;
        if( !replaying )
            fadeIn($paragraph);
    });

    ipc.on("play-generated-error", (event, error, fromSessionId) => {
        
        if( sessionId != fromSessionId )
            return;

        console.log("Got error: "+JSON.stringify(error));

        var editorErrorType = "error";
        if( error.type == "WARNING" )
            editorErrorType = "warning";
        else if( error.type == "TODO" )
            editorErrorType = "information";

        editorAnnotations.push({
          row: error.lineNumber-1,
          column: 0,
          text: error.message,
          type: editorErrorType
        });
        editor.getSession().setAnnotations(editorAnnotations);

        if( error.type.indexOf("ERROR") != -1) {
            var markerId = editor.session.addMarker(
                new Range(error.lineNumber-1, 0, error.lineNumber, 0),
                "ace-error", 
                "line",
                false
            );
            editorMarkers.push(markerId);
        }

        if( error.type == "RUNTIME ERROR" ) {
            var $aError = $("<a href='#'>Line "+error.lineNumber+": "+error.message+"</a>");
            $aError.on("click", function() {
                editor.gotoLine(error.lineNumber);
            });
            var $paragraph = $("<p class='error'></p>");
            $paragraph.append($aError);
            $("#player .innerText").append($paragraph);
        }
    });

    ipc.on("play-generated-choice", (event, choice, fromSessionId) => {

        if( fromSessionId != sessionId )
            return;

        clearIfNecessary();

        if( currentReplayTurnIdx >= 0 && currentReplayTurnIdx < choiceSequence.length ) {
            var replayChoiceNumber = choiceSequence[currentReplayTurnIdx];
            if( choice.number == replayChoiceNumber ) {
                $("#player .innerText").append("<hr/>");

                // Found the right choice to choose now, we just need to wait until
                // the story's ready for our next choice (TODO: More robust way?!)
                setTimeout(() => {
                    currentReplayTurnIdx++;
                    ipc.send("play-continue-with-choice-number", replayChoiceNumber, fromSessionId);
                }, 10);
            }
        } else {
            var $choice = $("<a href='#'>"+choice.text+"</a>");

            // Append the choice
            var $choicePara = $("<p class='choice'></p>");
            $choicePara.append($choice);
            $("#player .innerText").append($choicePara);

            // Fade it in
            if( currentReplayTurnIdx == choiceSequence.length )
                currentReplayTurnIdx = -1;
            else
                fadeIn($choicePara);

            scrollToBottom();

            // When this choice is clicked...
            $choice.on("click", (event) => {

                var existingHeight = $(".innerText").height();
                $(".innerText").height(existingHeight);

                // Remove any existing choices, and add a divider
                $(".choice").remove();
                $("#player .innerText").append("<hr/>");

                // Tell inklecate to make the choice
                ipc.send("play-continue-with-choice-number", choice.number, fromSessionId);
                event.preventDefault();

                choiceSequence.push(choice.number);
            });
        }

    });

    ipc.on("play-story-completed", (event, fromSessionId) => {

        console.log("play-story-completed from "+fromSessionId);
        if( fromSessionId != sessionId )
            return;

        var $end = $("<p class='end'>End of story</p>");
        fadeIn($end);
        $("#player .innerText").append($end);
    });

    ipc.on("play-story-unexpected-exit", (event, fromSessionId) => {

        console.log("play-story-unexpected-exit from "+fromSessionId);
        if( sessionId != fromSessionId ) 
            return;

        var $error = $("<p class='error'>Error in story</p>");
        fadeIn($error);
        $("#player .innerText").append($error);
    });

    ipc.on("play-story-stopped", (event, fromSessionId) => {
        console.log("play-story-stopped from "+fromSessionId);
    });

    $("#restart").on("click", function(event) {
        choiceSequence = [];
        currentReplayTurnIdx = -1;
        reloadInkForPlaying();

        event.preventDefault();
    });

    $("#stepback").on("click", function(event) {
        if( choiceSequence.length > 0 )
            choiceSequence.splice(-1, 1);

        reloadInkForPlaying();

        event.preventDefault();
    });

});