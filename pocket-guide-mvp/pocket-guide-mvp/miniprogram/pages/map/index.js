const api = require('../../utils/api')

Page({
  data: {
    trip: null,
    latitude: 39.918,
    longitude: 116.397,
    markers: [],
    polyline: [],
    selectedDay: 0,
    selectedNodeIndex: 0,
    loadError: ''
  },
  onLoad(options) {
    this.tripId = options.id || wx.getStorageSync('currentTripId')
    this.targetNodeId = options.nodeId ? decodeURIComponent(options.nodeId) : ''
  },
  onShow() {
    const id = this.tripId || wx.getStorageSync('currentTripId')
    if (!id) return this.setData({ trip: null, markers: [], polyline: [], loadError: '' })
    this.setData({ loadError: '' })
    api.getTrip(id)
      .then((trip) => {
        let dayIndex = 0
        if (this.targetNodeId) {
          const matched = trip.days.findIndex((day) => day.nodes.some((node) => node.id === this.targetNodeId))
          if (matched >= 0) dayIndex = matched
        }
        this.setData({ trip }, () => this.drawDay(dayIndex, this.targetNodeId))
      })
      .catch(() => {
        this.setData({ trip: null, markers: [], polyline: [], loadError: '地图行程加载失败，行程数据没有被删除。' })
      })
  },
  retryLoad() {
    this.onShow()
  },
  selectDay(event) {
    this.drawDay(Number(event.currentTarget.dataset.index))
  },
  drawDay(index, targetNodeId = '') {
    const nodes = this.data.trip.days[index].nodes
    const targetIndex = Math.max(0, targetNodeId ? nodes.findIndex((item) => item.id === targetNodeId) : 0)
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
      selectedNodeIndex: targetIndex,
      markers,
      polyline: [{ points, color: '#1677E8', width: 5, dottedLine: false }],
      latitude: nodes[targetIndex].latitude,
      longitude: nodes[targetIndex].longitude
    })
  },
  selectMarker(event) {
    this.focusNode(Number(event.detail.markerId) - 1)
  },
  selectNode(event) {
    this.focusNode(Number(event.currentTarget.dataset.index))
  },
  focusNode(index) {
    const nodes = this.data.trip.days[this.data.selectedDay].nodes
    const node = nodes[index]
    if (!node) return
    this.setData({ selectedNodeIndex: index, latitude: node.latitude, longitude: node.longitude })
  },
  locate() {
    wx.getLocation({
      type: 'gcj02',
      success: ({ latitude, longitude }) => this.setData({ latitude, longitude }),
      fail: () => wx.showModal({ title: '无法获取定位', content: '你仍可查看行程路线，并在后续版本中手动填写位置。', showCancel: false })
    })
  }
})
