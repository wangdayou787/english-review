const IMPLEMENTED_SINGLE_POINT_CODES = [
  'vocab_spelling_fill',
  'vocab_form_transform',
  'phrase_choice',
  'sentence_ordering',
  'grammar_choice',
  'grammar_completion',
  'grammar_sentence_transform',
];

const INFLECTION_LABELS = {
  plural: '复数',
  third_person_singular: '第三人称单数',
  past_tense: '过去式',
  past_participle: '过去分词',
  present_participle: '现在分词',
  comparative: '比较级',
  superlative: '最高级',
  adverb: '副词形式',
  adjective: '形容词形式',
  noun: '名词形式',
};

function parseJsonOrDefault(value, fallback) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch (err) {
    return fallback;
  }
}

function mapQuestionTypeToExerciseType(questionType, item, options = {}) {
  switch (questionType.code) {
    case 'vocab_en_cn_choice':
      if (item.type !== 'word' && item.type !== 'phrase') return null;
      return (options.random || Math.random)() < 0.5 ? 'en2cn' : 'cn2en_choice';
    case 'translation_fill':
      if (item.type !== 'word' && item.type !== 'phrase') return null;
      return (options.random || Math.random)() < 0.5 ? 'cn2en' : 'en2cn_fill';
    case 'vocab_spelling_fill': return item.type === 'word' ? 'spelling_fill' : null;
    case 'vocab_form_transform': return item.type === 'word' ? 'form_fill' : null;
    case 'vocab_listening_choice': return item.type === 'word' || item.type === 'phrase' ? 'listening' : null;
    case 'phrase_cn_en_fill': return item.type === 'phrase' ? 'cn2en' : null;
    case 'phrase_choice': return item.type === 'phrase' ? 'phrase_choice' : null;
    case 'sentence_ordering': return item.type === 'grammar' ? 'sentence_plus' : null;
    case 'grammar_choice': return item.type === 'grammar' ? 'grammar_choice' : null;
    case 'grammar_completion': return item.type === 'grammar' ? 'grammar_completion' : null;
    case 'grammar_sentence_transform': return item.type === 'grammar' ? 'grammar_sentence_transform' : null;
    default: return null;
  }
}

function getImplementedSinglePointTypes(db, itemType) {
  const placeholders = IMPLEMENTED_SINGLE_POINT_CODES.map(() => '?').join(', ');
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
     WHERE question_types.code IN (${placeholders})
     ORDER BY question_types.sort_order, question_types.id`
  ).all(...IMPLEMENTED_SINGLE_POINT_CODES);

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
      .filter(code => mapQuestionTypeToExerciseType({ code }, item, { random: () => 0 }) !== null)
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
    grammarExamples: item.type === 'grammar' ? queries.getGrammarExamplesByItem(db, item.id) : [],
  };
}

function getGrammarExampleTypeForQuestionCode(code) {
  if (code === 'grammar_choice') return 'choice';
  if (code === 'grammar_completion') return 'completion';
  if (code === 'grammar_sentence_transform') return 'sentence_transform';
  return null;
}

function getInflectionEntries(wordDetail) {
  if (!wordDetail || !wordDetail.inflections) return [];
  return Object.entries(wordDetail.inflections)
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([key, value]) => ({
      key,
      label: INFLECTION_LABELS[key] || key,
      value: value.trim(),
    }));
}

function getInflectionEntry(wordDetail, random = Math.random) {
  const entries = getInflectionEntries(wordDetail);
  if (!entries || entries.length === 0) return null;
  const index = Math.min(entries.length - 1, Math.floor(random() * entries.length));
  return entries[index];
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
      return !!(support.sentenceOrder &&
        String(support.sentenceOrder.answer_sentence || '').trim() &&
        Array.isArray(support.sentenceOrder.tokens) &&
        support.sentenceOrder.tokens.filter(Boolean).length > 0);
    case 'grammar_choice':
    case 'grammar_completion':
    case 'grammar_sentence_transform': {
      const exampleType = getGrammarExampleTypeForQuestionCode(questionType.code);
      return Array.isArray(support.grammarExamples) &&
        support.grammarExamples.some(example => example.example_type === exampleType);
    }
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
    .filter(type => mapQuestionTypeToExerciseType(type, item, { random: () => 0 }))
    .filter(type => isConfiguredTypeUsable(type, item, support));
  return pickWeightedQuestionType(candidates, options.random || Math.random);
}

module.exports = {
  INFLECTION_LABELS,
  getInflectionEntries,
  getInflectionEntry,
  getGrammarExampleTypeForQuestionCode,
  getSinglePointSupport,
  isConfiguredTypeUsable,
  mapQuestionTypeToExerciseType,
  pickConfiguredQuestionType,
  pickWeightedQuestionType,
};
