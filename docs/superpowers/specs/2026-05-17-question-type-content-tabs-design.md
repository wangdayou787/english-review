# Question Type Content Tabs Design

## Goal

Make the question type settings page match the product's core purpose: daily review of English foundational knowledge. The page should help the teacher choose question types by review content first, instead of showing one long mixed list.

## Scope

This change only covers the admin question type settings page at `/admin/question-types`.

It does not add grammar question generation, grammar scoring, grammar question-bank editing, Excel import, or changes to the daily review scheduler.

## Page Structure

The page keeps the existing explanation area and save action. The main settings area becomes three tabs:

- `单词`
- `词组`
- `语法`

Each tab contains two sections:

- `可用于练习`
- `后续支持`

The existing collapsible question type cards remain. The available section keeps editable settings. The planned section stays read-only.

## Content Mapping

Question types are assigned to tabs by their supported review content:

- `单词`: question types whose supported item types include `word`.
- `词组`: question types whose supported item types include `phrase`.
- `语法`: question types whose supported item types include `grammar`.

If one question type supports multiple content types, it appears in each matching tab. For example, `听音选择` and `互译填空` can appear in both `单词` and `词组`.

Non-core future types are hidden from this page in this iteration:

- cloze question types
- reading question types
- dialogue or passage-only question types that do not support `word`, `phrase`, or `grammar`

This keeps the page focused on foundational daily review rather than the larger future roadmap.

## Available Type Behavior

In each tab's `可用于练习` section:

- Only implemented question types with `implementation_status = 'available'` appear.
- Cards stay collapsible.
- The `选用此题型` checkbox remains editable.
- Selected cards keep the existing selected text highlight.
- The section count updates within that tab, using the same pattern as `n 个题型，选用 m 个`.
- Existing settings remain editable: weight, instruction text, primary action text, hint text, and display options.

Saving the page continues to submit the same `settings[...]` payload. If the same question type appears in more than one tab, it must only submit one set of inputs to avoid duplicate settings conflicts. The duplicated appearances should be display-only mirrors or should be controlled by a single canonical input instance.

## Planned Type Behavior

In each tab's `后续支持` section:

- Planned question types appear only if they support the active tab's content type.
- Cards stay collapsible.
- Cards show name, category, and description.
- No editable settings are rendered.
- Planned types are not submitted when saving.

## Default Tab

The default active tab is `单词`, because word review is the highest-volume daily review content and is the first teacher workflow after setting the review plan.

The tab can be implemented as client-side tab switching in the EJS template. No separate route is required.

## Testing

Tests should verify:

- `/admin/question-types` renders the three tabs: `单词`, `词组`, `语法`.
- The default page renders the `单词` tab as active.
- Word-supported available types appear in the `单词` tab.
- Phrase-supported available types appear in the `词组` tab.
- Grammar-supported types appear in the `语法` tab.
- Cloze, reading, and passage-only future types do not appear on the page.
- The same question type does not submit duplicate `settings[...]` rows when it belongs to multiple tabs.
- Existing save behavior for question type settings still works.
