var fs = require('fs');

// Is there a more elegant way of achieving this?
// mkdirp isn't found during the postinstall step because I guess we're in the wrong directory.
// But this js file doesn't really belong in app. Are we supposed to have a separate node_modules directory?
const mkdirp = require('../app/node_modules/mkdirp');

/* When the documentation is generaded by the markdown-html modul, some characters are altered
   for the ids of the anchorpoints.
   To replicate this when creating the navigation, this list contains all changing characters an their replacements.
   The strings inside the list can be read the following way:

    'character replaced by markdown-html'x'character the replaced one is changed to'

    It can happen that multiple '-' are directly following each other. In this case the last three entrys
    replaced these with one '-'.
*/
var characters = ['#x', '?x-', '>x', '<x', ')x-', '(x-', ':x', ' x-', '.x', '/x-', "'x-", '`x-', '--x-', '--x-', '--x-', '--x-', '--x-', '--x-'];

function initializeNavigation() {
    fs.readFile('../app/resources/Documentation/documentationWindowPrefab.html', 'utf8', function (firstErr, html) {
        if (firstErr) {
            return console.log(firstErr);
        }
        var originalFile = html.split("<!--navigationentries-->");

        fs.readFile('../app/resources/Documentation/WritingWithInk.md', 'utf8', function (secErr, data) {
            if (secErr) {
                return console.log(secErr);
            }

            var output = originalFile[0];

            for (var line of data.split("\n")) {
                /*
                checks weather the line does NOT contains a headline (indecated by the character '#'; the indexOf methode will return -1 if the string does not contain the argument).
                The secoud part checks weather the found '#' was written in the context of the programming language c#.
                */
                if (line.indexOf('#') === -1 || line.substr(line.indexOf('#') - 1, 2).toLowerCase() === "c#".toLowerCase()) {
                    continue;
                }
                var headline;
                headline = line.split('#').join('').trim();

                //generating the ids for the
                id = headline.toLowerCase();
                var activeCharacter;
                for (var character of characters) {
                    activeCharacter = character.split('x');
                    id = id.split(activeCharacter[0]).join(activeCharacter[1]);
                }

                var headlineType;
                headlineType = 'h' + numberOfOccurrences(line, '#', false);
                output = output + ' ' + '<li><a id="#' + id + '"onclick="openPath(this.id)" class="nav-' + headlineType + '">' + headline + '</a></li>\n';

            }
            output = output + originalFile[1];

            mkdirp.sync("../app/renderer/documentation/");
            
            fs.writeFile('../app/renderer/documentation/window.html', output, function (thirdErr) {
                if (thirdErr) {
                    return console.log(thirdErr);
                }

                console.log('Documentation was created');
            });
        });
    });

}
function numberOfOccurrences(searchIn, searchFor, allowOverlapping) {
    searchIn += "";
    searchFor += "";
    if (searchFor.length <= 0) return (searchIn.length + 1);

    var n = 0,
        pos = 0,
        step = allowOverlapping ? 1 : searchFor.length;

    while (true) {
        pos = searchIn.indexOf(searchFor, pos);
        if (pos >= 0) {
            ++n;
            pos += step;
        } else break;
    }
    return n;
}
initializeNavigation();