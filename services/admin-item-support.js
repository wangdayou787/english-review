const queries = require('../db/queries');

const WORD_INFLECTION_FIELDS = [
  'plural',
  'third_person_singular',
  'past_tense',
  'past_participle',
  'present_participle',
  'comparative',
  'superlative',
  'adverb',
  'adjective',
  'noun',
];

function normalizeWordQuestionDetails(raw) {
  return {
    baseForm: raw?.base_form || '',
    firstLetterHint: raw?.first_letter_hint || '',
    usageNote: raw?.usage_note || '',
    inflections: WORD_INFLECTION_FIELDS.reduce((all, key) => {
      all[key] = raw?.[key] || '';
      return all;
    }, {}),
  };
}

function normalizePhraseChoiceRows(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : rawRows ? Object.values(rawRows) : [];
  return rows.map((row) => ({
    id: row?.id ? parseInt(row.id, 10) : null,
    promptSentence: String(row?.prompt_sentence || '').trim(),
    correctPhrase: String(row?.correct_phrase || '').trim(),
    distractorA: String(row?.distractor_a || '').trim(),
    distractorB: String(row?.distractor_b || '').trim(),
    distractorC: String(row?.distractor_c || '').trim(),
    explanation: String(row?.explanation || '').trim(),
  }));
}

function normalizeSentenceTokens(tokensText, answerSentence) {
  const source = String(tokensText || answerSentence || '').trim();
  if (!source) return [];
  if (/[|,\n]/.test(source)) {
    return source.split(/[|,\n]/).map(token => token.trim()).filter(Boolean);
  }
  return source ? source.split(/\s+/).filter(Boolean) : [];
}

function normalizeSentenceOrderDetail(raw) {
  const answerSentence = String(raw?.answer_sentence || '').trim();
  const tokens = normalizeSentenceTokens(raw?.tokens_text, answerSentence);
  return {
    answerSentence,
    tokens,
    hintText: String(raw?.hint_text || '').trim(),
    isComplete: !!answerSentence && tokens.length > 0,
  };
}

function draftPhraseChoiceRows(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : rawRows ? Object.values(rawRows) : [];
  return rows.map((row) => ({
    id: row?.id || '',
    prompt_sentence: String(row?.prompt_sentence || ''),
    correct_phrase: String(row?.correct_phrase || ''),
    distractor_a: String(row?.distractor_a || ''),
    distractor_b: String(row?.distractor_b || ''),
    distractor_c: String(row?.distractor_c || ''),
    explanation: String(row?.explanation || ''),
  }));
}

function draftSentenceOrderDetail(raw) {
  const detail = normalizeSentenceOrderDetail(raw);
  return {
    answer_sentence: String(raw?.answer_sentence || ''),
    tokens: detail.tokens,
    hint_text: String(raw?.hint_text || ''),
  };
}

function getPhraseChoiceQuestionForItem(db, itemId, questionId) {
  return db.prepare(
    'SELECT * FROM phrase_choice_questions WHERE id = ? AND item_id = ?'
  ).get(questionId, itemId);
}

function getItemSupportViewData(db, itemId) {
  return {
    wordQuestionDetail: queries.getWordQuestionDetails(db, itemId),
    phraseChoiceQuestions: queries.getPhraseChoiceQuestionsByItem(db, itemId),
    sentenceOrderDetail: queries.getSentenceOrderDetails(db, itemId),
  };
}

function getDraftSupportViewData(db, itemId, body) {
  return {
    wordQuestionDetail: body.word_detail
      ? {
          base_form: body.word_detail.base_form || '',
          first_letter_hint: body.word_detail.first_letter_hint || '',
          usage_note: body.word_detail.usage_note || '',
          inflections: normalizeWordQuestionDetails(body.word_detail).inflections,
        }
      : queries.getWordQuestionDetails(db, itemId),
    phraseChoiceQuestions: body.phrase_choice
      ? draftPhraseChoiceRows(body.phrase_choice)
      : queries.getPhraseChoiceQuestionsByItem(db, itemId),
    sentenceOrderDetail: body.sentence_order
      ? draftSentenceOrderDetail(body.sentence_order)
      : queries.getSentenceOrderDetails(db, itemId),
  };
}

function clearSupportData(db, itemId) {
  db.prepare('DELETE FROM word_question_details WHERE item_id = ?').run(itemId);
  db.prepare('DELETE FROM sentence_order_details WHERE item_id = ?').run(itemId);
  db.prepare('DELETE FROM phrase_choice_questions WHERE item_id = ?').run(itemId);
}

function savePhraseChoiceRows(db, itemId, rawRows) {
  for (const row of normalizePhraseChoiceRows(rawRows)) {
    const isComplete = row.promptSentence &&
      row.correctPhrase &&
      row.distractorA &&
      row.distractorB &&
      row.distractorC;
    if (row.id) {
      if (getPhraseChoiceQuestionForItem(db, itemId, row.id)) {
        if (isComplete) {
          queries.updatePhraseChoiceQuestion(db, row.id, row);
        } else {
          queries.deletePhraseChoiceQuestion(db, row.id);
        }
      }
    } else if (isComplete) {
      queries.savePhraseChoiceQuestion(db, { itemId, ...row });
    }
  }
}

function saveSentenceOrderIfComplete(db, itemId, raw) {
  const detail = normalizeSentenceOrderDetail(raw || {});
  if (!detail.isComplete) {
    db.prepare('DELETE FROM sentence_order_details WHERE item_id = ?').run(itemId);
    return;
  }

  queries.saveSentenceOrderDetails(db, itemId, {
    answerSentence: detail.answerSentence,
    tokens: detail.tokens,
    hintText: detail.hintText,
  });
}

function saveSupportData(db, itemId, type, body) {
  if (type === 'word' && body.word_detail) {
    queries.saveWordQuestionDetails(db, itemId, normalizeWordQuestionDetails(body.word_detail));
  }
  if (type === 'phrase' && body.phrase_choice) {
    savePhraseChoiceRows(db, itemId, body.phrase_choice);
  }
  if (type === 'grammar' && body.sentence_order) {
    saveSentenceOrderIfComplete(db, itemId, body.sentence_order);
  }
}

module.exports = {
  clearSupportData,
  getDraftSupportViewData,
  getItemSupportViewData,
  getPhraseChoiceQuestionForItem,
  saveSupportData,
};
