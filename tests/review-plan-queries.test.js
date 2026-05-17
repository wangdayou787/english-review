const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

describe('review plan query helpers', () => {
  let db;
  let textbookId;
  let unit1Id;
  let unit2Id;
  let word1Id;
  let word2Id;

  beforeEach(() => {
    db = new Database(':memory:');
    initDatabase(db);
    textbookId = queries.createTextbook(db, '七年级上册');
    unit1Id = queries.createUnit(db, textbookId, 'Unit 1');
    unit2Id = queries.createUnit(db, textbookId, 'Unit 2');
    word1Id = queries.createItem(db, { unitId: unit1Id, type: 'word', english: 'apple', chinese: '苹果' });
    word2Id = queries.createItem(db, { unitId: unit2Id, type: 'word', english: 'book', chinese: '书' });
  });

  afterEach(() => {
    db.close();
  });

  test('activateReviewPlan creates one active plan with selected units', () => {
    const planId = queries.activateReviewPlan(db, {
      name: 'Unit 1 Review',
      unitIds: [unit1Id],
    });

    const active = queries.getActiveReviewPlan(db);
    expect(active.id).toBe(planId);
    expect(active.name).toBe('Unit 1 Review');
    expect(active.units.map(u => u.id)).toEqual([unit1Id]);
  });

  test('activating a second plan deactivates the previous plan', () => {
    const firstPlanId = queries.activateReviewPlan(db, { name: 'First', unitIds: [unit1Id] });
    const secondPlanId = queries.activateReviewPlan(db, { name: 'Second', unitIds: [unit2Id] });

    const active = queries.getActiveReviewPlan(db);
    const first = db.prepare('SELECT * FROM review_plans WHERE id = ?').get(firstPlanId);

    expect(active.id).toBe(secondPlanId);
    expect(active.units.map(u => u.id)).toEqual([unit2Id]);
    expect(first.is_active).toBe(0);
  });

  test('getItemsForPlan returns only items inside selected units', () => {
    const planId = queries.activateReviewPlan(db, { name: 'Unit 1', unitIds: [unit1Id] });
    const items = queries.getItemsForPlan(db, planId);

    expect(items.map(i => i.id)).toEqual([word1Id]);
    expect(items.map(i => i.id)).not.toContain(word2Id);
  });

  test('daily task helpers save and load tasks for a user date', () => {
    const planId = queries.activateReviewPlan(db, { name: 'Unit 1', unitIds: [unit1Id] });
    queries.saveDailyReviewTasks(db, {
      userId: 1,
      planId,
      taskDate: '2026-05-11',
      tasks: [{ item_id: word1Id, source_type: 'new' }],
    });

    const tasks = queries.getDailyReviewTasks(db, 1, planId, '2026-05-11');

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(word1Id);
    expect(tasks[0].source_type).toBe('new');
  });

  test('daily task helpers allow the same item on the same date for a new plan', () => {
    const firstPlanId = queries.activateReviewPlan(db, { name: 'Unit 1', unitIds: [unit1Id] });
    queries.saveDailyReviewTasks(db, {
      userId: 1,
      planId: firstPlanId,
      taskDate: '2026-05-17',
      tasks: [{ item_id: word1Id, source_type: 'new' }],
    });

    const nextPlanId = queries.activateReviewPlan(db, { name: 'Unit 1 Again', unitIds: [unit1Id] });
    queries.saveDailyReviewTasks(db, {
      userId: 1,
      planId: nextPlanId,
      taskDate: '2026-05-17',
      tasks: [{ item_id: word1Id, source_type: 'cycle_review' }],
    });

    expect(queries.getDailyReviewTasks(db, 1, firstPlanId, '2026-05-17')).toHaveLength(1);
    expect(queries.getDailyReviewTasks(db, 1, nextPlanId, '2026-05-17')).toHaveLength(1);
  });
});
