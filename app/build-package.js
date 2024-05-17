const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const packager = require('@electron/packager');
const appdmg = process.platform == "darwin" ? require('appdmg') : null;

const allPlatforms = ["mac", "win32", "win64", "linux"];

const args = process.argv.slice(2);

let shouldCodesign = false;
let shouldZip = false;

let platforms = args.filter(arg => {
    if (arg === "-codesign") {
        shouldCodesign = true;
        return false;
    }
    if (arg === "-zip") {
        shouldZip = true;
        return false;
    }
    if( !allPlatforms.includes(arg) ) {
        if( arg.startsWith("-") ) {
            console.error("Unrecognised command line argument: "+arg);
        } else {
            console.error(`Unrecognised platform: ${arg}. The available platforms are: ${allPlatforms}`);
        }
        process.exit(1);
    }
    return true;
});

platforms = platforms.length ? platforms : ["mac", "win32", "win64", "linux"];


function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                reject(error);
                return;
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
                reject(stderr);
                return;
            }
            console.log(`Stdout: ${stdout}`);
            resolve(stdout);
        });
    });
}

// Clean
function deleteAtPath(relativePath) {
    let absPath = path.normalize(relativePath);
    if( fs.existsSync(absPath) ) {
        console.log("Cleaning "+absPath)
        fs.rmSync(absPath, { recursive: true, force: true });
    }
}

// Make DMG on Mac
async function makeDMG() {
    return new Promise((resolve, reject) => {
        const ee = appdmg({ 
            source: path.normalize("../resources/appdmg.json"), 
            target: path.normalize("../ReleaseUpload/Inky.dmg")
        });
        
        ee.on('progress', function (info) {
            if( info.type == "step-begin" ) {
                console.log(`[${info.current}/${info.total}]: ${info.title}`)
            }
        });
        
        ee.on('finish', function () {
            console.log("Successfully created Inky.dmg");
            resolve();
        });
        
        ee.on('error', function (err) {
            console.error("Error when creating Inky.dmg:", err);
            reject(err);
        });
    });
}


async function createZip(sourceDir, targetZipPath) {
    sourceDir = path.resolve(sourceDir);
    targetZipPath = path.resolve(targetZipPath);

    if( process.platform == "darwin" || process.platform == "linux" ) {
        await runCommand(`cd ${sourceDir} && zip -r ${targetZipPath} . -x "*.DS_Store"`);
    }
    
    // Assume powershell is available on windows
    else if( process.platform == "win32") {
        await runCommand(`powershell Compress-Archive ${sourceDir} ${targetZipPath}`);
    }
}


async function buildPackageForPlatform(targetPlatform) {

    // Any other cases we need to check?
    if( process.platform != "darwin" && targetPlatform == "mac" ) {
        throw "Can only do mac builds on mac";
    }
    
    let outputAppDirPath;
    let finalZipOrDmgPath;
    if( targetPlatform == "mac" ) {
        outputAppDirPath = "../Inky-darwin-universal";
        finalZipOrDmgPath = "../ReleaseUpload/Inky_mac.dmg";
    }
    else if( targetPlatform == "win32" ) {
        outputAppDirPath = "../Inky-win32-ia32";
        finalZipOrDmgPath = "../ReleaseUpload/Inky_windows_32.zip";
    }
    else if( targetPlatform == "win64" ) {
        outputAppDirPath = "../Inky-win32-x64";
        finalZipOrDmgPath = "../ReleaseUpload/Inky_windows_64.zip";
    }
    else if( targetPlatform == "linux" ) {
        outputAppDirPath = "../Inky-linux-x64";
        finalZipOrDmgPath = "../ReleaseUpload/Inky_linux.zip";
    } else {
        throw "Unexpected platform: "+targetPlatform;
    }

    // Clean
    deleteAtPath(outputAppDirPath);
    deleteAtPath(finalZipOrDmgPath);
    
    // Mac: Create icon from PNG
    if( targetPlatform == "mac" ) {
        runCommand("../resources/makeIcns.command");
    }
    
    let opts = {
        dir: '.', // Source directory (app directory)
        out: "..",
        name: 'Inky', 
        overwrite: true,
        extendInfo: '../resources/info.plist',
        appBundleId: 'com.inkle.inky',
        prune: true,
        asar: {
            unpackDir: 'main-process/ink'
        }
    };

    if( targetPlatform == "mac" ) {
        opts.platform = "darwin";
        opts.arch = "universal";
        opts.icon = '../resources/Icon.icns';
        opts.ignore = ['inklecate_win.exe', 'build-package.js']

        // If just doing a quick local build, no need to do the
        // extremely length process of codesigning + notarising
        if( shouldCodesign ) {
            opts.osxSign = true;
            opts.osxNotarize = {
                keychainProfile: "notarisationKeychainPassword"
            };
        }
    }
    else if( targetPlatform == "win32" || targetPlatform == "win64" ) {
        opts.platform = "win32";
        opts.arch = targetPlatform == "win32" ? "ia32" : "x64";
        opts.icon = '../resources/Icon1024.png.ico';
        opts.win32metadata = {
            CompanyName: "inkle Ltd",
            FileDescription: "Inky",
            OriginalFilename: "Inky",
            InternalName: "Inky"
        }
        opts.ignore = ['inklecate_mac', 'build-package.js']
    }
    else if( targetPlatform == "linux" ) {
        opts.platform = "linux";
        opts.arch = "x64";
        opts.ignore = ['inklecate_mac', 'build-package.js']
    }

    const appPaths = await packager(opts);
    

    // Only zip it up if requested, otherwise assume
    // we're doing a local build just to run locally
    if( shouldZip ) {

        // Create ReleaseUpload folder if necesscary
        let releaseFolderPath = path.normalize("../ReleaseUpload");
        if( !fs.existsSync(releaseFolderPath) ) {
            fs.mkdirSync(releaseFolderPath);
        }

        // Create .dmg on mac
        if( targetPlatform == "mac" ) {
            await makeDMG();
        }

        // Create .zip on other platforms
        else {
            await createZip(outputAppDirPath, finalZipOrDmgPath)
        }
    }

    // Delete temporary icon resource again on mac
    if( platforms.includes("mac") ) {
        deleteAtPath("../resources/Icon.icns")
    }
    
    console.log('Build completed successfully.');
}


(async function tryBuildPackages() {
    try {
        for(let i=0; i<platforms.length; i++) {
            await buildPackageForPlatform(platforms[i]);
        }
    } catch (error) {
        console.error('Package build failed: ', error);
    }
})()