// Tiny i18n: zh / en dictionaries, auto-detect from system language.
import { getMeta, setMeta, getUserLists } from './store';

type Dict = Record<string, string>;

const STRINGS: Record<string, Dict> = {
  zh: {
    'app.subtitle': '英语背单词 · 间隔重复',
    'set.voice': '发音',
    'set.daily': '每日新词（复习不限量）',
    'set.countdown': '拼写倒计时',
    'set.theme': '主题',
    'set.language': '语言',
    'set.langName': '中文',
    'set.langHint': '跟随浏览器 · {code} → {name}',
    'set.langHintUnsupported': '跟随浏览器 · {code} → {name}（该语言暂不支持，可在上方手动切换）',
    'set.langManual': '已手动选择，不再跟随浏览器',
    'set.retention': '目标保留率',
    'opt.retLoose': '宽松 80%（间隔更长）',
    'opt.retStd': '标准 90%',
    'opt.retStrict': '严格 95%（复习更勤）',
    'opt.us': '美音',
    'opt.gb': '英音',
    'opt.light': '浅色',
    'opt.dark': '深色',
    'opt.auto': '跟随系统',
    'opt.off': '关闭',
    'opt.langAuto': '自动',
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
    'study.undo': '撤销',
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
    'store.quotaFull': '存储空间已满，本次进度未能保存，请导出数据后清理',
    'pwa.offline': '离线下载',
    'pwa.installing': '下载中…',
    'pwa.offlineDone': '✓ 已离线可用（{mb} MB）',
    'pwa.offlineFail': '离线下载失败，请检查网络后重试',
    'pwa.install': '安装到桌面',
    'pwa.installHint': '请从浏览器菜单选择「安装 / 添加到主屏幕」',
    'pwa.newVersion': '有新版本可用',
    'pwa.reload': '刷新',
    'sync.title': '云同步',
    'sync.desc': '多设备同步学习进度。数据仍保存在本地，云端只是一份镜像。',
    'sync.url': '服务地址',
    'sync.urlPh': 'https://recite-sync.你的账户.workers.dev',
    'sync.urlPhDav': 'webdav://user:pass@host/path（自建服务）',
    'sync.key': '同步码',
    'sync.keyPh': '自动生成，也可自定义',
    'sync.keyWeak': '同步码太短，建议 12 位以上',
    'sync.genKey': '随机生成',
    'sync.token': '访问令牌（可选）',
    'sync.tokenPh': '多人共用同一服务时设置',
    'sync.now': '立即同步',
    'sync.syncing': '同步中…',
    'sync.ok': '✓ 已同步',
    'sync.fail': '同步失败：{msg}',
    'sync.v': 'v{v} · 更新内容见 README',
    'sync.never': '从未同步',
    'sync.last': '上次同步 {time}',
    'sync.deploy': '如何部署？',
    'sync.deployHint': '点 README 里的 Deploy to Cloudflare 按钮一键部署自己的同步服务（免费），把得到的 workers.dev 地址填到这里。',
    'sync.webdavHint': 'WebDAV 需自建服务（如 Nextcloud）并开启 CORS，多数公有网盘不可用。地址用 webdav:// 开头（填到目录），同步码会拼成文件名。',
    'lang.unsupported': '浏览器语言 {code} 暂不支持，当前以英文显示',
    'home.newList': '新建词本',
    'home.browse': '浏览',
    'list.create.title': '新建词本',
    'list.create.name': '名称',
    'list.create.namePh': '例如：我的生词',
    'list.create.words': '单词（每行一个）',
    'list.create.wordsPh': '一行一个，或直接粘贴文本',
    'list.create.submit': '创建词本',
    'list.create.nameRequired': '请填写词本名称',
    'list.create.noWords': '至少输入一个单词',
    'list.create.created': '已创建「{name}」，{found}/{total} 个词匹配到释义',
    'list.create.loading': '加载词库中以匹配释义…',
    'list.filterAll': '全部',
    'list.filterNew': '新词',
    'list.filterDue': '待复习',
    'list.filterLearned': '已学',
    'list.filterKnown': '已掌握',
    'list.filterDiff': '难词',
    'list.selectAll': '全选',
    'list.clearSel': '清除选择',
    'list.markKnown': '标记已掌握',
    'list.unmarkKnown': '取消已掌握',
    'list.selected': '已选 {n} 个',
    'list.loadMore': '加载更多',
    'list.empty': '这个词本没有词',
    'list.delete': '删除词本',
    'list.confirmDelete': '确定删除词本「{name}」？其中的学习进度也会一并清除。',
    'list.deleted': '已删除',
    'st.new': '新词',
    'st.due': '待复习',
    'st.learned': '已学',
    'st.known': '已掌握',
    'st.diff': '难词',
  },
  en: {
    'app.subtitle': 'English vocabulary · spaced repetition',
    'set.voice': 'Voice',
    'set.daily': 'New words / day (reviews free)',
    'set.countdown': 'Spell timer',
    'set.theme': 'Theme',
    'set.language': 'Language',
    'set.langName': 'English',
    'set.langHint': 'Following browser · {code} → {name}',
    'set.langHintUnsupported': 'Following browser · {code} → {name} (unsupported — pick one above)',
    'set.langManual': 'Set manually — browser language ignored',
    'set.retention': 'Retention target',
    'opt.retLoose': 'Relaxed 80% (longer gaps)',
    'opt.retStd': 'Standard 90%',
    'opt.retStrict': 'Strict 95% (more reviews)',
    'opt.us': 'American',
    'opt.gb': 'British',
    'opt.light': 'Light',
    'opt.dark': 'Dark',
    'opt.auto': 'System',
    'opt.off': 'Off',
    'opt.langAuto': 'Auto',
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
    'study.undo': 'Undo',
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
    'store.quotaFull': 'Storage is full — this progress was not saved. Export and clear some data.',
    'pwa.offline': 'Download offline',
    'pwa.installing': 'Downloading…',
    'pwa.offlineDone': '✓ Ready offline ({mb} MB)',
    'pwa.offlineFail': 'Offline download failed — check your network',
    'pwa.install': 'Install app',
    'pwa.installHint': 'Use browser menu: Install / Add to Home Screen',
    'pwa.newVersion': 'New version available',
    'pwa.reload': 'Reload',
    'sync.title': 'Cloud sync',
    'sync.desc': 'Sync progress across devices. Data stays local; the cloud is only a mirror.',
    'sync.url': 'Service URL',
    'sync.urlPh': 'https://recite-sync.your-account.workers.dev',
    'sync.urlPhDav': 'webdav://user:pass@host/path (self-hosted)',
    'sync.key': 'Sync code',
    'sync.keyPh': 'Auto-generated; customize if you like',
    'sync.keyWeak': 'Code too short — use 12+ characters',
    'sync.genKey': 'Generate',
    'sync.token': 'Access token (optional)',
    'sync.tokenPh': 'Set when sharing one service with others',
    'sync.now': 'Sync now',
    'sync.syncing': 'Syncing…',
    'sync.ok': '✓ Synced',
    'sync.v': 'v{v} · see README for changes',
    'sync.fail': 'Sync failed: {msg}',
    'sync.never': 'Never synced',
    'sync.last': 'Last sync {time}',
    'sync.deploy': 'How to deploy?',
    'sync.deployHint': 'Click the Deploy to Cloudflare button in the README for a free one-click sync service, then paste the workers.dev URL here.',
    'sync.webdavHint': 'WebDAV needs a self-hosted server (e.g. Nextcloud) with CORS enabled — most public drives will not work. Start the URL with webdav:// (directory path); the sync code becomes the file name.',
    'lang.unsupported': "Browser language {code} isn't supported yet — showing English",
    'home.newList': 'New list',
    'home.browse': 'Browse',
    'list.create.title': 'New list',
    'list.create.name': 'Name',
    'list.create.namePh': 'e.g. My words',
    'list.create.words': 'Words (one per line)',
    'list.create.wordsPh': 'One per line, or paste a block',
    'list.create.submit': 'Create list',
    'list.create.nameRequired': 'Please enter a name',
    'list.create.noWords': 'Enter at least one word',
    'list.create.created': 'Created "{name}" — {found}/{total} words matched',
    'list.create.loading': 'Loading word data to match meanings…',
    'list.filterAll': 'All',
    'list.filterNew': 'New',
    'list.filterDue': 'Due',
    'list.filterLearned': 'Learned',
    'list.filterKnown': 'Known',
    'list.filterDiff': 'Difficult',
    'list.selectAll': 'Select all',
    'list.clearSel': 'Clear',
    'list.markKnown': 'Mark known',
    'list.unmarkKnown': 'Unmark known',
    'list.selected': '{n} selected',
    'list.loadMore': 'Load more',
    'list.empty': 'No words in this list',
    'list.delete': 'Delete list',
    'list.confirmDelete': 'Delete list "{name}"? Its learning progress will be erased too.',
    'list.deleted': 'Deleted',
    'st.new': 'New',
    'st.due': 'Due',
    'st.learned': 'Learned',
    'st.known': 'Known',
    'st.diff': 'Difficult',
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

declare global {
  interface Window {
    // Set up by public/lang.js, which runs in <head> before the bundle. Optional
    // only so a failed script load degrades instead of taking the whole boot down.
    reciteLang?: {
      resolve(): string;
      unsupported(): boolean;
      code(): string;
      title(lang: string): string;
      bootText(lang: string): string;
    };
  }
}

let current = 'zh';

// Language resolution lives in public/lang.js because it has to run before the
// bundle does (splash text + tab title). Everything here delegates to it — there is
// no second implementation to drift. The inline fallbacks below only ever run if
// that script failed to load.
export function detectLang(): string {
  if (window.reciteLang) return window.reciteLang.resolve();
  const stored = getMeta().lang || 'auto';
  if (stored === 'zh' || stored === 'en') return stored;
  return (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

// Raw code for the settings hint ("following browser · zh-CN → 中文"), so a
// user who sees an unexpected language can tell where it came from.
export function browserLangCode(): string {
  return window.reciteLang ? window.reciteLang.code() : navigator.language || '—';
}

// The browser's list holds neither zh nor en: we fall back to English, and the
// caller should say so rather than let the user wonder.
export function browserLangUnsupported(): boolean {
  return !!window.reciteLang && window.reciteLang.unsupported();
}

export function initI18n(): void {
  current = detectLang();
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
  document.title = window.reciteLang ? window.reciteLang.title(current) : 'recite';
}

// Changing language reloads so every string re-renders consistently.
export function setLang(lang: string): void {
  setMeta({ lang });
  location.reload();
}

export function listName(id: string): string {
  if (id.startsWith('user-')) {
    const ul = getUserLists().find((u) => u.id === id);
    return ul?.name || id;
  }
  return (LIST_NAMES[current] || LIST_NAMES.en)[id] || id;
}
export function listDesc(id: string): string {
  if (id.startsWith('user-')) return '';
  return (LIST_DESC[current] || LIST_DESC.en)[id] || '';
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = STRINGS[current] || STRINGS.en;
  let s: string = dict[key] != null ? dict[key] : STRINGS.en[key];
  if (s == null) s = key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]));
  return s;
}
