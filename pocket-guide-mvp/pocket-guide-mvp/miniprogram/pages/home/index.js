const api = require('../../utils/api')
const travelLibrary = require('../../utils/travel-library')
const { buildHomeDashboard } = require('../../utils/home-dashboard')

Page({
  data: {
    activeTrip: null,
    upcomingTrips: [],
    recentCompleted: null,
    totalTrips: 0,
    favoritesCount: 0,
    notesCount: 0,
    loading: true,
    loadError: '',
    avatarState: '待机',
    cities: ['北京', '西安', '杭州']
  },
  onShow() {
    this.loadDashboard()
  },
  onPullDownRefresh() {
    this.loadDashboard().finally(() => wx.stopPullDownRefresh())
  },
  loadDashboard() {
    this.setData({ loading: true, loadError: '' })
    const favoritesCount = travelLibrary.listFavorites().length
    const notesCount = travelLibrary.listNotes().length
    return api.listTrips()
      .then((trips) => {
        const dashboard = buildHomeDashboard(trips, wx.getStorageSync('currentTripId'))
        if (dashboard.activeTrip) wx.setStorageSync('currentTripId', dashboard.activeTrip.id)
        else if (!dashboard.upcoming.some((item) => item.id === wx.getStorageSync('currentTripId'))) wx.removeStorageSync('currentTripId')
        this.setData({
          activeTrip: dashboard.activeTrip,
          upcomingTrips: dashboard.upcoming,
          recentCompleted: dashboard.recentCompleted,
          totalTrips: dashboard.totalTrips,
          favoritesCount,
          notesCount,
          loading: false
        })
      })
      .catch((error) => this.setData({ loading: false, loadError: error.message || '旅行信息加载失败', favoritesCount, notesCount }))
  },
  createTrip() {
    wx.navigateTo({ url: '/pages/create/index' })
  },
  continueActiveTrip() {
    if (!this.data.activeTrip) return
    wx.setStorageSync('currentTripId', this.data.activeTrip.id)
    wx.setStorageSync('companionTripId', this.data.activeTrip.id)
    wx.switchTab({ url: '/pages/companion/index' })
  },
  openTrip(event) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    wx.setStorageSync('lastViewedTripId', id)
    wx.switchTab({ url: '/pages/trips/index' })
  },
  viewAllTrips() {
    wx.switchTab({ url: '/pages/trips/index' })
  },
  openLibrary(event) {
    // 收藏已从「我的」拆成独立子页，这里直接跳子页并带上要看的分类
    const tab = event.currentTarget.dataset.tab === 'notes' ? 'notes' : 'favorites'
    wx.navigateTo({ url: `/pages/library/index?tab=${tab}` })
  },
  retryLoad() {
    this.loadDashboard()
  },
  chooseCity(event) {
    wx.setStorageSync('draftCity', event.currentTarget.dataset.city)
    this.createTrip()
  },
  holdToTalk() {
    this.setData({ avatarState: '倾听' })
    wx.showToast({ title: '语音服务将在联调阶段接入', icon: 'none' })
  },
  stopTalk() {
    this.setData({ avatarState: '待机' })
  }
})
