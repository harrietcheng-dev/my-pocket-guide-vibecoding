const api = require('../../utils/api')

const serviceItems = [
  { key: '美食', icon: '餐', label: '美食推荐', tone: 'orange' },
  { key: '休息', icon: '椅', label: '休息地点', tone: 'blue' },
  { key: '医院', icon: '医', label: '医院药店', tone: 'green' },
  { key: '交通', icon: '行', label: '交通出行', tone: 'blue' },
  { key: '卫生间', icon: '卫', label: '卫生间', tone: 'cyan' }
]

Page({
  data: {
    trip: null,
    currentNode: null,
    nextNode: null,
    guide: null,
    loading: true,
    checkingIn: false,
    explaining: false,
    audioProgress: 0,
    speechState: '待机',
    question: '',
    asking: false,
    messages: [],
    serviceItems,
    nearbyTitle: '',
    nearbyItems: [],
    showSource: false,
    recording: false,
    quickQuestions: ['这里最值得看什么？', '附近有卫生间吗？', '走累了，后面少走一点']
  },

  onShow() {
    const id = wx.getStorageSync('currentTripId')
    this.tripId = id
    this.stopPlayback()
    if (!id) return this.setData({ trip: null, currentNode: null, loading: false })
    this.setData({ loading: true })
    api.getTrip(id)
      .then((trip) => this.prepareTrip(trip))
      .catch(() => this.setData({ trip: null, currentNode: null, loading: false }))
  },

  onHide() { this.stopPlayback() },
  onUnload() { this.stopPlayback() },

  prepareTrip(trip) {
    const nodes = (trip.days || []).reduce((all, day) => all.concat(day.nodes || []), [])
    let currentIndex = nodes.findIndex((item) => item.status === 'IN_PROGRESS')
    if (currentIndex < 0) currentIndex = nodes.findIndex((item) => item.name.indexOf('故宫') >= 0)
    if (currentIndex < 0) currentIndex = nodes.findIndex((item) => item.status === 'PLANNED')
    if (currentIndex < 0) currentIndex = 0
    const currentNode = nodes[currentIndex] || null
    const nextNode = nodes.slice(currentIndex + 1).find((item) => item.status === 'PLANNED') || null
    const messages = this.data.messages.length ? this.data.messages : [{
      id: 'welcome',
      role: 'assistant',
      text: currentNode
        ? `我们现在来到${currentNode.name}。签到后我会为你讲重点，也可以随时问路线和周边服务。`
        : '我会在这里陪你完成今天的行程。'
    }]
    this.setData({ trip, currentNode, nextNode, messages, loading: false, speechState: '待机' })
  },

  checkIn() {
    const node = this.data.currentNode
    if (!node || this.data.checkingIn) return
    this.setData({ checkingIn: true })
    api.checkIn(this.tripId, node.id, { manual: true })
      .then(({ trip, node: checkedNode, guide }) => {
        this.setData({ trip, currentNode: checkedNode, guide, checkingIn: false, speechState: '已到达' })
        wx.showToast({ title: '签到成功，讲解已准备', icon: 'success' })
      })
      .catch((error) => {
        this.setData({ checkingIn: false })
        wx.showToast({ title: error.message || '签到失败', icon: 'none' })
      })
  },

  ensureGuide(depth = 'short') {
    const node = this.data.currentNode
    if (!node) return Promise.reject(new Error('暂无当前景点'))
    if (this.data.guide && depth === 'short') return Promise.resolve(this.data.guide)
    return api.getGuide(node.id, node.name, depth).then((guide) => {
      this.setData({ guide })
      return guide
    })
  },

  toggleExplain() {
    if (this.data.explaining) return this.stopPlayback()
    this.ensureGuide().then(() => this.startPlayback()).catch((error) => {
      wx.showToast({ title: error.message, icon: 'none' })
    })
  },

  startPlayback() {
    this.stopPlayback(false)
    this.setData({ explaining: true, speechState: '讲解中', audioProgress: 4 })
    this.playTimer = setInterval(() => {
      const next = this.data.audioProgress + 4
      if (next >= 100) return this.stopPlayback()
      this.setData({ audioProgress: next })
    }, 360)
  },

  stopPlayback(resetState = true) {
    if (this.playTimer) clearInterval(this.playTimer)
    this.playTimer = null
    if (resetState) this.setData({ explaining: false, speechState: '待机' })
  },

  detailedGuide() {
    this.stopPlayback()
    this.setData({ speechState: '准备讲解' })
    this.ensureGuide('detail').then(() => this.startPlayback())
  },

  toggleSource() { this.setData({ showSource: !this.data.showSource }) },
  inputQuestion(event) { this.setData({ question: event.detail.value }) },

  quickAsk(event) {
    this.setData({ question: event.currentTarget.dataset.question }, () => this.ask())
  },

  ask() {
    const text = this.data.question.trim()
    if (!text || this.data.asking || !this.tripId) return
    this.stopPlayback()
    const userMessage = { id: `user_${Date.now()}`, role: 'user', text }
    this.setData({
      messages: this.data.messages.concat(userMessage),
      question: '',
      asking: true,
      speechState: '思考中'
    })
    api.askQuestion(this.tripId, text, this.data.currentNode && this.data.currentNode.id)
      .then((result) => {
        const reply = { id: result.id || `assistant_${Date.now()}`, role: 'assistant', text: result.reply }
        this.setData({ messages: this.data.messages.concat(reply), asking: false, speechState: '待机' })
        if (result.action === 'nearby_hospital') this.loadNearby('医院')
        if (result.action === 'nearby_toilet') this.loadNearby('卫生间')
      })
      .catch((error) => {
        this.setData({ asking: false, speechState: '服务降级' })
        wx.showToast({ title: error.message || '问答暂不可用，请稍后重试', icon: 'none' })
      })
  },

  startVoice() {
    this.stopPlayback()
    this.setData({ recording: true, speechState: '倾听中' })
  },

  endVoice() {
    if (!this.data.recording) return
    this.setData({ recording: false, question: '这里最值得看什么？', speechState: '识别完成' }, () => {
      wx.showToast({ title: '语音演示：已转为文字', icon: 'none' })
      this.ask()
    })
  },

  cancelVoice() { this.setData({ recording: false, speechState: '已取消' }) },
  chooseService(event) { this.loadNearby(event.currentTarget.dataset.category) },

  loadNearby(category) {
    this.setData({ nearbyTitle: `附近${category}`, nearbyItems: [] })
    const requestNearby = (location = {}) => api.getNearby(category, location)
      .then((result) => this.setData({ nearbyItems: result.items || [] }))
      .catch(() => wx.showToast({ title: '周边服务暂不可用', icon: 'none' }))
    wx.getLocation({
      type: 'gcj02',
      success: (location) => requestNearby(location),
      fail: () => {
        wx.showToast({ title: '未使用定位，展示演示地点', icon: 'none' })
        requestNearby()
      }
    })
  },

  openNearby(event) {
    const item = event.currentTarget.dataset.item
    wx.showActionSheet({
      itemList: ['在地图中查看', '复制地点名称'],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) this.openMap()
        if (tapIndex === 1) wx.setClipboardData({ data: item.name })
      }
    })
  },

  openMap() { wx.navigateTo({ url: `/pages/map/index?id=${this.tripId}` }) },

  startNavigation() {
    const node = this.data.nextNode || this.data.currentNode
    if (!node || node.latitude == null || node.longitude == null) return this.openMap()
    wx.openLocation({
      latitude: Number(node.latitude),
      longitude: Number(node.longitude),
      name: node.name,
      address: node.reason || '行程目的地',
      scale: 16,
      fail: () => this.openMap()
    })
  },

  replan() {
    if (this.tripId) wx.navigateTo({ url: `/pages/replan/index?id=${this.tripId}` })
  },

  createTrip() { wx.navigateTo({ url: '/pages/create/index' }) }
})
