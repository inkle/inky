const $ = window.jQuery = require('./jquery-2.2.3.min.js');

const Document = ace.require('ace/document').Document;
const EditSession = ace.require('ace/edit_session').EditSession;
const InkMode = require("./ace-ink-mode/ace-ink.js").InkMode;

var lastFadeTime = 0;

var $textBuffer = null;

var events = {};

document.addEventListener("keyup", function(){
    $("#player").removeClass("altKey");
});
document.addEventListener("keydown", function(){
    $("#player").addClass("altKey");
});

// Initial default: append to visible buffer
$textBuffer = $("#player .innerText.active");

var expressionEditors = [];

function setupExpressionWatcher() {

    const $expressionWatchContainer = $(".expressionWatch tbody");
    const $expression = $(`<tr><td class="expressionLabel">Every turn:</td><td class="expressionInput"></td></tr>`);
    $expressionWatchContainer.append($expression);

    // These lines are all only need for expression watcher view.
    // Should probably extract to expressionWatchView.js
    const expressionAceEditor = ace.edit($expression.children(".expressionInput").get(0));

    expressionAceEditor.setOptions({
        maxLines: 1,
        autoScrollEditorIntoView: true,
        highlightActiveLine: false,
        printMargin: false,
        showGutter: false
    });

    // remove newlines in pasted text
    expressionAceEditor.on("paste", function(e) {
        e.text = e.text.replace(/[\r\n]+/g, " ");
    });

    // make mouse position clipping nicer
    expressionAceEditor.renderer.screenToTextCoordinates = function(x, y) {
        var pos = this.pixelToScreenCoordinates(x, y);
        return this.session.screenToDocumentPosition(
            Math.min(this.session.getScreenLength() - 1, Math.max(pos.row, 0)),
            Math.max(pos.column, 0)
        );
    };

    // disable Enter Shift-Enter keys
    expressionAceEditor.commands.bindKey("Enter|Shift-Enter", "null")

    // TODO: Is there not a way to set the mode to "new InkMode()" without starting a new session?!
    var aceDocument = new Document("hello world isn't this great yes it is {x}");
    var aceSession = new EditSession(aceDocument, new InkMode());
    aceSession.setUseWrapMode(false);
    aceSession.setUndoManager(new ace.UndoManager());
    expressionAceEditor.setSession(aceSession);

    expressionAceEditor.container.style.lineHeight = 2;

    expressionEditors.push(expressionAceEditor);
}
setupExpressionWatcher();

function shouldAnimate() {
    return $textBuffer.hasClass("active");
}

function showSessionView(sessionId) {
    var $player = $("#player");

    var $hiddenContainer = $player.children(".hiddenBuffer");
    var $hidden = $hiddenContainer.children(".innerText");

    var $active = $("#player .innerText.active");
    if( $active.data("sessionId") == sessionId ) {
        return;
    }

    if( $hidden.data("sessionId") == sessionId ) {
        // Swap buffers
        $active.removeClass ("active");
        $hiddenContainer.append($active);
        $hidden.insertBefore($hiddenContainer);
        $hidden.addClass("active");

        // Also make this the active buffer
        $textBuffer = $hidden;
    }
}

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

function contentReady() {

    // Expand to fit
    var $lastObj = $textBuffer.children().last();
    var bottomEdge = $lastObj.position().top + $lastObj.height();
    var newHeight = bottomEdge + 100;
    if( $textBuffer.height() < newHeight )
        $textBuffer.height(bottomEdge + 100);

    // Scroll to bottom?
    if( shouldAnimate() ) {
        var offset = newHeight - $("#main").height();
        if( offset > 0 && offset > $("#player").scrollTop() ) {
            $("#player").animate({
                scrollTop: offset
            }, 500);
        }
    }
}

function prepareForNewPlaythrough(sessionId) {

    $textBuffer = $("#player .hiddenBuffer .innerText");
    $textBuffer.data("sessionId", sessionId);

    $textBuffer.text("");
    $textBuffer.height(0);
}

function addTextSection(text)
{
    var $paragraph = $("<p class='storyText'></p>");

    // Split individual words into span tags, so that they can be underlined
    // when the user holds down the alt key, and so that they can be individually
    // clicked in order to jump to the source.
    var splitIntoSpans = text.split(" ");
    var textAsSpans = "<span>" + splitIntoSpans.join("</span> <span>") + "</span>";

    $paragraph.html(textAsSpans);

    // Keep track of the offset of each word into the content,
    // starting from the end of the last choice (it's global in the current play session)
    var previousContentLength = 0;
    var $existingLastContent = $textBuffer.children(".storyText").last();
    if( $existingLastContent ) {
        var range = $existingLastContent.data("range");
        if( range ) {
            previousContentLength = range.start + range.length + 1; // + 1 for newline
        }
    }
    $paragraph.data("range", {start: previousContentLength, length: text.length});

    // Append the actual content
    $textBuffer.append($paragraph);

    // Find the offset of each word in the content, for clickability
    var offset = previousContentLength;
    $paragraph.children("span").each((i, element) => {
        var $span = $(element);
        var length = $span.text().length;
        $span.data("range", {start: offset, length: length});
        offset += length + 1; // extra 1 for space
    });

    // Alt-click handler to jump to source
    $paragraph.find("span").click(function(e) {
        if( e.altKey ) {

            var range = $(this).data("range");
            if( range ) {
                var midOffset = Math.floor(range.start + range.length/2);
                events.jumpToSource(midOffset);
            }

            e.preventDefault();
        }
    });

    if( shouldAnimate() )
        fadeIn($paragraph);
}

function addChoice(choice, callback)
{
    var $choice = $("<a href='#'>"+choice.text+"</a>");

    // Append the choice
    var $choicePara = $("<p class='choice'></p>");
    $choicePara.append($choice);
    $textBuffer.append($choicePara);

    // Fade it in
    if( shouldAnimate() )
        fadeIn($choicePara);

    // When this choice is clicked...
    $choice.on("click", (event) => {

        var existingHeight = $textBuffer.height();
        $textBuffer.height(existingHeight);

        // Remove any existing choices, and add a divider
        $(".choice").remove();
        $textBuffer.append("<hr/>");

        event.preventDefault();

        callback();
    });
}

function addTerminatingMessage(message, cssClass)
{
    var $message = $(`<p class='${cssClass}'>${message}</p>`);
    $textBuffer.append($message);

    if( shouldAnimate() )
        fadeIn($message);
}

function addLongMessage(message, cssClass)
{
    var $message = $(`<pre class='${cssClass}'>${message}</pre>`);
    $textBuffer.append($message);

    if( shouldAnimate() )
        fadeIn($message);
}

function addHorizontalDivider()
{
    $textBuffer.append("<hr/>");
}

function addLineError(error, callback)
{
    var $aError = $("<a href='#'>Line "+error.lineNumber+": "+error.message+"</a>");
    $aError.on("click", callback);

    var $paragraph = $("<p class='error'></p>");
    $paragraph.append($aError);
    $textBuffer.append($paragraph);
}

function addEvaluationResult(result, error)
{   
    var $result;
    if( error ) {
        $result = $(`<div class="evaluationResult error"><span>${error}</span></div>`);
    } else {
        $result = $(`<div class="evaluationResult"><span>${result}</span></div>`);
    }
    $textBuffer.append($result);
}

function previewStepBack()
{
    var $lastDivider = $("#player .innerText.active").find("hr").last();
    $lastDivider.nextAll().remove();
    $lastDivider.remove();
}

function getTurnExpression()
{
    return expressionEditors[0].getValue();
}

exports.PlayerView = {
    setEvents: (e) => { events = e; },
    contentReady: contentReady,
    prepareForNewPlaythrough: prepareForNewPlaythrough,
    addTextSection: addTextSection,
    addChoice: addChoice,
    addTerminatingMessage: addTerminatingMessage,
    addLongMessage: addLongMessage,
    addHorizontalDivider: addHorizontalDivider,
    addLineError: addLineError,
    addEvaluationResult: addEvaluationResult,
    showSessionView: showSessionView,
    previewStepBack: previewStepBack,
    getTurnExpression: getTurnExpression
};  