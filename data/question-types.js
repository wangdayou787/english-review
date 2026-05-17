const CATEGORY_LABELS = {
  vocabulary: '单词词汇类',
  phrase: '短语固定搭配类',
  grammar: '语法专项类',
  sentence: '句子句型类',
  cloze: '完形填空类',
  reading: '阅读理解类',
};

const DEFAULT_DISPLAY_OPTIONS = {
  showExample: false,
  showPartOfSpeech: false,
  showChineseMeaning: false,
  showFirstLetterHint: false,
};

const QUESTION_TYPES = [
  { code: 'vocab_en_cn_choice', category: 'vocabulary', name: '中英互译单选', description: '给中文选英文，或给英文选中文释义。', supportedItemTypes: ['word'], implementationStatus: 'available', defaultWeight: 30, instructionText: '选择正确答案。', primaryActionText: '提交答案', hintText: '注意词义和语境。', displayOptions: { showPartOfSpeech: true } },
  { code: 'translation_fill', category: 'vocabulary', name: '互译填空', description: '给出英文或中文，直接填写对应翻译。', supportedItemTypes: ['word', 'phrase'], implementationStatus: 'available', defaultWeight: 20, instructionText: '写出对应的翻译。', primaryActionText: '提交答案', hintText: '注意拼写、大小写和中文释义。', displayOptions: { showPartOfSpeech: true, showChineseMeaning: true } },
  { code: 'vocab_spelling_fill', category: 'vocabulary', name: '单词拼写填空', description: '给出中文和首字母，填写完整单词。', supportedItemTypes: ['word'], implementationStatus: 'available', defaultWeight: 10, instructionText: '根据提示拼写完整单词。', primaryActionText: '提交答案', hintText: '先回忆发音，再检查拼写。', displayOptions: { showPartOfSpeech: true, showChineseMeaning: true, showFirstLetterHint: true } },
  { code: 'vocab_form_transform', category: 'vocabulary', name: '词形变换填空', description: '考查名词、动词、形容词和副词等常见变形。', supportedItemTypes: ['word'], implementationStatus: 'available', defaultWeight: 10, instructionText: '写出所给词的正确形式。', primaryActionText: '提交答案', hintText: '注意时态、词性和比较等级。', displayOptions: { showPartOfSpeech: true, showChineseMeaning: true, showExample: true } },
  { code: 'vocab_word_bank_fill', category: 'vocabulary', name: '选词填空', description: '从词库中选择合适单词填入句子。', supportedItemTypes: ['word'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '从词库中选择合适的词。', primaryActionText: '提交答案', hintText: '先判断句子需要的词性。', displayOptions: { showExample: true } },
  { code: 'vocab_synonym_antonym_choice', category: 'vocabulary', name: '近义词 / 反义词辨析选择题', description: '辨析常见易混词、近义词和反义词。', supportedItemTypes: ['word'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '选择最符合题意的词。', primaryActionText: '提交答案', hintText: '注意词义差别和固定搭配。', displayOptions: { showPartOfSpeech: true, showExample: true } },
  { code: 'vocab_listening_choice', category: 'vocabulary', name: '听音选择', description: '听英文发音，选择对应中文释义。', supportedItemTypes: ['word', 'phrase'], implementationStatus: 'available', defaultWeight: 20, instructionText: '听发音，选择正确释义。', primaryActionText: '播放发音', hintText: '可以重复播放后再选择。', displayOptions: {} },
  { code: 'phrase_cn_en_fill', category: 'phrase', name: '短语汉译英填空', description: '给中文短语，默写英文固定搭配。', supportedItemTypes: ['phrase'], implementationStatus: 'available', defaultWeight: 30, instructionText: '写出对应英文短语。', primaryActionText: '提交答案', hintText: '注意介词和冠词。', displayOptions: { showChineseMeaning: true, showExample: true } },
  { code: 'phrase_choice', category: 'phrase', name: '短语单选辨析', description: '从相近短语中选择正确搭配。', supportedItemTypes: ['phrase'], implementationStatus: 'available', defaultWeight: 10, instructionText: '选择正确短语。', primaryActionText: '提交答案', hintText: '注意动词和介词搭配。', displayOptions: { showExample: true } },
  { code: 'phrase_matching', category: 'phrase', name: '短语匹配题', description: '匹配中文短语和英文短语。', supportedItemTypes: ['phrase'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '匹配意思相同的短语。', primaryActionText: '提交答案', hintText: '先匹配最熟悉的短语。', displayOptions: { showChineseMeaning: true } },
  { code: 'grammar_choice', category: 'grammar', name: '语法单项选择', description: '每题考查一个语法点。', supportedItemTypes: ['grammar'], implementationStatus: 'planned', defaultWeight: 20, instructionText: '选择最符合语法规则的答案。', primaryActionText: '提交答案', hintText: '先判断本题考查的语法点。', displayOptions: { showExample: true } },
  { code: 'grammar_given_word_form', category: 'grammar', name: '用所给词适当形式填空', description: '根据句子语境填写所给词的正确形式。', supportedItemTypes: ['grammar'], implementationStatus: 'planned', defaultWeight: 20, instructionText: '写出括号内词的正确形式。', primaryActionText: '提交答案', hintText: '注意时态、语态和词性。', displayOptions: { showExample: true } },
  { code: 'grammar_error_correction', category: 'grammar', name: '单句改错', description: '选择错误部分并写出改正内容。', supportedItemTypes: ['grammar'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '找出错误并改正。', primaryActionText: '提交答案', hintText: '从时态、主谓一致和固定搭配检查。', displayOptions: { showExample: true } },
  { code: 'grammar_sentence_transform', category: 'grammar', name: '句型转换', description: '完成同义句、否定句、疑问句等转换。', supportedItemTypes: ['grammar'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '按要求完成句型转换。', primaryActionText: '提交答案', hintText: '注意助动词和句子结构。', displayOptions: { showExample: true } },
  { code: 'sentence_ordering', category: 'sentence', name: '连词成句', description: '把打乱的词语排列成完整句子。', supportedItemTypes: ['grammar'], implementationStatus: 'available', defaultWeight: 20, instructionText: '点击词块组成完整句子。', primaryActionText: '提交答案', hintText: '先找主语和谓语。', displayOptions: { showChineseMeaning: true } },
  { code: 'situational_dialogue_choice', category: 'sentence', name: '情景交际单选', description: '根据对话上下文选择合适答句。', supportedItemTypes: ['grammar'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '选择最合适的答句。', primaryActionText: '提交答案', hintText: '注意上下文语气。', displayOptions: { showExample: true } },
  { code: 'dialogue_completion', category: 'sentence', name: '补全对话', description: '从备选句子中补全对话。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '选择合适句子补全对话。', primaryActionText: '提交答案', hintText: '先判断空格前后的问答关系。', displayOptions: {} },
  { code: 'cloze_choice', category: 'cloze', name: '标准短文完形', description: '短文每空四选一。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '阅读短文，选择每空正确答案。', primaryActionText: '提交答案', hintText: '先通读全文，再逐空判断。', displayOptions: {} },
  { code: 'cloze_word_bank', category: 'cloze', name: '短文选词完形', description: '从词库中选择合适词语完成短文。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '从词库中选择合适词语。', primaryActionText: '提交答案', hintText: '注意上下文和词形变化。', displayOptions: {} },
  { code: 'reading_true_false', category: 'reading', name: '判断正误阅读', description: '阅读短文后判断句子正误。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '根据短文判断正误。', primaryActionText: '提交答案', hintText: '回到原文定位关键信息。', displayOptions: {} },
  { code: 'reading_choice', category: 'reading', name: '阅读理解选择题', description: '阅读短文后回答细节、推理和主旨题。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '阅读短文并选择正确答案。', primaryActionText: '提交答案', hintText: '先看题干，再回原文定位。', displayOptions: {} },
  { code: 'reading_task_based', category: 'reading', name: '任务型阅读', description: '完成表格、简答或信息填空。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '根据短文完成任务。', primaryActionText: '提交答案', hintText: '答案通常来自原文信息。', displayOptions: {} },
];

function serializeDisplayOptions(options) {
  return JSON.stringify({ ...DEFAULT_DISPLAY_OPTIONS, ...(options || {}) });
}

module.exports = {
  CATEGORY_LABELS,
  DEFAULT_DISPLAY_OPTIONS,
  QUESTION_TYPES,
  serializeDisplayOptions,
};
