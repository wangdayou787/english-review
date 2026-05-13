const express = require('express');
const session = require('express-session');
const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

function buildApp(user) {
  const app = express();
  const db = new Database(':memory:');
  initDatabase(db);
  db.prepare('INSERT OR IGNORE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)')
    .run(user.id, user.username, 'hash', user.role);
  app.locals.db = db;
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.user = user;
    res.locals.user = user;
    next();
  });
  app.use(require('../routes/admin'));
  app.use((err, req, res, next) => {
    res.status(500).send('Error: ' + err.message);
  });
  app.cleanup = () => db.close();
  return app;
}

function requestApp(app, method, urlPath, formBody) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const payload = formBody ? new URLSearchParams(formBody).toString() : '';
      const headers = formBody
        ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(payload),
          }
        : {};

      const req = http.request({
        hostname: '127.0.0.1',
        port: server.address().port,
        method,
        path: urlPath,
        headers,
      }, (res) => {
        let text = '';
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => {
          server.close(() => resolve({ statusCode: res.statusCode, headers: res.headers, text }));
        });
      });

      req.on('error', (err) => {
        server.close(() => reject(err));
      });

      if (payload) req.write(payload);
      req.end();
    });
  });
}

function seedItem(db, type) {
  const textbookId = queries.createTextbook(db, 'Admin Book');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const itemId = queries.createItem(db, {
    unitId,
    type,
    english: type === 'grammar' ? 'She likes music' : type === 'phrase' ? 'look after' : 'study',
    chinese: type === 'grammar' ? '她喜欢音乐' : type === 'phrase' ? '照顾' : '学习',
    pos: type === 'word' ? 'verb' : null,
    example: null,
  });
  return { textbookId, unitId, itemId };
}

describe('admin single-point item edit routes', () => {
  test('word edit form exposes the common inflection fields', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { itemId } = seedItem(app.locals.db, 'word');

    const res = await requestApp(app, 'GET', `/admin/items/${itemId}/edit`);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('name="word_detail[plural]"');
    expect(res.text).toContain('name="word_detail[third_person_singular]"');
    expect(res.text).toContain('name="word_detail[past_tense]"');
    expect(res.text).toContain('name="word_detail[past_participle]"');
    expect(res.text).toContain('name="word_detail[present_participle]"');
    expect(res.text).toContain('name="word_detail[comparative]"');
    expect(res.text).toContain('name="word_detail[superlative]"');
    expect(res.text).toContain('name="word_detail[adverb]"');
    expect(res.text).toContain('name="word_detail[adjective]"');
    expect(res.text).toContain('name="word_detail[noun]"');

    app.cleanup();
  });

  test('admin can save word question details from item edit', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { itemId, unitId } = seedItem(app.locals.db, 'word');

    const res = await requestApp(app, 'POST', `/admin/items/${itemId}/edit`, {
      type: 'word',
      english: 'study',
      chinese: '学习',
      pos: 'verb',
      example: '',
      'word_detail[base_form]': 'study',
      'word_detail[first_letter_hint]': 's',
      'word_detail[usage_note]': '动词原形',
      'word_detail[past_tense]': 'studied',
      'word_detail[present_participle]': 'studying',
    });

    const detail = queries.getWordQuestionDetails(app.locals.db, itemId);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/admin/units/${unitId}/items`);
    expect(detail).not.toBeNull();
    expect(detail.base_form).toBe('study');
    expect(detail.first_letter_hint).toBe('s');
    expect(detail.usage_note).toBe('动词原形');
    expect(detail.inflections.past_tense).toBe('studied');
    expect(detail.inflections.present_participle).toBe('studying');

    app.cleanup();
  });

  test('admin can clear optional word detail fields on edit', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { itemId } = seedItem(app.locals.db, 'word');
    queries.saveWordQuestionDetails(app.locals.db, itemId, {
      baseForm: 'study',
      firstLetterHint: 's',
      usageNote: '动词原形',
      inflections: {
        plural: 'studies',
        past_tense: 'studied',
        present_participle: 'studying',
        noun: 'study',
      },
    });

    const res = await requestApp(app, 'POST', `/admin/items/${itemId}/edit`, {
      type: 'word',
      english: 'study',
      chinese: '学习',
      pos: 'verb',
      example: '',
      'word_detail[base_form]': '',
      'word_detail[first_letter_hint]': '',
      'word_detail[usage_note]': '',
      'word_detail[plural]': '',
      'word_detail[past_tense]': '',
      'word_detail[present_participle]': '',
      'word_detail[noun]': '',
    });

    const detail = queries.getWordQuestionDetails(app.locals.db, itemId);
    expect(res.statusCode).toBe(302);
    expect(detail.base_form).toBeNull();
    expect(detail.first_letter_hint).toBeNull();
    expect(detail.usage_note).toBeNull();
    expect(detail.inflections).toEqual({});

    app.cleanup();
  });

  test('admin can add and delete phrase choice questions from item edit', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { itemId } = seedItem(app.locals.db, 'phrase');

    const editRes = await requestApp(app, 'POST', `/admin/items/${itemId}/edit`, {
      type: 'phrase',
      english: 'look after',
      chinese: '照顾',
      pos: '',
      example: '',
      'phrase_choice[0][prompt_sentence]': 'She often ___ her sister.',
      'phrase_choice[0][correct_phrase]': 'looks after',
      'phrase_choice[0][distractor_a]': 'looks up',
      'phrase_choice[0][distractor_b]': 'looks for',
      'phrase_choice[0][distractor_c]': 'looks at',
      'phrase_choice[0][explanation]': '固定搭配',
    });

    let rows = queries.getPhraseChoiceQuestionsByItem(app.locals.db, itemId);
    expect(editRes.statusCode).toBe(302);
    expect(rows).toHaveLength(1);
    expect(rows[0].prompt_sentence).toBe('She often ___ her sister.');

    const deleteRes = await requestApp(app, 'POST', `/admin/items/${itemId}/phrase-choice-questions/${rows[0].id}/delete`);
    rows = queries.getPhraseChoiceQuestionsByItem(app.locals.db, itemId);
    expect(deleteRes.statusCode).toBe(302);
    expect(deleteRes.headers.location).toBe(`/admin/items/${itemId}/edit`);
    expect(rows).toHaveLength(0);

    app.cleanup();
  });

  test('cross-item phrase choice mutation is ignored', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { itemId: itemA } = seedItem(app.locals.db, 'phrase');
    const { itemId: itemB } = seedItem(app.locals.db, 'phrase');
    const questionId = queries.savePhraseChoiceQuestion(app.locals.db, {
      itemId: itemB,
      promptSentence: 'She often ___ her sister.',
      correctPhrase: 'looks after',
      distractorA: 'looks up',
      distractorB: 'looks for',
      distractorC: 'looks at',
      explanation: '固定搭配',
    });

    const res = await requestApp(app, 'POST', `/admin/items/${itemA}/edit`, {
      type: 'phrase',
      english: 'look after',
      chinese: '照顾',
      pos: '',
      example: '',
      'phrase_choice[0][id]': String(questionId),
      'phrase_choice[0][prompt_sentence]': 'Tampered prompt',
      'phrase_choice[0][correct_phrase]': 'tampered',
      'phrase_choice[0][distractor_a]': 'a',
      'phrase_choice[0][distractor_b]': 'b',
      'phrase_choice[0][distractor_c]': 'c',
      'phrase_choice[0][explanation]': 'tampered',
    });

    const itemARows = queries.getPhraseChoiceQuestionsByItem(app.locals.db, itemA);
    const itemBRows = queries.getPhraseChoiceQuestionsByItem(app.locals.db, itemB);
    expect(res.statusCode).toBe(302);
    expect(itemARows).toHaveLength(0);
    expect(itemBRows).toHaveLength(1);
    expect(itemBRows[0].id).toBe(questionId);
    expect(itemBRows[0].prompt_sentence).toBe('She often ___ her sister.');

    app.cleanup();
  });

  test('cross-item phrase choice delete is ignored', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { itemId: itemA } = seedItem(app.locals.db, 'phrase');
    const { itemId: itemB } = seedItem(app.locals.db, 'phrase');
    const questionId = queries.savePhraseChoiceQuestion(app.locals.db, {
      itemId: itemB,
      promptSentence: 'She often ___ her sister.',
      correctPhrase: 'looks after',
      distractorA: 'looks up',
      distractorB: 'looks for',
      distractorC: 'looks at',
      explanation: '固定搭配',
    });

    const res = await requestApp(app, 'POST', `/admin/items/${itemA}/phrase-choice-questions/${questionId}/delete`);

    const itemBRows = queries.getPhraseChoiceQuestionsByItem(app.locals.db, itemB);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/admin/items/${itemA}/edit`);
    expect(itemBRows).toHaveLength(1);
    expect(itemBRows[0].id).toBe(questionId);

    app.cleanup();
  });

  test('partial phrase choice rows are ignored', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { itemId } = seedItem(app.locals.db, 'phrase');

    const res = await requestApp(app, 'POST', `/admin/items/${itemId}/edit`, {
      type: 'phrase',
      english: 'look after',
      chinese: '照顾',
      pos: '',
      example: '',
      'phrase_choice[0][prompt_sentence]': 'She often ___ her sister.',
      'phrase_choice[0][correct_phrase]': '',
      'phrase_choice[0][distractor_a]': 'looks up',
      'phrase_choice[0][distractor_b]': 'looks for',
      'phrase_choice[0][distractor_c]': 'looks at',
      'phrase_choice[0][explanation]': '固定搭配',
    });

    const rows = queries.getPhraseChoiceQuestionsByItem(app.locals.db, itemId);
    expect(res.statusCode).toBe(302);
    expect(rows).toHaveLength(0);

    app.cleanup();
  });

  test('existing phrase choice row is removed when edited into an incomplete state', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { itemId } = seedItem(app.locals.db, 'phrase');
    const questionId = queries.savePhraseChoiceQuestion(app.locals.db, {
      itemId,
      promptSentence: 'She often ___ her sister.',
      correctPhrase: 'looks after',
      distractorA: 'looks up',
      distractorB: 'looks for',
      distractorC: 'looks at',
      explanation: '固定搭配',
    });

    const res = await requestApp(app, 'POST', `/admin/items/${itemId}/edit`, {
      type: 'phrase',
      english: 'look after',
      chinese: '照顾',
      pos: '',
      example: '',
      'phrase_choice[0][id]': String(questionId),
      'phrase_choice[0][prompt_sentence]': 'She often ___ her sister.',
      'phrase_choice[0][correct_phrase]': '',
      'phrase_choice[0][distractor_a]': 'looks up',
      'phrase_choice[0][distractor_b]': 'looks for',
      'phrase_choice[0][distractor_c]': 'looks at',
      'phrase_choice[0][explanation]': '固定搭配',
    });

    const rows = queries.getPhraseChoiceQuestionsByItem(app.locals.db, itemId);
    expect(res.statusCode).toBe(302);
    expect(rows).toHaveLength(0);

    app.cleanup();
  });

  test('admin can save sentence order details from item edit', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { itemId, unitId } = seedItem(app.locals.db, 'grammar');

    const res = await requestApp(app, 'POST', `/admin/items/${itemId}/edit`, {
      type: 'grammar',
      english: 'She likes music',
      chinese: '她喜欢音乐',
      pos: '',
      example: '',
      'sentence_order[answer_sentence]': 'She likes music',
      'sentence_order[tokens_text]': 'She likes music',
      'sentence_order[hint_text]': '先找主语。',
    });

    const detail = queries.getSentenceOrderDetails(app.locals.db, itemId);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/admin/units/${unitId}/items`);
    expect(detail).not.toBeNull();
    expect(detail.answer_sentence).toBe('She likes music');
    expect(detail.tokens).toEqual(['She', 'likes', 'music']);
    expect(detail.hint_text).toBe('先找主语。');

    app.cleanup();
  });

  test('word and phrase edits reject blank or whitespace-only core english/chinese fields', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { itemId: wordItemId } = seedItem(app.locals.db, 'word');
    const { itemId: phraseItemId } = seedItem(app.locals.db, 'phrase');
    const { itemId: grammarItemId } = seedItem(app.locals.db, 'grammar');

    const wordRes = await requestApp(app, 'POST', `/admin/items/${wordItemId}/edit`, {
      type: 'word',
      english: '   ',
      chinese: '学习',
      pos: 'verb',
      example: '',
      'word_detail[base_form]': 'draft-study',
      'word_detail[first_letter_hint]': 'ds',
      'word_detail[past_tense]': 'drafted',
    });
    const phraseRes = await requestApp(app, 'POST', `/admin/items/${phraseItemId}/edit`, {
      type: 'phrase',
      english: 'look after',
      chinese: '   ',
      pos: '',
      example: '',
      'phrase_choice[0][prompt_sentence]': 'Draft prompt',
      'phrase_choice[0][correct_phrase]': 'draft answer',
      'phrase_choice[0][distractor_a]': 'a',
      'phrase_choice[0][distractor_b]': 'b',
      'phrase_choice[0][distractor_c]': 'c',
      'phrase_choice[0][explanation]': 'draft explanation',
    });
    const grammarRes = await requestApp(app, 'POST', `/admin/items/${grammarItemId}/edit`, {
      type: 'grammar',
      english: '',
      chinese: '更新后的语法说明',
      pos: '',
      example: '',
      'sentence_order[answer_sentence]': 'Draft sentence',
      'sentence_order[tokens_text]': 'Draft sentence',
      'sentence_order[hint_text]': 'Draft hint',
    });

    const wordItem = queries.getItemById(app.locals.db, wordItemId);
    const phraseItem = queries.getItemById(app.locals.db, phraseItemId);
    const grammarItem = queries.getItemById(app.locals.db, grammarItemId);
    expect(wordRes.statusCode).toBe(200);
    expect(phraseRes.statusCode).toBe(200);
    expect(grammarRes.statusCode).toBe(302);
    expect(wordItem.english).toBe('study');
    expect(phraseItem.chinese).toBe('照顾');
    expect(grammarItem.english).toBeNull();
    expect(grammarItem.chinese).toBe('更新后的语法说明');
    expect(wordRes.text).toContain('value="draft-study"');
    expect(wordRes.text).toContain('value="drafted"');
    expect(phraseRes.text).toContain('value="Draft prompt"');
    expect(phraseRes.text).toContain('value="draft answer"');

    app.cleanup();
  });

  test('type switch clears stale subtype data from the previous type', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { itemId } = seedItem(app.locals.db, 'word');
    queries.saveWordQuestionDetails(app.locals.db, itemId, {
      baseForm: 'study',
      firstLetterHint: 's',
      usageNote: '动词原形',
      inflections: { past_tense: 'studied' },
    });

    const res = await requestApp(app, 'POST', `/admin/items/${itemId}/edit`, {
      type: 'grammar',
      english: 'She likes music',
      chinese: '她喜欢音乐',
      pos: '',
      example: '',
      'sentence_order[answer_sentence]': 'She likes music',
      'sentence_order[tokens_text]': 'She likes music',
      'sentence_order[hint_text]': '先找主语。',
    });

    expect(res.statusCode).toBe(302);
    expect(queries.getWordQuestionDetails(app.locals.db, itemId)).toBeNull();
    expect(queries.getSentenceOrderDetails(app.locals.db, itemId)).not.toBeNull();

    app.cleanup();
  });

  test('non-admin cannot access single-point edit controls', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    const { itemId } = seedItem(app.locals.db, 'word');
    const { itemId: phraseItemId } = seedItem(app.locals.db, 'phrase');
    const questionId = queries.savePhraseChoiceQuestion(app.locals.db, {
      itemId: phraseItemId,
      promptSentence: 'She often ___ her sister.',
      correctPhrase: 'looks after',
      distractorA: 'looks up',
      distractorB: 'looks for',
      distractorC: 'looks at',
      explanation: '固定搭配',
    });

    const getRes = await requestApp(app, 'GET', `/admin/items/${itemId}/edit`);
    const postRes = await requestApp(app, 'POST', `/admin/items/${itemId}/edit`, {
      type: 'word',
      english: 'study',
      chinese: '学习',
      pos: 'verb',
      example: '',
      'word_detail[base_form]': 'study',
    });
    const deleteRes = await requestApp(app, 'POST', `/admin/items/${phraseItemId}/phrase-choice-questions/${questionId}/delete`);

    expect(getRes.statusCode).toBe(403);
    expect(postRes.statusCode).toBe(403);
    expect(deleteRes.statusCode).toBe(403);

    app.cleanup();
  });
});
