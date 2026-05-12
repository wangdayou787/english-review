# Question Type Settings Verification

## Preconditions

- Start the app with `cmd /c npm start`.
- Open `http://localhost:3000`.
- Log in as admin with `admin` / `admin123`.

## Admin Checks

1. Open `题型设置` from the admin navigation.
2. Confirm the six groups are visible: 单词词汇类、短语固定搭配类、语法专项类、句子句型类、完形填空类、阅读理解类。
3. Confirm available types show `可用于练习` and planned types show `后续支持`.
4. Change `听音选择` weight to `100` and keep it enabled.
5. Save the page and confirm the value remains after reload.
6. Enter invalid weight `101`; confirm the page shows `题型比例必须是 0 到 100 的整数`.

## Student Checks

1. Make sure a review plan is active and contains word items.
2. Open `学生端预览`, then start today's review.
3. Confirm word exercises can use the configured type.
4. Confirm planned types such as 阅读理解 do not appear in student practice.
5. Submit answers and confirm the result page still works.

## Regression Checks

- Existing textbook management still works.
- Existing review plan activation still works.
- Existing daily review task generation still works.
- Existing stats page still opens.
