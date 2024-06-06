@echo off
REM Uses: https://github.com/electron-userland/electron-packager
REM To install it globally:
REM
REM     npm install electron-packager -g
REM

cd app
call npm install
call npm run build-package -- win64