(function(storyContent) {

    function storyFingerprint(content) {
        var serialized = JSON.stringify(content);
        var first = 2166136261;
        var second = 0x9e3779b9;
        for( var i = 0; i < serialized.length; i++ ) {
            var code = serialized.charCodeAt(i);
            first = Math.imul(first ^ code, 16777619) >>> 0;
            second = Math.imul(second ^ code, 2246822519) >>> 0;
        }
        return first.toString(16).padStart(8, "0") + second.toString(16).padStart(8, "0");
    }

    // Keep saves from separate stories and revisions isolated on the same origin.
    var saveKey = "save-state:" + location.pathname.replace(/index\.html$/i, "") + ":" + storyFingerprint(storyContent);
    // Story text is plain text: markup is shown as written, never interpreted as HTML.
    function storyTextNode(text) {
        // richtext.js (shared with the Preview) turns the bold/italic markers into <strong>/<em> nodes
        if( window.InkRichText ) return window.InkRichText.toNodes(text, document);
        return document.createTextNode(String(text == null ? "" : text).replace(/\u27e6\/?[^\u27e6\u27e7]{0,8}\u27e7/g, ""));
    }

    // Choices and scene titles are never formatted: markers left in the file are dropped, the words stay.
    function plainStoryText(text) {
        text = String(text == null ? "" : text);
        if( window.InkRichText ) return window.InkRichText.plainText(text);
        return text.replace(/\u27e6\/?[^\u27e6\u27e7]{0,8}\u27e7/g, "");
    }

    function safeStoryUrl(value, allowMailto) {
        value = String(value || "").trim();
        if( !value || value.startsWith("//") ) return null;
        try {
            var resolved = new URL(value, location.href);
            if( resolved.protocol === "http:" || resolved.protocol === "https:" ) return resolved.href;
            if( resolved.protocol === "mailto:" && allowMailto && /^mailto:/i.test(value) ) return resolved.href;
            if( resolved.protocol === "file:" && !/^[a-z][a-z0-9+.-]*:/i.test(value) ) return resolved.href;
        } catch(error) {
            return null;
        }
        return null;
    }

    function addSafeClasses(element, values) {
        values.forEach(value => String(value).split(/\s+/).forEach(className => {
            if( /^[A-Za-z_][A-Za-z0-9_-]*$/.test(className) ) element.classList.add(className);
        }));
    }


    // ---- Sound -------------------------------------------------------------------------
    // "# music: file.mp3" loops until another music tag ("# music: stop" ends it),
    // "# sound: file.mp3" plays once. Both read files from the audio folder next to this page.
    // The speaker button and the volume slider in the top bar control all of it, and the player's
    // choice is remembered.
    var AUDIO_EXTENSIONS = [".mp3", ".ogg", ".oga", ".wav", ".m4a", ".aac", ".flac", ".opus", ".webm"];

    function audioUrlForFile(value) {
        var name = String(value || "").trim().replace(/^["']|["']$/g, "").replace(/\\/g, "/");
        if( !name || name.charAt(0) === "/" || /[\x00-\x1f]/.test(name) ) return null;
        var parts = name.split("/");
        if( parts.some(function(part) { return !part || part === "." || part === ".."; }) ) return null;
        var filename = parts[parts.length - 1];
        var dot = filename.lastIndexOf(".");
        if( dot <= 0 || AUDIO_EXTENSIONS.indexOf(filename.slice(dot).toLowerCase()) === -1 ) return null;
        return "audio/" + parts.map(encodeURIComponent).join("/");
    }

    var audioEngine = (function() {
        var enabled = document.body.getAttribute("data-audio") === "on";
        var startVolume = parseInt(document.body.getAttribute("data-volume"), 10);
        if( isNaN(startVolume) ) startVolume = 50;
        startVolume = Math.max(0, Math.min(100, startVolume));
        var masterVolume = parseInt(document.body.getAttribute("data-master-volume"), 10);
        var musicVolume = parseInt(document.body.getAttribute("data-music-volume"), 10);
        var sfxVolume = parseInt(document.body.getAttribute("data-sfx-volume"), 10);
        if( isNaN(masterVolume) ) masterVolume = 100;
        if( isNaN(musicVolume) ) musicVolume = 100;
        if( isNaN(sfxVolume) ) sfxVolume = 100;
        masterVolume = Math.max(0, Math.min(100, masterVolume)) / 100;
        musicVolume = Math.max(0, Math.min(100, musicVolume)) / 100;
        sfxVolume = Math.max(0, Math.min(100, sfxVolume)) / 100;

        var volume = startVolume / 100;
        var muted = false;
        try {
            var storedVolume = window.localStorage.getItem("inky-audio-volume");
            if( storedVolume !== null && storedVolume !== "" && !isNaN(Number(storedVolume)) )
                volume = Math.max(0, Math.min(1, Number(storedVolume) / 100));
            muted = window.localStorage.getItem("inky-audio-muted") === "1";
        } catch(e) { /* storage unavailable */ }
        var lastAudible = volume > 0 ? volume : (startVolume > 0 ? startVolume / 100 : 0.5);

        var tracks = [];          // music that is playing, fading in or fading out
        var effects = [];         // active one-shot sounds
        var music = null;         // the track that should be playing now
        var needsGesture = false; // the browser refused to start sound before a click or key press
        var ticker = null;

        function level(category) {
            return muted ? 0 : volume * masterVolume * (category === "music" ? musicVolume : sfxVolume);
        }
        function applyVolume(track) { track.el.volume = Math.max(0, Math.min(1, level("music") * track.fade)); }
        function applyEffectVolume(effect) { effect.el.volume = level("sfx"); }
        function applyAll() {
            tracks.forEach(applyVolume);
            effects.forEach(applyEffectVolume);
        }

        function tick() {
            var fading = false;
            tracks = tracks.filter(function(track) {
                if( track.fade < track.target ) track.fade = Math.min(track.target, track.fade + 0.06);
                else if( track.fade > track.target ) track.fade = Math.max(track.target, track.fade - 0.06);
                applyVolume(track);
                if( track.fade === 0 && track.target === 0 ) {
                    track.el.pause();
                    track.el.removeAttribute("src");
                    track.el.load();
                    return false;
                }
                if( track.fade !== track.target ) fading = true;
                return true;
            });
            if( !fading && ticker ) { clearInterval(ticker); ticker = null; }
        }
        function ensureTicker() { if( !ticker ) ticker = setInterval(tick, 40); }

        function tryPlay(track) {
            var attempt = track.el.play();
            if( attempt && attempt.catch ) attempt.catch(function() { needsGesture = true; });
        }

        function setMusicUrl(url) {
            if( url && music && music.url === url ) return;   // already playing it
            if( music ) { music.target = 0; ensureTicker(); }
            music = null;
            if( !url ) return;
            var el = new Audio(url);
            el.loop = true;
            el.volume = 0;
            el.addEventListener("error", function() { console.warn("Sound file not found or not playable:", url); });
            var track = { el: el, url: url, fade: 0, target: 1 };
            tracks.push(track);
            music = track;
            tryPlay(track);
            ensureTicker();
        }

        function playSoundUrl(url) {
            if( !url || level("sfx") === 0 ) return;
            var el = new Audio(url);
            var effect = { el: el };
            el.volume = level("sfx");
            var removeEffect = function() {
                var index = effects.indexOf(effect);
                if( index !== -1 ) effects.splice(index, 1);
            };
            effects.push(effect);
            el.addEventListener("ended", removeEffect);
            el.addEventListener("error", function() {
                console.warn("Sound file not found or not playable:", url);
                removeEffect();
            });
            var attempt = el.play();
            if( attempt && attempt.catch ) attempt.catch(removeEffect);
        }

        function stopSoundEffects() {
            effects.forEach(function(effect) {
                effect.el.pause();
                effect.el.removeAttribute("src");
                effect.el.load();
            });
            effects = [];
        }

        function onGesture() {
            if( !needsGesture ) return;
            needsGesture = false;
            tracks.forEach(function(track) { if( track.el.paused && track.target === 1 ) tryPlay(track); });
        }
        ["pointerdown", "keydown", "touchstart"].forEach(function(type) { document.addEventListener(type, onGesture, true); });

        function persist() {
            try {
                window.localStorage.setItem("inky-audio-volume", String(Math.round(volume * 100)));
                window.localStorage.setItem("inky-audio-muted", muted ? "1" : "0");
            } catch(e) { /* storage unavailable */ }
        }

        function refreshControl() {
            var control = document.getElementById("audio-control");
            if( !control ) return;
            var silent = muted || volume === 0;
            control.classList.toggle("muted", silent);
            var toggle = document.getElementById("audio-toggle");
            if( toggle ) toggle.setAttribute("aria-pressed", String(!silent));
            var slider = document.getElementById("audio-volume");
            if( slider ) slider.value = String(muted ? 0 : Math.round(volume * 100));
        }

        if( enabled ) {
            var control = document.getElementById("audio-control");
            var controls = document.getElementById("controls");
            var audioSettingsAnchor = document.getElementById("audio-settings-anchor");
            if( control ) control.hidden = false;
            if( controls ) controls.classList.add("has-audio");
            if( audioSettingsAnchor ) audioSettingsAnchor.hidden = false;
            var slider = document.getElementById("audio-volume");
            var toggle = document.getElementById("audio-toggle");
            if( slider ) slider.addEventListener("input", function() {
                volume = Math.max(0, Math.min(1, Number(slider.value) / 100));
                muted = false;
                if( volume > 0 ) lastAudible = volume;
                applyAll(); persist(); refreshControl();
            });
            if( toggle ) toggle.addEventListener("click", function() {
                if( muted || volume === 0 ) {
                    muted = false;
                    if( volume === 0 ) volume = lastAudible;
                } else {
                    muted = true;
                }
                applyAll(); persist(); refreshControl();
            });
            refreshControl();
        }

        return {
            enabled: enabled,
            setMusicUrl: setMusicUrl,
            playSoundUrl: playSoundUrl,
            stopSoundEffects: stopSoundEffects,
            currentMusic: function() { return music ? music.url : ""; }
        };
    })();

    function processAudioTag(tag) {
        var splitTag = splitPropertyTag(tag);
        if( !splitTag ) return false;
        var property = splitTag.property.trim().replace(/^#\s*/, "").toUpperCase();

        if( property == "MUSIC" ) {
            if( /^(stop|none|off)$/i.test(splitTag.val) ) audioEngine.setMusicUrl(null);
            else {
                var musicUrl = audioUrlForFile(splitTag.val);
                if( musicUrl ) audioEngine.setMusicUrl(musicUrl);
                else console.warn("Not a sound file name:", splitTag.val);
            }
        } else if( property == "SOUND" ) {
            if( /^stop$/i.test(splitTag.val) ) audioEngine.stopSoundEffects();
            else {
                var soundUrl = audioUrlForFile(splitTag.val);
                if( soundUrl ) audioEngine.playSoundUrl(soundUrl);
                else {
                    audioEngine.stopSoundEffects();
                    console.warn("Not a sound file name:", splitTag.val);
                }
            }
        } else {
            return false;
        }
        return true;
    }

    // What the saved game remembers: the music that was playing when the save point was taken.
    var savePointMusic = "";
    function markSavePoint() {
        savePoint = story.state.toJson();
        savePointMusic = audioEngine.currentMusic();
    }

    function restoreSavedMusic() {
        var url = null;
        try {
            var saved = window.localStorage.getItem(saveKey + ":music");
            if( saved ) url = safeStoryUrl(saved, false);
        } catch(e) { /* storage unavailable */ }
        audioEngine.setMusicUrl(url);
    }

    // Create ink story from the content using inkjs
    var story = new inkjs.Story(storyContent);

    var savePoint = "";

    // Alignment of the current scene, set by "# align:" together with "# title:".
    var sceneAlign = null;

    // Global alignment tags are still supported for existing Ink projects.
    var globalTags = story.globalTags;
    var globalTagSet = new Set(globalTags || []);
    if( globalTags ) {
        for(var i=0; i<story.globalTags.length; i++) {
            var globalTag = story.globalTags[i];
            var splitTag = splitPropertyTag(globalTag);
            if( splitTag ) splitTag.property = splitTag.property.trim().toLowerCase();

            if( splitTag && splitTag.property == "align" ) {
                var textAlign = String(splitTag.val || "").trim().toLowerCase();
                if( ["left", "center", "right"].indexOf(textAlign) !== -1 ) {
                    document.documentElement.style.setProperty("--story-align", textAlign);
                }
            }
        }
    }

    var storyFrame = document.querySelector('#story');
    var storyContainer = document.querySelector('#story-passage');
    var storyVisual = document.querySelector('#story-visual');
    // Choices live in a footer at the bottom of the frame. Older exported pages have no
    // footer element, so the script creates it next to the passage.
    var choicesContainer = document.querySelector('#story-choices');
    if( !choicesContainer && storyContainer ) {
        choicesContainer = document.createElement('div');
        choicesContainer.id = 'story-choices';
        choicesContainer.className = 'story-choices';
        choicesContainer.hidden = true;
        storyContainer.insertAdjacentElement('afterend', choicesContainer);
    }
    // A passage taller than the frame is divided into pages (pager.js). The navigation row sits
    // between the passage and the choices; older exported pages get it from the script.
    var storyPager = document.querySelector('#story-pager');
    if( !storyPager && storyContainer && window.InkyPager ) {
        storyPager = window.InkyPager.navElement(document);
        storyPager.id = 'story-pager';
        storyContainer.insertAdjacentElement('afterend', storyPager);
    }
    var pager = (window.InkyPager && storyPager && storyContainer)
        ? window.InkyPager.attach({
            frame: storyFrame,
            passage: storyContainer,
            nav: storyPager,
            getChoices: function() { return choicesContainer; }
        })
        : null;
    // Space, Enter and the arrow keys turn the pages; a key that belongs to a control with the focus
    // is left to it.
    document.addEventListener('keydown', function(event) {
        if( pager && (event.target === document.body || storyFrame.contains(event.target)) ) pager.handleKey(event);
    });
    // The frame fades its bottom edge (see the exported CSS) while there is more text below
    function updateMoreBelow() {
        storyFrame.classList.toggle("has-more-below",
            storyContainer.scrollHeight - scrollFill() - storyContainer.scrollTop - storyContainer.clientHeight > 2);
    }
    storyContainer.addEventListener("scroll", updateMoreBelow, { passive: true });
    // A picture in the text only knows its height once it has loaded, and a different window size
    // changes how much text is below the edge.
    storyContainer.addEventListener("load", updateMoreBelow, true);
    window.addEventListener("resize", updateMoreBelow);
    new MutationObserver(updateMoreBelow).observe(storyContainer, { childList: true, subtree: true });
    // The arrow takes the reader to the end of the text.
    var scrollCue = document.querySelector(".scroll-cue");
    if( scrollCue ) scrollCue.addEventListener("click", function() {
        var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        storyContainer.scrollTo({ top: Math.max(0, storyContainer.scrollHeight - scrollFill()), behavior: reduceMotion ? "auto" : "smooth" });
    });
    var selectedChoiceText = null;
    story.onError = function(message) {
        console.error("Ink runtime issue:", message);
        var errorElement = document.createElement("p");
        errorElement.className = "runtime-error";
        errorElement.setAttribute("role", "alert");
        errorElement.textContent = "Ink runtime issue: " + message;
        storyContainer.appendChild(errorElement);
    };

    // Page features setup. The page uses the colors from game.yaml; when the writer allowed it,
    // the story menu also lets the player switch between the light and the dark look.
    var hasSave = loadSavePoint();
    setupButtons(hasSave);
    setupLookToggle();

    // The story does not run under the title screen. "Iniciar" is the only place where it starts, so
    // the browser sees the first passage, and the sounds in it, as a result of the player's own click.
    var titleScreen = document.getElementById("title-screen");
    var storyStarted = false;
    var startsFromBeginning = false;

    // A reset brings the title screen back: the story stays reset behind it, and "Iniciar" is the
    // only way in again, as on a freshly opened page.
    function showTitleScreen() {
        storyStarted = false;
        startsFromBeginning = true;
        if( titleScreen ) titleScreen.hidden = false;
        storyFrame.classList.add("title-screen-active");
        storyContainer.hidden = true;
        clearChoices();
    }

    function startStory() {
        if( storyStarted ) return;
        storyStarted = true;
        if( titleScreen ) titleScreen.hidden = true;
        storyFrame.classList.remove("title-screen-active");
        storyContainer.hidden = false;
        if( pager ) pager.refresh();

        // A saved game goes on from where it was saved, with its music. After a reset the story
        // starts from its beginning instead.
        if( startsFromBeginning ) startsFromBeginning = false;
        else if( hasSave ) restoreSavedMusic();

        // Set initial save point
        markSavePoint();

        // Kick off the start of the story!
        continueStory();
    }

    var startButton = titleScreen && titleScreen.querySelector(".choice-button");
    if( startButton ) startButton.addEventListener("click", startStory);
    else startStory();

    // Main story processing function. Each time this is called it generates
    // all the next content up as far as the next set of choices.
    function continueStory() {

        var delay = 0.0;

        // Generate story text - loop through available content
        while(story.canContinue) {

            // Get ink to generate the next paragraph
            var paragraphText = story.Continue();
            if( selectedChoiceText !== null ) {
                if( paragraphText.indexOf(selectedChoiceText) === 0 )
                    paragraphText = paragraphText.substring(selectedChoiceText.length).replace(/^\s+/, "");
                selectedChoiceText = null;
            }
            var tags = story.currentTags || [];
            var sceneTitle = null;

            // Any special tags included with this line
            var customClasses = [];
            var paragraphAlign = null;
            for(var i=0; i<tags.length; i++) {
                var tag = tags[i];
                processAudioTag(tag);

                // Detect tags of the form "X: Y". Currently used for image and class but could be
                // customised to be used for other things too.
                var splitTag = splitPropertyTag(tag);
                if( splitTag ) splitTag.property = splitTag.property.trim().replace(/^#\s*/, "").toUpperCase();

                // TITLE: text
                if( splitTag && splitTag.property == "TITLE" ) {
                    sceneTitle = splitTag.val;
                }
                else if( splitTag && splitTag.property == "ALIGN" ) {
                    var requestedAlign = splitTag.val.toLowerCase();
                    if( ["left", "center", "right"].indexOf(requestedAlign) !== -1 )
                        paragraphAlign = requestedAlign.charAt(0).toUpperCase() + requestedAlign.slice(1);
                }

                // image: src (matched case-insensitively)
                if( splitTag && splitTag.property == "IMAGE" ) {
                    var imageUrl = safeStoryUrl(splitTag.val, false);
                    if( !imageUrl ) {
                        console.warn("Blocked unsupported image URL", splitTag.val);
                        continue;
                    }
                    var imageElement = document.createElement('img');
                    imageElement.alt = "";
                    imageElement.src = imageUrl;
                    if( !showSceneImage(imageElement) )
                        storyContainer.appendChild(imageElement);

                    showAfter(delay, imageElement);
                    delay += 200.0;
                }

                // LINK: url
                else if( splitTag && splitTag.property == "LINK" ) {
                    var linkUrl = safeStoryUrl(splitTag.val, true);
                    if( linkUrl ) window.location.href = linkUrl;
                    else console.warn("Blocked unsupported story link", splitTag.val);
                }

                // LINKOPEN: url
                else if( splitTag && splitTag.property == "LINKOPEN" ) {
                    var openUrl = safeStoryUrl(splitTag.val, true);
                    if( openUrl ) window.open(openUrl, "_blank", "noopener,noreferrer");
                    else console.warn("Blocked unsupported story link", splitTag.val);
                }

                // BACKGROUND: src
                else if( splitTag && splitTag.property == "BACKGROUND" ) {
                    var backgroundUrl = safeStoryUrl(splitTag.val, false);
                    if( backgroundUrl ) {
                        if( storyFrame ) {
                            storyFrame.style.backgroundImage = "url(" + JSON.stringify(backgroundUrl) + ")";
                            storyFrame.classList.add("has-background");
                        }
                    }
                    else console.warn("Blocked unsupported background URL", splitTag.val);
                }

                // CLASS: className
                else if( splitTag && splitTag.property == "CLASS" ) {
                    customClasses.push(splitTag.val);
                }

                // CLEAR - removes all existing content and hides the header.
                // RESTART - clears everything and restarts the story from the beginning.
                else if( tag.trim().replace(/^#/, "").toUpperCase() == "CLEAR" ||
                         tag.trim().replace(/^#/, "").toUpperCase() == "RESTART" ) {
                    clearScene();
                    setVisible(".header", false);

                    if( tag.trim().replace(/^#/, "").toUpperCase() == "RESTART" ) {
                        restart();
                        return;
                    }
                }
            }

            // A scene starts with "# title:"; its "# align:" tag (if any) applies
            // to the whole scene. Without one the scene uses the story alignment. On any other
            // paragraph "# align:" only affects that paragraph.
            if( sceneTitle !== null )
                sceneAlign = paragraphAlign;
            var effectiveAlign = paragraphAlign || sceneAlign;

            if( sceneTitle !== null ) {
                var sceneTitleElement = document.createElement('h2');
                sceneTitleElement.className = 'scene-title';
                if( paragraphAlign ) sceneTitleElement.classList.add("align" + paragraphAlign);
                sceneTitleElement.textContent = plainStoryText(sceneTitle);
                storyContainer.appendChild(sceneTitleElement);
                showAfter(delay, sceneTitleElement);
                delay += 200.0;
            }
		
		// Check if paragraphText is empty
		if (paragraphText.trim().length == 0) {
                continue; // Skip empty paragraphs
		}

            // The story title and the author line follow the first paragraph below them.
            if( paragraphAlign && !storyContainer.querySelector("p:not(.choice)") )
                setHeaderAlignment(paragraphAlign);

            // Create paragraph element (initially hidden)
            var paragraphElement = document.createElement('p');
            paragraphElement.appendChild(storyTextNode(paragraphText));
            if( effectiveAlign ) paragraphElement.classList.add("align" + effectiveAlign);
            storyContainer.appendChild(paragraphElement);

            // Add any custom classes derived from ink tags
            addSafeClasses(paragraphElement, customClasses);

            var visibleTags = tags.filter(function(tag) {
                var normalized = String(tag).trim().replace(/^#\s*/, "");
                var tagProperty = splitPropertyTag(normalized);
                var property = tagProperty && tagProperty.property.toUpperCase();
                return !globalTagSet.has(String(tag))
                    && property !== "TITLE"
                    && property !== "IMAGE"
                    && property !== "ALIGN"
                    && property !== "MUSIC"
                    && property !== "SOUND";
            });
            if( visibleTags.length ) {
                var tagsElement = document.createElement('p');
                tagsElement.className = 'tags';
                tagsElement.textContent = "# " + visibleTags.join(", ");
                storyContainer.appendChild(tagsElement);
                showAfter(delay, tagsElement);
                delay += 200.0;
            }

            // Fade in paragraph after a short delay
            showAfter(delay, paragraphElement);
            delay += 200.0;
        }

        // Create HTML choices from ink choices
        story.currentChoices.forEach(function(choice) {
            // Create paragraph with anchor element
            var choiceTags = choice.tags || [];
            var customClasses = [];
            var isClickable = true;
            var visibleChoiceTags = [];
            for(var i=0; i<choiceTags.length; i++) {
                var choiceTag = choiceTags[i];
                var normalizedChoiceTag = choiceTag.trim().replace(/^#/, "").toUpperCase();
                var splitTag = splitPropertyTag(choiceTag);
                if( splitTag ) splitTag.property = splitTag.property.trim().replace(/^#\s*/, "").toUpperCase();

                if(normalizedChoiceTag == "UNCLICKABLE"){
                    isClickable = false
                }

                if( splitTag && splitTag.property == "CLASS" ) {
                    customClasses.push(splitTag.val);
                }

                // Sound tags drive the sound player; they are never shown.
                if( splitTag && (splitTag.property == "MUSIC" || splitTag.property == "SOUND") ) continue;

                visibleChoiceTags.push(choiceTag);

            }

            
            var choiceParagraphElement = document.createElement('p');
            choiceParagraphElement.classList.add("choice");

            addSafeClasses(choiceParagraphElement, customClasses);

            if(isClickable){
                var choiceButton = document.createElement("button");
                choiceButton.type = "button";
                choiceButton.className = "choice-button";
                choiceButton.appendChild(document.createTextNode(plainStoryText(choice.text)));
                choiceParagraphElement.appendChild(choiceButton);
            } else {
                var unclickableChoice = document.createElement("span");
                unclickableChoice.className = "unclickable";
                unclickableChoice.appendChild(document.createTextNode(plainStoryText(choice.text)));
                choiceParagraphElement.appendChild(unclickableChoice);
            }
            if( visibleChoiceTags.length ) {
                var choiceTagsElement = document.createElement("span");
                choiceTagsElement.className = "tags";
                choiceTagsElement.textContent = " # " + visibleChoiceTags.join(" # ");
                if(isClickable) choiceButton.appendChild(choiceTagsElement);
                else choiceParagraphElement.appendChild(choiceTagsElement);
            }
            choicesContainer.appendChild(choiceParagraphElement);
            choicesContainer.hidden = false;
            storyFrame.classList.add("has-choices");

            // Fade choice in after a short delay
            showAfter(delay, choiceParagraphElement);
            delay += 200.0;

            // Click on choice
            if(isClickable){
                choiceButton.addEventListener("click", function() {

                    // The chosen branch replaces the passage on screen, as the Preview does.
                    clearScene();

                    // Tell the story where to go next
                    selectedChoiceText = choice.text;
                    choiceTags.forEach(processAudioTag);
                    story.ChooseChoiceIndex(choice.index);

                    // This is where the save button will save from
                    markSavePoint();

                    // Aaand loop
                    continueStory();
                });
            }
        });

        // A passage divided into pages starts at its first page: nothing scrolls.
        if( pager ) pager.refresh();
        if( !storyFrame.classList.contains("is-paged") ) scrollToNewContent();
        updateMoreBelow();
    }

    function restart() {
        sceneAlign = null;
        audioEngine.stopSoundEffects();
        story.ResetState();

        setVisible(".header", true);

        // set save point to here
        markSavePoint();

        continueStory();

        storyContainer.scrollTop = 0;
        resetScrollFill();
    }

    // -----------------------------------
    // Various Helper functions
    // -----------------------------------

    // Detects whether the user accepts animations
    function isAnimationEnabled() {
        return window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    }

    // Fades in an element after a specified delay
    function showAfter(delay, el) {
        if( isAnimationEnabled() ) {
            el.classList.add("hide");
            setTimeout(function() { el.classList.remove("hide") }, delay);
        } else {
            // If the user doesn't want animations, show immediately
            el.classList.remove("hide");
        }
    }

    // Clear the story content while preserving the page header and background.
    // The incoming line or selected branch is rendered after this call.
    // The header (story title + author) takes the alignment of the first paragraph
    // below it, or the story alignment when that paragraph has no "# align:" tag.
    function setHeaderAlignment(alignment) {
        var header = storyFrame.querySelector(".header");
        if( !header ) return;
        header.classList.remove("alignLeft", "alignCenter", "alignRight");
        if( alignment ) header.classList.add("align" + alignment);
    }

    // The first picture of a scene becomes the frame's visual panel; any further
    // pictures stay in the text, as before.
    function showSceneImage(imageElement) {
        if( !storyVisual || !storyFrame ) return false;
        if( storyFrame.classList.contains("has-visual") ) return false;
        storyVisual.textContent = "";
        storyVisual.appendChild(imageElement);
        storyVisual.hidden = false;
        storyFrame.classList.add("has-visual");
        return true;
    }

    function clearStoryImage() {
        if( !storyVisual || !storyFrame ) return;
        storyVisual.textContent = "";
        storyVisual.hidden = true;
        storyFrame.classList.remove("has-visual");
    }

    function clearChoices() {
        if( choicesContainer ) {
            choicesContainer.textContent = "";
            choicesContainer.hidden = true;
        }
        storyFrame.classList.remove("has-choices");
    }

    function clearScene() {
        sceneAlign = null;
        setHeaderAlignment(null);
        storyContainer.scrollTop = 0;
        resetScrollFill();
        removeAll("p");
        removeAll(".scene-title");
        removeAll("img");
        removeAll("hr");
        clearChoices();
        clearStoryImage();
    }

    // Remove all elements that match the given selector. Used for removing choices after
    // you've picked one, as well as for the CLEAR and RESTART tags.
    function removeAll(selector)
    {
        var allElements = storyContainer.querySelectorAll(selector);
        for(var i=0; i<allElements.length; i++) {
            var el = allElements[i];
            el.parentNode.removeChild(el);
        }
    }

    // Bring the new turn to the top of the passage. When the turn is too short to
    // reach that position, a filler below adds the scroll room.
    function scrollToNewContent() {
        function startTop() {
            var dividers = storyContainer.querySelectorAll("hr");
            var newContent = dividers.length ? dividers[dividers.length - 1].nextElementSibling : null;
            return newContent ? newContent.offsetTop : 0;
        }
        // The story's own height. scrollHeight is clamped to the viewport when the
        // text is short, and the filler must not count as story.
        function contentHeight() {
            var last = storyContainer.lastElementChild;
            if( !last ) return 0;
            var paddingBottom = parseFloat(window.getComputedStyle(storyContainer).paddingBottom) || 0;
            return last.offsetTop + last.offsetHeight + paddingBottom;
        }
        var paddingTop = parseFloat(window.getComputedStyle(storyContainer).paddingTop) || 0;

        function fillFor(target) {
            return target > 0 ? Math.max(0, target + storyContainer.clientHeight - contentHeight()) : 0;
        }

        var target = Math.max(0, startTop() - paddingTop);
        storyContainer.style.setProperty("--story-scroll-fill", fillFor(target) + "px");
        // Once the filler makes the passage overflow, a short turn is no longer
        // centred, so its position is measured again before scrolling.
        target = Math.max(0, startTop() - paddingTop);
        storyContainer.style.setProperty("--story-scroll-fill", fillFor(target) + "px");
        storyContainer.style.setProperty("--story-top-cover", paddingTop + "px");
        storyContainer.scrollTop = target;
    }

    function resetScrollFill() {
        storyContainer.style.setProperty("--story-scroll-fill", "0px");
        storyContainer.style.setProperty("--story-top-cover", "0px");
    }

    // The filler below the last turn is scroll room, not story: it never counts as
    // "more below".
    function scrollFill() {
        return parseFloat(window.getComputedStyle(storyContainer).getPropertyValue("--story-scroll-fill")) || 0;
    }

    // Used for hiding and showing the header when you CLEAR or RESTART the story respectively.
    function setVisible(selector, visible)
    {
        var allElements = storyFrame.querySelectorAll(selector);
        for(var i=0; i<allElements.length; i++) {
            var el = allElements[i];
            if( !visible )
                el.classList.add("invisible");
            else
                el.classList.remove("invisible");
        }
    }

    // Helper for parsing out tags of the form:
    //  # PROPERTY: value
    // e.g. image: source path
    function splitPropertyTag(tag) {
        var propertySplitIdx = tag.indexOf(":");
        if( propertySplitIdx != null ) {
            var property = tag.substr(0, propertySplitIdx).trim();
            var val = tag.substr(propertySplitIdx+1).trim();
            return {
                property: property,
                val: val
            };
        }

        return null;
    }

    // Loads save state if exists in the browser memory
    function loadSavePoint() {

        try {
            let savedState = window.localStorage.getItem(saveKey);
            if (savedState) {
                story.state.LoadJson(savedState);
                return true;
            }
        } catch (e) {
            console.warn("Discarding an incompatible story save", e);
            discardSavePoint();
        }
        return false;
    }

    function discardSavePoint() {
        story.ResetState();
        try {
            window.localStorage.removeItem(saveKey);
            window.localStorage.removeItem(saveKey + ":music");
        } catch(e) {
            console.warn("Couldn't remove the incompatible story save", e);
        }
    }

    // The light/dark switch in the story menu. The alternate look is the set of variables under
    // :root[data-look="alternate"] (see style.css); the choice is remembered in this browser.
    function setupLookToggle() {
        var button = document.getElementById("theme-toggle");
        if( !button ) return;
        if( document.body.getAttribute("data-theme-toggle") !== "on" ) {
            button.hidden = true;
            return;
        }
        var initial = document.body.getAttribute("data-theme-initial") === "dark" ? "dark" : "light";
        var alternate = document.body.getAttribute("data-theme-alternate") === "dark" ? "dark" : "light";
        var key = "inky-look:" + window.location.pathname;
        var root = document.documentElement;
        function showsAlternate() { return root.getAttribute("data-look") === "alternate"; }
        function refresh() {
            var target = showsAlternate() ? initial : alternate;
            var label = target === "dark" ? "Dark theme" : "Light theme";
            var text = button.querySelector("span");
            if( text ) text.textContent = label;
            button.title = label;
            button.setAttribute("aria-label", "Change to " + label.toLowerCase());
        }
        button.hidden = false;
        try {
            if( window.localStorage.getItem(key) === "alternate" ) root.setAttribute("data-look", "alternate");
        } catch(e) {}
        button.addEventListener("click", function() {
            if( showsAlternate() ) root.removeAttribute("data-look");
            else root.setAttribute("data-look", "alternate");
            try {
                window.localStorage.setItem(key, showsAlternate() ? "alternate" : "base");
            } catch(e) {
                console.warn("Couldn't remember the theme");
            }
            refresh();
        });
        refresh();
    }

    // Used to hook up the functionality for global functionality buttons
    function setupButtons(hasSave) {
        let popovers = [
            {
                toggle: document.getElementById("menu-toggle"),
                panel: document.getElementById("story-menu")
            },
            {
                toggle: document.getElementById("settings-toggle"),
                panel: document.getElementById("audio-settings")
            }
        ].filter(function(popover) { return popover.toggle && popover.panel; });
        let closePopovers = function(except) {
            popovers.forEach(function(popover) {
                if( popover === except ) return;
                popover.panel.hidden = true;
                popover.toggle.setAttribute("aria-expanded", "false");
            });
        };
        popovers.forEach(function(popover) {
            popover.toggle.addEventListener("click", function() {
                let shouldOpen = popover.panel.hidden;
                closePopovers(popover);
                popover.panel.hidden = !shouldOpen;
                popover.toggle.setAttribute("aria-expanded", String(shouldOpen));
            });
        });
        if( popovers.length ) {
            document.addEventListener("click", function(event) {
                if( !document.getElementById("controls").contains(event.target) ) closePopovers();
            });
            document.addEventListener("keydown", function(event) {
                if( event.key !== "Escape" ) return;
                let openPopover = popovers.find(function(popover) { return !popover.panel.hidden; });
                if( openPopover ) {
                    closePopovers();
                    openPopover.toggle.focus();
                }
            });
            document.querySelectorAll("#story-menu > button").forEach(function(button) {
                button.addEventListener("click", closePopovers);
            });
        }

        let rewindEl = document.getElementById("rewind");
        if (rewindEl) rewindEl.addEventListener("click", function(event) {
            closePopovers();
            if( !storyStarted ) return;
            sceneAlign = null;
            setHeaderAlignment(null);
            removeAll("p");
            removeAll(".scene-title");
            removeAll("img");
            removeAll("hr");
            clearChoices();
            clearStoryImage();
            storyContainer.scrollTop = 0;
            resetScrollFill();
            setVisible(".header", true);
            audioEngine.setMusicUrl(null);
            audioEngine.stopSoundEffects();
            story.ResetState();
            showTitleScreen();
        });

        let saveEl = document.getElementById("save");
        if (saveEl) saveEl.addEventListener("click", function(event) {
            closePopovers();
            if( !storyStarted ) return;
            try {
                window.localStorage.setItem(saveKey, savePoint);
                window.localStorage.setItem(saveKey + ":music", savePointMusic);
                document.getElementById("reload").removeAttribute("disabled");
            } catch (e) {
                console.warn("Couldn't save state");
            }

        });

        let reloadEl = document.getElementById("reload");
        if (reloadEl && !hasSave) {
            reloadEl.setAttribute("disabled", "disabled");
        }
        if (reloadEl) reloadEl.addEventListener("click", function(event) {
            if (reloadEl.getAttribute("disabled"))
                return;

            closePopovers();
            if( !storyStarted ) return;
            storyContainer.scrollTop = 0;
            resetScrollFill();
            sceneAlign = null;
            setHeaderAlignment(null);
            removeAll("p");
            removeAll(".scene-title");
            removeAll("img");
            removeAll("hr");
            clearChoices();
            clearStoryImage();
            try {
                let savedState = window.localStorage.getItem(saveKey);
                if (savedState) story.state.LoadJson(savedState);
            } catch (e) {
                console.warn("Discarding an incompatible story save", e);
                discardSavePoint();
                reloadEl.setAttribute("disabled", "disabled");
            }
            restoreSavedMusic();
            continueStory();
        });

    }

})(storyContent);
