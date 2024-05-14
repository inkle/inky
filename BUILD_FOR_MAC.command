cd "`dirname "$0"`"

# Uses: https://github.com/electron-userland/electron-packager
# To install it globally:
#
#     npm install electron-packager -g
#

# Clean
rm -rf Inky-darwin-x64/
rm ReleaseUpload/Inky_mac.dmg

# Ensure it's correctly/fully installed first
( cd app && npm install )

# Create icon from PNG
./resources/makeIcns.command

# Mac
electron-packager app Inky --platform=darwin --arch=x64 --icon=resources/Icon.icns --extend-info=resources/info.plist --app-bundle-id=com.inkle.inky --prune --asar.unpackDir="main-process/ink" --ignore="inklecate_win.exe"

# Create a DMG
# Requires appdmg: npm install -g appdmg
# https://www.npmjs.com/package/appdmg
mkdir -p ReleaseUpload

# 14th May 2024: appdmg isn't work with the ancient version of Node we've been relying on,
#                so let's zip up for now until we can upgrade everything. Who knows, maybe
#                people actually prefer zip files anyway!
# appdmg resources/appdmg.json ReleaseUpload/Inky_mac.dmg
ditto -c -k --keepParent Inky-darwin-x64/Inky.app ReleaseUpload/Inky_mac.zip

# Remove .icns again
rm resources/Icon.icns
