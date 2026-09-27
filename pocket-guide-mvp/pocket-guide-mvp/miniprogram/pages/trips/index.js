const api = require('../../utils/api')

Page({
  data: {
    trip: null,
    view: 'overview',
    selectedDay: 0,
    latitude: 39.918,
    longitude: 116.397,
    markers: [],
    polyline: []
  },
  onShow() {
    const id = wx.getStorageSync('currentTripId')
    if (!id) return this.setData({ trip: null })
    api.getTrip(id)
      .then((trip) => this.setData({ trip }, () => this.drawDay(this.data.selectedDay)))
      .catch(() => {
        wx.removeStorageSync('currentTripId')
        this.setData({ trip: null })
      })
  },
  switchView(event) {
    this.setData({ view: event.currentTarget.dataset.view })
  },
  selectDay(event) {
    this.drawDay(Number(event.currentTarget.dataset.index))
  },
  drawDay(index) {
    if (!this.data.trip || !this.data.trip.days[index]) return
    const nodes = this.data.trip.days[index].nodes
    const markers = nodes.map((item, nodeIndex) => ({
      id: nodeIndex + 1,
      latitude: item.latitude,
      longitude: item.longitude,
      width: 28,
      height: 36,
      callout: {
        content: `${nodeIndex + 1}. ${item.name}`,
        display: 'BYCLICK',
        padding: 8,
        borderRadius: 8
      }
    }))
    const points = nodes.map(({ latitude, longitude }) => ({ latitude, longitude }))
    this.setData({
      selectedDay: index,
      markers,
      polyline: [{ points, color: '#1677E8', width: 5, dottedLine: false }],
      latitude: nodes.length ? nodes[0].latitude : this.data.latitude,
      longitude: nodes.length ? nodes[0].longitude : this.data.longitude
    })
  },
  create() {
    wx.navigateTo({ url: '/pages/create/index' })
  },
  replan() {
    wx.navigateTo({ url: `/pages/replan/index?id=${this.data.trip.id}` })
  },
  openCompanion() {
    wx.switchTab({ url: '/pages/companion/index' })
  }
})
