/**
 * Exercise generator: create exercises from items and score answers.
 */

const EXERCISE_TYPES = ['en2cn', 'cn2en', 'listening', 'sentence'];

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

/**
 * Pick a random exercise type suitable for the item.
 */
function pickExerciseType(item) {
  const types = getExerciseTypesForItem(item);
  return types[Math.floor(Math.random() * types.length)];
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

/**
 * Create a single exercise from an item.
 */
function createExercise(item, exerciseType, db) {
  const base = {
    item_id: item.id,
    exercise_type: exerciseType,
    correct_answer: null,
    question: null,
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

    default:
      return base;
  }
}

/**
 * Generate exercises for a list of items.
 */
function generateExercises(items, db) {
  return items.map(item => {
    const exType = pickExerciseType(item);
    return createExercise(item, exType, db);
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
      isCorrect = (userAnswer || '').trim().toLowerCase() === (correctAnswer || '').trim().toLowerCase();
      break;
    case 'sentence':
      isCorrect = (userAnswer || '').trim() === (correctAnswer || '').trim();
      break;
  }

  return {
    item_id: item.id,
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
      default:
        correctAnswer = item.chinese || item.english;
    }

    const result = scoreAnswer(item, answer.exercise_type, answer.answer, correctAnswer);
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

module.exports = { createExercise, generateExercises, scoreAnswer, scoreAnswers, EXERCISE_TYPES };
