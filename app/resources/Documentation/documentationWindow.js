function adjustToScreen() {
    document.getElementById("contentView").height = window.innerHeight - 20;
}
function openPath(link) {
    var pathToDocumentation = "documentation.html";
    if (document.getElementById("contentView").src != pathToDocumentation + link) {
        document.getElementById("contentView").src = pathToDocumentation + link;
    }
    return false;
}