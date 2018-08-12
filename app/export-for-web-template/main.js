(function(storyContent) {

    var story = new inkjs.Story(storyContent);

    var storyContainer = document.querySelectorAll('#story')[0];

    // Fades in an element after a specified delay
    function showAfter(delay, el) {
        el.classList.add("hide");
        setTimeout(function() { el.classList.remove("hide") }, delay);
    }

    function scrollToBottom() {
        var progress = 0.0;
        var start = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        var dist = document.body.scrollHeight - window.innerHeight - start;
        if( dist < 0 ) return;

        var duration = 300 + 300*dist/100;
        var startTime = null;
        function step(time) {
            if( startTime == null ) startTime = time;
            var t = (time-startTime) / duration;
            var lerp = 3*t*t - 2*t*t*t;
            window.scrollTo(0, start + lerp*dist);
            if( t < 1 ) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function removeAll(selector)
    {
        var allElements = storyContainer.querySelectorAll(selector);
        for(var i=0; i<allElements.length; i++) {
            var el = allElements[i];
            el.parentNode.removeChild(el);
        }
    }

    function continueStory() {

        var paragraphIndex = 0;
        var delay = 0.0;

        // Generate story text - loop through available content
        while(story.canContinue) {

            // Get ink to generate the next paragraph
            var paragraphText = story.Continue();
            var tags = story.currentTags;
            
            // Any special tags included with this line
            var customClasses = [];
            for(var i=0; i<tags.length; i++) {
                var tag = tags[i];

                // Remove all existing content.
                if( tag == "CLEAR" ) {
                    removeAll("p");
                    removeAll("img");
                    
                    // Comment out this line if you want to leave the header visible when clearing
                    removeAll("h1");
                }

                // Detect tags of the form "X: Y". Currently used for IMAGE but could be
                // customised to be used for other things too.
                else {
                    var propertySplitIdx = tag.indexOf(":");
                    if( propertySplitIdx != null ) {
                        var property = tag.substr(0, propertySplitIdx).trim();
                        var val = tag.substr(propertySplitIdx+1).trim();    

                        // IMAGE
                        if( property == "IMAGE" ) {
                            var imageElement = document.createElement('img');
                            imageElement.src = val;
                            storyContainer.appendChild(imageElement);

                            showAfter(delay, imageElement);
                            delay += 200.0;
                        }

                        // CLASS
                        if( property == "CLASS" ) {
                            customClasses.push(val);
                        }
                    }
                }
            }

            // Create paragraph element (initially hidden)
            var paragraphElement = document.createElement('p');
            paragraphElement.innerHTML = paragraphText;
            storyContainer.appendChild(paragraphElement);
            
            // Add any custom classes derived from ink tags
            for(var i=0; i<customClasses.length; i++)
                paragraphElement.classList.add(customClasses[i]);

            // Fade in paragraph after a short delay
            showAfter(delay, paragraphElement);
            delay += 200.0;
        }

        // Create HTML choices from ink choices
        story.currentChoices.forEach(function(choice) {

            // Create paragraph with anchor element
            var choiceParagraphElement = document.createElement('p');
            choiceParagraphElement.classList.add("choice");
            choiceParagraphElement.innerHTML = `<a href='#'>${choice.text}</a>`
            storyContainer.appendChild(choiceParagraphElement);

            // Fade choice in after a short delay
            showAfter(delay, choiceParagraphElement);
            delay += 200.0;

            // Click on choice
            var choiceAnchorEl = choiceParagraphElement.querySelectorAll("a")[0];
            choiceAnchorEl.addEventListener("click", function(event) {

                // Don't follow <a> link
                event.preventDefault();

                // Remove all existing choices
                removeAll("p.choice");

                // Tell the story where to go next
                story.ChooseChoiceIndex(choice.index);

                // Aaand loop
                continueStory();
            });
        });

        scrollToBottom();
    }

    continueStory();

})(storyContent);