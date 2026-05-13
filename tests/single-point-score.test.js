const generator = require('../engine/generator');

describe('single-point scoring', () => {
  test('spelling answers are trim-safe and case-insensitive', () => {
    const item = { id: 1, type: 'word', english: 'Study', chinese: '学习' };
    const result = generator.scoreAnswer(item, 'spelling_fill', ' study ', 'Study');
    expect(result.is_correct).toBe(true);
  });

  test('inflection answers compare against the targeted inflection', () => {
    const item = { id: 2, type: 'word', english: 'study', chinese: '学习' };
    const result = generator.scoreAnswer(item, 'form_fill', 'studied', 'studied');
    expect(result.is_correct).toBe(true);
  });

  test('phrase choice compares selected option', () => {
    const item = { id: 3, type: 'phrase', english: 'look after', chinese: '照顾' };
    const result = generator.scoreAnswer(item, 'phrase_choice', 'looks after', 'looks after');
    expect(result.is_correct).toBe(true);
  });

  test('enhanced sentence ordering still uses exact trimmed match', () => {
    const item = { id: 4, type: 'grammar', english: 'She likes music', chinese: '她喜欢音乐' };
    const result = generator.scoreAnswer(item, 'sentence_plus', ' She likes music ', 'She likes music');
    expect(result.is_correct).toBe(true);
  });
});
