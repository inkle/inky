const $ = window.jQuery = require('./jquery-2.2.3.min.js');

exports.NavView = {
    setCurrentFilename: (name) => {
        $(".sidebar .nav-group.main-ink .nav-group-item .filename").text(name)
    }
}