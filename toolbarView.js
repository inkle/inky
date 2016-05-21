const $ = window.jQuery = require('./jquery-2.2.3.min.js');

// Overriden by external setButtonActions call
var buttonActions = {
    rewind:   () => {},
    stepBack: () => {}
};

$("#toolbar .rewind.button").on("click", function(event) {
    buttonActions.rewind();
    event.preventDefault();
});

$("#toolbar .step-back.button").on("click", function(event) {
    buttonActions.stepBack();
    event.preventDefault();
});

$(document).ready(function() {

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

});

exports.ToolbarView = {
    setButtonActions: (actions) => {
        buttonActions = actions;
    }
}