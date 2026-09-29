const api = require('../../utils/api')
const travelLibrary = require('../../utils/travel-library')
const store = require('../../utils/profile-store')

const EMPTY_STATS = { trips: '—', cities: '—', favorites: 0, days: '—' }

function persistAvatar(tempFilePath) {
  return new Promise((resolve) => {
    if (!tempFilePath) return resolve('')
    const manager = wx.getFileSystemManager && wx.getFileSystemManager()
    if (!manager || !manager.saveFile) return resolve(tempFilePath)
    manager.saveFile({
      tempFilePath,
      success: ({ savedFilePath }) => resolve(savedFilePath || tempFilePath),
      // 存不下时退回临时路径，本次会话内头像仍可正常显示
      fail: () => resolve(tempFilePath)
    })
  })
}

Page({
  data: {
    profile: store.getProfile(),
    profileSummary: '',
    preferenceSummary: '未设置',
    stats: EMPTY_STATS,
    statsError: '',
    tagOptions: [],
    editOpen: false,
    editForm: { avatarPath: '', nickname: '', city: '', tags: [] },
    savingProfile: false
  },
  onShow() {
    this.loadProfile()
    this.loadStats()
  },
  onPullDownRefresh() {
    this.loadStats()
    wx.stopPullDownRefresh()
  },
  loadProfile() {
    const profile = store.getProfile()
    this.setData({
      profile,
      profileSummary: store.profileSummary(),
      preferenceSummary: store.preferencesSummary(),
      tagOptions: store.TAG_OPTIONS.map((value) => ({ value, selected: profile.tags.indexOf(value) >= 0 }))
    })
  },
  loadStats() {
    const favorites = travelLibrary.listFavorites().length
    this.setData({ stats: { ...EMPTY_STATS, favorites }, statsError: '' })
    return api.listTrips()
      .then((items) => {
        const trips = Array.isArray(items) ? items : []
        const completed = trips.filter((trip) => trip.state === 'COMPLETED')
        const cities = completed
          .map((trip) => String((trip.constraints || {}).city || '').trim())
          .filter(Boolean)
        this.setData({
          stats: {
            trips: trips.filter((trip) => trip.state !== 'CANCELLED').length,
            cities: new Set(cities).size,
            favorites,
            days: completed.reduce((sum, trip) => sum + ((trip.days || []).length), 0)
          },
          statsError: ''
        })
      })
      .catch(() => this.setData({ statsError: '行程服务未连接，行程统计暂不可用' }))
  },

  /* 入口跳转 */
  goTrips() {
    wx.switchTab({ url: '/pages/trips/index' })
  },
  goLibrary(event) {
    const tab = (event.currentTarget.dataset.tab === 'notes' ? 'notes' : 'favorites')
    wx.navigateTo({ url: `/pages/library/index?tab=${tab}` })
  },
  goPreferences() {
    wx.navigateTo({ url: '/pages/preferences/index' })
  },
  goSettings() {
    wx.navigateTo({ url: '/pages/settings/index' })
  },

  /* 编辑资料 */
  openEdit() {
    const profile = store.getProfile()
    this.setData({
      editOpen: true,
      editForm: { avatarPath: profile.avatarPath, nickname: profile.nickname, city: profile.city, tags: profile.tags.slice() },
      tagOptions: store.TAG_OPTIONS.map((value) => ({ value, selected: profile.tags.indexOf(value) >= 0 }))
    })
  },
  closeEdit() {
    this.setData({ editOpen: false })
  },
  onChooseAvatar(event) {
    this.setData({ 'editForm.avatarPath': event.detail.avatarUrl || '' })
  },
  inputNickname(event) {
    this.setData({ 'editForm.nickname': event.detail.value })
  },
  inputCity(event) {
    this.setData({ 'editForm.city': event.detail.value })
  },
  toggleTag(event) {
    const value = event.currentTarget.dataset.value
    const tags = this.data.editForm.tags.slice()
    const index = tags.indexOf(value)
    if (index >= 0) tags.splice(index, 1)
    else tags.push(value)
    this.setData({
      'editForm.tags': tags,
      tagOptions: this.data.tagOptions.map((item) => ({ ...item, selected: tags.indexOf(item.value) >= 0 }))
    })
  },
  saveEdit() {
    if (this.data.savingProfile) return
    const { avatarPath, nickname, city, tags } = this.data.editForm
    const trimmedNickname = String(nickname || '').trim()
    if (!trimmedNickname && !avatarPath) {
      return wx.showToast({ title: '请先填写昵称或选择头像', icon: 'none' })
    }
    this.setData({ savingProfile: true })
    persistAvatar(avatarPath)
      .then((savedPath) => {
        store.saveProfile({
          avatarPath: savedPath,
          nickname: trimmedNickname,
          city: String(city || '').trim(),
          tags
        })
        this.setData({ savingProfile: false, editOpen: false })
        this.loadProfile()
        wx.showToast({ title: '资料已保存', icon: 'success' })
      })
      .catch(() => {
        this.setData({ savingProfile: false })
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      })
  }
})
