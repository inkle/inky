const $ = window.jQuery = require('./jquery-2.2.3.min.js');
const path = require("path");
const _ = require("lodash");
const i18n = require("./i18n.js");
const InkFile = require("./inkFile.js").InkFile;
const { range, toInteger } = require('lodash');

const slideAnimDuration = 200;
var sidebarWidth = 200;

var $sidebar = null;
var $fileNavWrapper = null;
var $knotStichNavWrapper = null;
var $twoPane = null;
var $footer = null;
var $newIncludeForm = null;

var $currentNavWrapper = null

var visible = false;
var hasBeenShown = false;
var events = {};

$(document).ready(() => {
    //Assign each variable to the allocated class/id.
    $sidebar = $(".sidebar");
    $fileNavWrapper = $sidebar.find("#file-nav-wrapper");
    $knotStichNavWrapper = $sidebar.find("#knot-stitch-wrapper")
    $twoPane = $(".twopane");
    $sidebarSplit = $("#main").children(".split");
    $sidebarSplit.hide();
    $sidebarSplit.css("left", 0);
    $footer = $sidebar.find(".footer");

    // Clicking on navigation item
    $fileNavWrapper.on("click", ".nav-group-item", function(event) {
        // Any clicked navigation item should become highlighted
        event.preventDefault();
        var $targetNavGroupItem = $(event.currentTarget);
        highlight$NavGroupItem($targetNavGroupItem);

        var fileIdStr = $targetNavGroupItem.attr("data-file-id");
        var fileId = parseInt(fileIdStr);
        events.clickFileId(fileId);
    });
    $knotStichNavWrapper.on("click", ".nav-group-item", function(event) {
        // Any clicked navigation item should become highlighted
        event.preventDefault();
        var $targetNavGroupItem = $(event.currentTarget);
        var row = $targetNavGroupItem.attr("row");
        events.jumpToRow(parseInt(row))
    });

    // Add new include interactions
    $newIncludeForm = $footer.find(".new-include-form");
    $sidebar.on("click", ".add-include-button", function(event) {
        setIncludeFormVisible(true);
        event.preventDefault();
    });
    $sidebar.on("click", "#cancel-add-include", function(event) {
        setIncludeFormVisible(false);
        event.preventDefault();
    })

    function confirmAddInclude() {
        var $inputBox = $newIncludeForm.find("input[type='text']");
        var $addToMainInkCheckbox = $newIncludeForm.find(".add-to-main-ink input");

        var confirmedFilename = $inputBox.val();
        if( !confirmedFilename || confirmedFilename.trim().length == 0 ) {
            $inputBox.addClass("error");
            setImmediate(() => $inputBox.focus());
        } else {
            
            var shouldAddToMainInk = $addToMainInkCheckbox.get(0).checked;
            var success = events.addInclude(confirmedFilename, shouldAddToMainInk);
            if( success ) setIncludeFormVisible(false);
        }
    }

    $sidebar.on("keypress", "input", function(event) {
        const returnKey = 13;
        if( event.which == returnKey ) {
            confirmAddInclude();
            event.preventDefault();
        }
    });
    $sidebar.on("click", "#add-include", function(event) {
        event.preventDefault();
        confirmAddInclude();
    })

    // Unfortunately you can't capture escape from the input itself
    $(document).keyup(function(e) {
        const escape = 27;
        if (e.keyCode == escape) {
            if( $newIncludeForm.find("input").is(":focus") ) {
                e.preventDefault();
                setIncludeFormVisible(false);
            }
        }
    });

    $(document).on("click", function(e) {
        var $target = $(e.target);
        if( $footer.hasClass("showingForm") && $target.closest(".footer").length == 0 && $target.closest(".split") == 0 ) {
            setIncludeFormVisible(false);
            e.preventDefault();
        }
    });
});

function setMainInkFilename(name) {
    $fileNavWrapper.find(".nav-group.main-ink .nav-group-item .filename").text(name);
}

function setKnots(mainInk){
//Parse the symbols before setting the knots
//TODO: Improved implementation of symbols/when they parse
//may make this unneeded. This may improve performance, 
//as currently it parses whenever the user types
//anything! 
    mainInk.symbols.parse();
    var ranges = mainInk.symbols.rangeIndex;

    $knotStichNavWrapper.empty();

    if (ranges.length == 0) {
        var contentLoc = i18n._('Content');
        var descriptionLoc = i18n._('Knots, stitches and functions are indexed here')

        var $content = $(
          `<nav class="nav-group"><h5 class="nav-group-title">${contentLoc}</h5></nav>` +
            `<nav class="nav-group"><span class="nav-group-item nav-tooltip">${descriptionLoc}</span></nav>`
        );
        
        $knotStichNavWrapper.append($content);

        return;
    }
    
    var extraClass = ""

    var externalsList = getExternals(mainInk);
    
    var $content = $(`<nav class="nav-group"><h5 class="nav-group-title">Content</h5></nav>`);
    var $functions = $(`<nav class="nav-group"><h5 class="nav-group-title">Functions</h5></nav>`);
    var $externals = $(`<nav class="nav-group"><h5 class="nav-group-title">Externals</h5></nav>`);

    var foundContent = false; 
    var foundFunctions = false;

    // $knotStichNavWrapper.append($main);
    //For every knots (Ranges is knot and functions)
    ranges.forEach(range => {
        var symbol = range.symbol;
        var extraClass = "knot"
        if (symbol.isfunc) foundFunctions = true; else foundContent = true;
        var icon = symbol.isfunc ? "ink-icon icon-function-scaled" : "ink-icon icon-knot-scaled"
        var items = `<span class="nav-group-item ${extraClass}" row = "${symbol.row}">
        <span class="icon ${icon}"></span>
                <span class="filename">${symbol.name}</span>
            </span>`;
        //If the knot has any symbols inside of it.
        if (symbol.innerSymbols){
            //For every stitch inside the knot
            Object.keys(symbol.innerSymbols).forEach((innerSymbolName) => {
                var innerSymbol = symbol.innerSymbols[innerSymbolName]
                if (innerSymbol.flowType.name == "Stitch"){
                    var extraClass = "stitch";
                    items += 
                    `<span class="nav-group-item ${extraClass}" row = "${innerSymbol.row}">
                    <span class="icon ink-icon icon-stitch-scaled"></span>
                            <span class="filename">${innerSymbol.name}</span>
                        </span>`;
                }
            });

        }

        extraClass = "";
        var $group = $(`<nav class="nav-group ${extraClass}"> ${items} </nav>`);

        if (symbol.isfunc) {
            if (externalsList.has(symbol.name)) 
                $externals.append($group);
            else
                $functions.append($group);
        }
        else 
            $content.append($group);
    });

    if (foundContent)
        $knotStichNavWrapper.append($content);
    if (foundFunctions)
        $knotStichNavWrapper.append($functions);
    if (externalsList.size > 0) 
        $knotStichNavWrapper.append($externals);
}

function updateCurrentKnot(mainInk, cursorPos){
    var symbols = mainInk.symbols.flowAtPos(cursorPos);
    if (!symbols) return;

    let $currentKnot = null;
    if ("Knot" in symbols){
        $currentKnot = $(`[row=${symbols["Knot"].row}]`);
        if (symbols["Knot"].isfunc){
            $currentKnot.addClass("function")
        }
    }

    let $currentStitch = null;
    if ("Stitch" in symbols){
        $currentStitch = $(`[row=${symbols["Stitch"].row}]`);
    }

    if (($currentKnot && $currentKnot.hasClass("active"))&&($currentStitch && $currentStitch.hasClass("active")))
        return;

    $knotStichNavWrapper.find(".nav-group-item.active").removeClass("active");
    if ($currentKnot && $currentKnot.length !== 0){
        $currentKnot.addClass("active");
        $currentKnot[0].scrollIntoViewIfNeeded();


    }
    if ($currentStitch && $currentStitch.length !== 0){
        $currentStitch.addClass("active");
        $currentStitch[0].scrollIntoViewIfNeeded();
    }
}

function setFiles(mainInk, allFiles) {
    var unusedFiles = _.filter(allFiles, f => f.isSpare);
    var normalIncludes = _.filter(allFiles, f => !f.isSpare && f != mainInk);
    var groupedIncludes = _.groupBy(normalIncludes, f => { 
        var dirName = path.dirname(f.relativePath());
        if( dirName == "." )
            dirName = "";
        return dirName;
    });

    var groupsArray = _.map(groupedIncludes, (group, name) => { return {name: name, files: group}; });
    groupsArray.sort((a,b) => a.name.localeCompare(b.name));

    if( unusedFiles.length > 0 )
        groupsArray.push({
            name: i18n._("Unused files"),
            files: unusedFiles
        });

    $fileNavWrapper.empty();
    
    var extraClass = "";
    if( mainInk.hasUnsavedChanges ) extraClass = "unsaved";
    if( mainInk.isLoading ) extraClass += " loading";

    var $main = `<nav class="nav-group main-ink">
                    <h5 class="nav-group-title">Main ink file</h5>
                    <a class="nav-group-item ${extraClass}" data-file-id="${mainInk.id}">
                        <span class="icon icon-book"></span>
                        <span class="filename">${mainInk.filename()}</span>
                    </a>
                </nav>`;
    $fileNavWrapper.append($main);
    var nonMainFileActive = false;
    groupsArray.forEach(group => {
        var items = "";

        group.files.forEach((file) => {
            var name = file.isSpare ? file.relativePath() : file.filename();
            
            var extraClass = "";
            if( file.hasUnsavedChanges ) extraClass = "unsaved";
            if( file.isLoading ) extraClass += " loading";
            
            items = items + `<span class="nav-group-item ${extraClass}" data-file-id="${file.id}">
            <span class="icon icon-doc-text"></span>
            <span class="filename">${name}</span>
            </span>`;
        });

        extraClass = "";
        if( group.files === unusedFiles )
            extraClass = "unused";

        var $group = $(`<nav class="nav-group ${extraClass}"><h5 class="nav-group-title">${group.name}</h5> ${items} </nav>`);
        $fileNavWrapper.append($group);
    });
    
}

function highlight$NavGroupItem($navGroupItem) {
    $fileNavWrapper.find(".nav-group-item").not($navGroupItem).removeClass("active");
    $navGroupItem.addClass("active");
}

function highlightRelativePath(relativePath) {
    var dirName = path.dirname(relativePath);
    if( dirName == "." )
        dirName = "";

    var filename = path.basename(relativePath);

    var $group = $fileNavWrapper.find(".nav-group").filter((i, el) => $(el).find(".nav-group-title").text() == dirName);
    if( dirName == "" ) $group = $group.add(".nav-group.main-ink");

    var $file = $group.find(".nav-group-item .filename").filter((i, el) => $(el).text() == filename);
    var $navGroupItem = $file.closest(".nav-group-item");
    highlight$NavGroupItem($navGroupItem);
}

function hideSidebar() {
    if( !visible )
        return;
    
    animateSidebar(0);

    visible = false;
}

function showSidebar(columns) {
    if (!columns) columns = 1;    
    if( ! visible )
    {
    
        hasBeenShown = true;

        // hidden class only exists in initial state
        $sidebar.removeClass("hidden");
        $sidebarSplit.removeClass("hidden");

        $sidebar.show();
        $sidebarSplit.show();
    }
    animateSidebar(columns);
    visible = true;
}

function animateSidebar(columns) {
    
    $sidebar.animate({
        width: (columns * sidebarWidth)-1 // border
    }, slideAnimDuration, () => {
        if (columns == 0)
            $sidebar.hide();    
    });
    $twoPane.animate({
        left: (columns * sidebarWidth)
    }, slideAnimDuration);
    $sidebarSplit.animate({
        left:  (columns * sidebarWidth)
    }, slideAnimDuration);

    if (columns > 0) {
        var $navElements =  $(".nav-wrapper");
        var widthStepPercent = (100 / columns);

        let widthCss = "calc("+widthStepPercent+"% - 1px)"; // leave space for a 1 px border
        $footer.width(widthCss);
        $navElements.width(widthCss);

        var leftPosPercent = 0;
        var el;
        for (var idx = 0 ; idx < $navElements.length; idx++) {
            el = $($navElements[idx]);
            if (!el.hasClass("hidden")) 
            {
                el.animate({
                    left: (leftPosPercent + "%")
                }, 0 );  
                leftPosPercent += widthStepPercent;  
            }
        }
    }

}


function setIncludeFormVisible(visible) {
    var $inputBox = $newIncludeForm.find("input[type='text']");
    if( visible ) {
        $inputBox.val("");
        $inputBox.removeClass("error");
        $footer.addClass("showingForm");
        $inputBox.focus();
    } else {
        $inputBox.blur();
        $inputBox.removeClass("error");
        $footer.removeClass("showingForm");
    }
}

function toggle(id, buttonId){

    var $button = $("#toolbar " + buttonId);
    var $thisPanel = $(id);

    var columns =  2 - $(".nav-wrapper.hidden").length;
    if (columns > 0 && !$sidebarSplit.is(':animated'))
        sidebarWidth =  $sidebarSplit.position().left / columns; 

    

    if ($thisPanel.hasClass("hidden")) {
        columns++;
        $thisPanel.removeClass("hidden");
        if ($thisPanel.hasClass("hasFooter")) 
            $footer.removeClass("hidden");
        $button.addClass("selected");
    } else {
        columns--;
        $thisPanel.addClass("hidden");
        if ($thisPanel.hasClass("hasFooter")) 
            $footer.addClass("hidden"); 
        $button.removeClass("selected");     
    }

   
    if (columns == 0) {
        hideSidebar();
    } else { 
        showSidebar(columns);
   
    }

 
}



// Helper function that gets all the external function names from a list of InkFiles
function getExternals(file) {
    return file.symbols.getCachedExternals();
}

exports.NavView = {
    setMainInkFilename: setMainInkFilename,
    setFiles: setFiles,
    setKnots: setKnots,
    updateCurrentKnot: updateCurrentKnot,
    highlightRelativePath: highlightRelativePath,
    setEvents: e => events = e,
    hide: hideSidebar,
    show: showSidebar,
    initialShow: () => { if( !hasBeenShown ) 
        toggle("#file-nav-wrapper");
    },
    toggle: toggle,
    showAddIncludeForm: () => setIncludeFormVisible(true)
}

