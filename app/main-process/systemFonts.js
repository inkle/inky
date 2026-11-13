const { execFile } = require("child_process");

function parseFontOutput(platform, stdout) {
    let names = [];
    if( platform === "darwin" ) {
        const collectFamilies = value => {
            if( Array.isArray(value) ) return value.forEach(collectFamilies);
            if( typeof value === "string" ) {
                names.push(value);
                return;
            }
            if( !value || typeof value !== "object" ) return;
            if( typeof value.family === "string" ) names.push(value.family);
            else if( Array.isArray(value.family) ) value.family.forEach(collectFamilies);
            Object.keys(value).forEach(key => {
                if( key !== "family" ) collectFamilies(value[key]);
            });
        };
        collectFamilies(JSON.parse(stdout));
    } else {
        names = String(stdout).split(/\r?\n/);
    }
    return Array.from(new Set(names.flatMap(name => String(name).split(","))
        .map(name => name.trim())
        .filter(name => /^[\p{L}\p{N} .\-']{1,60}$/u.test(name))))
        .sort((a, b) => a.localeCompare(b));
}

function listSystemFonts(platform = process.platform) {
    return new Promise((resolve, reject) => {
        let executable;
        let args;
        if( platform === "linux" ) {
            executable = "fc-list";
            args = ["--format=%{family}\\n"];
        } else if( platform === "win32" ) {
            executable = "powershell.exe";
            args = ["-NoProfile", "-Command",
                "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts').PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $_.Name -replace ' \\(.*\\)$', '' }"];
        } else if( platform === "darwin" ) {
            executable = "system_profiler";
            args = ["SPFontsDataType", "-json"];
        } else {
            reject(new Error("Font discovery is not supported on this platform."));
            return;
        }

        execFile(executable, args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
            if( error ) {
                reject(new Error("Could not read installed system fonts: " + error.message));
                return;
            }
            try {
                resolve(parseFontOutput(platform, stdout));
            } catch(parseError) {
                reject(new Error("Could not parse installed system fonts: " + parseError.message));
            }
        });
    });
}

exports.listSystemFonts = listSystemFonts;
exports.parseFontOutput = parseFontOutput;
