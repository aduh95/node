'use strict';
const common = require('../common');
common.skipIfTOMLMissing();
const assert = require('node:assert');
const TOML = require('node:formats/toml');

common.expectWarning('ExperimentalWarning', 'TOML is an experimental feature and might change at any time');

function assertParseError(input, line, column) {
  assert.throws(() => TOML.parse(input), (err) => {
    assert.strictEqual(err.code, 'ERR_TOML_PARSE');
    assert.ok(err instanceof SyntaxError);
    if (line !== undefined) assert.strictEqual(err.line, line);
    if (column !== undefined) assert.strictEqual(err.column, column);
    return true;
  });
}

// Basic document.
{
  const doc = TOML.parse(`
# comment
title = "TOML Example" # trailing
"quoted key" = 'literal \\n'
a.b.c = 1

[owner]
name = "Tom"
enabled = true
ratio = 0.5

[[products]]
name = "Hammer"

[[products]]
name = "Nail"
sku = 0x1F
`);
  assert.deepStrictEqual(doc, {
    'title': 'TOML Example',
    'quoted key': 'literal \\n',
    'a': { b: { c: 1 } },
    'owner': { name: 'Tom', enabled: true, ratio: 0.5 },
    'products': [{ name: 'Hammer' }, { name: 'Nail', sku: 31 }],
  });
  assert.strictEqual(Object.getPrototypeOf(doc), Object.prototype);
}

// Keys keep document order.
{
  assert.deepStrictEqual(Object.keys(TOML.parse('b = 1\na = 2\n[d]\n[c]')), ['b', 'a', 'd', 'c']);
}

// Accepts buffers and strips a BOM.
{
  assert.deepStrictEqual(TOML.parse(Buffer.from('\uFEFFa = 1')), { a: 1 });
  assert.deepStrictEqual(TOML.parse(new TextEncoder().encode('a = 1').buffer), { a: 1 });
  assert.deepStrictEqual(TOML.parse('\uFEFFa = 1'), { a: 1 });
}

// Strings.
{
  const doc = TOML.parse([
    'a = "tab\\there \\u00e9 \\U0001F600 \\"q\\""',
    'b = """',
    'one \\',
    '   two"""',
    "c = '''",
    'raw \\n',
    "line'''",
    'd = """""quoted"""""',
    'e = "#not a comment"',
  ].join('\n'));
  assert.deepStrictEqual(doc, {
    a: 'tab\there \u00e9 \u{1F600} "q"',
    b: 'one two',
    c: 'raw \\n\nline',
    d: '""quoted""',
    e: '#not a comment',
  });
  // Long strings.
  const long = 'x'.repeat(1000);
  assert.strictEqual(TOML.parse(`a = "${long}\\n${long}"`).a, `${long}\n${long}`);
  assertParseError(`a = "${long}\u0001"`, 1);
  // TOML 1.1 escapes.
  assert.strictEqual(TOML.parse('a = "\\x41\\e"').a, 'A\x1b');
  assertParseError('a = "\\uD800"');
  assertParseError('a = "unterminated');
  assertParseError(Buffer.from([0x61, 0x3d, 0x22, 0xff, 0x22]), 1);
}

// Numbers.
{
  assert.deepStrictEqual(TOML.parse([
    'a = +99', 'b = -17', 'c = 1_000', 'd = 0o755', 'e = 0b1101',
    'f = 6.626e-34', 'g = -0.0', 'h = inf', 'i = -inf', 'j = 9007199254740993',
    'k = -9223372036854775808',
  ].join('\n')), {
    a: 99, b: -17, c: 1000, d: 493, e: 13, f: 6.626e-34, g: -0, h: Infinity,
    i: -Infinity, j: 9007199254740993n, k: -9223372036854775808n,
  });
  assert.ok(Number.isNaN(TOML.parse('a = nan').a));
  assert.deepStrictEqual(TOML.parse('a = 1\nb = 1.5', { bigint: true }), { a: 1n, b: 1.5 });
  for (const bad of ['01', '1__0', '_1', '1_', '0x', '9223372036854775808',
                     '1.', '.1', '1e', '+0x1', '0X1F']) {
    assertParseError(`a = ${bad}`);
  }
}

// Arrays and inline tables.
{
  assert.deepStrictEqual(TOML.parse('a = [ 1, [2, "x"], { b = 3 }, ] # c'), {
    a: [1, [2, 'x'], { b: 3 }],
  });
  assert.deepStrictEqual(TOML.parse('a = [\n  1, # one\n  2,\n]'), { a: [1, 2] });
  assert.deepStrictEqual(TOML.parse('a = { b.c = 1, d = [] }'), { a: { b: { c: 1 }, d: [] } });
  // TOML 1.1 allows newlines and trailing commas in inline tables.
  assert.deepStrictEqual(TOML.parse('a = {\n  b = 1,\n}'), { a: { b: 1 } });
  assertParseError('a = { b = 1,, }');
  assertParseError('a = [1 2]');
  assertParseError(`a = ${'['.repeat(1000)}${']'.repeat(1000)}`);
}

// Structural errors.
{
  assertParseError('a = 1\na = 2', 2);
  assertParseError('[a]\n[a]');
  assertParseError('a = 1\n[a]');
  assertParseError('a = {}\n[a]');
  assertParseError('a = {}\na.b = 1');
  assertParseError('a = []\n[[a]]');
  assertParseError('[a.b]\n[a]\nb = 1');
  assertParseError('a = 1 b = 2');
  assertParseError('a =');
  assertParseError('= 1');
  // Defining a super-table after a sub-table is allowed.
  assert.deepStrictEqual(TOML.parse('[a.b]\nc = 1\n[a]\nd = 2'), { a: { b: { c: 1 }, d: 2 } });
  // Keys named like Object.prototype members are plain own properties.
  const doc = TOML.parse('__proto__ = 1\nconstructor.x = 2');
  assert.strictEqual(Object.getPrototypeOf(doc), Object.prototype);
  assert.deepStrictEqual(Object.keys(doc), ['__proto__', 'constructor']);
  assert.strictEqual(Object.getOwnPropertyDescriptor(doc, '__proto__').value, 1);
}

// Datetimes.
if (typeof Temporal === 'object') {
  const doc = TOML.parse([
    'odt = 1979-05-27T07:32:00Z',
    'odt2 = 1979-05-27 00:32:00.999999-07:00',
    'ldt = 1979-05-27T07:32:00',
    'ld = 1979-05-27',
    'lt = 07:32:00.5',
  ].join('\n'));
  assert.ok(doc.odt instanceof Temporal.ZonedDateTime);
  assert.strictEqual(doc.odt.toString(), '1979-05-27T07:32:00+00:00[UTC]');
  assert.strictEqual(doc.odt2.offset, '-07:00');
  assert.ok(doc.ldt instanceof Temporal.PlainDateTime);
  assert.ok(doc.ld instanceof Temporal.PlainDate);
  assert.ok(doc.lt instanceof Temporal.PlainTime);
  assert.strictEqual(doc.lt.toString(), '07:32:00.5');
  assert.strictEqual(TOML.parse('a = 07:32').a.toString(), '07:32:00');
  assertParseError('a = 1979-02-30');
  assertParseError('a = 1979-05-27T25:00:00');

  assert.strictEqual(TOML.stringify({
    a: doc.odt2, b: doc.ldt, c: doc.ld, d: doc.lt,
    e: new Date(Date.UTC(2000, 0, 1)),
    f: Temporal.Instant.fromEpochMilliseconds(0),
  }), [
    'a = 1979-05-27T00:32:00.999999-07:00',
    'b = 1979-05-27T07:32:00',
    'c = 1979-05-27',
    'd = 07:32:00.5',
    'e = 2000-01-01T00:00:00Z',
    'f = 1970-01-01T00:00:00Z',
    '',
  ].join('\n'));
}

// stringify().
{
  const value = {
    'str': 'a "b"\n\u0001',
    'int': 1,
    'neg': -0,
    'float': 1.5,
    'big': 123n,
    'inf': -Infinity,
    'bool': false,
    'arr': [1, 'two', [3]],
    'empty': [],
    'inline': [{ x: 1 }],
    'bare-key_1': 1,
    'needs quote': 1,
    'skip': undefined,
    'nested': { deep: { leaf: 1 }, value: 2 },
    'aot': [{ a: 1 }, { b: { c: 2 } }],
  };
  const text = TOML.stringify(value);
  // Plain values come before sections, and keys are sorted.
  assert.match(text, /^arr = \[/);
  assert.match(text, /^"needs quote" = 1$/m);
  assert.match(text, /^neg = -0\.0$/m);
  assert.match(text, /^inf = -inf$/m);
  assert.match(text, /^str = "a \\"b\\"\\n\\u0001"$/m);
  assert.match(text, /\n\[\[aot\]\]\n/);
  assert.match(text, /\n\[nested\.deep\]\n/);
  assert.doesNotMatch(text, /skip/);
  assert.ok(text.endsWith('\n'));
  assert.ok(text.indexOf('[nested') > text.indexOf('str = '));
  const { skip, ...rest } = value;
  assert.deepStrictEqual(TOML.parse(text), { ...rest, neg: -0, big: 123 });
  assert.ok(Number.isNaN(TOML.parse(TOML.stringify({ n: NaN })).n));
  assert.strictEqual(TOML.stringify({}), '');

  for (const bad of [null, 1, 'x', [], undefined]) {
    assert.throws(() => TOML.stringify(bad), { code: 'ERR_INVALID_ARG_TYPE' });
  }
  const circular = { a: {} };
  circular.a.b = circular;
  assert.throws(() => TOML.stringify(circular), { code: 'ERR_INVALID_ARG_VALUE' });
  for (const bad of [{ a: null }, { a: Symbol() }, { a: () => {} },
                     { a: [undefined] }, { a: new Map() }]) {
    assert.throws(() => TOML.stringify(bad), { code: 'ERR_INVALID_ARG_TYPE' });
  }
  assert.throws(() => TOML.stringify({ a: 2n ** 63n }), { code: 'ERR_OUT_OF_RANGE' });
  assert.throws(() => TOML.stringify({ a: new Date(NaN) }),
                { code: 'ERR_INVALID_ARG_VALUE' });
}

// Argument validation.
{
  for (const bad of [1, null, undefined, {}]) {
    assert.throws(() => TOML.parse(bad), { code: 'ERR_INVALID_ARG_TYPE' });
  }
  assert.throws(() => TOML.parse('', null), { code: 'ERR_INVALID_ARG_TYPE' });
  assert.throws(() => TOML.parse('', { bigint: 1 }), { code: 'ERR_INVALID_ARG_TYPE' });
}
