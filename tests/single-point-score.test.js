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

  test('english to chinese fill trims whitespace and compares Chinese meaning exactly', () => {
    const item = { id: 6, type: 'word', english: 'apple', chinese: '苹果' };
    const correct = generator.scoreAnswer(item, 'en2cn_fill', ' 苹果 ', '苹果');
    const wrong = generator.scoreAnswer(item, 'en2cn_fill', '苹果子', '苹果');

    expect(correct.is_correct).toBe(true);
    expect(wrong.is_correct).toBe(false);
  });

  test('scoreAnswers keeps phrase choice explanation and exercise type', () => {
    const items = [{ id: 5, type: 'phrase', english: 'look after', chinese: '照顾' }];
    const answers = [{
      item_id: 5,
      exercise_type: 'phrase_choice',
      answer: 'looks after',
      correct_answer: 'looks after',
      explanation: '固定搭配。',
    }];
    const result = generator.scoreAnswers(items, answers);
    expect(result.results[0].is_correct).toBe(true);
    expect(result.results[0].exercise_type).toBe('phrase_choice');
    expect(result.results[0].explanation).toBe('固定搭配。');
  });
});
