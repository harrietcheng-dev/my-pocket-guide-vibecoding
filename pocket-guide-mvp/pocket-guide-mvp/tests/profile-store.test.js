const test = require('node:test')
const assert = require('node:assert/strict')

const storage = new Map()
global.wx = {
  getStorageSync(key) { return storage.get(key) },
  setStorageSync(key, value) { storage.set(key, value) },
  removeStorageSync(key) { storage.delete(key) }
}

const store = require('../miniprogram/utils/profile-store')

test.beforeEach(() => storage.clear())

test('saving a nickname marks the profile as filled in', () => {
  assert.equal(store.getProfile().loggedIn, false)
  store.saveProfile({ nickname: '小雨', city: '上海', tags: ['亲子家庭'] })
  assert.equal(store.getProfile().loggedIn, true)
  assert.equal(store.profileSummary(), '上海 · 亲子家庭')
})

test('tags outside the allowed list are dropped', () => {
  store.saveProfile({ nickname: '小雨', tags: ['亲子家庭', '不存在的标签'] })
  assert.deepEqual(store.getProfile().tags, ['亲子家庭'])
})

test('preferences fall back to defaults and reject unknown options', () => {
  const fresh = store.getPreferences()
  assert.equal(fresh.pace, '适中')
  assert.equal(fresh.perCapitaBudget, store.PER_CAPITA_BUDGET_DEFAULT)

  store.savePreferences({ interests: ['美食', '不存在的兴趣'], pace: '不存在的节奏', perCapitaBudget: -5 })
  const saved = store.getPreferences()
  assert.deepEqual(saved.interests, ['美食'])
  assert.equal(saved.pace, '适中')
  assert.equal(saved.perCapitaBudget, store.PER_CAPITA_BUDGET_DEFAULT)
})

test('physical constraints merge accessibility and health needs without duplicates', () => {
  store.savePreferences({ accessibility: ['少走路', '无障碍'], healthNeeds: ['少走路', '需要午休'] })
  assert.deepEqual(store.physicalConstraints(), ['少走路', '无障碍', '需要午休'])
})

test('preference notes only carry values the user actually chose', () => {
  store.savePreferences({ dietRestrictions: ['不吃辣', '无'], lodging: '民宿', companions: ['同行儿童'] })
  assert.equal(store.preferenceNotes(), '饮食禁忌：不吃辣；住宿偏好：民宿；同行：同行儿童')
})

test('preferences summary stays readable when nothing is chosen', () => {
  assert.equal(store.preferencesSummary(), '未设置')
  store.savePreferences({ interests: ['历史文化', '美食', '自然'], pace: '轻松' })
  assert.equal(store.preferencesSummary(), '历史文化、美食 · 轻松')
})

test('feedback requires text and keeps the trip context', () => {
  assert.throws(() => store.submitFeedback({ type: '功能异常', text: '   ' }), /请填写问题描述/)
  const entry = store.submitFeedback({ type: '功能异常', text: '签到后讲解没有出现', tripId: 'trip-1' })
  assert.equal(entry.type, '功能异常')
  assert.equal(entry.tripId, 'trip-1')
  assert.equal(store.listFeedback().length, 1)
})

test('clearing local data removes every owned key', () => {
  store.saveProfile({ nickname: '小雨' })
  store.savePreferences({ interests: ['美食'] })
  store.saveSettings({ personalized: false })
  store.submitFeedback({ type: '产品建议', text: '希望支持多人协作' })
  storage.set('pocketGuideFavorites', [{ id: 'f1' }])
  storage.set('currentTripId', 'trip-1')

  store.clearLocalData()

  assert.equal(store.getProfile().nickname, '')
  assert.deepEqual(store.getPreferences().interests, [])
  assert.equal(store.getSettings().personalized, true)
  assert.equal(store.listFeedback().length, 0)
  assert.equal(storage.has('pocketGuideFavorites'), false)
  assert.equal(storage.has('currentTripId'), false)
})
