const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

describe('pipe-delimited batch item import', () => {
  let db;
  let unitId;

  beforeEach(() => {
    db = new Database(':memory:');
    initDatabase(db);
    const textbookId = queries.createTextbook(db, 'Batch Import Book');
    unitId = queries.createUnit(db, textbookId, 'Unit 1');
  });

  afterEach(() => {
    db.close();
  });

  test('imports word rows written as english phonetic chinese pos', () => {
    const result = queries.batchCreateItems(db, unitId, [
      'director|dɪˈrektə|导演|n，名词|',
      'drama|ˈdrɑːmə|戏剧|n，名词|',
    ]);

    const items = queries.getItemsByUnit(db, unitId);

    expect(result).toEqual({ count: 2, errors: [] });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      type: 'word',
      english: 'director',
      chinese: '导演',
      pos: 'n，名词',
    });
    expect(items[1]).toMatchObject({
      type: 'word',
      english: 'drama',
      chinese: '戏剧',
      pos: 'n，名词',
    });
  });

  test('still imports explicit rows written as english chinese type pos example', () => {
    const result = queries.batchCreateItems(db, unitId, [
      'look after|照顾|phrase||She looks after her sister.',
    ]);

    const items = queries.getItemsByUnit(db, unitId);

    expect(result).toEqual({ count: 1, errors: [] });
    expect(items[0]).toMatchObject({
      type: 'phrase',
      english: 'look after',
      chinese: '照顾',
      pos: null,
      example: 'She looks after her sister.',
    });
  });
});
