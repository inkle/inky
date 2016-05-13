// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
var $ = window.jQuery = require('./jquery-2.2.3.min.js');
var ipc = require("electron").ipcRenderer;
var util = require('util');

var editor = ace.edit("editor");
editor.setShowPrintMargin(false);
editor.getSession().setUseWrapMode(true);


$(document).ready(function() {

    ipc.on("play", () => {
        console.log("Received play instruction. Will play the following:");
        console.log(editor.getValue());
        ipc.send("play-ink", editor.getValue());

        // Reset text and hide play message
        $("#player .playMessage").fadeOut();
        $("#player .innerText").text("");
    });

    var lastFadeTime = 0;
    function fadeIn($jqueryElement) {

        const minimumTimeSeparation = 200;
        const animDuration = 1000;

        var currentTime = Date.now();

        console.log("Last fade time: "+lastFadeTime);
        console.log("Current time: "+currentTime);

        var timeSinceLastFade = currentTime - lastFadeTime;

        console.log("timeSinceLastFade: "+timeSinceLastFade);

        var delay = 0;
        if( timeSinceLastFade < minimumTimeSeparation )
            delay = minimumTimeSeparation - timeSinceLastFade;

        $jqueryElement.css("opacity", 0);
        $jqueryElement.delay(delay).animate({opacity: 1.0}, animDuration);

        lastFadeTime = currentTime + delay;
    }

    ipc.on("play-generated-text", (event, result) => {
        console.log("Received play text: "+result);

        var $paragraph = $("<p class='storyText'></p>");
        $paragraph.text(result);
        $("#player .innerText").append($paragraph);

        fadeIn($paragraph);
    });

    ipc.on("play-generated-choice", (event, choice) => {
        var $choice = $("<a href='#'>"+choice.text+"</a>");

        // Append the choice
        var $choicePara = $("<p class='choice'></p>");
        $choicePara.append($choice);
        $("#player .innerText").append($choicePara);

        // Fade it in
        fadeIn($choicePara);

        // When this choice is clicked...
        $choice.on("click", (event) => {

            // Remove any existing choices, and add a divider
            $(".choice").remove();
            $("#player .innerText").append("<hr/>");

            // Tell inklecate to make the choice
            ipc.send("play-continue-with-choice-number", choice.number);
            event.preventDefault();
        });
    });

    ipc.on("play-story-completed", (event) => {
        var $end = $("<p class='end'>End of story</p>");
        fadeIn($end);
        $("#player .innerText").append($end);
    });

    ipc.on("play-story-unexpected-exit", (event) => {
        var $error = $("<p class='error'>Error in story</p>");
        fadeIn($error);
        $("#player .innerText").append($error);
    });

    ipc.on("compile", () => {
        console.log("Received compile instruction. Will compile the following:");
        console.log(editor.getValue());
        ipc.send("compile-ink", editor.getValue());
    });

    ipc.on("did-compile", (event, result) => {
        console.log("Renderer got result back from inklecate. Will place it in #player...");
        console.log("Placing: "+result);
        $("#player .innerText").text(result);
    });
});