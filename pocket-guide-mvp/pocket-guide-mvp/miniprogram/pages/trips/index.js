const api = require('../../utils/api')

Page({
  data: { trips: [] },
  onShow() {
    api.listTrips().then((trips) => this.setData({ trips }))
  },
  open(event) {
    const id = event.currentTarget.dataset.id
    wx.setStorageSync('currentTripId', id)
    wx.navigateTo({ url: `/pages/itinerary/index?id=${id}` })
  },
  create() {
    wx.navigateTo({ url: '/pages/create/index' })
  }
})
