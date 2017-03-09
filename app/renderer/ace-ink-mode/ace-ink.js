const oop = ace.require("ace/lib/oop");
const TextMode = ace.require("ace/mode/text").Mode;
const Tokenizer = ace.require("ace/tokenizer").Tokenizer;
const TextHighlightRules = ace.require("ace/mode/text_highlight_rules").TextHighlightRules;

var inkHighlightRules = function() {
    // regexp must not have capturing parentheses. Use (?:) instead.
    // regexps are ordered -> the first match is used

    this.$rules = {
        start: [{
            include: "#comments"
        }, {
            regex: /^(\s*)(={2,})(\s*)((?:function)?)(\s*)(\w+)(\s*)(\([\w,\s->]*\))?(\s*)((?:={1,})?)/,
            token: [
                "",
                "flow.knot.declaration.punctuation", // ===
                "flow.knot.declaration", // whitespace
                "flow.knot.declaration.function", // function (optional)
                "flow.knot.declaration", // whitespace
                "flow.knot.declaration.name", // knot_name
                "flow.knot.declaration", // whitespace
                "flow.knot.declaration.parameters", // (arg1, arg2)
                "flow.knot.declaration", // whitespace
                "flow.knot.declaration.punctuation" // ====
            ]
        }, {
            regex: /^(\s*)(=)(\s*)(\w+)(\s*)(\([\w,\s->]*\))?/,
            token: [
                "flow.stitch.declaration", // whitespace
                "flow.stitch.declaration.punctuation", // =
                "flow.stitch.declaration", // whitespace
                "flow.stitch.declaration.name", // stitch_name
                "flow.stitch.declaration", // whitespace
                "flow.stitch.declaration.parameters" // parameters
            ]
        }, {
            include: "#choice"
        }, {
            include: "#gather"
        }, {
            include: "#statements"
        }],
        "#TODO": [{
            regex: /^(\s*)(TODO\b)([:\w\ \t\"\,\;\(\)\'\.\-]+)/,
            token: [
                "todo", // whitespace
                "todo.TODO", // TODO
                "todo" // user text
            ]
        }],
        "#choice": [{
            regex: /^(\s*)((?:[\*\+]\s?)+)(\s*)(?:(\(\s*)(\w+)(\s*\)))?/,
            token: [
                "choice", // whitespace
                "choice.bullets", // * or +
                "choice", // whitespace
                "choice.label", // ( 
                "choice.label.name", // label_name
                "choice.label" // )
            ],

            // Sub section within choice
            push: [{
                token: "choice",
                regex: /$/,
                next: "pop"
            }, {
                include: "#comments"
            }, {
                token: [
                    "choice.weaveBracket",
                    "choice.weaveInsideBrackets",
                    "choice.weaveBracket"
                ],
                regex: /(\[)([^\]]*)(\])/
            }, {
                include: "#divert"
            }, {
                include: "#mixedContent"
            }, {
                defaultToken: "choice"
            }]
        }],
        "#comments": [{
            token: "punctuation.definition.comment.json",
            regex: /\/\*\*/,
            push: [{
                token: "punctuation.definition.comment.json",
                regex: /\*\//,
                next: "pop"
            }, {
                defaultToken: "comment.block.documentation.json"
            }]
        }, {
            token: "punctuation.definition.comment.json",
            regex: /\/\*/,
            push: [{
                token: "punctuation.definition.comment.json",
                regex: /\*\//,
                next: "pop"
            }, {
                defaultToken: "comment.block.json"
            }]
        }, {
            token: [
                "punctuation.definition.comment.json",
                "comment.line.double-slash.js"
            ],
            regex: /(\/\/)(.*$)/
        }],

        // Try different types of divert in sequence, since it's a bit complicated
        // to try to do it in one expression!
        // It's partly complicated because we need to parse it fairly accurately in
        // order to find the divert targets for hyperlinking.
        "#divert": [{
            // -> DONE|END
            regex: /(->|<-)(\s*)(DONE|END)(\s*)/,
            token: [
                "divert.operator",      // ->
                "divert",               // whitespace
                "divert.to-special",    // DONE / END
                "divert"               // whitespace
            ]
        }, {
            // Tunnel onwards
            regex: /(->->)(\s*)(\w[\w\.\s]*)/,
            token: [
                "divert.to-tunnel",      // ->->
                "divert",                // whitespace
                "divert.target"          // target.name
            ]
        }, {
            // Divert with parameters: -> knot (param, -> param2)
            regex: /(->|<-)(\s*)(\w[\w\.\s]*?)(\s*)(\()/,
            token: [
                "divert.operator",  // ->
                "divert",           // whitespace
                "divert.target",    // target.name
                "divert",           // whitespace
                "divert.operator",  // (
            ],
            push: [{
                // Divert target, as parameter to the current divert
                regex: /(->)(\s*)(\w[\w\.\s]*?)(\s*)(?![\w\.])/,
                token: [
                    "divert.parameter.operator",  // ->
                    "divert.parameter",           // whitespace
                    "divert.target",              // target.name
                    "divert.parameter"            // whitespace
                ]
            }, {
                // Explicitly parse function calls so that the close bracket
                // doesn't accidentally get parsed as the end of the parameters
                include: "#functionCallInDivertParameter"
            }, {
                regex: /\)/,
                token: "divert.parameter.operator",
                next: "pop"
            }, {
                defaultToken: "divert.parameter"
            }]
        }, {
            // Vanilla divert
            regex: /(->|<-)(\s*)(\w[\w\.\s]*?)(\s*)(?![\w\.])/,
            token: [
                "divert.operator",  // -> | <-
                "divert",           // whitespace
                "divert.target",              // target.name
                "divert"            // whitespace
            ]
        }, {
            // Divert to gather/choice point, or end of tunnel divert
            regex: /->/,
            token: "divert.operator"
        }],

        // Used to parse function calls within divert paramters so that
        // the closing bracket doesn't accidentally cause the rule to end early. 
        // Having it as a separate rule also allows it to be recursive.
        "#functionCallInDivertParameter": [{
            regex: /\w+\s*\(/,
            token: "divert.parameter",
            push: [{
                "include": "#functionCallInDivertParameter"
            }, {
                regex: /\)/,
                token: "divert.parameter",
                next: "pop"
            }, {
                defaultToken: "divert.parameter"
            }]
        }],

        "#gather": [{
            regex: /^(\s*)((?:-\s*)+)(?!>)(?:(\(\s*)(\w+)(\s*\)))?/,
            token: [
                "gather", // whitespace
                "gather.bullets", // - - 
                "gather.label", // (
                "gather.label.name", // label_name
                "gather.label" // )
            ]
        }],
        "#globalVAR": [{
            regex: /^(\s*)(VAR|CONST)\b/, // (\s*)(\w+)(\s*)
            token: [
                "var-decl", // whitespace
                "var-decl.keyword"
            ],
            
            push: [{
                regex: /(\s*)(\w+)(\s*)/,
                token: [
                    "var-decl", // whitespace
                    "var-decl.name",
                    "var-decl" // whitespace
                ]
            }, 

            // The rest of the assignment line
            { 
                regex: /$/,
                token: "var-decl",
                next: "pop"
            }, {
                defaultToken: "var-decl"
            }]
        }],
        "#listDef": [{
            regex: /(\s*)(LIST)/,
            token: [
                "list-decl", // whitespace
                "list-decl.keyword"
            ],
            push: [
                {
                    regex: /(\s*=\s*)/,
                    token: [
                        "list-decl"
                    ],
                    next: "#listItem"
                },
                {
                    regex: /$/,
                    next: "pop"
                },
                {
                    defaultToken: "list-decl"
                }
            ]
        }],

        "#listItemsSeparator": [{
            regex: /(\s*,\s*)/,
            token: ["list-decl"],
            next: "#listItem"
        }, {
            regex: /$/,
            token: [""],
            next: "start"
        }],

        "#listItem": [{
            regex: /([\w\(\)=\d\s]+)/,
            token: ["list-decl.item"],
            next: "#listItemsSeparator"
        }],
        "#INCLUDE": [{
            regex: /(\s*)(INCLUDE\b)/,
            token: [
                "include",
                "include.keyword"
            ],

            push: [{
                regex: /(\s*)([^\r\n]+)/,
                token: [
                    "include", // whitespace
                    "include.filepath"
                ]
            }, 

            // The rest of the assignment line
            { 
                regex: /$/,
                token: "include",
                next: "pop"
            }, {
                defaultToken: "include"
            }]
        }],

        "#EXTERNAL": [{
            regex: /(\s*)(EXTERNAL\b)/,
            token: [
                "external",
                "external.keyword"
            ],

            // The rest of the external line unline a newline
            push: [{
                regex: /(\s*)([^\r\n]+)/,
                token: [
                    "external", // whitespace
                    "external.declaration"
                ]
            }, 
            { 
                regex: /$/,
                token: "external",
                next: "pop"
            }, {
                defaultToken: "external"
            }]
        }],

        "#inlineConditional": [{
            regex: /(\{)([^:\|\}]+:)/,
            token: [
                "logic.punctuation",
                "logic.inline.conditional.condition"
            ],
            push: [{
                token: "logic.inline.conditional.punctuation",
                regex: /\}/,
                next: "pop"
            }, {
                token: "logic.inline.conditional.punctuation",
                regex: /\|/
            }, {
                include: "#mixedContent"
            }, {
                defaultToken: "logic.inline.innerContent"
            }]
        }],
        "#inlineSequence": [{
            regex: /(\{)(\s*)((?:~|&|!|\$)?)(?=[^\|\}]*\|)/, // Try look ahead to make sure there's a pipe char
            token: [
                "logic.punctuation", // {
                "logic.sequence", // whitespace
                "logic.sequence.operator" // sequence type char (~&!$)
            ],
            push: [{
                token: "logic.punctuation", // }
                regex: /\}/,
                next: "pop"
            }, {
                token: "logic.sequence.punctuation", // | (but not ||)
                regex: /\|(?!\|)/
            }, {
                include: "#mixedContent"
            }, {
                defaultToken: "logic.sequence.innerContent"
            }]
        }],
        "#inlineLogic": [{
            token: "logic.punctuation",
            regex: /\{/,
            push: [{
                token: "logic.punctuation",
                regex: /\}/,
                next: "pop"
            }, {
                defaultToken: "logic.inline"
            }]
        }],
        "#multiLineLogic": [{
            regex: /^(\s*)(\{)(?:([^}:]+)(:))?(?=[^}]*$)/,
            token: [
                "logic", // whitespace
                "logic.punctuation", // {
                "logic.conditional.multiline.condition", // optional initial condition
                "logic.conditional.multiline.condition.punctuation" // :
            ],
            push: [{
                token: "logic.punctuation",
                regex: /\}/,
                next: "pop"
            }, {
                regex: /^\s*else\s*\:/,
                token: "conditional.multiline.else"
            }, {
                regex: /^(\s*)(-)(?!>)((?:\s?[^:\{}]+):)?/,
                token: [
                    "logic.multiline.branch",
                    "logic.multiline.branch.operator",
                    "logic.multiline.branch.condition"
                ]
            }, {
                include: "#statements"
            }, {
                defaultToken: "logic.multiline.innerContent"
            }]
        }],
        "#logicLine": [{
            token: "logic.tilda",
            regex: /\s*~\s*.*$/
        }],
        "#tags": [{
            token: "tag",
            regex: /#.*/
        }],
        "#mixedContent": [{
            include: "#inlineConditional"
        }, {
            include: "#inlineSequence"
        }, {
            include: "#inlineLogic"
        }, {
            include: "#logicLine"
        }, {
            include: "#divert"
        }, {
            include: "#tags"
        }, {
            token: "glue",
            regex: /<>/
        }],
        "#statements": [{
            include: "#comments"
        }, {
            include: "#TODO"
        }, {
            include: "#globalVAR"
        }, {
            include: "#listDef"
        }, {
            include: "#EXTERNAL"
        }, {
            include: "#INCLUDE"
        }, {
            include: "#choice"
        }, {
            include: "#gather"
        }, {
            include: "#multiLineLogic"
        }, {
            include: "#endOfSection"
        }, {
            include: "#logicLine"
        }, {
            include: "#mixedContent"
        }]
    }
    
    this.normalizeRules();
};

inkHighlightRules.metaData = {
    fileTypes: ["ink", "ink2"],
    name: "ink",
    scopeName: "source.ink"
}

oop.inherits(inkHighlightRules, TextHighlightRules);

var InkMode = function() {
    this.HighlightRules = inkHighlightRules;
};
oop.inherits(InkMode, TextMode);

(function() {
    // configure comment start/end characters
    this.lineCommentStart = "//";
    this.blockComment = {start: "/*", end: "*/"};

    this.$id = "ace/mode/ink"
}).call(InkMode.prototype);

exports.InkMode = InkMode;
