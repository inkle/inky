// Pagination of a long passage. When the narrative of a passage is taller than the frame, it is
// divided into pages instead of getting a scrollbar; a navigation row (arrows and dots) sits above
// the choices footer. This file is shared: the Preview requires it and the web export ships it
// next to main.js, so both behave the same.
//
// - Pages are filled by measured height, never by a fixed number of lines, and each one is filled
//   as far as it goes.
// - When the next paragraph does not fit in what is left of a page, it is cut at the end of the
//   last sentence that does. Only when no sentence fits, and a good part of the page would stay
//   empty, is it cut at a word.
// - A scene title stays with the paragraph below it.
// - Scrolling stays only as the safety net for a block that cannot be divided.
(function (root, factory) {
    if( typeof module === "object" && module.exports ) module.exports = factory();
    else root.InkyPager = factory();
})(typeof self !== "undefined" ? self : this, function () {
    var MAX_DOTS = 10;
    var SENTENCE_END = /[.!?\u2026][\u201d\u2019"')\]]*$/;
    var HEADINGS = /^h[1-6]$/i;

    // ---- Cutting (pure) ----------------------------------------------------

    // The index just after the last node that ends a sentence, within the first `limit` nodes.
    // 0 when none does.
    function lastSentenceEnd(texts, limit) {
        for( var i = Math.min(limit, texts.length) - 1; i >= 0; --i ) {
            var text = texts[i].trim();
            if( text === "" ) continue;
            if( SENTENCE_END.test(text) ) return i + 1;
        }
        return 0;
    }

    // ---- Navigation row ------------------------------------------------------

    var PREVIOUS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6"/></svg>';
    var NEXT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';

    function navElement(doc) {
        var nav = doc.createElement("div");
        nav.className = "story-pager";
        nav.hidden = true;
        nav.setAttribute("role", "navigation");
        nav.setAttribute("aria-label", "Pages");
        nav.innerHTML =
            '<button type="button" class="pager-button pager-prev" aria-label="Previous page" title="Previous page">' + PREVIOUS_ICON + "</button>" +
            '<span class="pager-dots" aria-live="polite"></span>' +
            '<button type="button" class="pager-button pager-next" aria-label="Next page" title="Next page">' + NEXT_ICON + "</button>";
        return nav;
    }

    // ---- Attaching to a frame --------------------------------------------------

    function styleNumber(win, element, property) {
        return parseFloat(win.getComputedStyle(element)[property]) || 0;
    }

    // Heights of the blocks as they stand one below the other: a block is measured up to the top
    // of the next one, so its margins count.
    function measureBlocks(blocks) {
        return blocks.map(function (block, index) {
            var next = blocks[index + 1];
            return next ? next.offsetTop - block.offsetTop : block.offsetHeight;
        });
    }

    // options: { frame, passage, nav, getChoices(), onPage(pageIndex, blocks) }
    function attach(options) {
        var frame = options.frame, passage = options.passage, nav = options.nav;
        var doc = frame.ownerDocument, win = doc.defaultView;
        var state = { pages: [], index: 0, signature: null };
        var busy = false, pending = false, observer = null;

        if( !nav.querySelector(".pager-prev") ) {
            var template = navElement(doc);
            while( template.firstChild ) nav.appendChild(template.firstChild);
        }
        var previous = nav.querySelector(".pager-prev");
        var next = nav.querySelector(".pager-next");
        var dots = nav.querySelector(".pager-dots");
        var choices = options.getChoices && options.getChoices();

        // The choices footer grows naturally until its CSS maximum height is reached.
        // Beyond that, it becomes a keyboard-accessible scroll region.  Scrollbars and
        // the small bottom fade are visible only while there is actual overflow.
        // This belongs in the shared pager so Preview and Web Export stay identical.
        function updateChoicesOverflow() {
            if( !choices ) return;
            var overflow = !choices.hidden && choices.clientHeight > 0 &&
                choices.scrollHeight - choices.clientHeight > 2;
            var moreBelow = overflow &&
                choices.scrollHeight - choices.clientHeight - choices.scrollTop > 2;
            choices.classList.toggle("choices-scrollable", overflow);
            frame.classList.toggle("choices-more-below", !!moreBelow);
            if( overflow ) {
                if( !choices.hasAttribute("tabindex") ) choices.setAttribute("tabindex", "0");
                if( !choices.hasAttribute("aria-label") ) choices.setAttribute("aria-label", "Choices. Scroll for more options.");
                if( !choices.hasAttribute("role") ) choices.setAttribute("role", "region");
            } else {
                choices.removeAttribute("tabindex");
                choices.removeAttribute("aria-label");
                choices.removeAttribute("role");
            }
        }

        function blocksOf() {
            return Array.prototype.filter.call(passage.children, function (child) { return child.nodeType === 1; });
        }

        // Puts the pieces of every divided paragraph back together.
        function mergeSplits() {
            var heads = blocksOf().filter(function (block) { return block.hasAttribute("data-page-split"); });
            for( var i = heads.length - 1; i >= 0; --i ) {
                var head = heads[i];
                var rest = head.nextElementSibling;
                if( rest ) {
                    var first = rest.firstChild;
                    while( head.firstChild ) rest.insertBefore(head.firstChild, first);
                }
                head.remove();
            }
        }

        function clearPageState() {
            blocksOf().forEach(function (block) { block.classList.remove("page-out"); });
            passage.classList.remove("page-overflow");
        }

        // Cuts the front off `block` (a paragraph) so that it fits `capacity`: at the end of the
        // last sentence that fits or, when `byWord` is set and none does, at a word. Returns false
        // when there is nothing to cut.
        function cutFront(block, capacity, byWord) {
            // Plain text is divided into words and spaces, so it can be cut like the Preview's
            // paragraphs, whose words already are elements of their own.
            Array.prototype.slice.call(block.childNodes).forEach(function (node) {
                if( node.nodeType !== 3 ) return;
                var parts = node.textContent.split(/(\s+)/).filter(function (part) { return part !== ""; });
                if( parts.length < 2 ) return;
                parts.forEach(function (part) { block.insertBefore(doc.createTextNode(part), node); });
                block.removeChild(node);
            });
            var nodes = Array.prototype.slice.call(block.childNodes);
            if( nodes.length < 2 ) return false;
            var head = block.cloneNode(false);
            head.setAttribute("data-page-split", "1");
            passage.insertBefore(head, block);

            function moveFirst(count) {
                while( head.childNodes.length > count ) block.insertBefore(head.lastChild, block.firstChild);
                while( head.childNodes.length < count ) head.appendChild(block.firstChild);
            }

            // The most nodes of the paragraph that still fit the page.
            var low = 0, high = nodes.length - 1;
            while( low < high ) {
                var middle = Math.ceil((low + high) / 2);
                moveFirst(middle);
                if( head.offsetHeight <= capacity ) low = middle;
                else high = middle - 1;
            }
            var count = low;
            if( count > 0 ) {
                var texts = nodes.map(function (node) { return node.textContent; });
                count = lastSentenceEnd(texts, count) || (byWord ? count : 0);
            }
            // A cut never leaves whitespace alone at the end of the page.
            while( count > 1 && nodes[count - 1].textContent.trim() === "" ) count--;
            if( count < 1 ) {
                moveFirst(0);
                head.remove();
                return false;
            }
            moveFirst(count);
            // The space after the cut stays at the end of the page, so putting the pieces back
            // together gives the same text.
            while( block.firstChild && block.firstChild.nodeType === 3 && block.firstChild.textContent.trim() === "" ) {
                head.appendChild(block.firstChild);
            }
            return true;
        }

        function isHeading(block) {
            return HEADINGS.test(block.tagName) || /(^|\s)(scene-title|sceneTitle)(\s|$)/.test(block.className);
        }

        // Fills the pages one after the other. A block that does not fit in what is left of the
        // page is cut at a sentence when it is a paragraph, so the page is used as far as it goes.
        function layoutPages(available) {
            var pages = [], current = [], used = 0;
            var index = 0;
            for( var guard = 0; guard < 2000; ++guard ) {
                var blocks = blocksOf();
                if( index >= blocks.length ) break;
                var heights = measureBlocks(blocks);
                var block = blocks[index], height = heights[index];

                if( used + height <= available + 1 ) {
                    current.push(block);
                    used += height;
                    index++;
                    continue;
                }

                var left = available - used;
                var alone = current.length === 0 || (current.length === 1 && isHeading(current[0]));
                var paragraph = block.tagName === "P" && !isHeading(block);
                // A cut at a word only when it saves a good part of the page, or when the page
                // would hold nothing else.
                var byWord = alone || left >= available * 0.35;
                if( paragraph && left > 0 && cutFront(block, left, byWord) ) continue;

                if( current.length === 0 ) {
                    // Nothing can be cut: the block takes a page of its own (and may scroll).
                    current.push(block);
                    index++;
                }
                // A scene title never ends a page: it moves to the next one.
                else if( isHeading(current[current.length - 1]) ) {
                    current.pop();
                    index--;
                }
                pages.push(current);
                current = [];
                used = 0;
            }
            if( current.length ) pages.push(current);
            return pages;
        }

        function signatureOf(blocks) {
            return blocks.length + ":" + blocks.map(function (block) { return block.textContent; }).join("\u0001");
        }

        function show(index, notify) {
            var pages = state.pages;
            state.index = Math.max(0, Math.min(index, Math.max(0, pages.length - 1)));
            pages.forEach(function (page, pageIndex) {
                page.forEach(function (block) { block.classList.toggle("page-out", pageIndex !== state.index); });
            });
            passage.scrollTop = 0;
            renderNav();
            if( notify && options.onPage ) options.onPage(state.index, pages[state.index] || []);
        }

        function lockChoices() {
            var choices = options.getChoices && options.getChoices();
            if( !choices ) return;
            var locked = state.pages.length > 1 && state.index < state.pages.length - 1;
            choices.classList.toggle("pages-locked", locked);
            Array.prototype.forEach.call(choices.querySelectorAll("button"), function (button) {
                if( locked ) {
                    if( !button.disabled ) {
                        button.setAttribute("data-page-locked", "");
                        button.disabled = true;
                    }
                } else if( button.hasAttribute("data-page-locked") ) {
                    button.disabled = false;
                    button.removeAttribute("data-page-locked");
                }
            });
        }

        function renderNav() {
            var total = state.pages.length;
            var paged = total > 1;
            frame.classList.toggle("is-paged", paged);
            nav.hidden = !paged;
            previous.disabled = !paged || state.index === 0;
            next.disabled = !paged || state.index >= total - 1;
            dots.textContent = "";
            if( paged ) {
                if( total <= MAX_DOTS ) {
                    for( var i = 0; i < total; ++i ) {
                        var dot = doc.createElement("span");
                        dot.className = "pager-dot" + (i === state.index ? " current" : "");
                        dots.appendChild(dot);
                    }
                } else {
                    dots.textContent = (state.index + 1) + " / " + total;
                }
                dots.setAttribute("aria-label", "Page " + (state.index + 1) + " of " + total);
            }
            lockChoices();
            updateChoicesOverflow();
        }

        function refresh() {
            busy = true;
            try {
                mergeSplits();
                clearPageState();
                var blocks = blocksOf();
                var signature = signatureOf(blocks);
                var keep = signature === state.signature ? state.index : 0;
                state.signature = signature;
                state.pages = [];

                // The navigation row takes room from the passage, so the decision is made as if it
                // were there; a passage that turns out to fit on one page then has room to spare.
                frame.classList.add("is-paged");
                nav.hidden = false;
                var available = passage.clientHeight - styleNumber(win, passage, "paddingTop") - styleNumber(win, passage, "paddingBottom");
                if( blocks.length === 0 || passage.clientHeight <= 0 ) {
                    renderNav();
                    return;
                }
                var total = measureBlocks(blocks).reduce(function (sum, height) { return sum + height; }, 0);
                if( total <= available + 1 ) {
                    state.pages = [blocks];
                    state.index = 0;
                    renderNav();
                    return;
                }

                state.pages = layoutPages(available);
                state.pages.forEach(function (page) {
                    var used = measureBlocks(page).reduce(function (sum, height) { return sum + height; }, 0);
                    if( used > available + 1 ) passage.classList.add("page-overflow");
                });
                show(keep, true);
            } finally {
                busy = false;
                if( observer && observer.takeRecords ) observer.takeRecords();
            }
        }

        function schedule() {
            if( pending ) return;
            pending = true;
            var run = function () { pending = false; refresh(); };
            if( win.requestAnimationFrame ) win.requestAnimationFrame(run);
            else win.setTimeout(run, 0);
        }

        function go(index) {
            if( state.pages.length < 2 ) return false;
            var target = Math.max(0, Math.min(index, state.pages.length - 1));
            if( target === state.index ) return false;
            show(target, true);
            return true;
        }

        previous.addEventListener("click", function () { go(state.index - 1); });
        next.addEventListener("click", function () { go(state.index + 1); });

        var INTERACTIVE = /^(button|a|input|textarea|select|summary)$/i;
        // Space, Enter and Right go forward, Left goes back. A key that belongs to a control that
        // has the focus is left to it.
        function handleKey(event) {
            if( state.pages.length < 2 || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ) return false;
            var target = event.target;
            var editable = target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName || ""));
            var interactive = target && INTERACTIVE.test(target.tagName || "");
            var handled = false;
            if( event.key === "ArrowRight" || event.key === "PageDown" ) handled = !editable && (go(state.index + 1) || true);
            else if( event.key === "ArrowLeft" || event.key === "PageUp" ) handled = !editable && (go(state.index - 1) || true);
            else if( event.key === " " || event.key === "Enter" ) handled = !interactive && !editable && (go(state.index + 1) || true);
            if( handled ) event.preventDefault();
            return handled;
        }

        if( win.MutationObserver ) {
            observer = new win.MutationObserver(function () { if( !busy ) schedule(); });
            observer.observe(passage, { childList: true });
            if( choices ) new win.MutationObserver(function () {
                if( !busy ) lockChoices();
                updateChoicesOverflow();
            }).observe(choices, { childList: true, subtree: true });
        }
        if( win.ResizeObserver ) {
            new win.ResizeObserver(function () { if( !busy ) schedule(); }).observe(passage);
            if( choices ) {
                var choiceResize = new win.ResizeObserver(updateChoicesOverflow);
                choiceResize.observe(choices);
                choiceResize.observe(frame);
            }
        }
        if( choices ) choices.addEventListener("scroll", updateChoicesOverflow, { passive: true });
        passage.addEventListener("load", schedule, true);
        updateChoicesOverflow();

        return {
            refresh: refresh,
            schedule: schedule,
            handleKey: handleKey,
            next: function () { return go(state.index + 1); },
            previous: function () { return go(state.index - 1); },
            goTo: go,
            getState: function () { return { index: state.index, count: state.pages.length || 1 }; }
        };
    }

    return {
        lastSentenceEnd: lastSentenceEnd,
        navElement: navElement,
        attach: attach,
        MAX_DOTS: MAX_DOTS
    };
});
