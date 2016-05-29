const $ = window.jQuery = require('./jquery-2.2.3.min.js');

const editor = ace.edit("editor");

$(document).ready(() => {
    $(".split").each(function() {

        var $split = $(this);
        var $left = $split.prev();
        var $right = $split.next();
        var $parent = $split.parent();

        var $grip = $split.append(`<div class="grip"></div>`);

        var isDragging = false;
        var didResize = false;
        $grip.mousedown(function() {
            isDragging = true;
            event.preventDefault();
        });
        $(document).mousemove(function(event) {
            if( isDragging ) {
                var x = event.pageX;
                var x0 = $parent.offset().left;
                var width = $parent.width();

                var percent = 100 * ((x-x0) / width);
                var fromLeft = percent + "%";
                var fromRight = (100-percent) + "%";

                $left.css({"right": fromRight, "width": fromLeft});
                $right.css({"left": fromLeft, "width": fromRight});
                $split.css("left", fromLeft);

                didResize = true;

                event.preventDefault();
            }
        });
        $(document).mouseup(function() {
            
            // Hack... not sure of a better way to do this
            if( didResize ) {
                if( $left.is("#editor") )
                    editor.resize();
                didResize = false;
            }

            isDragging = false;
            event.preventDefault();
        });

    });
});