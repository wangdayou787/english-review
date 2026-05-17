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
