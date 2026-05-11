function normalizeExampleText(type, example, examples) {
  const firstExample = typeof example === 'string' ? example.trim() : '';

  if (type !== 'phrase') {
    return firstExample || null;
  }

  const extraExamples = Array.isArray(examples)
    ? examples
    : examples
      ? [examples]
      : [];

  const lines = [firstExample, ...extraExamples]
    .map(value => String(value || '').trim())
    .filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : null;
}

module.exports = { normalizeExampleText };
