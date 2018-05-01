// -----------------------------------------------------------------------------
// Taken from https://github.com/bartosz-antosik/vscode-spellright by
// Bartosz Antosik.
//
// File contains code taken from SpellChecker Node Module of NODE.js. It
// has been modified to work with various binary bindings without the need
// to rebuild them on target machine.
//
// SpellChecker Node Module: https://github.com/atom/node-spellchecker
// -----------------------------------------------------------------------------

'use strict';

const path = require('path');
const glob = require('glob');

var bindings = null;
var Spellchecker = null;

const loadBinary = function (baseName) {
  const nodeFiles = glob(path.join(__dirname, `${baseName}*${process.arch}*.node`), { sync: true });

  var binding = null;

  nodeFiles.forEach((file) => {
    try {
      if (binding == null) {
        binding = require(file);
        console.log('SpellRight bindings: \"' + path.basename(file) + '\".');
      }
    } catch (e) {
    }
  });

  if (!binding) {
    console.log('SpellRight found no bindings among these files:');
    nodeFiles.forEach((file) => {
      console.log(file);
    });
  }

  return binding;
};

bindings = loadBinary('spellchecker');
Spellchecker = bindings.Spellchecker;

var checkSpellingAsyncCb = Spellchecker.prototype.checkSpellingAsync

Spellchecker.prototype.checkSpellingAsync = function (corpus) {
  return new Promise(function (resolve, reject) {
    checkSpellingAsyncCb.call(this, corpus, function (err, result) {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  }.bind(this));
};

var defaultSpellcheck = null;

var ensureDefaultSpellCheck = function() {
  if (defaultSpellcheck) {
    return;
  }

  var lang = process.env.LANG;
  lang = lang ? lang.split('.')[0] : 'en_US';
  defaultSpellcheck = new Spellchecker();

  setDictionary(lang, getDictionaryPath());
};

var setDictionary = function(lang, dictPath) {
  ensureDefaultSpellCheck();
  return defaultSpellcheck.setDictionary(lang, dictPath);
};

var isMisspelled = function() {
  ensureDefaultSpellCheck();

  return defaultSpellcheck.isMisspelled.apply(defaultSpellcheck, arguments);
};

var checkSpelling = function() {
  ensureDefaultSpellCheck();

  return defaultSpellcheck.checkSpelling.apply(defaultSpellcheck, arguments);
};

var checkSpellingAsync = function(corpus) {
  ensureDefaultSpellCheck();

  return defaultSpellcheck.checkSpellingAsync.apply(defaultSpellcheck, arguments);
};

var add = function() {
  ensureDefaultSpellCheck();

  defaultSpellcheck.add.apply(defaultSpellcheck, arguments);
};

var remove = function() {
  ensureDefaultSpellCheck();

  defaultSpellcheck.remove.apply(defaultSpellcheck, arguments);
};

var getCorrectionsForMisspelling = function() {
  ensureDefaultSpellCheck();

  return defaultSpellcheck.getCorrectionsForMisspelling.apply(defaultSpellcheck, arguments);
};

var getAvailableDictionaries = function() {
  ensureDefaultSpellCheck();

  return defaultSpellcheck.getAvailableDictionaries.apply(defaultSpellcheck, arguments);
};

var getDictionaryPath = function() {
  var dict = path.join(__dirname, '..', 'vendor', 'hunspell_dictionaries');
  try {
    // HACK: Special case being in an asar archive
    var unpacked = dict.replace('.asar' + path.sep, '.asar.unpacked' + path.sep);
    if (require('fs').statSyncNoException(unpacked)) {
      dict = unpacked;
    }
  } catch (error) {
  }
  return dict;
}

module.exports = {
  setDictionary: setDictionary,
  add: add,
  remove: remove,
  isMisspelled: isMisspelled,
  checkSpelling: checkSpelling,
  checkSpellingAsync: checkSpellingAsync,
  getAvailableDictionaries: getAvailableDictionaries,
  getCorrectionsForMisspelling: getCorrectionsForMisspelling,
  Spellchecker: Spellchecker
};
