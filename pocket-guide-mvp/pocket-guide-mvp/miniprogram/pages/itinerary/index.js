const api = require('../../utils/api')

Page({
  data: { trip: null, selectedDay: 0 },
  onLoad(options) {
    this.tripId = options.id || wx.getStorageSync('currentTripId')
  },
  onShow() {
    if (!this.tripId) return
    api.getTrip(this.tripId).then((trip) => this.setData({ trip }))
  },
  selectDay(event) {
    this.setData({ selectedDay: Number(event.currentTarget.dataset.index) })
  },
  openMap() {
    wx.switchTab({ url: '/pages/map/index' })
  },
  replan() {
    wx.navigateTo({ url: `/pages/replan/index?id=${this.tripId}` })
  },
  undo() {
    api.undo(this.tripId)
      .then((trip) => {
        this.setData({ trip })
        wx.showToast({ title: '已恢复上一版本' })
      })
      .catch((error) => wx.showToast({ title: error.message, icon: 'none' }))
  }
})
