const api = require('../../utils/api')

Page({
  data: {
    trip: null,
    latitude: 39.918,
    longitude: 116.397,
    markers: [],
    polyline: [],
    selectedDay: 0
  },
  onShow() {
    const id = wx.getStorageSync('currentTripId')
    if (!id) return this.setData({ trip: null, markers: [], polyline: [] })
    api.getTrip(id)
      .then((trip) => {
        this.setData({ trip }, () => this.drawDay(0))
      })
      .catch(() => {
        wx.removeStorageSync('currentTripId')
        this.setData({ trip: null, markers: [], polyline: [] })
      })
  },
  selectDay(event) {
    this.drawDay(Number(event.currentTarget.dataset.index))
  },
  drawDay(index) {
    const nodes = this.data.trip.days[index].nodes
    const markers = nodes.map((item, nodeIndex) => ({
      id: nodeIndex + 1,
      latitude: item.latitude,
      longitude: item.longitude,
      width: 28,
      height: 36,
      callout: { content: `${nodeIndex + 1}. ${item.name}`, display: 'BYCLICK', padding: 8, borderRadius: 8 }
    }))
    const points = nodes.map(({ latitude, longitude }) => ({ latitude, longitude }))
    this.setData({
      selectedDay: index,
      markers,
      polyline: [{ points, color: '#1677E8', width: 5, dottedLine: false }],
      latitude: nodes[0].latitude,
      longitude: nodes[0].longitude
    })
  },
  locate() {
    wx.getLocation({
      type: 'gcj02',
      success: ({ latitude, longitude }) => this.setData({ latitude, longitude }),
      fail: () => wx.showModal({ title: '无法获取定位', content: '你仍可查看行程路线，并在后续版本中手动填写位置。', showCancel: false })
    })
  }
})
