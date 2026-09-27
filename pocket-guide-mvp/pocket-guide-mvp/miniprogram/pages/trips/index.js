const api = require('../../utils/api')

Page({
  data: {
    trips: [],
    stateLabels: {
      DRAFT: '草稿',
      CONFIRMED: '已确认',
      GENERATING: '生成中',
      READY: '待出发',
      ACTIVE: '进行中',
      COMPLETED: '已完成',
      CANCELLED: '已取消'
    }
  },
  onShow() {
    api.listTrips().then((trips) => this.setData({ trips }))
  },
  open(event) {
    const id = event.currentTarget.dataset.id
    const state = event.currentTarget.dataset.state
    if (state !== 'COMPLETED' && state !== 'CANCELLED') wx.setStorageSync('currentTripId', id)
    wx.navigateTo({ url: `/pages/itinerary/index?id=${id}` })
  },
  create() {
    wx.navigateTo({ url: '/pages/create/index' })
  }
})
