# Formats

<!--introduced_in=REPLACEME-->

> Stability: 1.0 - Early development

The `node:formats/*` modules parse and serialize data interchange formats.
Each format is exposed as its own module, and each module can only be loaded
with the `node:` scheme.

Every format module exports two functions:

* `parse(input[, options])` turns a document into JavaScript values.
* `stringify(value)` turns JavaScript values into a document.

## TOML

<!-- source_link=lib/formats/toml.js -->

> Stability: 1.0 - Early development

The `node:formats/toml` module parses and serializes [TOML v1.1.0][]
documents using the bundled [toml++][] library. It is only available when
Node.js is configured with `--with-toml`.

```mjs
import { parse, stringify } from 'node:formats/toml';

const config = parse(`
[server]
host = "localhost"
port = 8080
`);
console.log(config.server.port); // 8080

console.log(stringify({ server: { host: 'example.com', port: 443 } }));
// [server]
// host = "example.com"
// port = 443
```

```cjs
const { parse, stringify } = require('node:formats/toml');
```

### TOML type mapping

| TOML             | JavaScript                                         |
| ---------------- | -------------------------------------------------- |
| String           | {string}                                           |
| Integer          | {number}, or {bigint} outside the safe integer range |
| Float            | {number}                                           |
| Boolean          | {boolean}                                          |
| Offset datetime  | `Temporal.ZonedDateTime` with a fixed-offset zone  |
| Local datetime   | `Temporal.PlainDateTime`                           |
| Local date       | `Temporal.PlainDate`                               |
| Local time       | `Temporal.PlainTime`                               |
| Array            | {Array}                                            |
| Table            | {Object}                                           |

Tables are returned as ordinary objects, with keys in document order. Keys
such as `__proto__` are created as own properties and never change the
prototype of the result.

### `toml.parse(input[, options])`

<!-- YAML
added: REPLACEME
-->

* `input` {string|ArrayBuffer|SharedArrayBuffer|TypedArray|DataView} The TOML
  document. Binary input must be UTF-8. A leading byte order mark is ignored.
* `options` {Object}
  * `bigint` {boolean} If `true`, every integer is returned as a {bigint}.
    **Default:** `false`.
* Returns: {Object}

Parses a TOML document. Throws a {SyntaxError} with code `ERR_TOML_PARSE` if
the document is invalid. The error has numeric `line` and `column` properties
pointing at the problem; both are 1-based.

Parsing a document that contains datetimes throws `ERR_INVALID_STATE` if
`Temporal` is not available.

### `toml.stringify(value)`

<!-- YAML
added: REPLACEME
-->

* `value` {Object} The root table.
* Returns: {string}

Serializes `value` as a TOML document. Own enumerable string-keyed properties
are written in sorted key order. Properties whose value is `undefined` are
skipped. Plain values are written first, followed by sub-tables as `[table]`
sections and arrays of objects as `[[array]]` sections.

Values are converted as follows:

* {string}, {boolean} and {number} map to the TOML type of the same name.
  `NaN`, `Infinity` and `-Infinity` become `nan`, `inf` and `-inf`. Integral
  numbers are written as integers, except `-0` which is written as `-0.0`.
* {bigint} values become integers. Values outside the 64-bit signed integer
  range throw `ERR_OUT_OF_RANGE`.
* `Temporal.ZonedDateTime` and `Temporal.Instant` become offset datetimes, and
  `Temporal.PlainDateTime`, `Temporal.PlainDate` and `Temporal.PlainTime` become
  the matching local types. {Date} objects become UTC offset datetimes.
* Arrays become arrays. Plain objects and objects with a `null` prototype
  become tables.

`null`, symbols, functions, `undefined` array elements and other objects throw
`ERR_INVALID_ARG_TYPE`. Circular references, invalid dates and datetimes with
years outside 0000-9999 throw `ERR_INVALID_ARG_VALUE`.

[TOML v1.1.0]: https://toml.io/en/v1.1.0
[toml++]: https://github.com/marzer/tomlplusplus
