(() => {
    const fs = require('fs');
    const path = require('path');
    const readline = require('readline');
    const { JSDOM } = require('../app/node_modules/jsdom');

    // JSON utils
    const PrettyJSON = (str) => JSON.stringify(str, null, 2); 

    // FS utils
    const WriteJSONTo = (json, filePath) => {
        if (filePath) {
            fs.writeFileSync(filePath, PrettyJSON(json));
            console.info("All done.");
        } else {
            console.info("No output directory specified, the file content will be printed on stdout.\n");
            console.info(outputFile);
            console.info(PrettyJSON(json));
        }
    };
    const OverWriteJSONTo = (json, filePath) => {
        fs.rmSync(filePath);
        WriteJSONTo(json, filePath);
    };

    // Extraction utils
    const ExtractFromJS = filePath => {
        const fileContent = fs.readFileSync(filePath);
        const matches = Array.from(RegExp.prototype[Symbol.matchAll].call(re, fileContent));
        return matches.reduce((acc, match) => ({...acc, [match[2]]: ""}), {});
    };
    const ExtractFromHTML = filePath => {
        const mustBeExtracted = ['textContent', 'title', 'placeholder'];
        const fileContent = fs.readFileSync(filePath);
        const dom = new JSDOM(fileContent);
        const matches = Array.from(dom.window._document.querySelectorAll('.i18n')).map(
            elem => mustBeExtracted.map(key => elem[key] ? elem[key] : undefined).filter(x => x != undefined && x.trim().length)
        ).flat(1);
        return matches.reduce((acc, match) => ({...acc, [match]: ""}), {});
    };

    // Extract all msgids from a directory
    const re = new RegExp(/i18n\._\((['"])(.+?)\1\)/, 'gm');
    const Extract = dirPath => {
        let msgs = {};

        fs.readdirSync(dirPath).forEach(file => {
            // we don't want anything to do with node_modules/ or acesrc/
            if (['node_modules', 'acesrc'].indexOf(file) >= 0) { return; }

            const filePath = path.join(dirPath, file);
            if (fs.lstatSync(filePath).isDirectory()) {
                msgs = Object.assign({}, msgs, Extract(filePath));
            } else if (path.extname(file) === ".js") {
                msgs = Object.assign({}, msgs, ExtractFromJS(filePath));
            } else if (path.extname(file) === ".html") {
                msgs = Object.assign({}, msgs, ExtractFromHTML(filePath));
            }
        });

        return msgs;
    };

    // Handle CLI arguments
    const IsNodeInvoke = () => !process.argv[0].endsWith(__filename);
    const CheckArgs = () => process.argv.length >= (IsNodeInvoke() ? 3 : 2);
    const GetLocale = () => IsNodeInvoke() ? process.argv[2] : process.argv[1];
    const HasOutputDir = () => process.argv.length >= (IsNodeInvoke() ? 4 : 5);
    const GetOutputDir = () => process.argv[IsNodeInvoke() ? 3 : 2];

    if (!fs.existsSync(path.join(process.cwd(), 'package.json'))) {
        console.error("ERROR: This script should be executed from the app root directory.");
        process.exit(1);
    }

    if (!CheckArgs()) {
        console.error("ERROR: Please specify a locale to generate.");
        process.exit(1);
    }

    const localeName = GetLocale();
    const outputDir = HasOutputDir() ? path.join(process.cwd(), GetOutputDir()) : null;
    const outputFile = `${localeName}.json`;
    
    // Extract everything
    const msgs = Extract(process.cwd());

    if (!outputDir) {
        WriteJSONTo(msgs, null);
    } else {
        const outputPath = path.join(outputDir, outputFile);
        console.info(`Generated locale will be writen to ${outputPath}`);
        if (fs.existsSync(outputPath)) {
            const rl = readline.createInterface(process.stdin, process.stdout);
            console.info("File already exists.")
            rl.question("Merge? y/[n]\n", function(answer) {
                if (answer.toLowerCase() === "y") {
                    const current = JSON.parse(fs.readFileSync(outputPath));
                    OverWriteJSONTo(Object.assign({}, msgs, current), outputPath);
                    rl.close();
                } else {
                    rl.question("Overwrite? y/[n]\n", function(answer) {
                        if (answer.toLowerCase() === "y") {
                            OverWriteJSONTo(msgs, outputPath);
                        }
                        rl.close();
                    });
                }
            })
        } else {
            WriteJSONTo(msgs, outputPath);
        }
    }
})();