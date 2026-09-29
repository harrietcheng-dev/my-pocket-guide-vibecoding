const PROFILE_KEY = 'pocketGuideProfile'
const PREFERENCES_KEY = 'pocketGuidePreferences'
const SETTINGS_KEY = 'pocketGuideSettings'
const FEEDBACK_KEY = 'pocketGuideFeedback'

const TAG_OPTIONS = ['亲子家庭', '中老年游客', '独自旅行', '情侣出游', '朋友结伴']
const INTEREST_OPTIONS = ['历史文化', '美食', '自然', '拍照', '城市漫步', '休闲']
const PACE_OPTIONS = ['轻松', '适中', '紧凑']
const TRANSPORT_OPTIONS = ['公交', '地铁', '步行', '打车']
const DIET_OPTIONS = ['不吃辣', '清真', '素食', '不吃海鲜', '无']
const LODGING_OPTIONS = ['经济型', '舒适型', '高档', '民宿']
const ACCESSIBILITY_OPTIONS = ['少走路', '无障碍', '轮椅出行']
const HEALTH_OPTIONS = ['需要午休', '关注医院药店', '慢性病需注意']
const COMPANION_OPTIONS = ['同行儿童', '同行老人', '无']

const FEEDBACK_TYPES = ['行程信息错误', '地点信息错误', '路线不合理', '功能异常', '产品建议']

const PER_CAPITA_BUDGET_DEFAULT = 1500

const PROFILE_DEFAULT = {
  loggedIn: false,
  avatarPath: '',
  nickname: '',
  city: '',
  tags: []
}

const PREFERENCES_DEFAULT = {
  interests: [],
  pace: '适中',
  transportModes: [],
  perCapitaBudget: PER_CAPITA_BUDGET_DEFAULT,
  dietRestrictions: [],
  lodging: '',
  accessibility: [],
  healthNeeds: [],
  companions: []
}

const SETTINGS_DEFAULT = {
  personalized: true
}

// 清除本地数据时统一处理的键，新增本地存储时记得同步补进来
const LOCAL_DATA_KEYS = [
  PROFILE_KEY,
  PREFERENCES_KEY,
  SETTINGS_KEY,
  FEEDBACK_KEY,
  'pocketGuideFavorites',
  'pocketGuideNotes',
  'pocketGuideTrips',
  'currentTripId',
  'companionTripId',
  'lastViewedTripId',
  'tripDraft',
  'draftCity',
  'profileInitialTab'
]

const clone = (value) => JSON.parse(JSON.stringify(value))

function readObject(key, fallback) {
  const value = wx.getStorageSync(key)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return clone(fallback)
  return Object.assign(clone(fallback), clone(value))
}

function writeObject(key, value) {
  wx.setStorageSync(key, value)
  return clone(value)
}

function readList(key) {
  const value = wx.getStorageSync(key)
  return Array.isArray(value) ? clone(value) : []
}

function writeList(key, value) {
  wx.setStorageSync(key, value)
  return clone(value)
}

function asArray(value) {
  return Array.isArray(value) ? value.slice() : []
}

function pickOne(value, options, fallback) {
  return options.indexOf(value) >= 0 ? value : fallback
}

function pickMany(value, options) {
  return asArray(value).filter((item) => options.indexOf(item) >= 0)
}

/* ------------------------------- 用户档案 ------------------------------- */

function getProfile() {
  const profile = readObject(PROFILE_KEY, PROFILE_DEFAULT)
  return {
    loggedIn: Boolean(profile.loggedIn),
    avatarPath: String(profile.avatarPath || ''),
    nickname: String(profile.nickname || ''),
    city: String(profile.city || ''),
    tags: pickMany(profile.tags, TAG_OPTIONS)
  }
}

function saveProfile(patch = {}) {
  const next = Object.assign(getProfile(), patch)
  if (patch.tags) next.tags = pickMany(patch.tags, TAG_OPTIONS)
  // 填过昵称或头像即视为已完善资料（微信已不提供一键授权，只能由用户自行填写）
  next.loggedIn = Boolean(next.nickname || next.avatarPath)
  return writeObject(PROFILE_KEY, next)
}

function resetProfile() {
  return writeObject(PROFILE_KEY, PROFILE_DEFAULT)
}

// 用于信息卡副标题：上海 · 亲子家庭
function profileSummary() {
  const profile = getProfile()
  return [profile.city, profile.tags.join('、')].filter(Boolean).join(' · ')
}

/* ------------------------------- 旅行偏好 ------------------------------- */

function getPreferences() {
  const prefs = readObject(PREFERENCES_KEY, PREFERENCES_DEFAULT)
  const budget = Number(prefs.perCapitaBudget)
  return {
    interests: pickMany(prefs.interests, INTEREST_OPTIONS),
    pace: pickOne(prefs.pace, PACE_OPTIONS, PREFERENCES_DEFAULT.pace),
    transportModes: pickMany(prefs.transportModes, TRANSPORT_OPTIONS),
    perCapitaBudget: Number.isFinite(budget) && budget > 0 ? Math.round(budget) : PER_CAPITA_BUDGET_DEFAULT,
    dietRestrictions: pickMany(prefs.dietRestrictions, DIET_OPTIONS),
    lodging: pickOne(prefs.lodging, LODGING_OPTIONS, ''),
    accessibility: pickMany(prefs.accessibility, ACCESSIBILITY_OPTIONS),
    healthNeeds: pickMany(prefs.healthNeeds, HEALTH_OPTIONS),
    companions: pickMany(prefs.companions, COMPANION_OPTIONS)
  }
}

function savePreferences(patch = {}) {
  const next = Object.assign(getPreferences(), patch)
  next.interests = pickMany(next.interests, INTEREST_OPTIONS)
  next.pace = pickOne(next.pace, PACE_OPTIONS, PREFERENCES_DEFAULT.pace)
  next.transportModes = pickMany(next.transportModes, TRANSPORT_OPTIONS)
  next.dietRestrictions = pickMany(next.dietRestrictions, DIET_OPTIONS)
  next.lodging = pickOne(next.lodging, LODGING_OPTIONS, '')
  next.accessibility = pickMany(next.accessibility, ACCESSIBILITY_OPTIONS)
  next.healthNeeds = pickMany(next.healthNeeds, HEALTH_OPTIONS)
  next.companions = pickMany(next.companions, COMPANION_OPTIONS)
  const budget = Number(next.perCapitaBudget)
  next.perCapitaBudget = Number.isFinite(budget) && budget > 0 ? Math.round(budget) : PER_CAPITA_BUDGET_DEFAULT
  return writeObject(PREFERENCES_KEY, next)
}

function resetPreferences() {
  return writeObject(PREFERENCES_KEY, PREFERENCES_DEFAULT)
}

// 用于「我的」页菜单行右侧摘要：历史文化、美食 · 适中
function preferencesSummary() {
  // 从没保存过偏好时不要显示默认节奏，否则会误导成"用户选过"
  const raw = wx.getStorageSync(PREFERENCES_KEY)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '未设置'
  const prefs = getPreferences()
  const head = prefs.interests.length ? prefs.interests.slice(0, 2).join('、') : ''
  if (head && prefs.pace) return `${head} · ${prefs.pace}`
  if (head) return head
  if (prefs.pace) return `节奏${prefs.pace}`
  return '未设置'
}

// 特殊需求与无障碍：把两组选项合并成创建行程页的「特殊需求」
function physicalConstraints() {
  const prefs = getPreferences()
  return prefs.accessibility
    .concat(prefs.healthNeeds)
    .filter((item, index, all) => item !== '无' && all.indexOf(item) === index)
}

// 饮食 / 住宿 / 同行人员目前后端没有独立字段，拼成补充说明带入
function preferenceNotes() {
  const prefs = getPreferences()
  const diet = prefs.dietRestrictions.filter((item) => item !== '无')
  const companions = prefs.companions.filter((item) => item !== '无')
  const parts = []
  if (diet.length) parts.push(`饮食禁忌：${diet.join('、')}`)
  if (prefs.lodging) parts.push(`住宿偏好：${prefs.lodging}`)
  if (companions.length) parts.push(`同行：${companions.join('、')}`)
  return parts.join('；')
}

/* ------------------------------- 本地设置 ------------------------------- */

function getSettings() {
  const settings = readObject(SETTINGS_KEY, SETTINGS_DEFAULT)
  return { personalized: settings.personalized !== false }
}

function saveSettings(patch = {}) {
  const next = Object.assign(getSettings(), patch)
  next.personalized = next.personalized !== false
  return writeObject(SETTINGS_KEY, next)
}

/* ------------------------------- 意见反馈 ------------------------------- */

// 后端暂未提供反馈接口，先落在本机，避免用户以为提交失败
function submitFeedback({ type, text, tripId, nodeId, placeName }) {
  const feedbackType = FEEDBACK_TYPES.indexOf(type) >= 0 ? type : FEEDBACK_TYPES[FEEDBACK_TYPES.length - 1]
  const content = String(text || '').trim()
  if (!content) throw new Error('请填写问题描述')
  if (content.length > 500) throw new Error('问题描述最多 500 字')
  const entries = readList(FEEDBACK_KEY)
  const entry = {
    id: `feedback_${Date.now()}_${entries.length}`,
    type: feedbackType,
    text: content,
    tripId: String(tripId || ''),
    nodeId: String(nodeId || ''),
    placeName: String(placeName || ''),
    createdAt: new Date().toISOString()
  }
  entries.unshift(entry)
  writeList(FEEDBACK_KEY, entries)
  return clone(entry)
}

function listFeedback() {
  return clone(readList(FEEDBACK_KEY))
}

/* ------------------------------- 其他 ------------------------------- */

function clearLocalData() {
  LOCAL_DATA_KEYS.forEach((key) => wx.removeStorageSync(key))
}

module.exports = {
  TAG_OPTIONS,
  INTEREST_OPTIONS,
  PACE_OPTIONS,
  TRANSPORT_OPTIONS,
  DIET_OPTIONS,
  LODGING_OPTIONS,
  ACCESSIBILITY_OPTIONS,
  HEALTH_OPTIONS,
  COMPANION_OPTIONS,
  FEEDBACK_TYPES,
  PER_CAPITA_BUDGET_DEFAULT,
  LOCAL_DATA_KEYS,
  getProfile,
  saveProfile,
  resetProfile,
  profileSummary,
  getPreferences,
  savePreferences,
  resetPreferences,
  preferencesSummary,
  physicalConstraints,
  preferenceNotes,
  getSettings,
  saveSettings,
  submitFeedback,
  listFeedback,
  clearLocalData
}
