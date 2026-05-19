const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('review template safety', () => {
  test('sentence ordering builds selected chips with DOM APIs', () => {
    const exercise = read('views/practice/exercise.ejs');

    expect(exercise).not.toContain('innerHTML');
    expect(exercise).toContain('document.createElement');
    expect(exercise).toContain('textContent');
  });

  test('listening buttons do not embed item text in inline JavaScript', () => {
    const exercise = read('views/practice/exercise.ejs');

    expect(exercise).not.toContain('onclick="speak');
    expect(exercise).toContain('data-question="<%= ex.question %>"');
    expect(exercise).toContain('addEventListener');
  });

  test('practice text answer inputs disable browser answer history', () => {
    const exercise = read('views/practice/exercise.ejs');

    expect(exercise).toContain('autocomplete="off"');
    expect(exercise).toContain('autocapitalize="off"');
    expect(exercise).toContain('spellcheck="false"');
  });

  test('practice exercises do not render bottom hint text', () => {
    const exercise = read('views/practice/exercise.ejs');

    expect(exercise).not.toContain('exercise-hint');
    expect(exercise).not.toContain('ex.hint_text');
  });

  test('practice template renders grammar example exercise types', () => {
    const exercise = read('views/practice/exercise.ejs');

    expect(exercise).toContain("ex.exercise_type === 'grammar_choice'");
    expect(exercise).toContain("ex.exercise_type === 'grammar_completion'");
    expect(exercise).toContain("ex.exercise_type === 'grammar_sentence_transform'");
  });

  test('paginated practice stores answers and only submits from the final page', () => {
    const exercise = read('views/practice/exercise.ejs');

    expect(exercise).toContain('data-answer-storage-key');
    expect(exercise).toContain('saveCurrentPageAnswers');
    expect(exercise).toContain('restoreCurrentPageAnswers');
    expect(exercise).toContain('appendStoredAnswersForSubmit');
    expect(exercise).toContain('sessionStorage');
    expect(exercise).toContain('reportValidity');
    expect(exercise).toContain('event.preventDefault()');
    expect(exercise).toContain('window.location.href = link.href');
    expect(exercise).toContain('data-total-items');
    expect(exercise).toContain('storedAnswers.length < totalItems');
    expect(exercise).toContain('page === totalPages');
    expect(exercise).not.toContain('<button type="submit" class="primary-action">提交答案</button>');
  });

  test('question type settings no longer exposes hint text inputs', () => {
    const questionTypes = read('views/admin/question-types.ejs');

    expect(questionTypes).not.toContain('[hintText]');
    expect(questionTypes).not.toContain('type.hint_text');
  });

  test('grammar example options are toggled by example type in admin forms', () => {
    const addItems = read('views/admin/items.ejs');
    const editItem = read('views/admin/item-edit.ejs');

    expect(addItems).toContain('data-grammar-options-field');
    expect(addItems).toContain('toggleGrammarOptionFields');
    expect(addItems).toContain('optionField.hidden = !isChoice');
    expect(addItems).toContain('field.disabled = !isChoice');
    expect(editItem).toContain('data-grammar-options-field');
    expect(editItem).toContain('toggleGrammarOptionFields');
    expect(editItem).toContain('optionField.hidden = !isChoice');
    expect(editItem).toContain('field.disabled = !isChoice');
  });

  test('add item form can autofill grammar details by existing title', () => {
    const addItems = read('views/admin/items.ejs');

    expect(addItems).toContain('grammar-title-reuse-data');
    expect(addItems).toContain('applyGrammarTitleReuse');
    expect(addItems).toContain('grammarDetailTitleInput');
    expect(addItems).toContain('grammarDetailDescriptionInput');
    expect(addItems).toContain('grammarDetailUsageNotesInput');
  });

  test('question type settings updates selected count without inline handlers', () => {
    const questionTypes = read('views/admin/question-types.ejs');

    expect(questionTypes).toContain('data-available-count');
    expect(questionTypes).toContain('data-question-type-enabled');
    expect(questionTypes).toContain('question-type-selected');
    expect(questionTypes).toContain("addEventListener('change'");
    expect(questionTypes).not.toContain('onchange=');
  });

  test('question type settings tabs synchronize mirrored controls without duplicate forms', () => {
    const questionTypes = read('views/admin/question-types.ejs');

    expect(questionTypes).toContain('data-question-type-tab');
    expect(questionTypes).toContain('data-question-type-panel');
    expect(questionTypes).toContain('data-canonical-code');
    expect(questionTypes).toContain('data-mirror-enabled');
    expect(questionTypes).toContain('syncMirroredCards');
    expect(questionTypes).toContain("addEventListener('click'");
    expect(questionTypes).not.toContain('onclick=');
  });

  test('stats mastered items use a passive chip class', () => {
    const stats = read('views/stats.ejs');

    expect(stats).toContain('class="mastery-chip"');
    expect(stats).not.toContain('word-chip');
  });

  test('layout links student review styles', () => {
    const layout = read('views/layout.ejs');

    expect(layout).toContain('href="/review.css"');
  });
});
