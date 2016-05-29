# TODO

## SOON

* Multi-ink file editing
    * Add filenames to issue browser
    * Highlight files in nav that have errors
    * Creation / saving of includes
        * File -> Add Include...
        * (+) button at bottom of sidebar
        * Simply typing into new include file created by writing an INCLUDE line
        * Contextual menu on includes (Rename, Delete)
        * File -> Rename include
    * Recursive include file parsing (currently it only works one include level deep)
    * Automatic discovery of other nearby ink files in addition to those that are INCLUDE-ed

## Features and improvements

* Back and forward buttons
* Drag split view divider
    * And hide/show editor and player views?
* Pause live compilation / playing?
* Switch to specific ink file within the current project when opening an ink file externally that's related to the current project
* Error checking for file system integration (opening / saving files etc currently doesn't check for any errors)

## Engineering

* **FIX:**
    
    * Quit never completes if it has to go through a project save dialog (even when not saving)
    * When inklecate crashes, we should handle it specially
    * Replaying a story goes through a transition for the last turn
        * jquery still fades in the last chunk even though it's a replay
        * should force the view height never to get smaller despite temporary content reduction
    * Cmd-D for "don't save" option
    * Only write out ink files that have changed for compilation
    * (VERIFY) Multiple windows - can be flaky? e.g. saving v.s. compiling etc
    * (DONE?) Reliability of story reloading - sometimes it fails
    * (DONE?) Copies of inklecate left open sometimes

* inklecate.js should compile within a project/window specific sub-folder to avoid collisions
    * Investigate fs.mkdtemp(prefix, callback)

* Convert ad-hoc style events to be proper NodeJS EventEmitters (?)
