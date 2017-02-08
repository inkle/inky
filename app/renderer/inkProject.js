const remote = require('electron').remote;
const dialog = remote.dialog;
const ipc = require("electron").ipcRenderer;
const path = require("path");
const fs = require("fs");
const _ = require("lodash");
const chokidar = require('chokidar');
const mkdirp = require('mkdirp');

const EditorView = require("./editorView.js").EditorView;
const NavView = require("./navView.js").NavView;

const InkFile = require("./inkFile.js").InkFile;
const LiveCompiler = require("./liveCompiler.js").LiveCompiler;

// -----------------------------------------------------------------
// InkProject
// -----------------------------------------------------------------

InkProject.events = {};
InkProject.currentProject = null;

// mainInkFilePath is optional, if creating a brand new untitled project
// Can also be absolute, if loading a project.
function InkProject(mainInkFilePath) {
    this.files = [];
    this.hasUnsavedChanges = false;
    this.unsavedFiles = [];

    this.mainInk = null;
    this.mainInk = this.createInkFile(mainInkFilePath || null);

    this.showInkFile(this.mainInk);

    this.startFileWatching();
}

InkProject.prototype.createInkFile = function(anyPath) {
    var inkFile = new InkFile(anyPath || null, this.mainInk, {
        fileChanged: () => { 
            if( inkFile.hasUnsavedChanges && !this.unsavedFiles.contains(inkFile) ) {
                this.unsavedFiles.push(inkFile);
                this.refreshUnsavedChanges();
            }

            // When a file is changed, its state may change to have unsaved changes,
            // which should be reflected in the sidebar (unsaved files are bold)
            this.refreshIncludes();
        },

        // Called when InkFile finds an INCUDE line in the contents of the file
        includesChanged: () => {         
            this.refreshIncludes();
            if( inkFile.includes.length > 0  )
                NavView.initialShow();
        }
    });

    this.files.push(inkFile);

    return inkFile;
}

InkProject.prototype.addNewInclude = function(newIncludePath, addToMainInk) {

    var newIncludeFile = this.createInkFile(newIncludePath || null);

    if( addToMainInk )
        this.mainInk.addIncludeLine(newIncludeFile.relativePath());

    NavView.setFiles(this.mainInk, this.files);
    return newIncludeFile;
}

// - Mark old includes as spare if they're no longer included
// - Load any newly discovered includes
// - Refresh nav hierarchy in sidebar
InkProject.prototype.refreshIncludes = function() {

    var allIncludes = [];
    var existingRelFilePaths = _.map(_.without(this.files, this.mainInk), (f) => f.relativePath());

    var relPathsFromINCLUDEs = [];
    var addIncludePathsFromFile = (inkFile) => {
        if( !inkFile.includes )
            return;

        inkFile.includes.forEach(incPath => {
            relPathsFromINCLUDEs.push(incPath);

            var recurseInkFile = this.inkFileWithRelativePath(incPath);
            if( recurseInkFile )
                addIncludePathsFromFile(recurseInkFile);
        });
    }
    addIncludePathsFromFile(this.mainInk);

    // Includes that we don't have in this.files yet that are mentioned in other files
    var includeRelPathsToLoad = _.difference(relPathsFromINCLUDEs, existingRelFilePaths)

    // Files that are in this.files that aren't actually mentioned anywhere
    var spareRelFilePaths = _.difference(existingRelFilePaths,  relPathsFromINCLUDEs);

    // Mark files that are spare, and remove those that aren't needed at all
    var filesToRemove = [];
    this.files.forEach(f => {
        f.isSpare = spareRelFilePaths.indexOf(f.relativePath()) != -1;

        // Remove brand new files that aren't included anywhere - otherwise they're spare
        if( f.isSpare && f.brandNewEmpty )
            filesToRemove.push(f);
    });
    this.files = _.difference(this.files, filesToRemove);

    includeRelPathsToLoad.forEach(newIncludeRelPath => this.createInkFile(newIncludeRelPath));

    NavView.setFiles(this.mainInk, this.files);
}

InkProject.prototype.refreshUnsavedChanges = function() {

    this.hasUnsavedChanges = this.unsavedFiles.length > 0;

    // Update NavView for whether files are bold or not
    // TODO: This could be faster if it simply refreshes the state rather than
    // rebuilding the entire nav view hierarchy
    NavView.setFiles(this.mainInk, this.files);

    // Overall, are there *any* unsaved changes, and has the state changed?
    // Change the dot in the Mac close window button
    remote.getCurrentWindow().setDocumentEdited(this.hasUnsavedChanges);
}

InkProject.prototype.startFileWatching = function() {
    if( !this.mainInk.projectDir )
        return;

    if( this.fileWatcher )
        this.fileWatcher.close();

    var watchPath = path.join(this.mainInk.projectDir, "**/*.ink");
    this.fileWatcher = chokidar.watch(watchPath);

    this.fileWatcher.on("add", newlyFoundAbsFilePath => {
        var relPath = path.relative(this.mainInk.projectDir, newlyFoundAbsFilePath);
        var existingFile = _.find(this.files, f => f.relativePath() == relPath);
        if( !existingFile ) {
            console.log("Watch found new file - creating it: "+relPath);
            this.createInkFile(newlyFoundAbsFilePath);

            // TODO: Find a way to refresh includes without spamming it
            this.refreshIncludes();
        } else {
            console.log("Watch found file but it already existed: "+relPath);
        }
    });

    this.fileWatcher.on("change", updatedAbsFilePath => {
        var relPath = path.relative(this.mainInk.projectDir, updatedAbsFilePath);
        var inkFile = _.find(this.files, f => f.relativePath() == relPath);
        if( inkFile ) {
            // TODO: maybe ask user if they want to overwrite? not sure I want to though
            if( !inkFile.hasUnsavedChanges )

                if( this.activeInkFile == inkFile )
                    EditorView.saveCursorPos();

                inkFile.tryLoadFromDisk(success => {
                    if( success && this.activeInkFile == inkFile )
                        setImmediate(() => EditorView.restoreCursorPos());
                });
        }
    });
    this.fileWatcher.on("unlink", removedAbsFilePath => {
        var relPath = path.relative(this.mainInk.projectDir, removedAbsFilePath);
        var inkFile = _.find(this.files, f => f.relativePath() == relPath);
        if( inkFile ) {
            if( !inkFile.hasUnsavedChanges && inkFile != this.mainInk ) {
                this.deleteInkFile(inkFile);
            }
        }
    });
}

InkProject.prototype.showInkFile = function(inkFile) {

    if( _.isString(inkFile) )
        inkFile = this.inkFileWithRelativePath(inkFile);

    if( inkFile && inkFile != this.activeInkFile ) {
        if( this.activeInkFile )
            this.activeInkFile.isActive = false;

        this.activeInkFile = inkFile;

        if( this.activeInkFile )
            this.activeInkFile.isActive = true;

        EditorView.showInkFile(inkFile);
        InkProject.events.didSwitchToInkFile(this.activeInkFile);
    }
}

InkProject.prototype.save = function() {

    var wasUnsaved = !this.mainInk.projectDir;

    var filesRemaining = this.files.length;
    var includeFiles = _.filter(this.files, f => f != this.mainInk);

    var allSuccess = true;

    var singleFileSaveComplete = (file, success) => {
        allSuccess = allSuccess && success;
        if( success ) this.unsavedFiles.remove(file);

        filesRemaining--;
        if( filesRemaining == 0 ) {
            this.refreshUnsavedChanges();

            if( allSuccess )
                InkProject.events.didSave();
        }
    }

    // Save main ink to ensure the other files have a base directory path
    this.mainInk.save(success => {
        singleFileSaveComplete(this.mainInk, success);

        // May not be a success if cancelled, in which case we stop early
        if( success ) {

            if( wasUnsaved ) this.startFileWatching();

            includeFiles.forEach(f => f.save(success => singleFileSaveComplete(f, success)));
        }
    });
}

// Helper to copy a file whilst optionally transforming the content
function copyFile(source, destination, transform) {
    fs.readFile(source, "utf8", (err, fileContent) => {
        if( !err && fileContent ) {
            if( transform ) fileContent = transform(fileContent);
            if( fileContent.length < 1 ) throw "Trying to write (copy) empty file!";
            
            fs.writeFile(destination, fileContent, "utf8");
        }
    });
}

// exportType is "json", "web", or "js"
InkProject.prototype.export = function(exportType) {

    // Always start by building the JSON
    LiveCompiler.exportJson((err, compiledJsonTempPath) => {
        if( err ) {
            alert("Could not export: "+err);
            return;
        }

        if( !this.defaultExportPath && this.mainInk.absolutePath() ) {
            this.defaultExportPath = this.mainInk.absolutePath();
        }

        if( this.defaultExportPath ) {
            var pathObj = path.parse(this.defaultExportPath);
            if( exportType == "json" ) {
                pathObj.ext = ".json";
            } else if( exportType == "js" ) {
                // If we already have a default export path specifically for JS files
                // then we use that, otherwise let's use the standard JS naming scheme
                if( pathObj.ext != ".js" )
                    pathObj.base = path.basename(this.jsFilename());
                pathObj.ext = ".js";
            } else {
                // Strip existing extension
                pathObj.base = path.basename(pathObj.base, pathObj.ext);
                pathObj.ext = "";
            }

            this.defaultExportPath = path.format(pathObj);
        }

        var saveOptions = {
            defaultPath: this.defaultExportPath
        }

        if( exportType == "json" ) {
            saveOptions.filters = [
                { name: "JSON files", extensions: ["json"] }
            ]
        } else if( exportType == "js" ) {
            saveOptions.filters = [
                { name: "JavaScript files", extensions: ["js"] }
            ]
        }

        dialog.showSaveDialog(remote.getCurrentWindow(), saveOptions, (targetSavePath) => {
            if( targetSavePath ) { 
                this.defaultExportPath = targetSavePath;

                // JSON export - simply move compiled json into place
                if( exportType == "json" || exportType == "js" ) {
                    fs.stat(targetSavePath, (err, stats) => {

                        // File already exists, or there's another error
                        // (error when code == ENOENT means file doens't exist, which is fine)
                        if( !err || err.code != "ENOENT" ) {
                            if( err ) alert("Sorry, could not save to "+targetSavePath);

                            if( stats.isFile() ) fs.unlinkSync(targetSavePath);

                            if( stats.isDirectory() ) {
                                alert("Could not save because directory exists with the given name");
                                return
                            }
                        }

                        // JS file: 
                        if( exportType == "js" ) {
                            this.convertJSONToJS(compiledJsonTempPath, targetSavePath);
                        } 

                        // JSON: Just copy into place
                        else {
                            copyFile(compiledJsonTempPath, targetSavePath);
                        }

                    });
                }

                // Web export
                else {
                    this.buildForWeb(compiledJsonTempPath, targetSavePath);
                }
            }
        });
    });
}

InkProject.prototype.exportJson = function() {
    this.export("json");
}

InkProject.prototype.exportForWeb = function() {
    this.export("web");
}

InkProject.prototype.exportJSOnly = function() {
    this.export("js");
}

InkProject.prototype.jsFilename = function() {
    // Derive story content js file from root ink filename
    // Remove .ink extension if it's ".ink"
    var mainInkRootName = this.mainInk.filename();
    if( path.extname(mainInkRootName) == ".ink" )
        mainInkRootName = path.basename(mainInkRootName, ".ink");
    var jsContentFilename = mainInkRootName+".js";

    // Avoid naming collision with our own main.js
    // (if user chose "main.ink" for their root ink)
    if( jsContentFilename == "main.js" ) {
        jsContentFilename = "story.js";
    }

    return jsContentFilename;
}

// Convert JSON to JS file with "var storyContent = "
InkProject.prototype.convertJSONToJS = function(jsonFilePath, targetJSPath) {
    copyFile(jsonFilePath, targetJSPath, (jsonContent) => {
        return `var storyContent = ${jsonContent};`;
    });
}

InkProject.prototype.buildForWeb = function(jsonFilePath, targetDirectory) {

    var templateDir = path.join(__dirname, "../export-for-web-template");

    // Derive story title from save name
    var storyTitle = path.basename(targetDirectory);
    
    // Unless the writer explicitly provided a tag with the title
    var mainInkTagDict = this.mainInk.symbols.globalDictionaryStyleTags;
    if( mainInkTagDict && mainInkTagDict["title"] ) {
        storyTitle = mainInkTagDict["title"];
    }

    // Create target directory name
    mkdirp.sync(targetDirectory);

    // Create JS story file with correct name
    var jsFullPath = path.join(targetDirectory, this.jsFilename());
    this.convertJSONToJS(jsonFilePath, jsFullPath);

    // Copy index.html:
    //  - inserting the filename as the <title> and <h1>
    //  - Inserting the correct name of the javascript file
    copyFile(path.join(templateDir, "index.html"), 
             path.join(targetDirectory, "index.html"), 
             (fileContent) => {
        fileContent = fileContent.replace(/##STORY TITLE##/g, storyTitle);
        fileContent = fileContent.replace(/##JAVASCRIPT FILENAME##/g, this.jsFilename());
        return fileContent;
    });

    // Copy other files verbatim
    copyFile(path.join(__dirname, "../node_modules/inkjs/dist/ink.js"), 
             path.join(targetDirectory, "ink.js"));

    copyFile(path.join(templateDir, "style.css"), 
             path.join(targetDirectory, "style.css"));

    copyFile(path.join(templateDir, "main.js"), 
         path.join(targetDirectory, "main.js"));
}

InkProject.prototype.tryClose = function() {
    if( this.hasUnsavedChanges ) {
        dialog.showMessageBox(remote.getCurrentWindow(), {
            type: "warning",
            message: "Would you like to save changes before exiting?",
            detail: "Your changes will be lost if you don't save.",
            buttons: [
                "Save",
                "Don't save",
                "Cancel"
            ],
            defaultId: 0
        }, (response) => {
            // Save
            if( response == 0 ) {
                this.save(false, () => {
                    this.closeImmediate();
                });
            }

            // Don't save
            else if( response == 1 ) {
                this.closeImmediate();
            }

            // Cancel
            else { 
                ipc.send("project-cancelled-close");
            }
        });
    } 

    // Nothing to save, just exit
    else {
        this.closeImmediate();
    }
}

InkProject.prototype.closeImmediate = function() {
    ipc.send("project-final-close");
}

InkProject.prototype.inkFileWithRelativePath = function(relativePath) {
    return _.find(this.files, f => f.relativePath() == relativePath);
}

InkProject.prototype.inkFileWithId = function(id) {
    return _.find(this.files, f => f.id == id);
}

InkProject.prototype.deleteInkFile = function(inkFile) {

    if( this.activeInkFile == inkFile )
        this.showInkFile(this.mainInk);

    inkFile.deleteFromDisk();

    this.files.remove(inkFile);

    NavView.setFiles(this.mainInk, this.files);
}

InkProject.prototype.findSymbol = function(name, posContext) {

    // Name components
    var nameComps = name.split(".");
    var baseName = nameComps[0];
    var tailNameComps = nameComps.slice(1);

    // Find starting symbol based on the context
    var symbolContext = this.activeInkFile.symbols.symbolAtPos(posContext);

    // Helper function to search downward into a symbol to find a single name
    function findWithinSymbolDeep(withinSymbol, targetName) {
        if( withinSymbol.innerSymbols ) {
            var foundSym = withinSymbol.innerSymbols[targetName];
            if( foundSym ) {
                return foundSym;
            } else {
                for(var innerSymName in withinSymbol.innerSymbols) {
                    foundSym = findWithinSymbolDeep(withinSymbol.innerSymbols[innerSymName])
                    if( foundSym )
                        return foundSym;
                }
            }
        }
    }

    // Try searching towards leaves first
    var baseSymbol = findWithinSymbolDeep(symbolContext, baseName);

    // Otherwise, work our way up to a broader and broader scope to
    // find the a symbol that contains the base name we're looking for
    if( !baseSymbol ) {
        while(symbolContext) {
            if( symbolContext.innerSymbols ) {
                var found = symbolContext.innerSymbols[baseName];
                if( found ) {
                    baseSymbol = found;
                    break;
                }
            }
            symbolContext = symbolContext.parent;
        }
    }

    // Finally, try to search within all files scope
    if( !baseSymbol ) {

        // Collect all symbols
        var allSymbols = {};
        for(var i=0; i<this.files.length; i++) {
            var file = this.files[i];
            var fileSymbols = file.symbols.getSymbols();
            var found = fileSymbols[baseName];
            if( found ) {
                baseSymbol = found;
                break;
            }
        }
    }
    
    if( !baseSymbol ) {
        console.log("Failed to find base symbol: "+baseName);
        return null;
    }

    // Resolve the rest of the path
    var symbol = baseSymbol;
    for(var i=0; i<tailNameComps.length; i++) {
        var tailComp = tailNameComps[i];
        var tailSymbol = findWithinSymbolDeep(symbol, tailComp);
        if( !tailSymbol ) {
            console.log("Failed to find complete path due to not finding: "+tailComp);
            return symbol;
        }
        
        symbol = tailSymbol;
    }

    console.log("Found "+symbol.name);
    return symbol;
}

InkProject.setEvents = function(e) {
    InkProject.events = e;
}

InkProject.startNew = function() {
    InkProject.setProject(new InkProject());
}

InkProject.loadProject = function(mainInkPath) {
    InkProject.setProject(new InkProject(mainInkPath));
}

InkProject.setProject = function(project) {
    InkProject.currentProject = project;
    InkProject.events.newProject(project);
}

ipc.on("set-project-main-ink-filepath", (event, filePath) => {
    InkProject.loadProject(filePath);
});

ipc.on("project-new-include", () => {
    if( InkProject.currentProject ) {
        NavView.show();
        NavView.showAddIncludeForm();
    }
});

ipc.on("project-save", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.save();
    }
});

ipc.on("project-export", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.exportJson();
    }
});

ipc.on("project-export-for-web", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.exportForWeb();
    }
});

ipc.on("project-export-js-only", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.exportJSOnly();
    }
});

ipc.on("project-tryClose", (event) => {
    if( InkProject.currentProject ) {
        InkProject.currentProject.tryClose();
    }
});


exports.InkProject = InkProject;