cd "`dirname "$0"`"

# Uses: https://github.com/electron-userland/electron-packager
# To install it globally:
#
#     npm install electron-packager -g
#

rm -rf Inky-darwin-x64/
electron-packager . Inky --platform=darwin --arch=x64 --extend-info=info.plist