const api = require('../../utils/api')

Page({
  data: {
    currentTrip: null,
    avatarState: '待机',
    cities: ['北京', '西安', '杭州']
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
