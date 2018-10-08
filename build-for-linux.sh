#!/bin/bash

# Clean
rm -rf Inky-darwin-x64/
rm -rf Inky-win32-x64/
rm -rf Inky-win32-ia32/
rm -rf Inky-linux-x64/
rm -rf ReleaseUpload

# Ensure that all dependencies are correctly/fully installed
cd app && npm install && cd ..

# Build for x64
electron-packager app Inky --platform=linux \
                           --arch=x64 \
                           --icon=resources/Icon.icns \
                           --extend-info=resources/info.plist \
                           --prune \
                           --asar.unpackDir="main-process/ink" \
                           --ignore="inklecate_mac"
