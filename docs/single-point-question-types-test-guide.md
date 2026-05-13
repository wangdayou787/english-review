# Single Point Question Types Verification

## Preconditions

- Start the app with `cmd /c npm start`.
- Log in as `admin`.
- Make sure there is an active review plan containing at least one word, one phrase, and one grammar item.
- In admin question type settings, enable the first-batch single-point types you want to test.

## Admin Checks

1. Open an existing word item and save `题型扩展信息`.
2. For that word, add `首字母提示`, `用法说明`, and at least one inflection such as past tense.
3. Open an existing phrase item and add one `辨析题` with a prompt sentence, correct phrase, three distractors, and explanation.
4. Open an existing grammar item and save `连词成句增强版` details with answer sentence, token text, and hint text.
5. Reload each edit page and confirm the values persist.

## Student Checks

1. Open `学生端预览` or log in as a normal user and open the practice page.
2. Start today's review with the supported question types enabled.
3. Confirm `单词拼写填空` can appear for a configured word item.
4. Confirm `词形变换填空` appears only when inflection data exists.
5. Confirm `短语单选辨析` uses the authored prompt, correct option, distractors, and explanation.
6. Confirm `连词成句增强版` uses the stored tokens and hint text.
7. Submit both correct and incorrect answers and inspect the result feedback.
8. Confirm phrase-choice explanations appear on the result page.

## Regression Checks

- Review plan page still opens and can keep an active plan.
- Question type settings page still opens and saves settings.
- Existing legacy question types still generate.
- Stats page still opens.
- Existing review records remain visible after restarting the app.
