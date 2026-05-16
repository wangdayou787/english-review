# Translation Fill And Choice Expansion Design

Date: 2026-05-16

## Purpose

This design fixes the current word-form display bug and expands the actual practice forms used by the review page.

The current experience has two gaps:

- Word-form fill questions show internal keys such as `plural` instead of Chinese labels such as `复数`.
- Translation practice is too narrow. Choice questions only cover English-to-Chinese, and direct fill questions do not separately cover Chinese-to-English and English-to-Chinese translation.

## Confirmed Scope

This sub-project includes:

- Showing Chinese labels for word-form targets.
- Randomizing word-form fill questions across all available inflection fields.
- Expanding translation choice so it can generate both:
  - English prompt, choose Chinese meaning.
  - Chinese prompt, choose English word or phrase.
- Adding direct translation fill variants:
  - Chinese prompt, type English word or phrase.
  - English prompt, type Chinese meaning.
- Supporting translation fill for both `word` and `phrase` items.
- Tests for exercise generation, scoring, and key UI text.

This sub-project does not include:

- New database tables.
- AI-generated distractors.
- Fuzzy Chinese semantic matching.
- Grammar sentence fill expansion.
- New admin data entry screens beyond existing question type controls.

## Exercise Forms

### Translation Choice

The existing `vocab_en_cn_choice` question type should remain a choice-based translation type, but it should produce both directions when enough data exists:

- `en2cn`: show `item.english`, options are Chinese meanings, correct answer is `item.chinese`.
- `cn2en_choice`: show `item.chinese`, options are English words or phrases, correct answer is `item.english`.

The same direction expansion should be usable for phrases where the item type supports the selected question type.

Option generation must keep options unique and include the correct answer. If there are not enough same-type distractors, the existing fallback behavior may use other item types.

### Translation Fill

Add a fill-based translation exercise family:

- `cn2en`: show Chinese, student types the English word or phrase.
- `en2cn_fill`: show English, student types the Chinese meaning.

`cn2en` already exists as a fill exercise and should continue to score case-insensitively for English answers. `en2cn_fill` should score by exact normalized string equality for Chinese answers after trimming whitespace.

This question family should support both `word` and `phrase` items.

### Word-Form Fill

For `form_fill`, the target label must be shown in Chinese. The supported label map is:

- `plural`: `复数`
- `third_person_singular`: `第三人称单数`
- `past_tense`: `过去式`
- `past_participle`: `过去分词`
- `present_participle`: `现在分词`
- `comparative`: `比较级`
- `superlative`: `最高级`
- `adverb`: `副词形式`
- `adjective`: `形容词形式`
- `noun`: `名词形式`

When a word has multiple available inflections, the generator should randomly choose one available target instead of always choosing the first object entry. A deterministic random function may be passed in tests.

## Question Type Configuration

Use existing question type infrastructure where possible.

The existing `vocab_en_cn_choice` should represent translation choice. It may map to either `en2cn` or `cn2en_choice`.

Add or enable a separate available question type for translation fill, for example:

```text
translation_fill
```

Visible copy:

- Name: `互译填空`
- Description: `给出英文或中文，直接填写对应翻译。`
- Instruction: `写出对应的翻译。`
- Button: `提交答案`
- Hint: `注意拼写、大小写和中文释义。`

Supported item types:

- `word`
- `phrase`

## Scoring

Scoring rules:

- `cn2en`, `spelling_fill`, and `form_fill`: trim and compare case-insensitively.
- `en2cn_fill`: trim and compare exactly.
- Choice exercises continue to compare selected value exactly.

No fuzzy matching is required in this phase.

## UI

The practice page should continue to render choice exercises with radio options and fill exercises with text inputs.

The word-form target line should display:

```text
目标词形：过去式
```

It must not display internal keys such as:

```text
目标词形：past_tense
目标词形：plural
```

## Testing

Add or update tests for:

- `form_fill` displays Chinese prompt labels.
- `form_fill` can choose among multiple inflections deterministically with injected randomness.
- Translation choice can generate English-to-Chinese and Chinese-to-English choice forms.
- Translation fill can generate Chinese-to-English and English-to-Chinese fill forms.
- `en2cn_fill` scoring trims whitespace and requires the correct Chinese meaning.
- UI text coverage includes `目标词形`, `互译填空`, and existing fill input text.

## Acceptance Criteria

- Screenshot issue is fixed: the page shows `目标词形：复数` rather than `目标词形：plural`.
- Students can practice English-to-Chinese choice and Chinese-to-English choice.
- Students can practice Chinese-to-English fill for words and phrases.
- Students can practice English-to-Chinese fill for words and phrases.
- Word-form fill uses available inflection fields and shows Chinese labels.
- Existing tests and the new focused tests pass.
