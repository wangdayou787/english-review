const { EXERCISE_TYPES } = require('./exercise-types');
const {
  createExercise,
  getSinglePointSupport,
  pickFallbackExerciseType,
  resolveAnswerMetadata,
} = require('./exercise-builders');
const {
  mapQuestionTypeToExerciseType,
  pickConfiguredQuestionType,
  pickWeightedQuestionType,
} = require('./question-type-selection');

function generateExercises(items, db, options = {}) {
  return items.map(item => {
    const support = getSinglePointSupport(item, db);
    const configuredType = pickConfiguredQuestionType(item, db, support, options);
    if (configuredType) {
      const exerciseType = mapQuestionTypeToExerciseType(configuredType, item, options);
      if (exerciseType) {
        return createExercise(item, exerciseType, db, {
          question_type_code: configuredType.code,
          instruction_text: configuredType.instruction_text,
          primary_action_text: configuredType.primary_action_text,
          hint_text: configuredType.hint_text,
          display_options: configuredType.display_options,
        }, support, options);
      }
    }

    return createExercise(item, pickFallbackExerciseType(item), db, {}, support, options);
  });
}

function scoreAnswer(item, exerciseType, userAnswer, correctAnswer) {
  const normalizedUser = (userAnswer || '').trim();
  const normalizedCorrect = (correctAnswer || '').trim();
  let isCorrect = false;

  switch (exerciseType) {
    case 'cn2en':
    case 'spelling_fill':
    case 'form_fill':
    case 'grammar_completion':
    case 'grammar_sentence_transform':
      isCorrect = normalizedUser.toLowerCase() === normalizedCorrect.toLowerCase();
      break;
    case 'en2cn':
    case 'listening':
    case 'phrase_choice':
    case 'sentence':
    case 'sentence_plus':
      isCorrect = normalizedUser === normalizedCorrect;
      break;
    case 'grammar_choice':
      isCorrect = normalizedUser === normalizedCorrect;
      break;
    case 'en2cn_fill':
      isCorrect = normalizedUser === normalizedCorrect;
      break;
    default:
      isCorrect = normalizedUser === normalizedCorrect;
  }

  return {
    item_id: item.id,
    exercise_type: exerciseType,
    is_correct: isCorrect,
    correct_answer: correctAnswer,
    user_answer: userAnswer,
  };
}

function getDefaultAnswerMetadata(item, answer) {
  switch (answer.exercise_type) {
    case 'en2cn':
    case 'listening':
      return { correct_answer: item.chinese || '', explanation: '' };
    case 'en2cn_fill':
      return { correct_answer: item.chinese || '', explanation: '' };
    case 'cn2en':
      return { correct_answer: item.english || '', explanation: '' };
    case 'sentence':
      return { correct_answer: item.english || item.chinese || '', explanation: '' };
    case 'spelling_fill':
    case 'form_fill':
    case 'phrase_choice':
    case 'sentence_plus':
    case 'grammar_choice':
    case 'grammar_completion':
    case 'grammar_sentence_transform':
      return {
        correct_answer: answer.correct_answer || item.chinese || item.english || '',
        explanation: answer.explanation || '',
      };
    default:
      return { correct_answer: item.chinese || item.english || '', explanation: '' };
  }
}

function scoreAnswers(items, answers, options = {}) {
  const results = [];
  let totalCorrect = 0;

  for (const answer of answers) {
    const item = items.find(i => i.id === answer.item_id);
    if (!item) {
      results.push({ item_id: answer.item_id, is_correct: false, correct_answer: '', user_answer: answer.answer });
      continue;
    }

    const metadata = options.db
      ? resolveAnswerMetadata(item, answer.exercise_type, options.db, getSinglePointSupport(item, options.db), {
        grammarExampleId: answer.grammar_example_id,
      })
      : getDefaultAnswerMetadata(item, answer);

    const exerciseType = metadata.exercise_type || answer.exercise_type;
    const result = scoreAnswer(item, exerciseType, answer.answer, metadata.correct_answer);
    if (metadata.explanation) result.explanation = metadata.explanation;
    if (metadata.grammar_example_id) result.grammar_example_id = metadata.grammar_example_id;
    if (metadata.question) result.question = metadata.question;
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

module.exports = {
  createExercise,
  generateExercises,
  scoreAnswer,
  scoreAnswers,
  EXERCISE_TYPES,
  pickWeightedQuestionType,
};
