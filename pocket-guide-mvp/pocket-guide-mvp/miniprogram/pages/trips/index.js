const api = require('../../utils/api')

Page({
  data: { trips: [] },
  onShow() {
    api.listTrips().then((trips) => this.setData({ trips }))
  },
  open(event) {
    wx.navigateTo({ url: `/pages/itinerary/index?id=${event.currentTarget.dataset.id}` })
  },
  create() {
    wx.navigateTo({ url: '/pages/create/index' })
  }
})
