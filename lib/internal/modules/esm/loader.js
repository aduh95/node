'use strict';

// This is needed to avoid cycles in esm/resolve <-> cjs/loader
require('internal/modules/cjs/loader');

const {
  Array,
  ArrayIsArray,
  ArrayPrototypeIncludes,
  ArrayPrototypeJoin,
  ArrayPrototypePush,
  FunctionPrototypeBind,
  FunctionPrototypeCall,
  ObjectCreate,
  ObjectEntries,
  ObjectFreeze,
  ObjectSetPrototypeOf,
  PromiseAll,
  RegExpPrototypeExec,
  SafeArrayIterator,
  SafeWeakMap,
  globalThis,
} = primordials;

const {
  ERR_FAILED_IMPORT_ASSERTION,
  ERR_INVALID_ARG_TYPE,
  ERR_INVALID_ARG_VALUE,
  ERR_INVALID_IMPORT_ASSERTION,
  ERR_INVALID_MODULE_SPECIFIER,
  ERR_INVALID_RETURN_PROPERTY_VALUE,
  ERR_INVALID_RETURN_VALUE,
  ERR_MISSING_IMPORT_ASSERTION,
  ERR_UNKNOWN_MODULE_FORMAT
} = require('internal/errors').codes;
const { pathToFileURL, isURLInstance } = require('internal/url');
const {
  isAnyArrayBuffer,
  isArrayBufferView,
} = require('internal/util/types');
const ModuleMap = require('internal/modules/esm/module_map');
const ModuleJob = require('internal/modules/esm/module_job');

const {
  defaultResolve,
  DEFAULT_CONDITIONS,
} = require('internal/modules/esm/resolve');
const { defaultLoad } = require('internal/modules/esm/load');
const { translators } = require(
  'internal/modules/esm/translators');
const { getOptionValue } = require('internal/options');

/** @typedef {undefined | "json"} SupportedType */
/** @typedef {{
 *  type?: SupportedType | string;
 *  [key: string]: string;
 * }} ImportAssertions */
/** @type {Map<string, SupportedType>} */
const importAssertionTypeCache = new SafeWeakMap();
/** @type {Map<string, string>} */
const finalFormatCache = new SafeWeakMap();
/** @type {FrozenArray<SupportedType>} */
const supportedTypes = ObjectFreeze([undefined, 'json']);

/**
 * An ESMLoader instance is used as the main entry point for loading ES modules.
 * Currently, this is a singleton -- there is only one used for loading
 * the main module and everything in its dependency graph.
 */
class ESMLoader {
  /**
   * Prior to ESM loading. These are called once before any modules are started.
   * @private
   * @property {function[]} globalPreloaders First-in-first-out list of
   * preload hooks.
   */
  #globalPreloaders = [];

  /**
   * Phase 2 of 2 in ESM loading.
   * @private
   * @property {function[]} loaders First-in-first-out list of loader hooks.
   */
  #loaders = [
    defaultLoad,
  ];

  /**
   * Phase 1 of 2 in ESM loading.
   * @private
   * @property {function[]} resolvers First-in-first-out list of resolver hooks
   */
  #resolvers = [
    defaultResolve,
  ];

  /**
   * Map of already-loaded CJS modules to use
   */
  cjsCache = new SafeWeakMap();

  /**
   * The index for assigning unique URLs to anonymous module evaluation
   */
  evalIndex = 0;

  /**
   * Registry of loaded modules, akin to `require.cache`
   */
  moduleMap = new ModuleMap();

  /**
   * Methods which translate input code or other information into ES modules
   */
  translators = translators;

  static pluckHooks({
    globalPreload,
    resolve,
    load,
    // obsolete hooks:
    dynamicInstantiate,
    getFormat,
    getGlobalPreloadCode,
    getSource,
    transformSource,
  }) {
    const obsoleteHooks = [];
    const acceptedHooks = ObjectCreate(null);

    if (getGlobalPreloadCode) {
      globalPreload ??= getGlobalPreloadCode;

      process.emitWarning(
        'Loader hook "getGlobalPreloadCode" has been renamed to "globalPreload"'
      );
    }
    if (dynamicInstantiate) ArrayPrototypePush(
      obsoleteHooks,
      'dynamicInstantiate'
    );
    if (getFormat) ArrayPrototypePush(
      obsoleteHooks,
      'getFormat',
    );
    if (getSource) ArrayPrototypePush(
      obsoleteHooks,
      'getSource',
    );
    if (transformSource) ArrayPrototypePush(
      obsoleteHooks,
      'transformSource',
    );

    if (obsoleteHooks.length) process.emitWarning(
      `Obsolete loader hook(s) supplied and will be ignored: ${
        ArrayPrototypeJoin(obsoleteHooks, ', ')
      }`,
      'DeprecationWarning',
    );

    // Use .bind() to avoid giving access to the Loader instance when called.
    if (globalPreload) {
      acceptedHooks.globalPreloader =
        FunctionPrototypeBind(globalPreload, null);
    }
    if (resolve) {
      acceptedHooks.resolver = FunctionPrototypeBind(resolve, null);
    }
    if (load) {
      acceptedHooks.loader = FunctionPrototypeBind(load, null);
    }

    return acceptedHooks;
  }

  /**
   * Collect custom/user-defined hook(s). After all hooks have been collected,
   * calls global preload hook(s).
   * @param {object | object[]} customLoaders A list of exports from
   * user-defined loaders (as returned by ESMLoader.import()).
   */
  async addCustomLoaders(
    customLoaders = [],
  ) {
    if (!ArrayIsArray(customLoaders)) customLoaders = [customLoaders];

    for (let i = 0; i < customLoaders.length; i++) {
      const exports = customLoaders[i];
      const {
        globalPreloader,
        resolver,
        loader,
      } = ESMLoader.pluckHooks(exports);

      if (globalPreloader) ArrayPrototypePush(
        this.#globalPreloaders,
        FunctionPrototypeBind(globalPreloader, null), // [1]
      );
      if (resolver) ArrayPrototypePush(
        this.#resolvers,
        FunctionPrototypeBind(resolver, null), // [1]
      );
      if (loader) ArrayPrototypePush(
        this.#loaders,
        FunctionPrototypeBind(loader, null), // [1]
      );
    }

    // [1] ensure hook function is not bound to ESMLoader instance

    this.preload();
  }

  async eval(
    source,
    url = pathToFileURL(`${process.cwd()}/[eval${++this.evalIndex}]`).href
  ) {
    const evalInstance = (url) => {
      const { ModuleWrap, callbackMap } = internalBinding('module_wrap');
      const module = new ModuleWrap(url, undefined, source, 0, 0);
      callbackMap.set(module, {
        importModuleDynamically: (specifier, { url }, importAssertions) => {
          return this.import(specifier, url, importAssertions);
        }
      });

      return module;
    };
    const job = new ModuleJob(this, url, evalInstance, false, false);
    this.moduleMap.set(url, job);
    finalFormatCache.set(job, 'module');
    const { module } = await job.run();

    return {
      namespace: module.getNamespace(),
    };
  }

  async getModuleJob(specifier, parentURL, importAssertions) {
    const { format, url, importAssertions: resolvedImportAssertions } =
      await this.resolve(specifier, parentURL, importAssertions);

    let job = this.moduleMap.get(url);
    // CommonJS will set functions for lazy job evaluation.
    if (typeof job === 'function') this.moduleMap.set(url, job = job());

    if (job !== undefined) {
      const currentImportAssertionType = importAssertionTypeCache.get(job);
      if (currentImportAssertionType === resolvedImportAssertions.type) {
        return job;
      }

      try {
        // To avoid race conditions, wait for previous module to fulfill first.
        await job.modulePromise;
      } catch {
        // If the other job failed with a different `type` assertion, we got
        // another chance.
        job = undefined;
      }

      if (job !== undefined) {
        const finalFormat = finalFormatCache.get(job);
        if (resolvedImportAssertions.type == null && finalFormat === 'json') {
          throw new ERR_MISSING_IMPORT_ASSERTION(url, finalFormat,
                                                 'type', 'json');
        }
        if (
          resolvedImportAssertions.type == null ||
            (resolvedImportAssertions.type === 'json' && finalFormat === 'json')
        ) return job;
        throw new ERR_FAILED_IMPORT_ASSERTION(url, 'type',
                                              resolvedImportAssertions.type,
                                              finalFormat);
      }
    }

    const moduleProvider = async (url, isMain) => {
      const { format: finalFormat, source } = await this.load(
        url,
        { format, importAssertions: resolvedImportAssertions }
      );

      if (resolvedImportAssertions.type === 'json' && finalFormat !== 'json') {
        throw new ERR_FAILED_IMPORT_ASSERTION(
          url, 'type', resolvedImportAssertions.type, finalFormat);
      }
      if (resolvedImportAssertions.type !== 'json' && finalFormat === 'json') {
        throw new ERR_MISSING_IMPORT_ASSERTION(url, finalFormat,
                                               'type', 'json');
      }
      finalFormatCache.set(job, finalFormat);

      const translator = translators.get(finalFormat);

      if (!translator) throw new ERR_UNKNOWN_MODULE_FORMAT(finalFormat);

      return FunctionPrototypeCall(translator, this, url, source, isMain);
    };

    const inspectBrk = (
      parentURL === undefined &&
      getOptionValue('--inspect-brk')
    );

    job = new ModuleJob(
      this,
      url,
      moduleProvider,
      parentURL === undefined,
      inspectBrk
    );

    importAssertionTypeCache.set(job, resolvedImportAssertions.type);
    this.moduleMap.set(url, job);

    return job;
  }

  /**
   * This method is usually called indirectly as part of the loading processes.
   * Internally, it is used directly to add loaders. Use directly with caution.
   *
   * This method must NOT be renamed: it functions as a dynamic import on a
   * loader module.
   *
   * @param {string | string[]} specifiers Path(s) to the module
   * @param {string} parentURL Path of the parent importing the module
   * @param {ImportAssertions} importAssertions
   * @returns {Promise<object | object[]>} A list of module export(s)
   */
  async import(specifiers, parentURL, importAssertions) {
    const wasArr = ArrayIsArray(specifiers);
    if (!wasArr) specifiers = [specifiers];

    const count = specifiers.length;
    const jobs = new Array(count);

    for (let i = 0; i < count; i++) {
      jobs[i] = this.getModuleJob(specifiers[i], parentURL, importAssertions)
        .then((job) => job.run())
        .then(({ module }) => module.getNamespace());
    }

    const namespaces = await PromiseAll(new SafeArrayIterator(jobs));

    return wasArr ?
      namespaces :
      namespaces[0];
  }

  /**
   * Provide source that is understood by one of Node's translators.
   *
   * The internals of this WILL change when chaining is implemented,
   * depending on the resolution/consensus from #36954
   * @param {string} url The URL/path of the module to be loaded
   * @param {Object} context Metadata about the module
   * @returns {Object}
   */
  async load(url, context = {}) {
    const defaultLoader = this.#loaders[0];

    const loader = this.#loaders.length === 1 ?
      defaultLoader :
      this.#loaders[1];
    const loaded = await loader(url, context, defaultLoader);

    if (typeof loaded !== 'object') {
      throw new ERR_INVALID_RETURN_VALUE(
        'object',
        'loader load',
        loaded,
      );
    }

    const {
      format,
      source,
      importAssertions: loadedImportAssertions,
    } = loaded;

    if (format == null) {
      const dataUrl = RegExpPrototypeExec(
        /^data:([^/]+\/[^;,]+)(?:[^,]*?)(;base64)?,/,
        url,
      );

      throw new ERR_INVALID_MODULE_SPECIFIER(
        url,
        dataUrl ? `has an unsupported MIME type "${dataUrl[1]}"` : ''
      );
    }

    if (typeof format !== 'string') {
      throw new ERR_INVALID_RETURN_PROPERTY_VALUE(
        'string',
        'loader resolve',
        'format',
        format,
      );
    }

    if (
      source != null &&
      typeof source !== 'string' &&
      !isAnyArrayBuffer(source) &&
      !isArrayBufferView(source)
    ) throw ERR_INVALID_RETURN_PROPERTY_VALUE(
      'string, an ArrayBuffer, or a TypedArray',
      'loader load',
      'source',
      source
    );

    return {
      format,
      source,
      importAssertions: loadedImportAssertions,
    };
  }

  preload() {
    const count = this.#globalPreloaders.length;
    if (!count) return;

    for (let i = 0; i < count; i++) {
      const preload = this.#globalPreloaders[i]();

      if (preload == null) return;

      if (typeof preload !== 'string') {
        throw new ERR_INVALID_RETURN_VALUE(
          'string',
          'loader globalPreloadCode',
          preload,
        );
      }
      const { compileFunction } = require('vm');
      const preloadInit = compileFunction(
        preload,
        ['getBuiltin'],
        {
          filename: '<preload>',
        }
      );
      const { NativeModule } = require('internal/bootstrap/loaders');

      FunctionPrototypeCall(preloadInit, globalThis, (builtinName) => {
        if (NativeModule.canBeRequiredByUsers(builtinName)) {
          return require(builtinName);
        }
        throw new ERR_INVALID_ARG_VALUE('builtinName', builtinName);
      });
    }
  }

  /**
   * Resolve the location of the module.
   *
   * The internals of this WILL change when chaining is implemented,
   * depending on the resolution/consensus from #36954
   * @param {string} originalSpecifier The specified URL path of the module to
   * be resolved
   * @param {string} [parentURL] The URL path of the module's parent
   * @param {ImportAssertions} [assertions]
   * @returns {{ url: string, importAssertions: ImportAssertions }}
   */
  async resolve(originalSpecifier, parentURL,
                assertions = ObjectCreate(null)) {
    const isMain = parentURL === undefined;

    if (
      !isMain &&
      typeof parentURL !== 'string' &&
      !isURLInstance(parentURL)
    ) throw new ERR_INVALID_ARG_TYPE(
      'parentURL',
      ['string', 'URL'],
      parentURL,
    );

    const conditions = DEFAULT_CONDITIONS;

    const defaultResolver = this.#resolvers[0];

    const resolver = this.#resolvers.length === 1 ?
      defaultResolver :
      this.#resolvers[1];
    const resolution = await resolver(
      originalSpecifier,
      {
        conditions,
        parentURL,
        importAssertions: assertions,
      },
      defaultResolver,
    );

    if (typeof resolution !== 'object') {
      throw new ERR_INVALID_RETURN_VALUE(
        'object',
        'loader resolve',
        resolution,
      );
    }

    const { format, url } = resolution;
    let { importAssertions } = resolution;

    if (
      format != null &&
      typeof format !== 'string'
    ) {
      throw new ERR_INVALID_RETURN_PROPERTY_VALUE(
        'string',
        'loader resolve',
        'format',
        format,
      );
    }
    if (typeof url !== 'string') {
      throw new ERR_INVALID_RETURN_PROPERTY_VALUE(
        'string',
        'loader resolve',
        'url',
        url,
      );
    }
    if (importAssertions == null) {
      importAssertions = assertions;
    } else if (typeof importAssertions !== 'object') {
      throw new ERR_INVALID_RETURN_PROPERTY_VALUE(
        'object',
        'loader resolve',
        'importAssertions',
        importAssertions,
      );
    }
    const importAssertionsEntries = ObjectEntries(importAssertions);
    for (let i = 0; i < importAssertionsEntries.length; i++) {
      const { 0: key, 1: value } = importAssertionsEntries[i];
      if (typeof importAssertions[key] !== 'string' ||
        (key === 'type' && !ArrayPrototypeIncludes(supportedTypes, value))
      ) {
        throw new ERR_INVALID_IMPORT_ASSERTION(key, value);
      }
    }

    return {
      format,
      url,
      importAssertions,
    };
  }
}

ObjectSetPrototypeOf(ESMLoader.prototype, null);

exports.ESMLoader = ESMLoader;
