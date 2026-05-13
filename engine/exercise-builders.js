const { getInflectionEntry, getSinglePointSupport } = require('./question-type-selection');

function getExerciseTypesForItem(item) {
  switch (item.type) {
    case 'word': return ['en2cn', 'cn2en', 'listening'];
    case 'phrase': return ['en2cn', 'cn2en', 'listening'];
    case 'grammar': return ['sentence'];
    default: return ['en2cn'];
  }
}

function pickFallbackExerciseType(item) {
  const types = getExerciseTypesForItem(item);
  return types[Math.floor(Math.random() * types.length)];
}

function getDistractors(item, db) {
  const seen = new Set([item.chinese]);
  const distractors = [];

  function addRows(rows) {
    for (const row of rows) {
      if (!row.chinese || seen.has(row.chinese)) continue;
      seen.add(row.chinese);
      distractors.push(row);
      if (distractors.length === 3) break;
    }
  }

  addRows(db.prepare(
    'SELECT * FROM items WHERE type = ? AND id != ? ORDER BY RANDOM()'
  ).all(item.type, item.id));

  if (distractors.length < 3) {
    addRows(db.prepare(
      'SELECT * FROM items WHERE type != ? AND id != ? ORDER BY RANDOM()'
    ).all(item.type, item.id));
  }

  return distractors;
}

function buildOptions(distractors, item) {
  const options = [...new Set([...distractors.map(d => d.chinese), item.chinese].filter(Boolean))];
  return options.sort(() => Math.random() - 0.5);
}

function shuffle(values) {
  return [...values].sort(() => Math.random() - 0.5);
}

function buildBaseExercise(item, exerciseType, template) {
  return {
    item_id: item.id,
    exercise_type: exerciseType,
    correct_answer: null,
    question: null,
    question_type_code: template.question_type_code,
    instruction_text: template.instruction_text,
    primary_action_text: template.primary_action_text,
    hint_text: template.hint_text,
    display_options: template.display_options,
  };
}

function createExercise(item, exerciseType, db, template = {}, support = null) {
  const singlePointSupport = support || getSinglePointSupport(item, db);
  const base = buildBaseExercise(item, exerciseType, template);

  switch (exerciseType) {
    case 'en2cn':
      return {
        ...base,
        question: item.english,
        correct_answer: item.chinese,
        options: buildOptions(getDistractors(item, db), item),
      };
    case 'cn2en':
      return { ...base, question: item.chinese, correct_answer: item.english };
    case 'listening':
      return {
        ...base,
        question: item.english,
        correct_answer: item.chinese,
        options: buildOptions(getDistractors(item, db), item),
      };
    case 'sentence': {
      const sentence = item.english || item.chinese || '';
      return {
        ...base,
        question: item.chinese || item.english,
        correct_answer: sentence,
        words: shuffle(sentence.split(/\s+/)),
      };
    }
    case 'spelling_fill': {
      const wordDetail = singlePointSupport.wordDetail || {};
      return {
        ...base,
        question: item.chinese,
        correct_answer: (wordDetail.base_form || item.english || '').trim(),
        first_letter_hint: wordDetail.first_letter_hint || '',
      };
    }
    case 'form_fill': {
      const wordDetail = singlePointSupport.wordDetail || {};
      const inflectionEntry = getInflectionEntry(wordDetail);
      if (!inflectionEntry) return createExercise(item, 'cn2en', db, template, singlePointSupport);
      const [promptLabel, correctAnswer] = inflectionEntry;
      return {
        ...base,
        question: (wordDetail.base_form || item.english || '').trim(),
        correct_answer: correctAnswer,
        prompt_label: promptLabel,
        usage_note: wordDetail.usage_note || '',
        example: item.example || '',
      };
    }
    case 'phrase_choice': {
      const row = (singlePointSupport.phraseQuestions || [])[0];
      if (!row) return createExercise(item, 'cn2en', db, template, singlePointSupport);
      return {
        ...base,
        question: row.prompt_sentence,
        correct_answer: row.correct_phrase,
        options: shuffle([row.correct_phrase, row.distractor_a, row.distractor_b, row.distractor_c].filter(Boolean)),
        explanation: row.explanation || '',
      };
    }
    case 'sentence_plus': {
      const detail = singlePointSupport.sentenceOrder;
      if (!detail || !Array.isArray(detail.tokens) || detail.tokens.length === 0) {
        return createExercise(item, 'sentence', db, {}, singlePointSupport);
      }
      return {
        ...base,
        question: item.chinese || item.english,
        correct_answer: detail.answer_sentence,
        words: shuffle(detail.tokens.filter(Boolean)),
        hint_text: detail.hint_text || base.hint_text,
      };
    }
    default:
      return base;
  }
}

function resolveAnswerMetadata(item, exerciseType, db, support = null) {
  const exercise = createExercise(item, exerciseType, db, {}, support);
  return {
    exercise_type: exercise.exercise_type,
    correct_answer: exercise.correct_answer || '',
    explanation: exercise.explanation || '',
  };
}

module.exports = {
  createExercise,
  getSinglePointSupport,
  pickFallbackExerciseType,
  resolveAnswerMetadata,
};
