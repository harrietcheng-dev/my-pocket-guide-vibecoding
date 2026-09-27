const api = require('../../utils/api')

Page({
  data: {
    trip: null,
    currentNode: null,
    explaining: false,
    question: '',
    answer: ''
  },
  onShow() {
    const id = wx.getStorageSync('currentTripId')
    this.tripId = id
    if (!id) return this.setData({ trip: null, currentNode: null })
    api.getTrip(id)
      .then((trip) => {
        const firstDay = trip.days && trip.days[0]
        const currentNode = firstDay && firstDay.nodes ? firstDay.nodes[0] : null
        this.setData({ trip, currentNode })
      })
      .catch(() => this.setData({ trip: null, currentNode: null }))
  },
  toggleExplain() {
    const explaining = !this.data.explaining
    this.setData({ explaining })
    wx.showToast({ title: explaining ? '开始景点讲解' : '讲解已暂停', icon: 'none' })
  },
  inputQuestion(event) {
    this.setData({ question: event.detail.value })
  },
  ask() {
    if (!this.data.question.trim()) return
    this.setData({ answer: '问题已收到。后续将在这里接入导游问答服务。' })
  },
  replan() {
    if (!this.tripId) return
    wx.navigateTo({ url: `/pages/replan/index?id=${this.tripId}` })
  },
  createTrip() {
    wx.navigateTo({ url: '/pages/create/index' })
  }
})
