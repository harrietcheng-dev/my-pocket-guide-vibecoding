const api = require('../../utils/api')

Page({
  data: {
    trip: null,
    selectedDay: 0,
    stateLabels: {
      DRAFT: '草稿',
      CONFIRMED: '已确认',
      GENERATING: '生成中',
      READY: '待出发',
      ACTIVE: '进行中',
      COMPLETED: '已完成',
      CANCELLED: '已取消'
    },
    nodeStatusLabels: {
      PLANNED: '待签到',
      IN_PROGRESS: '进行中',
      COMPLETED: '已完成',
      SKIPPED: '已跳过',
      CANCELLED: '已取消'
    },
    acting: false
  },
  onLoad(options) {
    this.tripId = options.id || wx.getStorageSync('currentTripId')
  },
  onShow() {
    if (!this.tripId) return
    this.reload()
  },
  reload() {
    api.getTrip(this.tripId)
      .then((trip) => this.setData({ trip }))
      .catch((error) => wx.showToast({ title: error.message, icon: 'none' }))
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
  startTrip() {
    if (this.data.acting) return
    this.runAction(api.startTrip(this.tripId), '行程已开始')
  },
  checkIn(event) {
    if (this.data.acting) return
    this.runAction(api.checkInNode(this.tripId, event.currentTarget.dataset.id), '签到成功')
  },
  completeNode(event) {
    if (this.data.acting) return
    this.runAction(api.updateNodeStatus(this.tripId, event.currentTarget.dataset.id, 'COMPLETED'), '节点已完成')
  },
  skipNode(event) {
    if (this.data.acting) return
    this.runAction(api.updateNodeStatus(this.tripId, event.currentTarget.dataset.id, 'SKIPPED'), '节点已跳过')
  },
  finishTrip() {
    wx.showModal({
      title: '确认结束行程',
      content: '尚未完成的节点会标记为已跳过，结束后不能继续签到。',
      success: ({ confirm }) => {
        if (!confirm || this.data.acting) return
        this.runAction(api.completeTrip(this.tripId), '行程已结束', true)
      }
    })
  },
  runAction(operation, successMessage, clearCurrent = false) {
    if (this.data.acting) return
    this.setData({ acting: true })
    operation
      .then((result) => {
        const trip = result.trip || result
        this.setData({ trip, acting: false })
        if (clearCurrent) wx.removeStorageSync('currentTripId')
        wx.showToast({ title: successMessage })
      })
      .catch((error) => {
        this.setData({ acting: false })
        wx.showToast({ title: error.message, icon: 'none' })
      })
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
