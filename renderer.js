// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
var $ = require('./jquery-2.2.3.min.js');
var inklecate = require('./inklecate.js');

var editor = ace.edit("editor");
editor.getSession().setUseWrapMode(true);

$(document).ready(function() {
  $(".compile_button").click(() => {
    inklecate.compile('compile this!')
  });
});