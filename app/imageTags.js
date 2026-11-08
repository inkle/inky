"use strict";

// Keep the historical app-level import path as a compatibility entry point.
// The renderer implementation is the single source of truth for image and background tags.
module.exports = require("./renderer/imageTags.js");
