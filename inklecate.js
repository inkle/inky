const exec = require('child_process').exec;
const fs = require('fs');

function compile(inkString) {
  console.log("Compiling "+inkString);

  fs.writeFileSync("/tmp/inklecatetemp.ink", inkString);

  exec('ink/inklecate -p /tmp/inklecatetemp.ink', function callback(error, stdout, stderr){
    if( error ) {
      console.log("ERR"+error);
      console.log("ERR2"+stderr);
    } else {
      console.log(stdout);
    }
  });
}

exports.compile = compile;