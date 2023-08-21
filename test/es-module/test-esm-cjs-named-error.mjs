import '../common/index.mjs';
import { rejects, strictEqual } from 'assert';

const fixtureBase = '../fixtures/es-modules/package-cjs-named-error';

const errTemplate = (specifier, name, namedImports) =>
  `Named export '${name}' not found. The requested module` +
  ` '${specifier}' is a CommonJS module, which may not support ` +
  'all module.exports as named exports.\nCommonJS modules can ' +
  'always be imported via the default export, for example using:' +
  `\n\nimport pkg from '${specifier}';\n` + (namedImports ?
    `const ${namedImports} = pkg;\n` : '');

const expectedWithoutExample = errTemplate('./fail.cjs', 'comeOn');

const expectedRelative = errTemplate('./fail.cjs', 'comeOn', '{ comeOn }');

const expectedRenamed = errTemplate('./fail.cjs', 'comeOn',
                                    '{ comeOn: comeOnRenamed }');

const expectedPackageHack =
    errTemplate('./json-hack/fail.js', 'comeOn', '{ comeOn }');

const expectedBare = errTemplate('deep-fail', 'comeOn', '{ comeOn }');

rejects(async () => {
  try {
    await import(`${fixtureBase}/single-quote.mjs`);
  } catch (err) {
    strictEqual(err?.code, 'ERR_DYNAMIC_IMPORT_SYNTAX_ERROR');
    throw err?.cause;
  }
}, {
  name: 'SyntaxError',
  message: expectedRelative
}, 'should support relative specifiers with single quotes');

rejects(async () => {
  try {
    await import(`${fixtureBase}/double-quote.mjs`);
  } catch (err) {
    strictEqual(err?.code, 'ERR_DYNAMIC_IMPORT_SYNTAX_ERROR');
    throw err?.cause;
  }
}, {
  name: 'SyntaxError',
  message: expectedRelative
}, 'should support relative specifiers with double quotes');

rejects(async () => {
  try {
    await import(`${fixtureBase}/renamed-import.mjs`);
  } catch (err) {
    strictEqual(err?.code, 'ERR_DYNAMIC_IMPORT_SYNTAX_ERROR');
    throw err?.cause;
  }
}, {
  name: 'SyntaxError',
  message: expectedRenamed
}, 'should correctly format named imports with renames');

rejects(async () => {
  try {
    await import(`${fixtureBase}/multi-line.mjs`);
  } catch (err) {
    strictEqual(err?.code, 'ERR_DYNAMIC_IMPORT_SYNTAX_ERROR');
    throw err?.cause;
  }
}, {
  name: 'SyntaxError',
  message: expectedWithoutExample,
}, 'should correctly format named imports across multiple lines');

rejects(async () => {
  try {
    await import(`${fixtureBase}/json-hack.mjs`);
  } catch (err) {
    strictEqual(err?.code, 'ERR_DYNAMIC_IMPORT_SYNTAX_ERROR');
    throw err?.cause;
  }
}, {
  name: 'SyntaxError',
  message: expectedPackageHack
}, 'should respect recursive package.json for module type');

rejects(async () => {
  try {
    await import(`${fixtureBase}/bare-import-single.mjs`);
  } catch (err) {
    strictEqual(err?.code, 'ERR_DYNAMIC_IMPORT_SYNTAX_ERROR');
    throw err?.cause;
  }
}, {
  name: 'SyntaxError',
  message: expectedBare
}, 'should support bare specifiers with single quotes');

rejects(async () => {
  try {
    await import(`${fixtureBase}/bare-import-double.mjs`);
  } catch (err) {
    strictEqual(err?.code, 'ERR_DYNAMIC_IMPORT_SYNTAX_ERROR');
    throw err?.cause;
  }
}, {
  name: 'SyntaxError',
  message: expectedBare
}, 'should support bare specifiers with double quotes');

rejects(async () => {
  try {
    await import(`${fixtureBase}/escaped-single-quote.mjs`);
  } catch (err) {
    strictEqual(err?.code, 'ERR_DYNAMIC_IMPORT_SYNTAX_ERROR');
    throw err?.cause;
  }
}, /import pkg from '\.\/oh'no\.cjs'/, 'should support relative specifiers with escaped single quote');
