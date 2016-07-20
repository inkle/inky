var fs = require('fs');
var marks = ['#x','?x-','>x','<x',')x-','(x-',':x',' x-','.x','/x-',"'x-",'`x-','--x-','--x-','--x-','--x-','--x-'];

function initializeNavigation() {
    fs.readFile('resources/Documentation/documentationWindowPrefab.html', 'utf8', function (firstErr,html) {
         if (firstErr) {
            return console.log(firstErr);
        }
        var originalFile = html.split("<!--navigationentries-->");

        fs.readFile('resources/Documentation/WritingWithInk.md', 'utf8', function (secErr, data) {
        if (secErr) {
            return console.log(secErr);
        }

        var output = originalFile[0];

        for (var line of data.split("\n")) {

            if (line.indexOf('#') === -1 || line.substr(line.indexOf('#') -1, 2).toLowerCase() === "c#".toLowerCase()) {
                continue;
            }
            var headline;
            headline = line.split('#').join('').trim();
            id = headline.toLowerCase();
            var activeMark;
            for(var mark of marks){
                activeMark = mark.split('x');
                id = id.split(activeMark[0]).join(activeMark[1]);
            }

            if((numberOfOccurrences(line,'#',false) + 3) < 6  ){
                  var headlineType;
                  headlineType = 'b'//'h' + (numberOfOccurrences(line,'#',false) + 3);
                  output = output + ' ' + '<li><a id="#' + id + '"onclick="openPath(this.id)"><' + headlineType + '>' + headline +'</'+ headlineType +'></a><li>\n';
             }else{
                   output = output + ' ' + '<li><a id="#' + id + '"onclick="openPath(this.id)">' + headline + '</a><li>\n';
            }
        }
        output = output + originalFile[1];
        fs.writeFile('renderer/documentationWindow.html', output, function(thirdErr) {
    if(thirdErr) {
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