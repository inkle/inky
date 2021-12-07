const fs = require('fs');
const path = require('path');

// Find longer snippets folder
const snippetsDirRelease = path.join(__dirname, "../../app.asar.unpacked/main-process", "ink/longer-ink-snippets");
const snippetsDirDev = path.join(__dirname, "ink/longer-ink-snippets");

var snippetsDir = snippetsDirRelease;
try { fs.accessSync(snippetsDir) }
catch(e) {
    snippetsDir = snippetsDirDev;
}

function loadLongerSnippet(inkFilename) {
    var inkContent = fs.readFileSync(path.join(snippetsDir, inkFilename));
    return inkContent+"\n";
}

//-------------------
// STYLE GUIDELINE
// PLEASE READ!
//-------------------
// For multi-line style snippets please include a final newline (\n)
// so that they appear as a full block. This includes snippets that
// are single but full lines (e.g. choices).
// The only time you shouldn't put a newline on the end is if the
// snippet is definitely meant to be insert into the middle of
// a line (such as an inline conditional).
//
// You can use {separator: true} either in the category or individual
// snippet lists to insert a separator in the menu.

exports.snippets = [

    //-------------------
    // Basic structure
    //-------------------
    {
        categoryName: "Basic structure",
        snippets: [
            {
                name: "Knot (main section)",
                ink: "=== knotName ===\n"
                    +"This is the content of the knot.\n"
                    +"-> END\n"
            },
            {
                name: "Stitch (sub-section)",
                ink: "= stitchName\n"
                    +"This is the content of the stitch that should be embedded within a knot.\n"
                    +"-> END\n"
            },
            {separator: true},
            {
                name: "Divert",
                ink: "-> targetKnotName"
            },
            {
                name: "Ending indicator",
                ink: "-> END\n"
            }
        ]
    },

    //-------------------
    // CHOICES
    //-------------------
    {
        categoryName: "Choices",
        snippets: [
            {
                name: "Basic Choice",
                ink:  "* This is a choice that can only be chosen once\n"
            },
            {
                name: "Sticky choice",
                ink: "+ This is a sticky choice - the player can choose it more than once\n"
            },
            {
                name: "Choice without printing",
                ink: "* [A choice where the content isn't printed after choosing]\n"
            },
            {
                name: "Choice with mixed output",
                ink: "* Try [it] this example!\n"
            },
        ]
    },

    //-------------------
    // VARIABLES
    //-------------------
    {
        categoryName: "Variables",
        snippets: [
            {
                "name": "Global variable",
                "ink": "VAR myNumber = 5\n"
            },
            {
                "name": "Temporary variable",
                "ink": "temp myTemporaryValue = 5\n"
            },
            {
                "name": "Modify variable",
                "ink": "~ myNumber = myNumber + 1\n"
            },

        ]
    },

    //-------------------
    // INLINE LOGIC
    //-------------------
    {
        categoryName: "Inline logic",
        snippets: [
            {
                name: "Condition",
                ink: "{yourVariable: This is written if yourVariable is true|Otherwise this is written}"
            }
        ]
    },

    //-------------------
    // MULTI-LINE LOGIC
    //-------------------
    {
        categoryName: "Multi-line logic",
        snippets: [
            {
                name: "Condition",
                ink: "{yourVariable:\n"+
                     "    This is written if yourVariable is true.\n"+
                     "  - else:\n"+
                     "    Otherwise this is written.\n"+
                     "}\n"
            }
        ]
    },

    //-------------------
    // COMMENTS
    //-------------------
    {
        categoryName: "Comments",
        snippets: [
            {
                name: "Single-line comment",
                ink: "// This line is a comment.\n"
            }, 
            {
                name: "Block comment",
                ink: "/* ---------------------------------\n"+
                     "\n" +
                     "   This whole section is a comment \n"+
                     "\n" +
                     " ----------------------------------*/\n"
            }
        ]
    },

    {separator: true},

    //-------------------
    // LIST FUNCTIONS
    //-------------------
    {
        categoryName: "List-handling",
        snippets: [
            {
                name: "List: pop",
                ink:  loadLongerSnippet("list_pop.ink") 
            },
            {
                name: "List: pop_random",
                ink:  loadLongerSnippet("list_pop_random.ink") 
            },
            {
                name: "List: list_item_is_member_of",
                ink:  loadLongerSnippet("list_item_is_member_of.ink") 
            },
            {
                name: "List: list_random_subset",
                ink:  loadLongerSnippet("list_random_subset.ink") 
            },
            {
                name: "List: list_random_subset_of_size",
                ink:  loadLongerSnippet("list_random_subset_of_size.ink") 
            },
            {
                name: "List: string_to_list",
                ink:  loadLongerSnippet("string_to_list.ink") 
            }
        ]
    },

    //-------------------
    // USEFUL FUNCTIONS
    //-------------------

    {
        categoryName: "Useful functions",
        snippets: [
            {
                name: "Logic: maybe",
                ink:  loadLongerSnippet("maybe.ink") 
            },
            {separator: true},
            {
                name: "Flow: came_from",
                ink:  loadLongerSnippet("came_from.ink") 
            },
            {
                name: "Flow: seen_very_recently",
                ink:  loadLongerSnippet("seen_very_recently.ink") 
            },
            {
                name: "Flow: seen_more_recently_than",
                ink:  loadLongerSnippet("seen_more_recently_than.ink") 
            },
            {
                name: "Flow: seen_this_scene",
                ink:  loadLongerSnippet("seen_this_scene.ink") 
            },
            {
                name: "Flow: thread_in_tunnel",
                ink:  loadLongerSnippet("thread_in_tunnel.ink") 
            },
            {separator: true},
            {
                name: "Printing: UPPERCASE",
                ink:  loadLongerSnippet("uppercase.ink") 
            },
            {
                name: "Printing: print_number",
                ink:  loadLongerSnippet("print_number.ink") 
            },
            {
                name: "Printing: list_with_commas",
                ink:  loadLongerSnippet("list_with_commas.ink") 
            }
        ]
    },
    {
        categoryName: "Useful systems",
        snippets: [
            {
                name: "Swing Variables",
                ink:  loadLongerSnippet("swing_variables.ink") 
            }
        ]
    },

    {separator: true},

    {
        categoryName: "Full stories",
        snippets: [
            {
                name: "Crime Scene (from Writing with Ink)",
                ink: loadLongerSnippet("murder_scene.ink")
            },
            {
                name: "Pontoon Game (from Overboard!)",
                ink: loadLongerSnippet("pontoon_example.ink")
            },
            {
                name: "The Intercept",
                ink: loadLongerSnippet("theintercept.ink")
            }
        ]
    }
];