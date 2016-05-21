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
            regex: /^(\s*)(TODO\b)([:\w\ \t]+)/,
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
        "#divert": [{
            // (->|<-)
            // (\s*)
            //      (DONE)
            //      (END)
            //      ((?:[\w\(\)\.,]+|\s+(?=[\w\(\)\.,]))+)
            //          which is:   
            //          [\w\(\)\.,]+   then   \s+, 
            //         (but only if not followed by more \w etc: don't capture last \s+)
            // (\s*)
            // ((?:->)(?!\s*\w+))?
            //    Final tunnel arrow, but not match if there are more things to divert to afterwards
            regex: /(->|<-)(\s*)(?:(DONE)|(END)|((?:[\w\(\)\.,]+|\s+(?=[\w\(\)\.,]))+))(\s*)((?:->)(?!\s*\w+))?/,
            token: [
                "divert.operator", // ->
                "divert",         // whitespace
                "divert.to-done", // DONE
                "divert.to-end",  // END
                "divert.target",  // knot_name(params)
                "divert",         // whitespace
                "divert.tunnel"   // ->   (terminating, for tunnels)
            ]
        }, {
            regex: /->->/,
            token: "divert.to-tunnel"
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
                regex: /^(\s*)(-)((?:\s?[^:\{}]+):)?/,
                token: [
                    "logic.multiline.branch",
                    "logic.multiline.branch.operator",
                    "logic.multiline.branch.condition"
                ],
                push: [{
                    token: "logic.multiline.branch",
                    regex: /$/,
                    next: "pop"
                }, {
                    include: "#mixedContent"
                }, {
                    defaultToken: "logic.multiline.branch.innerContent"
                }]
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
        "#mixedContent": [{
            include: "#inlineConditional"
        }, {
            include: "#inlineSequence"
        }, {
            include: "#inlineLogic"
        }, {
            include: "#divert"
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