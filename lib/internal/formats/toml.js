'use strict';

const {
  DatePrototypeGetTime,
  DatePrototypeToISOString,
  FunctionPrototypeCall,
  NumberIsNaN,
  ObjectPrototypeToString,
  RegExpPrototypeExec,
  StringPrototypeAt,
  StringPrototypeSlice,
} = primordials;

const binding = internalBinding('toml');
const {
  codes: {
    ERR_INVALID_ARG_TYPE,
    ERR_INVALID_ARG_VALUE,
    ERR_INVALID_STATE,
    ERR_TOML_PARSE,
  },
} = require('internal/errors');
const {
  isAnyArrayBuffer,
  isArrayBufferView,
  isDate,
} = require('internal/util/types');
const { kEmptyObject } = require('internal/util');
const {
  validateBoolean,
  validateObject,
} = require('internal/validators');

// Captured when the module is first loaded so that later changes to the
// global do not affect parsing.
const { Temporal } = globalThis;

// Must match the order of node::toml::Kind.
const kOffsetDateTime = 0;
const kLocalDateTime = 1;
const kLocalDate = 2;

// TOML datetimes only support four-digit years.
const kTomlDatetime = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}|$)|^\d{2}:\d{2}/;

function createDatetime(kind, text) {
  if (Temporal === undefined) {
    throw new ERR_INVALID_STATE('TOML datetimes require Temporal support');
  }
  switch (kind) {
    case kOffsetDateTime: {
      const offset = StringPrototypeAt(text, -1) === 'Z' ?
        'UTC' : StringPrototypeSlice(text, -6);
      return Temporal.ZonedDateTime.from(`${text}[${offset}]`);
    }
    case kLocalDateTime:
      return Temporal.PlainDateTime.from(text);
    case kLocalDate:
      return Temporal.PlainDate.from(text);
    default:
      return Temporal.PlainTime.from(text);
  }
}

const temporalFormatters = {
  '__proto__': null,
  '[object Temporal.Instant]': (value) =>
    FunctionPrototypeCall(Temporal.Instant.prototype.toString, value),
  '[object Temporal.ZonedDateTime]': (value) => FunctionPrototypeCall(
    Temporal.ZonedDateTime.prototype.toString, value,
    { timeZoneName: 'never', calendarName: 'never' }),
  '[object Temporal.PlainDateTime]': (value) => FunctionPrototypeCall(
    Temporal.PlainDateTime.prototype.toString, value,
    { calendarName: 'never' }),
  '[object Temporal.PlainDate]': (value) => FunctionPrototypeCall(
    Temporal.PlainDate.prototype.toString, value,
    { calendarName: 'never' }),
  '[object Temporal.PlainTime]': (value) =>
    FunctionPrototypeCall(Temporal.PlainTime.prototype.toString, value),
};

// Returns the TOML representation of a datetime object, or undefined if the
// value is not a supported datetime.
function formatDatetime(value) {
  let text;
  if (isDate(value)) {
    if (NumberIsNaN(DatePrototypeGetTime(value))) {
      throw new ERR_INVALID_ARG_VALUE('value', value, 'contains an invalid Date');
    }
    text = DatePrototypeToISOString(value);
  } else if (Temporal !== undefined) {
    const formatter = temporalFormatters[ObjectPrototypeToString(value)];
    if (formatter === undefined) return undefined;
    text = formatter(value);
  } else {
    return undefined;
  }
  if (RegExpPrototypeExec(kTomlDatetime, text) === null) {
    throw new ERR_INVALID_ARG_VALUE(
      'value', value, 'contains a datetime that cannot be represented in TOML');
  }
  return text;
}

/**
 * @param {string | ArrayBuffer | SharedArrayBuffer | ArrayBufferView} input
 * @param {{ bigint?: boolean }} [options]
 * @returns {object}
 */
function parse(input, options = kEmptyObject) {
  if (typeof input !== 'string' && !isArrayBufferView(input) &&
      !isAnyArrayBuffer(input)) {
    throw new ERR_INVALID_ARG_TYPE(
      'input',
      ['string', 'ArrayBuffer', 'Buffer', 'TypedArray', 'DataView'],
      input,
    );
  }
  validateObject(options, 'options');
  const { bigint = false } = options;
  validateBoolean(bigint, 'options.bigint');

  const errorInfo = [];
  const result = binding.parse(input, bigint, createDatetime, errorInfo);
  if (result === undefined) {
    const { 0: message, 1: line, 2: column } = errorInfo;
    const error = new ERR_TOML_PARSE(message, line, column);
    error.line = line;
    error.column = column;
    throw error;
  }
  return result;
}

/**
 * @param {object} value
 * @returns {string}
 */
function stringify(value) {
  validateObject(value, 'value');
  return binding.stringify(value, formatDatetime);
}

module.exports = {
  parse,
  stringify,
};
