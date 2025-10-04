'use strict';

const message =
  'Assertions must be wrapped into `common.mustCall` or `common.mustCallAtLeast`';


const requireCall = 'CallExpression[callee.name="require"]';
const assertModuleSpecifier = '/^(node:)?assert(.strict)?$/';

function findEnclosingFunction(node) {
  while (node) {
    node = node.parent;
    if (!node) break;

    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
      // We want to exit the loop only if it's not an IIFE nor a `[].forEach` call.
      if (node.parent.type !== 'CallExpression' || (
        node.parent.callee !== node && // IIFE
        !(
          node.parent.callee.type === 'MemberExpression' &&
          node.parent.callee.object.type === 'ArrayExpression' &&
          node.parent.callee.property.name === 'forEach'
        )
      )) {
        break;
      }
    }
  }
  return node;
}

function isMustCallOrMustCallAtLeast(str) {
  return str === 'mustCall' || str === 'mustCallAtLeast';
}

function isInMustCallFunction(node) {
  const parent = findEnclosingFunction(node)?.parent;
  if (!parent) return true;
  return (
    parent.type === 'CallExpression' &&
    (
      parent.callee.type === 'MemberExpression' ?
        parent.callee.object.name === 'common' && isMustCallOrMustCallAtLeast(parent.callee.property.name) :
        parent.callee.type === 'Identifier' && isMustCallOrMustCallAtLeast(parent.callee.name)
    )
  );
}

module.exports = {
  meta: {
    fixable: 'code',
  },
  create: function(context) {
    return {
      ':function CallExpression[callee.object.name="assert"]': (node) => {
        if (!isInMustCallFunction(node)) {
          context.report({
            node,
            message,
          });
        }
      },

      [[
        `:not(VariableDeclarator[id.name="assert"])>${requireCall}[arguments.0.value=${assertModuleSpecifier}]`,
        `ImportDeclaration[source.value=${assertModuleSpecifier}]:not(
          [specifiers.length=1][specifiers.0.type=/^Import(Default|Namespace)Specifier$/][specifiers.0.local.name="assert"]
        )`,
      ].join(',')]: (node) => {
        context.report({
          node,
          message: 'Only assign `node:assert` to `assert`',
        });
      },
    };
  },
};
