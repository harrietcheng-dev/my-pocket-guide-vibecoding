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
    cities: [
      { name: '北京', slogan: '穿越古今的京城漫游', icon: '🏯', tone: 'beijing' },
      { name: '西安', slogan: '遇见盛唐与人间烟火', icon: '🏮', tone: 'xian' },
      { name: '杭州', slogan: '沿着西湖慢慢生活', icon: '🌿', tone: 'hangzhou' }
    ]
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
    wx.setStorageSync('profileInitialTab', event.currentTarget.dataset.tab || 'favorites')
    wx.switchTab({ url: '/pages/profile/index' })
  },
  retryLoad() {
    this.loadDashboard()
  },
  chooseCity(event) {
    const city = event.currentTarget.dataset.city
    wx.navigateTo({ url: `/pages/create/index?city=${encodeURIComponent(city)}` })
  }
})
