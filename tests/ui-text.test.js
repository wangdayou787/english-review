const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

const filesWithUserFacingText = [
  'middleware/auth.js',
  'routes/auth.js',
  'routes/admin.js',
  'routes/practice.js',
  'routes/stats.js',
  'views/layout.ejs',
  'views/login.ejs',
  'views/register.ejs',
  'views/stats.ejs',
  'views/admin/textbooks.ejs',
  'views/admin/units.ejs',
  'views/admin/items.ejs',
  'views/admin/item-edit.ejs',
  'views/admin/review-plan.ejs',
  'views/admin/settings.ejs',
  'views/practice/dashboard.ejs',
  'views/practice/exercise.ejs',
  'views/practice/result.ejs',
];

const corruptedFragments = [
  '鈹',
  '鑻',
  '澶',
  '璇',
  '绠',
  '鐧',
  '娉',
  '瀛',
  '鎴',
  '锛?',
  '馃',
  '鉁',
  '鉂',
  '�',
];

const expectedText = {
  'views/layout.ejs': ['英语复习工具', '课本管理', '复习计划', '系统设置', '开始复习', '学习统计', '退出'],
  'views/login.ejs': ['登录', '用户名', '密码', '还没有账号？', '立即注册'],
  'views/register.ejs': ['注册', '用户名', '密码', '已有账号？', '立即登录'],
  'views/practice/dashboard.ejs': ['复习主页', '今日进度', '今日复习', '新内容', '复习内容', '开始今日复习', '暂无复习计划', '周期复习提醒'],
  'views/practice/exercise.ejs': ['提交答案', '播放发音', '输入你的答案'],
  'views/practice/result.ejs': ['练习结果', '获得积分', '正确率', '已掌握'],
  'views/stats.ejs': ['学习统计', '总积分', '连续打卡', '总正确率'],
  'views/admin/textbooks.ejs': ['课本管理', '添加课本', '系统设置'],
  'views/admin/units.ejs': ['返回课本列表', '添加单元'],
  'views/admin/items.ejs': ['添加条目', '批量导入', '英文', '中文释义'],
  'views/admin/item-edit.ejs': ['编辑条目', '保存', '取消'],
  'views/admin/review-plan.ejs': ['复习计划', '当前启用计划', '启用此复习计划', '每日配额'],
  'views/admin/settings.ejs': ['系统设置', '每日复习配额', '复习周期规则'],
};

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('Simplified Chinese UI text', () => {
  test.each(filesWithUserFacingText)('%s does not contain mojibake fragments', (relativePath) => {
    const content = read(relativePath);
    for (const fragment of corruptedFragments) {
      expect(content).not.toContain(fragment);
    }
  });

  test.each(Object.entries(expectedText))('%s contains expected user-facing copy', (relativePath, strings) => {
    const content = read(relativePath);
    for (const text of strings) {
      expect(content).toContain(text);
    }
  });
});
