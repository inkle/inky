@echo off

cd app
call npm install
call npm run build-package -- win64