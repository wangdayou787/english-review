const fs = require('fs');
const path = require('path');

describe('admin phrase examples', () => {
  test('phrase examples are normalized into multiline text', () => {
    const { normalizeExampleText } = require('../lib/item-examples');

    const result = normalizeExampleText('phrase', 'I get up early.', [
      'She gets up at six.',
      '  ',
      'We get up before school.',
    ]);

    expect(result).toBe('I get up early.\nShe gets up at six.\nWe get up before school.');
  });

  test('non-phrase items keep a single example field', () => {
    const { normalizeExampleText } = require('../lib/item-examples');

    const result = normalizeExampleText('word', 'I read a book.', [
      'Books are useful.',
    ]);

    expect(result).toBe('I read a book.');
  });

  test('admin add item form supports adding phrase example inputs', () => {
    const template = fs.readFileSync(
      path.join(__dirname, '..', 'views', 'admin', 'items.ejs'),
      'utf8'
    );

    expect(template).toContain('id="item-type"');
    expect(template).toContain('id="add-example-btn"');
    expect(template).toContain("input.name = 'examples[]'");
    expect(template).toContain('document.createElement');
    expect(template).toContain("typeSelect.value === 'phrase'");
  });
});
