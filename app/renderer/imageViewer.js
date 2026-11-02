"use strict";

const fs = require("fs");
const path = require("path");
const { imageMimeType } = require("./imageTypes.js");

const $ = window.jQuery = require("./jquery-2.2.3.min.js");
const $viewer = $("#image-viewer");
const $editor = $("#editor");
const $image = $viewer.find(".image-viewer-image");
let loadId = 0;

$image.on("error", () => {
    $viewer.find(".image-viewer-status").text("This image could not be displayed.");
});

const ImageViewer = {
    show: async filePath => {
        const currentLoad = ++loadId;
        const filename = path.basename(filePath);
        const mimeType = imageMimeType(filename);
        if( !mimeType ) throw new Error("Unsupported image format.");

        $viewer.prop("hidden", false);
        $editor.hide();
        $viewer.find(".image-viewer-title").text(filename);
        $viewer.find(".image-viewer-status").text("Loading image...");
        $image.removeAttr("src").attr("alt", filename);

        try {
            const data = await fs.promises.readFile(filePath);
            if( currentLoad !== loadId ) return;
            $image.attr("src", `data:${mimeType};base64,${data.toString("base64")}`);
            $viewer.find(".image-viewer-status").text(filePath);
        } catch(error) {
            if( currentLoad !== loadId ) return;
            console.error("Could not open project image", filePath, error);
            $viewer.find(".image-viewer-status").text(`Could not open image: ${error.message || error}`);
        }
    },
    hide: () => {
        if( $viewer.prop("hidden") ) return;
        loadId++;
        $image.removeAttr("src");
        $viewer.prop("hidden", true);
        $editor.show();
        ace.edit("editor").resize();
    }
};

module.exports = { ImageViewer };
