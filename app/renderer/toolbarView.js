const {ipcRenderer} = require("electron");
const $ = window.jQuery = require('./jquery-2.2.3.min.js');
const i18n = require("./i18n.js");

// Overriden by external setButtonActions call
var events = {
    rewind:   () => {},
    stepBack: () => {},
    selectIssue: () => {}
};

function updateIssueSummary(issues, issueClickCallback) {

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
        "RUNTIME WARNING": 4,
        "TODO": 5
    };

    // Note: we're sorting the original array that 
    // was passed in from the caller... bad behaviour?
    // (it's kinda desirable though, since sorting will be
    // faster if we're leaving it sorted for next time)
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
                            <span class="icon icon-right-open-big"></span>
                          </div>`);

        $issueRow.click((e) => {
            events.selectIssue(issue);
            e.preventDefault();
        });

        $issuesTable.append($issueRow);
    });

    if( errorCount == 0 && warningCount == 0 && todoCount == 0 ) {
        $summary.addClass("hidden");
        $message.text(i18n._("No issues."));
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

$(document).ready(function() {

    $("#toolbar .nav-toggle.button").on("click", function(event) {
        events.toggleSidebar("#file-nav-wrapper", ".nav-toggle.button");
        event.preventDefault();
    });

    $("#toolbar .knot-toggle.button").on("click", function(event) {
        events.toggleSidebar("#knot-stitch-wrapper", ".knot-toggle.button");
        event.preventDefault();
    });

    $("#toolbar .nav-back.button").on("click", function(event) {
        events.navigateBack();
        event.preventDefault();
    });

    $("#toolbar .nav-forward.button").on("click", function(event) {
        events.navigateForward();
        event.preventDefault();
    });



    $("#toolbar .rewind.button").on("click", function(event) {
        events.rewind();
        event.preventDefault();
    });

    $("#toolbar .step-back.button").on("click", function(event) {
        events.stepBack();
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

    $(window).resize(updateIssuesPopupPosition);
});

function setTitle(title) {
    $("h1.title").text(title);

    // Not visible on macOS
    //ipcRenderer.setTitle(title);
}

function setBusySpinnerVisible(vis) {
    $(".busySpinner").css("display", vis ? "block" : "none");
}

exports.ToolbarView = {
    setEvents: (e) => { events = e; },
    updateIssueSummary: updateIssueSummary,
    clearIssueSummary: () => { updateIssueSummary([]); },
    setTitle: setTitle,
    setBusySpinnerVisible: setBusySpinnerVisible
}