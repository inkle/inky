function adjustToScreen() {
    document.getElementById("contentView").height = window.innerHeight - 20;
}
function openPath(pathToNewDocumentation) {
var pathToDocumentationFolder = "../../resources/Documentation/";
    if (document.getElementById("contentView").src != pathToDocumentationFolder + pathToNewDocumentation) {
        document.getElementById("contentView").src = pathToDocumentationFolder + pathToNewDocumentation;
    }
    return false;
}