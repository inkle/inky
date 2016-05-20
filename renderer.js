// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const $ = window.jQuery = require('./jquery-2.2.3.min.js');
const ipc = require("electron").ipcRenderer;
const util = require('util');
const assert = require('assert');
const path = require("path");
const DocumentManager = require('./electron-document-manager').getRendererModule();

var editor = ace.edit("editor");
var Range = ace.require("ace/range").Range;

const InkMode = require("./ace-ink-mode/ace-ink.js").InkMode;

editor.getSession().setMode(new InkMode());
editor.setShowPrintMargin(false);
editor.getSession().setUseWrapMode(true);
editor.setOptions({
    enableLiveAutocompletion: true
});

/* TODO: It's possible to complete custom keywords.
   Can do this when we have them parsed from the ink file.
var staticWordCompleter = {
    getCompletions: function(editor, session, pos, prefix, callback) {
        var wordList = ["foo", "bar", "baz"];
        callback(null, wordList.map(function(word) {
            return {
                caption: word,
                value: word,
                meta: "static"
            };
        }));

    }
}
editor.completers = [staticWordCompleter];
*/

$(document).ready(function() {

    var sessionId = 0;
    var choiceSequence = [];
    var currentReplayTurnIdx = -1;
    var clearForNextContent = false;
    var editorMarkers = [];
    var editorAnnotations = [];
    var issues = [];
    var selectedIssueIdx = -1;

    $('body').on('click', 'span.ace_variable.ace_divertTarget', function(event){
        console.log("clicked target");
    });

    // Unfortunately standard jquery events don't work since 
    // Ace turns pointer events off
    editor.on("click", function(e){

        // Have to hold down modifier key to jump
        if( !e.domEvent.metaKey && !e.domEvent.ctrlKey )
            return;

        var editor = e.editor;
        var pos = editor.getCursorPosition();
        var token = editor.session.getTokenAt(pos.row, pos.column);

        if( token && token.type == "variable.divertTarget" ) {

            // TODO: Need a more accurate way to match the target!
            $(".ace_name").each((i, el) => {
                var $el = $(el);
                if( $el.text() == token.value ) {
                    var pos = $el.offset();
                    var character = editor.renderer.screenToTextCoordinates(pos.left, pos.top+5);
                    e.preventDefault();

                    editor.gotoLine(character.row+1, character.column);
                }
            });
        }
    });

    // Unfortunately standard CSS for hover doesn't work in the editor
    // since they turn pointer events off.
    editor.on("mousemove", function (e) {

        var editor = e.editor;

        // Have to hold down modifier key to jump
        if( e.domEvent.metaKey || e.domEvent.ctrlKey ) {

            var character = editor.renderer.screenToTextCoordinates(e.x, e.y);
            var token = editor.session.getTokenAt(character.row, character.column);
            if( !token )
                return;

            var tokenStartPos = editor.renderer.textToScreenCoordinates(character.row, token.start);
            var tokenEndPos = editor.renderer.textToScreenCoordinates(character.row, token.start + token.value.length);

            const lineHeight = 12;
            if( e.x >= tokenStartPos.pageX && e.x <= tokenEndPos.pageX && e.y >= tokenStartPos.pageY && e.y <= tokenEndPos.pageY+lineHeight) {
                if( token && token.type == "variable.divertTarget" ) {
                    editor.renderer.setCursorStyle("pointer");
                    return;
                }
            }
        }
        
        editor.renderer.setCursorStyle("default");
    });

    DocumentManager.setContentSetter(function(content) {
        editor.setValue(content);
    });
     
    DocumentManager.setContentGetter(function() {
        return editor.getValue();
    });

    var currentFilepath = null;
    ipc.on("set-filepath", (event, filename) => {
        currentFilepath = filename;
        var baseFilename = path.basename(filename);
        $("h1.title").text(path.basename(filename));

        $(".sidebar .nav-group.main-ink .nav-group-item .filename").text(baseFilename)
    });

    function resetErrors() {
        var editorSession = editor.getSession();
        editorSession.clearAnnotations();
        editorAnnotations = [];

        for(var i=0; i<editorMarkers.length; i++) {
            editorSession.removeMarker(editorMarkers[i]);
        }
        editorMarkers = [];

        issues = [];
        selectedIssueIdx = -1;

        refreshIssueSummary();
    }

    function clearIfNecessary() {
        if( clearForNextContent ) {

            $("#player .innerText").text("");

            // Temporarily set the height to zero so that it re-collapses,
            // and then we can expand it as the content fills it later
            $(".innerText").height(0);

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
        DocumentManager.setEdited(true);
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

    function refreshIssueSummary() {

        var $message = $(".issuesMessage");
        var $summary = $(".issuesSummary");
        var $issues = $("#toolbar .issue-popup");
        var $issuesTable = $issues.children(".table");
        $issuesTable.empty();

        var errorCount = 0;
        var warningCount = 0;
        var todoCount = 0;

        var issuePriorties = {
            "ERROR": 1,
            "RUNTIME ERROR": 2,
            "WARNING": 3,
            "TODO": 4
        };

        issues.sort((i1, i2) => {
            var errorTypeDiff = issuePriorties[i1.type] - issuePriorties[i2.type];
            if( errorTypeDiff != 0 )
                return errorTypeDiff;
            else
                return i1.lineNumber - i2.lineNumber;
        });

        issues.forEach((issue) => {
            var errorClass = "";
            if( issue.type == "ERROR" || issue.type == "RUNTIME ERROR" ) {
                errorCount++;
                errorClass = "error";
            } else if( issue.type == "WARNING" ) {
                warningCount++;
                errorClass = "warning";
            } else if( issue.type == "TODO" ) {
                todoCount++;
                errorClass = "todo";
            }

            var $issueRow = $(`<div class="row ${errorClass}">
            <div class="col line-no">
              ${issue.lineNumber}
            </div>
            <div class="col issue">
              ${issue.message}
            </div>
            <img class="chevron" src="img/right-chevron.png"/>
          </div>`);

            $issueRow.click((e) => {
                editor.gotoLine(issue.lineNumber);
                e.preventDefault();
            });

            $issuesTable.append($issueRow);
        });

        if( errorCount == 0 && warningCount == 0 && todoCount == 0 ) {
            $summary.addClass("hidden");
            $message.text("No issues.");
            $message.removeClass("hidden");
            $issues.addClass("hidden");
        } else {
            $message.addClass("hidden");
            function updateCount(className, count) {
                var $issueCount = $summary.children(".issueCount."+className);
                if( count == 0 )
                    $issueCount.hide();
                else {
                    $issueCount.show();
                    $issueCount.children("span").text(count);
                }
            }

            updateCount("error", errorCount);
            updateCount("warning", warningCount);
            updateCount("todo", todoCount);
            $summary.removeClass("hidden");

            updateIssuesPopupPosition();
        }
    }

    function updateIssuesPopupPosition() {
        var $issues = $("#toolbar .issue-popup");
        $issues.css({
            left: 0.5*$(window).width() - 0.5*$issues.width()
        });
    }


    ipc.on("next-issue", () => {
        if( issues.length > 0 ) {
            selectedIssueIdx++;
            if( selectedIssueIdx >= issues.length )
                selectedIssueIdx = 0;
            editor.gotoLine(issues[selectedIssueIdx].lineNumber);
        }
    });

    ipc.on("play-generated-text", (event, result, fromSessionId) => {

        if( fromSessionId != sessionId )
            return;

        clearIfNecessary();

        var $paragraph = $("<p class='storyText'></p>");
        $paragraph.text(result);
        $("#player .innerText").append($paragraph);

        var replaying = currentReplayTurnIdx != -1;
        if( !replaying )
            fadeIn($paragraph);
    });

    ipc.on("play-generated-error", (event, error, fromSessionId) => {
        
        if( sessionId != fromSessionId )
            return;

        var editorErrorType = "error";
        var editorClass = "ace-error";
        if( error.type == "WARNING" ) {
            editorErrorType = "warning";
            editorClass = "ace-warning";
        }
        else if( error.type == "TODO" ) {
            editorErrorType = "information";
            editorClass = 'ace-todo';
        }

        editorAnnotations.push({
          row: error.lineNumber-1,
          column: 0,
          text: error.message,
          type: editorErrorType
        });
        editor.getSession().setAnnotations(editorAnnotations);

        var aceClass = "ace-error";
        var markerId = editor.session.addMarker(
            new Range(error.lineNumber-1, 0, error.lineNumber, 0),
            editorClass, 
            "line",
            false
        );
        editorMarkers.push(markerId);

        if( error.type == "RUNTIME ERROR" ) {
            var $aError = $("<a href='#'>Line "+error.lineNumber+": "+error.message+"</a>");
            $aError.on("click", function() {
                editor.gotoLine(error.lineNumber);
            });
            var $paragraph = $("<p class='error'></p>");
            $paragraph.append($aError);
            $("#player .innerText").append($paragraph);
        }

        issues.push(error);

        refreshIssueSummary();
    });

    ipc.on("play-generated-choice", (event, choice, fromSessionId) => {

        if( fromSessionId != sessionId )
            return;

        clearIfNecessary();

        if( currentReplayTurnIdx == -1 || currentReplayTurnIdx >= choiceSequence.length ) {

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

    ipc.on("play-requires-input", (event, fromSessionId) => {

        if( fromSessionId != sessionId )
            return;

        scrollToBottom();

        // Replay?
        if( currentReplayTurnIdx >= 0 && currentReplayTurnIdx < choiceSequence.length ) {

            $("#player .innerText").append("<hr/>");

            var replayChoiceNumber = choiceSequence[currentReplayTurnIdx];
            currentReplayTurnIdx++;
            ipc.send("play-continue-with-choice-number", replayChoiceNumber, fromSessionId);
        }
    });

    ipc.on("play-story-completed", (event, fromSessionId) => {

        console.log("play-story-completed from "+fromSessionId);
        if( fromSessionId != sessionId )
            return;

        clearIfNecessary();

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

    $("#toolbar .rewind.button").on("click", function(event) {
        choiceSequence = [];
        currentReplayTurnIdx = -1;
        reloadInkForPlaying();

        event.preventDefault();
    });

    $("#toolbar .step-back.button").on("click", function(event) {
        if( choiceSequence.length > 0 )
            choiceSequence.splice(-1, 1);

        reloadInkForPlaying();

        event.preventDefault();
    });

    var shouldBeHidden = false;
    $("#toolbar .issuesSummary, #toolbar .issue-popup").hover(function(e) {
        $("#toolbar .issue-popup").removeClass("hidden");
        shouldBeHidden = false;
    }, function(e) {
        shouldBeHidden = true;
        setTimeout(() => { 
            if( shouldBeHidden )
                $("#toolbar .issue-popup").addClass("hidden");
        }, 500);
    });

    $(window).resize(() => {
        updateIssuesPopupPosition();
    });
});