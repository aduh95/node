// Flags: --experimental-json-modules
'use strict';
const common = require('../common');
const { rejects, strictEqual } = require('assert');

const jsModuleDataUrl = 'data:text/javascript,export{}';

async function test() {
  await rejects(
    import(`data:text/javascript,import${JSON.stringify(jsModuleDataUrl)}assert{type:"json"}`),
    { code: 'ERR_FAILED_IMPORT_ASSERTION' }
  );

  await rejects(
    import(jsModuleDataUrl, { assert: { type: 'json' } }),
    { code: 'ERR_FAILED_IMPORT_ASSERTION' }
  );

  await rejects(
    import('data:text/javascript,', { assert: { type: 'unsupported' } }),
    { code: 'ERR_INVALID_IMPORT_ASSERTION' }
  );

  await rejects(
    import('data:text/javascript,', { assert: { type: 'undefined' } }),
    { code: 'ERR_INVALID_IMPORT_ASSERTION' }
  );

  {
    const results = await Promise.allSettled([
      import('../fixtures/empty.js', { assert: { type: 'json' } }),
      import('../fixtures/empty.js'),
    ]);

    strictEqual(results[0].status, 'rejected');
    strictEqual(results[1].status, 'fulfilled');
  }

  {
    const results = await Promise.allSettled([
      import('../fixtures/empty.js'),
      import('../fixtures/empty.js', { assert: { type: 'json' } }),
    ]);

    strictEqual(results[0].status, 'fulfilled');
    strictEqual(results[1].status, 'rejected');
  }
}

test().then(common.mustCall());
