const DATA_URL_PATTERN = /^data:application\/json(?:[^,]*?)(;base64)?,([\s\S]*)$/;
const JSON_URL_PATTERN = /\.json(\?[^#]*)?(#.*)?$/;

export function resolve(specifier, context, defaultResolve) {
  if (DATA_URL_PATTERN.test(specifier)) {
    const { importAssertions } = context;
    importAssertions.type = 'json';
    return {
      url: specifier,
      importAssertions,
    };
  }
  const resolvedData = defaultResolve(specifier, context, defaultResolve);
  if (JSON_URL_PATTERN.test(resolvedData.url)) {
    resolvedData.importAssertions.type = 'json';
  }
  return resolvedData;
}
