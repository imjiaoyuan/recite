// Tiny i18n: zh / en dictionaries, auto-detect from system language.
import { getMeta, setMeta } from './store';

type Dict = Record<string, string>;

const STRINGS: Record<string, Dict> = {
  zh: {
    'app.subtitle': '英语背单词 · 间隔重复',
    'set.voice': '发音',
    'set.daily': '每日上限',
    'set.countdown': '拼写倒计时',
    'set.theme': '主题',
    'set.language': '语言',
    'opt.us': '美音',
    'opt.gb': '英音',
    'opt.light': '浅色',
    'opt.dark': '深色',
    'opt.auto': '跟随系统',
    'opt.off': '关闭',
    'opt.langAuto': '自动',
    'set.ttsEngine': '发音引擎',
    'opt.ttsSystem': '系统（默认）',
    'opt.ttsKokoro': '离线神经网络（高质量，约 80–100 MB）',
    'tts.downloading': '下载语音模型中，首次约 80–100 MB…',
    'tts.ready': '✓ 离线语音已就绪',
    'tts.failed': '下载失败，点此重试',
    'home.loading': '加载词本…',
    'home.loadFail': '加载失败：{msg}',
    'home.words': '共 {n} 词',
    'home.due': '待复习 {n}',
    'home.new': '新词 {n}',
    'home.learned': '已学 {n}',
    'home.study': '开始复习',
    'home.spell': '拼写测试',
    'home.dictation': '听写',
    'home.stats': '学习统计',
    'home.settings': '设置',
    'settings.title': '设置',
    'home.search': '搜词',
    'home.difficult': '难词本',
    'common.back': '返回',
    'study.hint': '先想意思，再点下方查看',
    'study.reveal': '显示释义',
    'study.speak': '发音',
    'grade.again': '忘了',
    'grade.hard': '困难',
    'grade.good': '良好',
    'grade.easy': '简单',
    'noMeaning': '（无中文释义）',
    'done.title': '本轮完成 🎉',
    'done.titleSpell': '测试完成 🎉',
    'done.none': '今日没有需要复习的词 🌿',
    'done.noneSpell': '今日没有需要测试的词 🌿',
    'done.noneHint': '晚点再来，或切换其他词本',
    'done.noneHintSpell': '切换其他词本试试',
    'done.count': '共复习 {total} 个，掌握 {ok} 个',
    'done.countSpell': '{total} 个，正确 {ok}，正确率 {acc}%',
    'done.again': '再来一轮',
    'done.home': '返回首页',
    'loadFail': '加载失败',
    'spell.placeholder': '输入英文单词',
    'spell.submit': '提交',
    'spell.right': '✓ 正确',
    'spell.wrong': '✗ 正确拼写：{word}',
    'spell.timeout': '超时',
    'spell.next': '下一个',
    'dict.listen': '听单词',
    'dict.replay': '再听一遍',
    'dict.placeholder': '输入听到的单词',
    'stats.title': '学习统计',
    'stats.section': '各词本进度',
    'stats.total': '累计学习词条 · 当前待复习 {n}',
    'stats.fmt': '{a}/{b} · 待复习 {n}',
    'stats.streak': '连续 {n} 天',
    'stats.heat': '近 17 周学习',
    'stats.less': '少',
    'stats.more': '多',
    'search.title': '搜词',
    'search.placeholder': '输入单词或释义…',
    'search.hint': '跨所有词本搜索',
    'search.noResults': '没有匹配的词',
    'search.results': '找到 {n} 个',
    'drill.title': '难词本',
    'drill.empty': '还没有难词 🌿',
    'drill.emptyHint': '在复习 / 拼写中答错的词会自动加入这里',
    'data.export': '导出数据',
    'data.import': '导入数据',
    'data.exported': '已导出',
    'data.imported': '已导入，即将刷新…',
    'data.importFail': '导入失败：文件格式不对',
    'data.clear': '清除学习数据',
    'data.clearConfirm': '将清除全部学习进度（设置与词本选择会保留），确定继续？',
    'data.cleared': '已清除，即将刷新…',
    'pwa.offline': '离线下载',
    'pwa.installing': '下载中…',
    'pwa.offlineDone': '✓ 已离线可用（{mb} MB）',
    'pwa.install': '安装到桌面',
    'pwa.installHint': '请从浏览器菜单选择「安装 / 添加到主屏幕」',
  },
  en: {
    'app.subtitle': 'English vocabulary · spaced repetition',
    'set.voice': 'Voice',
    'set.daily': 'Daily',
    'set.countdown': 'Spell timer',
    'set.theme': 'Theme',
    'set.language': 'Language',
    'opt.us': 'American',
    'opt.gb': 'British',
    'opt.light': 'Light',
    'opt.dark': 'Dark',
    'opt.auto': 'System',
    'opt.off': 'Off',
    'opt.langAuto': 'Auto',
    'set.ttsEngine': 'TTS engine',
    'opt.ttsSystem': 'System (default)',
    'opt.ttsKokoro': 'Offline neural (high quality, ~80–100 MB)',
    'tts.downloading': 'Downloading voice model (~80–100 MB first time)…',
    'tts.ready': '✓ Offline voice ready',
    'tts.failed': 'Download failed — tap to retry',
    'home.loading': 'Loading…',
    'home.loadFail': 'Load failed: {msg}',
    'home.words': '{n} words',
    'home.due': 'Review {n}',
    'home.new': 'New {n}',
    'home.learned': 'Learned {n}',
    'home.study': 'Study',
    'home.spell': 'Spell',
    'home.dictation': 'Dictation',
    'home.stats': 'Stats',
    'home.settings': 'Settings',
    'settings.title': 'Settings',
    'home.search': 'Search',
    'home.difficult': 'Difficult',
    'common.back': 'Back',
    'study.hint': 'Think of the meaning, then reveal',
    'study.reveal': 'Show meaning',
    'study.speak': 'Say it',
    'grade.again': 'Forgot',
    'grade.hard': 'Hard',
    'grade.good': 'Good',
    'grade.easy': 'Easy',
    'noMeaning': '(no Chinese meaning)',
    'done.title': 'Session done 🎉',
    'done.titleSpell': 'Test done 🎉',
    'done.none': 'Nothing to review today 🌿',
    'done.noneSpell': 'Nothing to test today 🌿',
    'done.noneHint': 'Come back later or pick another list',
    'done.noneHintSpell': 'Try another list',
    'done.count': 'Reviewed {total}, mastered {ok}',
    'done.countSpell': '{total} words, {ok} correct, {acc}% accuracy',
    'done.again': 'Another round',
    'done.home': 'Home',
    'loadFail': 'Load failed',
    'spell.placeholder': 'Type the word',
    'spell.submit': 'Check',
    'spell.right': '✓ Correct',
    'spell.wrong': '✗ Correct: {word}',
    'spell.timeout': "Time's up",
    'spell.next': 'Next',
    'dict.listen': 'Listen',
    'dict.replay': 'Replay',
    'dict.placeholder': 'Type what you hear',
    'stats.title': 'Statistics',
    'stats.section': 'Progress by list',
    'stats.total': 'Words learned · {n} due now',
    'stats.fmt': '{a}/{b} · {n} due',
    'stats.streak': '{n}-day streak',
    'stats.heat': 'Last 17 weeks',
    'stats.less': 'Less',
    'stats.more': 'More',
    'search.title': 'Search',
    'search.placeholder': 'Word or meaning…',
    'search.hint': 'Search across all lists',
    'search.noResults': 'No matching words',
    'search.results': '{n} found',
    'drill.title': 'Difficult',
    'drill.empty': 'No difficult words yet 🌿',
    'drill.emptyHint': 'Words you get wrong in study / spell land here',
    'data.export': 'Export',
    'data.import': 'Import',
    'data.exported': 'Exported',
    'data.imported': 'Imported — reloading…',
    'data.importFail': 'Import failed: invalid file',
    'data.clear': 'Clear progress',
    'data.clearConfirm': 'Clear ALL learning progress? Your settings and list choice stay.',
    'data.cleared': 'Cleared — reloading…',
    'pwa.offline': 'Download offline',
    'pwa.installing': 'Downloading…',
    'pwa.offlineDone': '✓ Ready offline ({mb} MB)',
    'pwa.install': 'Install app',
    'pwa.installHint': 'Use browser menu: Install / Add to Home Screen',
  },
};

// Localized list display names / descriptions (word content itself is never translated).
const LIST_NAMES: Record<string, Record<string, string>> = {
  zh: { zk: '中考', gk: '高考', cet4: '四级', cet6: '六级', ky: '考研', toefl: '托福', ielts: '雅思', gre: 'GRE', awl: '读博' },
  en: { zk: 'Junior', gk: 'Senior', cet4: 'CET-4', cet6: 'CET-6', ky: 'Grad', toefl: 'TOEFL', ielts: 'IELTS', gre: 'GRE', awl: 'Academic' },
};
const LIST_DESC: Record<string, Record<string, string>> = {
  zh: { zk: '初中毕业', gk: '高考', cet4: '大学英语四级', cet6: '大学英语六级', ky: '研究生入学', toefl: '托福', ielts: '雅思', gre: '研究生', awl: '学术词表' },
  en: { zk: 'Junior high', gk: 'College entry', cet4: 'Univ. English 4', cet6: 'Univ. English 6', ky: 'Grad entry', toefl: 'Test of English', ielts: 'Intl English', gre: 'Grad Record', awl: 'Academic words' },
};

let current = 'zh';

export function detectLang(): string {
  const stored = getMeta().lang || 'auto';
  if (stored === 'zh' || stored === 'en') return stored;
  return (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function initI18n(): void {
  current = detectLang();
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
}

// Changing language reloads so every string re-renders consistently.
export function setLang(lang: string): void {
  setMeta({ lang });
  location.reload();
}

export function listName(id: string): string {
  return (LIST_NAMES[current] || LIST_NAMES.en)[id] || id;
}
export function listDesc(id: string): string {
  return (LIST_DESC[current] || LIST_DESC.en)[id] || '';
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = STRINGS[current] || STRINGS.en;
  let s: string = dict[key] != null ? dict[key] : STRINGS.en[key];
  if (s == null) s = key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}
