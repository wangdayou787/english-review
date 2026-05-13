const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

function setupDb() {
  const db = new Database(':memory:');
  initDatabase(db);
  const textbookId = queries.createTextbook(db, '错题测试课本');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const wordId = queries.createItem(db, {
    unitId,
    type: 'word',
    english: 'study',
    chinese: '学习',
    pos: 'v.',
    example: 'I study English.',
  });
  const phraseId = queries.createItem(db, {
    unitId,
    type: 'phrase',
    english: 'look after',
    chinese: '照顾',
  });
  const grammarId = queries.createItem(db, {
    unitId,
    type: 'grammar',
    english: 'She likes music',
    chinese: '她喜欢音乐',
  });
  db.prepare("INSERT INTO users (id, username, password, role) VALUES (2, 'student', 'hash', 'user')").run();
  return { db, wordId, phraseId, grammarId, userId: 2 };
}

function record(db, userId, itemId, isCorrect, answer = 'answer') {
  db.prepare(
    `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct, created_at)
     VALUES (?, ?, 'en2cn', ?, ?, datetime('now'))`
  ).run(userId, itemId, answer, isCorrect ? 1 : 0);
}

describe('wrong answer query helpers', () => {
  test('returns items whose latest review record is wrong', () => {
    const { db, userId, wordId, phraseId } = setupDb();
    record(db, userId, wordId, false, 'wrong word');
    record(db, userId, phraseId, true, '照顾');

    const wrongItems = queries.getWrongItemsForUser(db, userId);

    expect(wrongItems.map(item => item.item_id)).toEqual([wordId]);
    expect(wrongItems[0].wrong_count).toBe(1);
    expect(wrongItems[0].last_user_answer).toBe('wrong word');
    db.close();
  });

  test('removes an item after a later correct answer', () => {
    const { db, userId, wordId } = setupDb();
    record(db, userId, wordId, false, 'wrong');
    record(db, userId, wordId, true, '学习');

    expect(queries.getWrongItemsForUser(db, userId)).toHaveLength(0);
    expect(queries.getWrongItemCountsForUser(db, userId)).toEqual({
      all: 0,
      word: 0,
      phrase: 0,
      grammar: 0,
    });
    db.close();
  });

  test('counts all wrong attempts while using latest record for current status', () => {
    const { db, userId, wordId } = setupDb();
    record(db, userId, wordId, false, 'wrong 1');
    record(db, userId, wordId, false, 'wrong 2');

    const [item] = queries.getWrongItemsForUser(db, userId);

    expect(item.item_id).toBe(wordId);
    expect(item.wrong_count).toBe(2);
    expect(item.last_user_answer).toBe('wrong 2');
    db.close();
  });

  test('filters current wrong items by item type', () => {
    const { db, userId, wordId, phraseId, grammarId } = setupDb();
    record(db, userId, wordId, false, 'wrong word');
    record(db, userId, phraseId, false, 'wrong phrase');
    record(db, userId, grammarId, false, 'wrong grammar');

    expect(queries.getWrongItemsForUser(db, userId, { type: 'word' }).map(item => item.item_id)).toEqual([wordId]);
    expect(queries.getWrongItemsForUser(db, userId, { type: 'phrase' }).map(item => item.item_id)).toEqual([phraseId]);
    expect(queries.getWrongItemsForUser(db, userId, { type: 'grammar' }).map(item => item.item_id)).toEqual([grammarId]);
    expect(queries.getWrongItemCountsForUser(db, userId)).toEqual({
      all: 3,
      word: 1,
      phrase: 1,
      grammar: 1,
    });
    db.close();
  });

  test('excludes mastered items from the current wrong set', () => {
    const { db, userId, wordId } = setupDb();
    record(db, userId, wordId, false, 'wrong');
    queries.setItemKnown(db, userId, wordId, true);

    expect(queries.getWrongItemsForUser(db, userId)).toHaveLength(0);
    expect(queries.getWrongItemCountsForUser(db, userId).all).toBe(0);
    db.close();
  });
});
