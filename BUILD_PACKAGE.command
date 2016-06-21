cd "`dirname "$0"`"

# Uses: https://github.com/electron-userland/electron-packager
# To install it globally:
#
#     npm install electron-packager -g
#

rm -rf Inky-darwin-x64/

# Create icon from PNG
./resources/makeIcns.command

# Mac
electron-packager app Inky --platform=darwin  --arch=x64 --icon=resources/Icon.icns --extend-info=resources/info.plist --prune --asar --asar-unpack="inklecate_mac" --ignore="inklecate_win.exe"

# Windows (requires Wine - `brew install wine`)
electron-packager app Inky --platform=win32  --arch=x64 --icon=resources/Icon1024.png.ico --prune --asar --asar-unpack="inklecate_win.exe" --ignore="inklecate_mac"

# Remove .icns again
rm resources/Icon.icns

# Create a zip file ready for upload
zip -r Inky-darwin-x64/Inky.app.zip Inky-darwin-x64/Inky.app
zip -r Inky_windows.zip Inky-win32-x64