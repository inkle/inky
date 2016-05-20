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
            token: [
                "divert.operator",
                "divert",
                "divert.to-done",
                "divert.to-end",
                "divert.target"
            ],
            regex: /(->|<-)(\s*)(?:(DONE)|(END)|([\w\d\.,\(\)\ \t]+))/
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
        "#inlineConditional": [{
            token: [
                "keyword.operator.inlineConditionalStart",
                "entity.inlineConditional"
            ],
            regex: /(\{)([^:\|\}]+:)/,
            push: [{
                token: "keyword.operator.inlineConditionalEnd",
                regex: /\}/,
                next: "pop"
            }, {
                token: "keyword.operator.inlineConditionalBranchSeparator",
                regex: /\|/
            }, {
                include: "#mixedContent"
            }, {
                defaultToken: "entity.inlineConditional"
            }]
        }],
        "#inlineLogic": [{
            token: "keyword.operator.inlineLogicStart",
            regex: /\{/,
            push: [{
                token: "keyword.operator.inlineLogicEnd",
                regex: /\}/,
                next: "pop"
            }, {
                defaultToken: "meta.logic"
            }]
        }],
        "#inlineSequence": [{
            token: [
                "keyword.operator.inlineSequenceStart",
                "entity.inlineSequence",
                "keyword.operator.inlineSequenceTypeChar"
            ],
            regex: /(\{)(\s*)((?:~|&|!|\$)?)(?=[^\|]*\|(?!\|)[^\}]*\})/,
            push: [{
                token: "keyword.operator.inlineSequenceEnd",
                regex: /\}/,
                next: "pop"
            }, {
                token: "keyword.operator.inlineSequenceSeparator",
                regex: /\|(?!\|)/
            }, {
                include: "#mixedContent"
            }, {
                defaultToken: "entity.inlineSequence"
            }]
        }],
        "#logicLine": [{
            token: "meta.logic",
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
            token: "constant.glue",
            regex: /<>/
        }],
        "#multiLineLogic": [{
            token: [
                "meta.multilineLogic",
                "keyword.operator.logic",
                "meta.multilineLogic",
                "keyword.operator.logic"
            ],
            regex: /^(\s*)(\{)(?:([\w_\s\*\/\-\+\&\|\%\<\>\.\(\)]+)(:))?(?=[^}]+$)/,
            push: [{
                token: "keyword.operator",
                regex: /\}/,
                next: "pop"
            }, {
                token: "conditional.else",
                regex: /^\s*else\s*\:/
            }, {
                token: [
                    "conditional.clause",
                    "keyword.operator",
                    "conditional.clause",
                    "keyword.operator"
                ],
                regex: /^(\s*)(-)(\s?[^:]+)(:)/,
                push: [{
                    token: "conditional.clause",
                    regex: /$/,
                    next: "pop"
                }, {
                    include: "#mixedContent"
                }, {
                    defaultToken: "conditional.clause"
                }]
            }, {
                include: "#statements"
            }, {
                defaultToken: "meta.multilineLogic"
            }]
        }],
        "#statements": [{
            include: "#comments"
        }, {
            include: "#TODO"
        }, {
            include: "#globalVAR"
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