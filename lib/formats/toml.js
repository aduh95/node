'use strict';

const { emitExperimentalWarning } = require('internal/util');
const { parse, stringify } = require('internal/formats/toml');

emitExperimentalWarning('TOML');

module.exports = {
  parse,
  stringify,
};
