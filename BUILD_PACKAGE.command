cd "`dirname "$0"`"

# Uses: https://github.com/electron-userland/electron-packager
# To install it globally:
#
#     npm install electron-packager -g
#

rm -rf Inky-darwin-x64/

# Create icon from PNG
./resources/makeIcns.command

electron-packager app Inky --platform=darwin --icon=resources/Icon.icns --arch=x64 --extend-info=resources/info.plist --prune --asar --asar-unpack="inklecate"

# Remove .icns again
rm resources/Icon.icns

# Create a zip file ready for upload
zip -r Inky-darwin-x64/Inky.app.zip Inky-darwin-x64/Inky.app