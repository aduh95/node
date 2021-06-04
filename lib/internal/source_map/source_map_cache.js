'use strict';

const {
  ArrayPrototypePush,
  JSONParse,
  ObjectCreate,
  ObjectKeys,
  ObjectGetOwnPropertyDescriptor,
  ObjectPrototypeHasOwnProperty,
  RegExpPrototypeExec,
  SafeMap,
  SafeStringPrototypeSplit,
} = primordials;

function ObjectGetValueSafe(obj, key) {
  const desc = ObjectGetOwnPropertyDescriptor(obj, key);
  return ObjectPrototypeHasOwnProperty(desc, 'value') ? desc.value : undefined;
}

// See https://sourcemaps.info/spec.html for SourceMap V3 specification.
const { Buffer } = require('buffer');
let debug = require('internal/util/debuglog').debuglog('source_map', (fn) => {
  debug = fn;
});
const fs = require('fs');
const { getOptionValue } = require('internal/options');
const { IterableWeakMap } = require('internal/util/iterable_weak_map');
const {
  normalizeReferrerURL,
} = require('internal/modules/cjs/helpers');
// Since the CJS module cache is mutable, which leads to memory leaks when
// modules are deleted, we use a WeakMap so that the source map cache will
// be purged automatically:
const cjsSourceMapCache = new IterableWeakMap();
// The esm cache is not mutable, so we can use a Map without memory concerns:
const esmSourceMapCache = new SafeMap();
const { fileURLToPath, pathToFileURL, URL } = require('internal/url');
let SourceMap;

let sourceMapsEnabled;
function getSourceMapsEnabled() {
  if (sourceMapsEnabled === undefined) {
    sourceMapsEnabled = getOptionValue('--enable-source-maps');
    if (sourceMapsEnabled) {
      const {
        enableSourceMaps,
        setPrepareStackTraceCallback
      } = internalBinding('errors');
      const {
        prepareStackTrace
      } = require('internal/source_map/prepare_stack_trace');
      setPrepareStackTraceCallback(prepareStackTrace);
      enableSourceMaps();
    }
  }
  return sourceMapsEnabled;
}

function maybeCacheSourceMap(filename, content, cjsModuleInstance) {
  const sourceMapsEnabled = getSourceMapsEnabled();
  if (!(process.env.NODE_V8_COVERAGE || sourceMapsEnabled)) return;
  try {
    filename = normalizeReferrerURL(filename);
  } catch (err) {
    // This is most likely an [eval]-wrapper, which is currently not
    // supported.
    debug(err.stack);
    return;
  }
  const match = RegExpPrototypeExec(
    /(?<=\/[*/]#\s+sourceMappingURL=)[^\s]+/,
    content,
  );
  if (match) {
    const data = dataFromUrl(filename, match[0]);
    const url = data ? null : match[0];
    if (cjsModuleInstance) {
      cjsSourceMapCache.set(cjsModuleInstance, {
        filename,
        lineLengths: lineLengths(content),
        data,
        url
      });
    } else {
      // If there is no cjsModuleInstance assume we are in a
      // "modules/esm" context.
      esmSourceMapCache.set(filename, {
        lineLengths: lineLengths(content),
        data,
        url
      });
    }
  }
}

function dataFromUrl(sourceURL, sourceMappingURL) {
  try {
    const url = new URL(sourceMappingURL);
    switch (url.protocol) {
      case 'data:':
        return sourceMapFromDataUrl(sourceURL, url.pathname);
      default:
        debug(`unknown protocol ${url.protocol}`);
        return null;
    }
  } catch (err) {
    debug(err.stack);
    // If no scheme is present, we assume we are dealing with a file path.
    const mapURL = new URL(sourceMappingURL, sourceURL).href;
    return sourceMapFromFile(mapURL);
  }
}

// Cache the length of each line in the file that a source map was extracted
// from. This allows translation from byte offset V8 coverage reports,
// to line/column offset Source Map V3.
function lineLengths(content) {
  // We purposefully keep \r as part of the line-length calculation, in
  // cases where there is a \r\n separator, so that this can be taken into
  // account in coverage calculations.
  const size = content.length;
  if (size === 0) return [0];

  // The following algorithm is equivalent to
  // return content.split(/\n|\u2028|\u2029/).map(line => line.length);

  const splitter = /\n|\u2028|\u2029/g;
  const lineLengths = [];
  let previousIndex = 0;
  while (RegExpPrototypeExec(splitter, content) !== null) {
    ArrayPrototypePush(lineLengths, splitter.lastIndex - previousIndex - 1);
    previousIndex = splitter.lastIndex;
  }
  ArrayPrototypePush(lineLengths, size - previousIndex);
  return lineLengths;
}

function sourceMapFromFile(mapURL) {
  try {
    const content = fs.readFileSync(fileURLToPath(mapURL), 'utf8');
    const data = JSONParse(content);
    return sourcesToAbsolute(mapURL, data);
  } catch (err) {
    debug(err.stack);
    return null;
  }
}

// data:[<mediatype>][;base64],<data> see:
// https://tools.ietf.org/html/rfc2397#section-2
function sourceMapFromDataUrl(sourceURL, url) {
  const { 0: format, 1: data } = SafeStringPrototypeSplit(url, ',', 2);
  const splitFormat = SafeStringPrototypeSplit(format, ';');
  const contentType = splitFormat[0];
  const base64 = splitFormat[splitFormat.length - 1] === 'base64';
  if (contentType === 'application/json') {
    const decodedData = base64 ?
      Buffer.from(data, 'base64').toString('utf8') : data;
    try {
      const parsedData = JSONParse(decodedData);
      return sourcesToAbsolute(sourceURL, parsedData);
    } catch (err) {
      debug(err.stack);
      return null;
    }
  } else {
    debug(`unknown content-type ${contentType}`);
    return null;
  }
}

// If the sources are not absolute URLs after prepending of the "sourceRoot",
// the sources are resolved relative to the SourceMap (like resolving script
// src in a html document).
function sourcesToAbsolute(baseURL, data) {
  data.sources = data.sources.map((source) => {
    source = (data.sourceRoot || '') + source;
    return new URL(source, baseURL).href;
  });
  // The sources array is now resolved to absolute URLs, sourceRoot should
  // be updated to noop.
  data.sourceRoot = '';
  return data;
}

// Move source map from garbage collected module to alternate key.
function rekeySourceMap(cjsModuleInstance, newInstance) {
  const sourceMap = cjsSourceMapCache.get(cjsModuleInstance);
  if (sourceMap) {
    cjsSourceMapCache.set(newInstance, sourceMap);
  }
}

// WARNING: The `sourceMapCacheToObject` and `appendCJSCache` run during
// shutdown. In particular, they also run when Workers are terminated, making
// it important that they do not call out to any user-provided code, including
// built-in prototypes that might have been tampered with.

// Get serialized representation of source-map cache, this is used
// to persist a cache of source-maps to disk when NODE_V8_COVERAGE is enabled.
function sourceMapCacheToObject() {
  const obj = ObjectCreate(null);

  for (const { 0: k, 1: v } of esmSourceMapCache) {
    obj[k] = v;
  }

  appendCJSCache(obj);

  if (ObjectKeys(obj).length === 0) {
    return undefined;
  }
  return obj;
}

function appendCJSCache(obj) {
  for (const value of cjsSourceMapCache) {
    obj[ObjectGetValueSafe(value, 'filename')] = {
      lineLengths: ObjectGetValueSafe(value, 'lineLengths'),
      data: ObjectGetValueSafe(value, 'data'),
      url: ObjectGetValueSafe(value, 'url')
    };
  }
}

function findSourceMap(sourceURL) {
  if (RegExpPrototypeExec(/^\w+:\/\//, sourceURL) == null) {
    sourceURL = pathToFileURL(sourceURL).href;
  }
  if (!SourceMap) {
    SourceMap = require('internal/source_map/source_map').SourceMap;
  }
  let sourceMap = esmSourceMapCache.get(sourceURL);
  if (sourceMap === undefined) {
    for (const value of cjsSourceMapCache) {
      const filename = ObjectGetValueSafe(value, 'filename');
      if (sourceURL === filename) {
        sourceMap = {
          data: ObjectGetValueSafe(value, 'data')
        };
      }
    }
  }
  if (sourceMap && sourceMap.data) {
    return new SourceMap(sourceMap.data);
  }
  return undefined;
}

module.exports = {
  findSourceMap,
  getSourceMapsEnabled,
  maybeCacheSourceMap,
  rekeySourceMap,
  sourceMapCacheToObject,
};
