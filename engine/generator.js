/**
 * Exercise generator: create exercises from items and score answers.
 */

const EXERCISE_TYPES = ['en2cn', 'cn2en', 'listening', 'sentence', 'spelling_fill', 'form_fill', 'phrase_choice', 'sentence_plus'];
const IMPLEMENTED_SINGLE_POINT_CODES = new Set([
  'vocab_spelling_fill',
  'vocab_form_transform',
  'phrase_choice',
  'sentence_ordering',
]);

/**
 * Map item type → available exercise types
 */
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

function mapQuestionTypeToExerciseType(questionType, item) {
  switch (questionType.code) {
    case 'vocab_en_cn_choice': return item.type === 'word' ? 'en2cn' : null;
    case 'vocab_spelling_fill': return item.type === 'word' ? 'spelling_fill' : null;
    case 'vocab_form_transform': return item.type === 'word' ? 'form_fill' : null;
    case 'vocab_listening_choice': return item.type === 'word' || item.type === 'phrase' ? 'listening' : null;
    case 'phrase_cn_en_fill': return item.type === 'phrase' ? 'cn2en' : null;
    case 'phrase_choice': return item.type === 'phrase' ? 'phrase_choice' : null;
    case 'sentence_ordering': return item.type === 'grammar' ? 'sentence_plus' : null;
    default: return null;
  }
}

function parseJsonOrDefault(value, fallback) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch (err) {
    return fallback;
  }
}

function getImplementedSinglePointTypes(db, itemType) {
  const rows = db.prepare(
    `SELECT question_types.code,
            question_types.category,
            question_types.name,
            question_types.description,
            question_types.supported_item_types,
            question_types.implementation_status,
            COALESCE(question_type_settings.enabled, CASE WHEN question_types.implementation_status = 'available' THEN 1 ELSE 0 END) AS enabled,
            COALESCE(question_type_settings.weight, question_types.default_weight) AS weight,
            COALESCE(question_type_settings.instruction_text, '') AS instruction_text,
            COALESCE(question_type_settings.primary_action_text, '') AS primary_action_text,
            COALESCE(question_type_settings.hint_text, '') AS hint_text,
            COALESCE(question_type_settings.display_options, '{}') AS display_options
     FROM question_types
     LEFT JOIN question_type_settings ON question_type_settings.question_type_code = question_types.code
     WHERE question_types.code IN ('vocab_spelling_fill', 'vocab_form_transform', 'phrase_choice', 'sentence_ordering')
     ORDER BY question_types.sort_order, question_types.id`
  ).all();

  return rows
    .map(row => ({
      ...row,
      enabled: row.enabled === 1,
      weight: Number(row.weight) || 0,
      supported_item_types: parseJsonOrDefault(row.supported_item_types, []),
      display_options: parseJsonOrDefault(row.display_options, {}),
    }))
    .filter(row => row.enabled && row.weight > 0 && row.supported_item_types.includes(itemType));
}

function getQuestionTypeCandidates(item, db) {
  const queries = require('../db/queries');
  const candidates = [
    ...queries.getAvailableQuestionTypesForItemType(db, item.type),
    ...getImplementedSinglePointTypes(db, item.type),
  ];
  const explicitCompatibleCodes = new Set(
    db.prepare(
      `SELECT DISTINCT question_types.code
       FROM question_type_settings
       JOIN question_types ON question_types.code = question_type_settings.question_type_code`
    ).all()
      .map(row => row.code)
      .filter(code => {
        const mapped = mapQuestionTypeToExerciseType({ code }, item);
        return mapped !== null;
      })
  );
  const seen = new Set();
  const deduped = candidates.filter(candidate => {
    if (seen.has(candidate.code)) return false;
    seen.add(candidate.code);
    return true;
  });
  if (explicitCompatibleCodes.size === 0) return deduped;
  return deduped.filter(candidate => explicitCompatibleCodes.has(candidate.code));
}

function getSinglePointSupport(item, db) {
  const queries = require('../db/queries');
  return {
    wordDetail: item.type === 'word' ? queries.getWordQuestionDetails(db, item.id) : null,
    phraseQuestions: item.type === 'phrase' ? queries.getPhraseChoiceQuestionsByItem(db, item.id) : [],
    sentenceOrder: item.type === 'grammar' ? queries.getSentenceOrderDetails(db, item.id) : null,
  };
}

function getInflectionEntry(wordDetail) {
  if (!wordDetail || !wordDetail.inflections) return null;
  for (const [key, value] of Object.entries(wordDetail.inflections)) {
    if (typeof value === 'string' && value.trim()) {
      return [key, value.trim()];
    }
  }
  return null;
}

function isConfiguredTypeUsable(questionType, item, support) {
  switch (questionType.code) {
    case 'vocab_spelling_fill':
      return !!(support.wordDetail && ((support.wordDetail.base_form || '').trim() || (item.english || '').trim()));
    case 'vocab_form_transform':
      return !!getInflectionEntry(support.wordDetail);
    case 'phrase_choice':
      return Array.isArray(support.phraseQuestions) && support.phraseQuestions.length > 0;
    case 'sentence_ordering':
      return true;
    default:
      return true;
  }
}

function pickWeightedQuestionType(questionTypes, random = Math.random) {
  const weighted = questionTypes.filter(type => Number(type.weight) > 0);
  const total = weighted.reduce((sum, type) => sum + Number(type.weight), 0);
  if (total <= 0) return null;

  let target = random() * total;
  for (const type of weighted) {
    target -= Number(type.weight);
    if (target < 0) return type;
  }

  return weighted[weighted.length - 1] || null;
}

function pickConfiguredQuestionType(item, db, support, options = {}) {
  if (!db || typeof db.prepare !== 'function') return null;
  const candidates = getQuestionTypeCandidates(item, db)
    .filter(type => mapQuestionTypeToExerciseType(type, item))
    .filter(type => isConfiguredTypeUsable(type, item, support));
  return pickWeightedQuestionType(candidates, options.random || Math.random);
}

/**
 * Get up to 3 random distractor items, preferring the same type.
 */
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

  const sameTypeRows = db.prepare(
    'SELECT * FROM items WHERE type = ? AND id != ? ORDER BY RANDOM()'
  ).all(item.type, item.id);
  addRows(sameTypeRows);

  if (distractors.length < 3) {
    const fallbackRows = db.prepare(
      'SELECT * FROM items WHERE type != ? AND id != ? ORDER BY RANDOM()'
    ).all(item.type, item.id);
    addRows(fallbackRows);
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

/**
 * Create a single exercise from an item.
 */
function createExercise(item, exerciseType, db, template = {}, support = null) {
  const singlePointSupport = support || getSinglePointSupport(item, db);
  const base = {
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

  switch (exerciseType) {
    case 'en2cn': {
      const distractors = getDistractors(item, db);
      const options = buildOptions(distractors, item);
      return {
        ...base,
        question: item.english,
        correct_answer: item.chinese,
        options,
      };
    }

    case 'cn2en': {
      return {
        ...base,
        question: item.chinese,
        correct_answer: item.english,
      };
    }

    case 'listening': {
      const distractors = getDistractors(item, db);
      const options = buildOptions(distractors, item);
      return {
        ...base,
        question: item.english, // Used by TTS
        correct_answer: item.chinese,
        options,
      };
    }

    case 'sentence': {
      const sentence = item.english || item.chinese || '';
      const words = sentence.split(/\s+/).sort(() => Math.random() - 0.5);
      return {
        ...base,
        question: item.chinese || item.english,
        correct_answer: sentence,
        words,
      };
    }

    case 'spelling_fill': {
      const wordDetail = singlePointSupport.wordDetail || {};
      const correctAnswer = (wordDetail.base_form || item.english || '').trim();
      return {
        ...base,
        question: item.chinese,
        correct_answer: correctAnswer,
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
        options: shuffle([
          row.correct_phrase,
          row.distractor_a,
          row.distractor_b,
          row.distractor_c,
        ].filter(Boolean)),
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

/**
 * Generate exercises for a list of items.
 */
function generateExercises(items, db, options = {}) {
  return items.map(item => {
    const support = getSinglePointSupport(item, db);
    const configuredType = pickConfiguredQuestionType(item, db, support, options);
    if (configuredType) {
      const exerciseType = mapQuestionTypeToExerciseType(configuredType, item);
      if (exerciseType) {
        return createExercise(item, exerciseType, db, {
          question_type_code: configuredType.code,
          instruction_text: configuredType.instruction_text,
          primary_action_text: configuredType.primary_action_text,
          hint_text: configuredType.hint_text,
          display_options: configuredType.display_options,
        }, support);
      }
    }

    return createExercise(item, pickFallbackExerciseType(item), db, {}, support);
  });
}

/**
 * Score a single answer.
 */
function scoreAnswer(item, exerciseType, userAnswer, correctAnswer) {
  let isCorrect = false;

  switch (exerciseType) {
    case 'en2cn':
    case 'listening':
      isCorrect = (userAnswer || '').trim() === (correctAnswer || '').trim();
      break;
    case 'cn2en':
    case 'spelling_fill':
    case 'form_fill':
      isCorrect = (userAnswer || '').trim().toLowerCase() === (correctAnswer || '').trim().toLowerCase();
      break;
    case 'phrase_choice':
    case 'sentence':
    case 'sentence_plus':
      isCorrect = (userAnswer || '').trim() === (correctAnswer || '').trim();
      break;
  }

  return {
    item_id: item.id,
    exercise_type: exerciseType,
    is_correct: isCorrect,
    correct_answer: correctAnswer,
    user_answer: userAnswer,
  };
}

/**
 * Score all answers for a set of exercises.
 */
function scoreAnswers(items, answers) {
  const results = [];
  let totalCorrect = 0;

  for (const answer of answers) {
    const item = items.find(i => i.id === answer.item_id);
    if (!item) {
      results.push({ item_id: answer.item_id, is_correct: false, correct_answer: '', user_answer: answer.answer });
      continue;
    }

    // Determine correct_answer based on exercise_type
    let correctAnswer;
    switch (answer.exercise_type) {
      case 'en2cn':
      case 'listening':
        correctAnswer = item.chinese;
        break;
      case 'cn2en':
        correctAnswer = item.english;
        break;
      case 'sentence':
        correctAnswer = item.english || item.chinese;
        break;
      case 'spelling_fill':
      case 'form_fill':
      case 'phrase_choice':
      case 'sentence_plus':
        correctAnswer = answer.correct_answer || item.chinese || item.english;
        break;
      default:
        correctAnswer = item.chinese || item.english;
    }

    const result = scoreAnswer(item, answer.exercise_type, answer.answer, correctAnswer);
    if (answer.exercise_type === 'phrase_choice' && answer.explanation) {
      result.explanation = answer.explanation;
    }
    results.push(result);
    if (result.is_correct) totalCorrect++;
  }

  const totalQuestions = answers.length;
  const perfectBonus = totalCorrect === totalQuestions && totalQuestions > 0 ? 3 : 0;

  return {
    results,
    total_correct: totalCorrect,
    total_questions: totalQuestions,
    perfect_bonus: perfectBonus,
    score: totalCorrect + perfectBonus,
  };
}

module.exports = { createExercise, generateExercises, scoreAnswer, scoreAnswers, EXERCISE_TYPES, pickWeightedQuestionType };
