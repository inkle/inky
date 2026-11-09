"use strict";

const OPEN = { b: "⟦b⟧", i: "⟦i⟧" };
const CLOSE = { b: "⟦/b⟧", i: "⟦/i⟧" };

function baseTokenType(type) {
    return String(type || "").replace(/\.rich(?:Bold|Italic)/g, "");
}

// Formatting is for the plain story text only: the narrative lines. Choices, gathers, tags, logic,
// comments and every other line of the ink stay plain.
function isEligibleType(type) {
    return baseTokenType(type) === "text";
}

// A choice line starts with * or + (nested choices repeat them: "* * text"). The whole line is plain.
function isChoiceLine(line) {
    return /^\s*[*+]/.test(line);
}

// A gather starts with - (but "->" is a divert). The whole line is plain.
function isGatherLine(line) {
    return /^\s*-(?!>)/.test(line);
}

function parseLine(line, tokens) {
    const eligible = new Array(line.length).fill(false);
    if( isChoiceLine(line) || isGatherLine(line) ) return { pairs: [], eligible, styles: new Array(line.length) };
    let offset = 0;
    (tokens || []).forEach(token => {
        const end = Math.min(line.length, offset + token.value.length);
        if( isEligibleType(token.type) ) {
            for( let i = offset; i < end; i++ ) eligible[i] = true;
        }
        offset = end;
    });

    const stack = [];
    const pairs = [];
    for( let i = 0; i < line.length; ) {
        let matched = false;
        for( const tag of ["b", "i"] ) {
            const marker = OPEN[tag];
            if( line.startsWith(marker, i) && isEligibleRange(eligible, i, marker.length) ) {
                stack.push({ tag, start: i, contentStart: i + marker.length });
                i += marker.length;
                matched = true;
                break;
            }
        }
        if( matched ) continue;

        for( const tag of ["b", "i"] ) {
            const marker = CLOSE[tag];
            if( line.startsWith(marker, i) && isEligibleRange(eligible, i, marker.length) ) {
                if( stack.length && stack[stack.length - 1].tag === tag ) {
                    const open = stack.pop();
                    pairs.push({
                        tag,
                        openStart: open.start,
                        openEnd: open.contentStart,
                        contentStart: open.contentStart,
                        contentEnd: i,
                        closeStart: i,
                        closeEnd: i + marker.length
                    });
                }
                i += marker.length;
                matched = true;
                break;
            }
        }
        if( !matched ) i++;
    }

    const styles = new Array(line.length);
    for( let i = 0; i < line.length; i++ ) {
        if( !eligible[i] ) continue;
        let bold = false, italic = false;
        pairs.forEach(pair => {
            if( i >= pair.contentStart && i < pair.contentEnd ) {
                if( pair.tag === "b" ) bold = true;
                else italic = true;
            }
        });
        if( bold || italic ) styles[i] = { bold, italic };
    }
    return { pairs, eligible, styles };
}

function isEligibleRange(eligible, start, length) {
    if( start + length > eligible.length ) return false;
    for( let i = start; i < start + length; i++ ) if( !eligible[i] ) return false;
    return true;
}

function decorateTokens(line, tokens) {
    const parsed = parseLine(line, tokens);
    const result = [];
    let offset = 0;
    (tokens || []).forEach(token => {
        let runStart = 0;
        let runStyle = null;
        const emit = end => {
            if( end <= runStart ) return;
            let type = baseTokenType(token.type);
            if( runStyle ) {
                if( runStyle.bold ) type += ".richBold";
                if( runStyle.italic ) type += ".richItalic";
            }
            result.push({ type, value: token.value.slice(runStart, end) });
            runStart = end;
        };
        for( let i = 0; i < token.value.length; i++ ) {
            const style = parsed.styles[offset + i] || null;
            if( i === 0 ) {
                runStyle = style;
            } else if( !sameStyle(runStyle, style) ) {
                emit(i);
                runStyle = style;
            }
        }
        emit(token.value.length);
        offset += token.value.length;
    });
    return result;
}

function sameStyle(a, b) {
    return (!a && !b) || (!!a && !!b && a.bold === b.bold && a.italic === b.italic);
}

function markerAt(session, row, column) {
    return (session.$richTextFolds || []).find(fold =>
        fold.start.row === row && (fold.start.column === column || fold.end.column === column));
}

function markerCoversColumn(session, row, column) {
    return (session.$richTextFolds || []).some(fold =>
        fold.start.row === row && column >= fold.start.column && column < fold.end.column);
}

function removeRange(session, range) {
    if( range.start.row === range.end.row && range.start.column >= range.end.column ) return;
    session.doc.remove(range);
}

function install(editor, Range) {
    const sessionFolds = new WeakMap();
    const originalRemove = editor.remove;
    const originalInsert = editor.insert;
    const originalRemoveWordLeft = editor.removeWordLeft;
    const originalRemoveWordRight = editor.removeWordRight;
    let pendingFormats = {};
    let lastCursor = editor.getCursorPosition();

    function clearPendingFormats() {
        pendingFormats = {};
    }

    function syncSession(session, firstRow, lastRow) {
        if( session.$richTextCleaning ) return;
        let folds = sessionFolds.get(session);
        if( !folds ) {
            folds = [];
            sessionFolds.set(session, folds);
            session.$richTextFolds = folds;
        }

        const validFolds = session.getAllFolds();
        folds = folds.filter(fold => validFolds.indexOf(fold) !== -1);
        for( let i = folds.length - 1; i >= 0; i-- ) {
            const fold = folds[i];
            if( fold.start.row >= firstRow && fold.start.row <= lastRow ) {
                session.removeFold(fold);
                folds.splice(i, 1);
            }
        }

        const start = Math.max(0, firstRow);
        const end = Math.min(session.getLength() - 1, lastRow);
        for( let row = start; row <= end; row++ ) {
            const line = session.getLine(row);
            const parsed = parseLine(line, session.getTokens(row));
            parsed.pairs.forEach(pair => {
                [
                    new Range(row, pair.openStart, row, pair.openEnd),
                    new Range(row, pair.closeStart, row, pair.closeEnd)
                ].forEach(range => {
                    session.addFold("", range);
                    const fold = session.getAllFolds().find(item =>
                        item.start.row === row && item.start.column === range.start.column &&
                        item.end.row === row && item.end.column === range.end.column);
                    if( fold && folds.indexOf(fold) === -1 ) folds.push(fold);
                });
            });
        }
        session.$richTextFolds = folds;
    }

    // Ace turns every fold into at least one placeholder cell when it measures a wrapped line,
    // even when the placeholder is empty and draws nothing. Each hidden marker would then push the
    // wrap point one cell too far, cutting words in half. Empty placeholders must take no width.
    const PLACEHOLDER_START = 3, PLACEHOLDER_BODY = 4;
    function updateWrapData(firstRow, lastRow) {
        const lines = this.doc.getAllLines();
        const tabSize = this.getTabSize();
        const wrapData = this.$wrapData;
        const wrapLimit = this.$wrapLimit;
        let foldLine;
        let row = firstRow;
        lastRow = Math.min(lastRow, lines.length - 1);
        while( row <= lastRow ) {
            foldLine = this.getFoldLine(row, foldLine);
            if( !foldLine ) {
                wrapData[row] = this.$computeWrapSplits(this.$getDisplayTokens(lines[row]), wrapLimit, tabSize);
                row++;
                continue;
            }
            let tokens = [];
            foldLine.walk((placeholder, walkRow, column, lastColumn) => {
                let walkTokens;
                if( placeholder != null ) {
                    walkTokens = placeholder ? this.$getDisplayTokens(placeholder, tokens.length) : [];
                    if( walkTokens.length ) {
                        walkTokens[0] = PLACEHOLDER_START;
                        for( let i = 1; i < walkTokens.length; i++ ) walkTokens[i] = PLACEHOLDER_BODY;
                    }
                } else {
                    walkTokens = this.$getDisplayTokens(lines[walkRow].substring(lastColumn, column), tokens.length);
                }
                tokens = tokens.concat(walkTokens);
            }, foldLine.end.row, lines[foldLine.end.row].length + 1);
            wrapData[foldLine.start.row] = this.$computeWrapSplits(tokens, wrapLimit, tabSize);
            row = foldLine.end.row + 1;
        }
    }

    function attach(session, initial) {
        if( !session || session.$richTextFormattingInstalled ) return;
        session.$richTextFormattingInstalled = true;
        session.$updateWrapData = updateWrapData;
        session.on("change", delta => {
            if( session.$richTextCleaning ) return;
            const first = delta.start.row;
            const last = Math.max(delta.start.row, delta.end.row);
            syncSession(session, first, last + 1);
        });
        if( initial ) {
            const cleaned = cleanEmptyPairs(session, 0, session.getLength() - 1, Range, false, false);
            if( cleaned && session.getUndoManager() )
                session.getUndoManager().reset();
            syncSession(session, 0, session.getLength() - 1);
        }
    }

    editor.on("changeSession", event => attach(event.session, true));
    attach(editor.session, true);
    editor.on("changeSession", () => {
        clearPendingFormats();
        lastCursor = editor.getCursorPosition();
    });
    editor.on("changeSelection", () => {
        const cursor = editor.getCursorPosition();
        const moved = cursor.row !== lastCursor.row || cursor.column !== lastCursor.column ||
            !editor.selection.isEmpty();
        if( moved ) clearPendingFormats();
        const previousRow = lastCursor.row;
        const session = editor.session;
        lastCursor = cursor;
        if( moved ) {
            setTimeout(() => {
                if( editor.session === session )
                    removeEmptyPairs(session, previousRow, Range);
            }, 0);
        }
    });

    editor.remove = function(direction) {
        if( !editor.selection.isEmpty() ) {
            const range = editor.getSelectionRange();
            if( !rangeIntersectsFolds(editor.session, range) ) {
                originalRemove.call(editor, direction);
                for( let row = range.start.row; row <= Math.min(range.end.row, editor.session.getLength() - 1); row++ )
                    removeEmptyPairs(editor.session, row, Range);
                return;
            }
            removeSelectionPreservingMarkers(editor, range, Range);
            editor.clearSelection();
            return;
        }
        const cursor = editor.getCursorPosition();
        const fold = markerAt(editor.session, cursor.row, cursor.column);
        if( !fold ) return originalRemove.call(editor, direction);

        const line = editor.session.getLine(cursor.row);
        const column = direction === "left" ? fold.start.column - 1 : fold.end.column;
        if( column < 0 || column >= line.length ) return;
        if( markerCoversColumn(editor.session, cursor.row, column) ) return;
        removeRange(editor.session, new Range(cursor.row, column, cursor.row, column + 1));
        editor.clearSelection();
        removeEmptyPairs(editor.session, cursor.row, Range);
    };

    function rangeIntersectsFolds(session, range) {
        return (session.$richTextFolds || []).some(fold =>
            fold.start.row >= range.start.row && fold.start.row <= range.end.row &&
            (fold.start.row > range.start.row || fold.end.column > range.start.column) &&
            (fold.end.row < range.end.row || fold.start.column < range.end.column));
    }

    editor.insert = function(text) {
        const cursor = editor.getCursorPosition();
        const pendingTags = Object.keys(pendingFormats).filter(tag => {
            const pending = pendingFormats[tag];
            return pending.row === cursor.row && pending.column === cursor.column;
        });
        if( typeof text === "string" && text.length && pendingTags.length &&
            editor.selection.isEmpty() && !editor.inMultiSelectMode ) {
            const line = editor.session.getLine(cursor.row);
            const parsed = parseLine(line, editor.session.getTokens(cursor.row));
            const contextColumn = cursor.column < line.length ? cursor.column : cursor.column - 1;
            if( contextColumn >= 0 && parsed.eligible[contextColumn] ) {
                clearPendingFormats();
                const openMarkers = pendingTags.map(tag => OPEN[tag]).join("");
                const closeMarkers = pendingTags.slice().reverse().map(tag => CLOSE[tag]).join("");
                const formattedText = text.split("\n").map(part =>
                    part ? openMarkers + part + closeMarkers : part).join("\n");
                originalInsert.call(editor, formattedText);
                cleanEmptyPairs(editor.session, cursor.row, cursor.row + text.split("\n").length, Range, true, true);
                const lastPart = text.split("\n").pop();
                if( lastPart ) {
                    const end = editor.getCursorPosition();
                    editor.moveCursorTo(end.row, end.column - closeMarkers.length);
                }
                return;
            }
        }
        if( typeof text === "string" && text.indexOf("\n") !== -1 &&
            editor.selection.isEmpty() && !editor.inMultiSelectMode ) {
            const line = editor.session.getLine(cursor.row);
            const parsed = parseLine(line, editor.session.getTokens(cursor.row));
            const activePairs = parsed.pairs.filter(pair =>
                cursor.column >= pair.contentStart && cursor.column <= pair.contentEnd)
                .sort((a, b) => a.contentStart - b.contentStart);
            const activeTags = [];
            activePairs.forEach(pair => {
                if( activeTags.indexOf(pair.tag) === -1 ) activeTags.push(pair.tag);
            });
            if( activeTags.length ) {
                const closeMarkers = activeTags.slice().reverse().map(tag => CLOSE[tag]).join("");
                const openMarkers = activeTags.map(tag => OPEN[tag]).join("");
                text = text.replace(/\n/g, closeMarkers + "\n" + openMarkers);
            }
        }
        const result = originalInsert.call(editor, text);
        if( typeof text === "string" && text.length )
            cleanEmptyPairs(editor.session, cursor.row, cursor.row + text.split("\n").length, Range, true, true);
        return result;
    };

    function removeSelectionPreservingMarkers(editor, range) {
        const session = editor.session;
        for( let row = range.end.row; row >= range.start.row; row-- ) {
            const line = session.getLine(row);
            const from = row === range.start.row ? range.start.column : 0;
            const to = row === range.end.row ? range.end.column : line.length;
            const cuts = (session.$richTextFolds || [])
                .filter(fold => fold.start.row === row && fold.start.column < to && fold.end.column > from)
                .map(fold => ({ start: Math.max(from, fold.start.column), end: Math.min(to, fold.end.column) }))
                .sort((a, b) => b.start - a.start);
            let end = to;
            cuts.forEach(cut => {
                if( end > cut.end )
                    removeRange(session, new Range(row, cut.end, row, end));
                end = Math.min(end, cut.start);
            });
            if( end > from ) removeRange(session, new Range(row, from, row, end));
            if( row > range.start.row && row - 1 >= range.start.row ) {
                const previousLine = session.getLine(row - 1);
                removeRange(session, new Range(row - 1, previousLine.length, row, 0));
            }
            removeEmptyPairs(session, Math.max(range.start.row, row - 1), Range);
        }
    }

    function removeWord(direction, original) {
        if( !editor.selection.isEmpty() ) {
            const range = editor.getSelectionRange();
            if( rangeIntersectsFolds(editor.session, range) ) {
                removeSelectionPreservingMarkers(editor, range);
                editor.clearSelection();
                return;
            }
            original.call(editor);
            for( let row = range.start.row; row <= Math.min(range.end.row, editor.session.getLength() - 1); row++ )
                removeEmptyPairs(editor.session, row, Range);
            return;
        }
        const cursor = editor.getCursorPosition();
        if( direction === "left" ) editor.selection.selectWordLeft();
        else editor.selection.selectWordRight();
        const range = editor.getSelectionRange();
        if( !rangeIntersectsFolds(editor.session, range) ) {
            editor.clearSelection();
            editor.moveCursorToPosition(cursor);
            original.call(editor);
            const row = Math.min(cursor.row, editor.session.getLength() - 1);
            removeEmptyPairs(editor.session, row, Range);
            return;
        }
        removeSelectionPreservingMarkers(editor, range);
        editor.clearSelection();
    }

    editor.removeWordLeft = function() { return removeWord("left", originalRemoveWordLeft); };
    editor.removeWordRight = function() { return removeWord("right", originalRemoveWordRight); };

    function cleanEmptyPairs(session, firstRow, lastRow, RangeClass, mergeUndo, shouldSync) {
        let changed = false;
        const wasCleaning = session.$richTextCleaning;
        const previousMerge = session.mergeUndoDeltas;
        session.$richTextCleaning = true;
        try {
            let removals;
            do {
                removals = [];
                for( let row = Math.min(lastRow, session.getLength() - 1);
                    row >= Math.max(0, firstRow); row-- ) {
                    const pairs = parseLine(session.getLine(row), session.getTokens(row)).pairs
                        .filter(pair => pair.contentStart === pair.contentEnd)
                        .sort((a, b) => b.openStart - a.openStart);
                    pairs.forEach(pair => removals.push({ row, pair }));
                }
                if( removals.length && mergeUndo ) session.mergeUndoDeltas = true;
                removals.forEach(({ row, pair }) => {
                    removeRange(session, new RangeClass(row, pair.closeStart, row, pair.closeEnd));
                    removeRange(session, new RangeClass(row, pair.openStart, row, pair.openEnd));
                });
                if( removals.length ) changed = true;
            } while( removals.length );
        } finally {
            session.$richTextCleaning = wasCleaning;
            session.mergeUndoDeltas = previousMerge;
        }
        if( changed && shouldSync ) syncSession(session, firstRow, lastRow);
        return changed;
    }

    function removeEmptyPairs(session, row, RangeClass) {
        return cleanEmptyPairs(session, row, row, RangeClass, true, true);
    }

    function selectionIsEligible(session, range) {
        for( let row = range.start.row; row <= range.end.row; row++ ) {
            const line = session.getLine(row);
            const parsed = parseLine(line, session.getTokens(row));
            const { from, to } = lineSelectionBounds(session, row, range);
            for( let column = from; column < to; column++ ) {
                if( isMarkerColumn(parsed.pairs, column) ) continue;
                if( !parsed.eligible[column] ) return false;
            }
        }
        return true;
    }

    function selectionHasFormat(session, range, tag) {
        let sawText = false;
        for( let row = range.start.row; row <= range.end.row; row++ ) {
            const line = session.getLine(row);
            const parsed = parseLine(line, session.getTokens(row));
            const { from, to } = lineSelectionBounds(session, row, range);
            for( let column = from; column < to; column++ ) {
                if( isMarkerColumn(parsed.pairs, column) ) continue;
                sawText = true;
                const style = parsed.styles[column];
                if( !style || !style[tag === "b" ? "bold" : "italic"] ) return false;
            }
        }
        return sawText;
    }

    function isMarkerColumn(pairs, column) {
        return pairs.some(pair =>
            (column >= pair.openStart && column < pair.openEnd) ||
            (column >= pair.closeStart && column < pair.closeEnd));
    }

    function lineSelectionBounds(session, row, range) {
        let from = row === range.start.row ? range.start.column : 0;
        let to = row === range.end.row ? range.end.column : session.getLine(row).length;
        const folds = (session.$richTextFolds || []).filter(fold => fold.start.row === row);
        let previous;
        do {
            previous = from;
            const opening = folds.find(fold => fold.start.column === from);
            if( opening ) from = opening.end.column;
        } while( from !== previous );
        do {
            previous = to;
            const closing = folds.find(fold => fold.end.column === to);
            if( closing ) to = closing.start.column;
        } while( to !== previous );
        return { from, to };
    }

    function toggleSelection(editor, tag) {
        const session = editor.session;
        const range = editor.getSelectionRange();
        if( !selectionIsEligible(session, range) ) return;
        clearPendingFormats();
        const removeFormat = selectionHasFormat(session, range, tag);
        const edits = [];
        for( let row = range.end.row; row >= range.start.row; row-- ) {
            const line = session.getLine(row);
            const { from, to } = lineSelectionBounds(session, row, range);
            if( from >= to ) continue;
            const parsed = parseLine(line, session.getTokens(row));
            if( removeFormat ) {
                const pairs = parsed.pairs.filter(item => item.tag === tag &&
                    item.contentStart < to && item.contentEnd > from);
                pairs.forEach(pair => {
                    // Hidden markers of another format at the edge are not text: a selection that
                    // covers all the visible text of the pair removes the pair, it does not split it
                    let edge = from;
                    while( edge > pair.contentStart && isMarkerColumn(parsed.pairs, edge - 1) ) edge--;
                    const coversStart = edge <= pair.contentStart;
                    edge = to;
                    while( edge < pair.contentEnd && isMarkerColumn(parsed.pairs, edge) ) edge++;
                    const coversEnd = edge >= pair.contentEnd;
                    if( !coversStart ) {
                        edits.push({ row, start: from, end: from, text: CLOSE[tag] });
                    } else {
                        edits.push({ row, start: pair.openStart, end: pair.openEnd, text: "" });
                    }
                    if( !coversEnd ) {
                        edits.push({ row, start: to, end: to, text: OPEN[tag] });
                    } else {
                        edits.push({ row, start: pair.closeStart, end: pair.closeEnd, text: "" });
                    }
                });
            } else {
                let hasText = false;
                for( let column = from; column < to; column++ ) {
                    if( !isMarkerColumn(parsed.pairs, column) ) {
                        hasText = true;
                        break;
                    }
                }
                if( !hasText ) continue;
                edits.push({ row, start: to, end: to, text: CLOSE[tag] });
                edits.push({ row, start: from, end: from, text: OPEN[tag] });
            }
        }
        if( !edits.length ) return;
        // The selection stays on the same text, so the writer can go on (bold, then italic).
        // Anchors follow the text while the hidden markers are added or removed around it.
        const startAnchor = session.doc.createAnchor(range.start.row, lineSelectionBounds(session, range.start.row, range).from);
        const endAnchor = session.doc.createAnchor(range.end.row, lineSelectionBounds(session, range.end.row, range).to);
        endAnchor.$insertRight = true;
        session.markUndoGroup();
        edits.sort((a, b) => b.row - a.row || b.start - a.start);
        edits.forEach(edit => {
            if( edit.text ) session.doc.insert({ row: edit.row, column: edit.start }, edit.text);
            else removeRange(session, new Range(edit.row, edit.start, edit.row, edit.end));
        });
        session.markUndoGroup();
        const kept = new Range(startAnchor.row, startAnchor.column, endAnchor.row, endAnchor.column);
        startAnchor.detach();
        endAnchor.detach();
        editor.selection.setRange(kept);
    }

    // What the formatting toolbar needs to know about the selection: whether it can be formatted,
    // and whether all of its text already is bold or italic.
    function selectionState(editor) {
        const none = { enabled: false, bold: false, italic: false };
        if( (editor.getReadOnly && editor.getReadOnly()) || editor.inMultiSelectMode || editor.selection.isEmpty() ) return none;
        const session = editor.session;
        const range = editor.getSelectionRange();
        const plain = session.getTextRange(range).replace(/\u27e6\/?[bi]\u27e7/g, "").trim();
        if( !plain || !selectionIsEligible(session, range) ) return none;
        return {
            enabled: true,
            bold: selectionHasFormat(session, range, "b"),
            italic: selectionHasFormat(session, range, "i")
        };
    }

    function toggleAtCursor(editor, tag) {
        const session = editor.session;
        const cursor = editor.getCursorPosition();
        const line = session.getLine(cursor.row);
        const parsed = parseLine(line, session.getTokens(cursor.row));
        const contextColumn = cursor.column < line.length ? cursor.column : cursor.column - 1;
        if( contextColumn < 0 || !parsed.eligible[contextColumn] ) return;
        const pending = pendingFormats[tag];
        if( pending && pending.row === cursor.row && pending.column === cursor.column ) {
            delete pendingFormats[tag];
            return;
        }
        const active = parsed.pairs.find(pair => pair.tag === tag &&
            cursor.column >= pair.contentStart && cursor.column <= pair.contentEnd);
        if( active && cursor.column === active.contentEnd ) {
            delete pendingFormats[tag];
            editor.moveCursorTo(cursor.row, active.closeEnd);
            return;
        }
        if( active ) {
            session.markUndoGroup();
            const close = CLOSE[tag];
            session.doc.insert({ row: cursor.row, column: cursor.column }, close + OPEN[tag]);
            editor.moveCursorTo(cursor.row, cursor.column + close.length);
            session.markUndoGroup();
        } else {
            pendingFormats[tag] = { row: cursor.row, column: cursor.column };
        }
    }

    ["b", "i"].forEach(tag => {
        editor.commands.addCommand({
            name: tag === "b" ? "toggleRichTextBold" : "toggleRichTextItalic",
            bindKey: tag === "b"
                ? { win: "Ctrl-B", mac: "Command-B" }
                : { win: "Ctrl-I", mac: "Command-I" },
            exec: editor => {
                if( editor.inMultiSelectMode ) return;
                if( editor.selection.isEmpty() ) toggleAtCursor(editor, tag);
                else toggleSelection(editor, tag);
            }
        });
    });

    editor.commands.addCommand({
        name: "cancelRichTextPendingFormat",
        bindKey: { win: "Esc", mac: "Esc" },
        exec: () => {
            if( Object.keys(pendingFormats).length )
                clearPendingFormats();
        }
    });

    return { syncSession, selectionState };
}

exports.RichTextFormatting = { OPEN, CLOSE, parseLine, decorateTokens, install };
