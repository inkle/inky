cd "`dirname "$0"`"

# Uses: https://github.com/electron-userland/electron-packager
# To install it globally:
#
#     npm install electron-packager -g
#

rm -rf Inky-darwin-x64/

# Create icon from PNG
./makeIcns.command

electron-packager . Inky --platform=darwin --icon=Icon.icns --arch=x64 --extend-info=info.plist

# Remove .icns again
rm Icon.icns