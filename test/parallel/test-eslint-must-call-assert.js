'use strict';
const common = require('../common');
if ((!common.hasCrypto) || (!common.hasIntl)) {
  common.skip('ESLint tests require crypto and Intl');
}
common.skipIfEslintMissing();

const RuleTester = require('../../tools/eslint/node_modules/eslint').RuleTester;
const rule = require('../../tools/eslint-rules/must-call-assert');

const message = 'Assertions must be wrapped into `common.mustCall` or `common.mustCallAtLeast`';

const tester = new RuleTester();
tester.run('must-call-assert', rule, {
  valid: [
    'assert.strictEqual(2+2, 4)',
    'process.on("exit", common.mustCallAtLeast((code) => {assert.strictEqual(code, 0)}));',
    'process.once("exit", common.mustCall((code) => {assert.strictEqual(code, 0)}));',
    'process.once("exit", common.mustCall((code) => {if(2+2 === 5) { assert.strictEqual(code, 0)} }));',
    'process.once("exit", common.mustCall((code) => { (() => assert.strictEqual(code, 0))(); }));',
    '(async () => {await assert.rejects(fun())})().then()',
    '[1, true].forEach((val) => assert.strictEqual(fun(val), 0));',
    'const assert = require("node:assert")',
    'const assert = require("assert")',
    'const assert = require("assert/strict")',
    'const assert = require("node:assert/strict")',
    'import assert from "node:assert"',
    'import * as assert from "node:assert"',
    'import assert from "node:assert/strict"',
    'import * as assert from "node:assert/strict"',
  ],
  invalid: [
    {
      code: 'process.on("exit", (code) => assert.strictEqual(code, 0))',
      errors: [{ message }],
    },
    {
      code: 'function test() { process.on("exit", (code) => assert.strictEqual(code, 0)) }',
      errors: [{ message }],
    },
    {
      code: 'process.once("exit", (code) => {if(2+2 === 5) { assert.strictEqual(code, 0)} });',
      errors: [{ message }],
    },
    {
      code: 'process.once("exit", (code) => { (() => { assert.strictEqual(code, 0)})(); });',
      errors: [{ message }],
    },
    {
      code: 'process.once("exit", common.mustCall((code) => {setImmediate(() => { assert.strictEqual(code, 0)}); }));',
      errors: [{ message }],
    },
    {
      code: 'require("node:assert").strictEqual(2+2, 5)',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'const { strictEqual } = require("node:assert")',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'const { strictEqual } = require("node:assert/strict")',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'const { strictEqual } = require("assert")',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'const { strictEqual } = require("assert/strict")',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'const someOtherName = require("assert")',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'import assert, { strictEqual } from "assert"',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'import * as someOtherName from "assert"',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'import someOtherName from "assert"',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'import "assert"',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'import { strictEqual } from "node:assert"',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'import assert, { strictEqual } from "node:assert"',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'import * as someOtherName from "node:assert"',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'import someOtherName from "node:assert"',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
    {
      code: 'import "node:assert"',
      errors: [{ message: 'Only assign `node:assert` to `assert`' }],
    },
  ]
});
