const api = require('../../utils/api')

Page({
  data: {
    currentTrip: null,
    cities: [
      { name: '北京', slogan: '穿越古今的京城漫游', icon: '🏯', tone: 'beijing' },
      { name: '西安', slogan: '遇见盛唐与人间烟火', icon: '🏮', tone: 'xian' },
      { name: '杭州', slogan: '沿着西湖慢慢生活', icon: '🌿', tone: 'hangzhou' }
    ]
  },
  onShow() {
    const id = wx.getStorageSync('currentTripId')
    if (!id) return this.setData({ currentTrip: null })
    api.getTrip(id)
      .then((currentTrip) => this.setData({ currentTrip }))
      .catch(() => {
        wx.removeStorageSync('currentTripId')
        this.setData({ currentTrip: null })
      })
  },
  createTrip() {
    wx.navigateTo({ url: '/pages/create/index' })
  },
  continueTrip() {
    wx.switchTab({ url: '/pages/trips/index' })
  },
  chooseCity(event) {
    const city = event.currentTarget.dataset.city
    wx.navigateTo({ url: `/pages/create/index?city=${encodeURIComponent(city)}` })
  }
})
