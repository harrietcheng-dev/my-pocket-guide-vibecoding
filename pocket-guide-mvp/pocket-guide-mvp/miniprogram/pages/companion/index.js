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
    tripCompleted: false,
    completionSummary: null,
    currentNode: null,
    nextNode: null,
    routeTarget: null,
    routeLabel: '本次目的地',
    progressText: '已完成 0/0',
    progressPercent: 0,
    nodeActionLabel: '手动签到',
    guide: null,
    loading: true,
    loadError: '',
    checkingIn: false,
    completing: false,
    explaining: false,
    audioProgress: 0,
    speechState: '待机',
    question: '',
    asking: false,
    messages: [],
    serviceItems,
    nearbyTitle: '',
    nearbyCategory: '',
    nearbyItems: [],
    nearbyLoading: false,
    nearbyError: '',
    showSource: false,
    recording: false,
    pendingReplan: null,
    replanLoading: false,
    applyingReplan: false,
    canUndo: false,
    quickQuestions: ['这里最值得看什么？', '附近有卫生间吗？', '走累了，后面少走一点']
  },

  onShow() {
    const id = wx.getStorageSync('companionTripId') || wx.getStorageSync('currentTripId')
    this.tripId = id
    this.stopPlayback()
    if (!id) return this.setData({ trip: null, currentNode: null, loading: false, loadError: '' })
    this.setData({ loading: true, loadError: '' })
    api.getTrip(id)
      .then((trip) => this.prepareTrip(trip))
      .catch(() => this.setData({ trip: null, currentNode: null, loading: false, loadError: '暂时无法连接行程服务，已有行程没有被删除。' }))
  },

  onReady() {
    this.avatar = this.selectComponent('#guideAvatar')
  },

  retryLoad() { this.onShow() },

  onHide() { this.stopPlayback() },
  onUnload() { this.stopPlayback() },

  prepareTrip(trip) {
    const nodes = (trip.days || []).reduce((all, day) => all.concat(day.nodes || []), [])
    const terminalStatuses = ['COMPLETED', 'SKIPPED', 'CANCELLED']
    const tripCompleted = trip.state === 'COMPLETED' || (nodes.length > 0 && nodes.every((item) => terminalStatuses.includes(item.status)))
    let currentIndex = tripCompleted ? -1 : nodes.findIndex((item) => item.status === 'IN_PROGRESS')
    if (!tripCompleted && currentIndex < 0) currentIndex = nodes.findIndex((item) => item.status === 'PLANNED')
    const currentNode = currentIndex >= 0 ? nodes[currentIndex] : null
    const nextNode = currentIndex >= 0 ? (nodes.slice(currentIndex + 1).find((item) => item.status === 'PLANNED') || null) : null
    const completedCount = nodes.filter((item) => item.status === 'COMPLETED').length
    const currentInProgress = currentNode && currentNode.status === 'IN_PROGRESS'
    const routeTarget = currentInProgress ? (nextNode || currentNode) : currentNode
    const routeLabel = currentInProgress ? (nextNode ? '接下来参观' : '当前为最后一站') : '本次目的地'
    const completionSummary = tripCompleted ? {
      dayCount: (trip.days || []).length,
      nodeCount: nodes.length,
      completedCount
    } : null
    const isSameTrip = this.loadedTripId === trip.id
    const messages = isSameTrip && this.data.messages.length ? this.data.messages : [{
      id: 'welcome',
      role: 'assistant',
      text: currentNode
        ? `我们现在来到${currentNode.name}。签到后我会为你讲重点，也可以随时问路线和周边服务。`
        : tripCompleted ? '本次行程已经完成，辛苦啦！可以查看完整行程记录，或返回首页规划下一段旅程。' : '我会在这里陪你完成今天的行程。'
    }]
    this.loadedTripId = trip.id
    this.setData({
      trip,
      tripCompleted,
      completionSummary,
      currentNode,
      nextNode,
      routeTarget,
      routeLabel,
      progressText: `已完成 ${completedCount}/${nodes.length}`,
      progressPercent: nodes.length ? Math.round(completedCount / nodes.length * 100) : 0,
      nodeActionLabel: tripCompleted ? '' : (currentNode && currentNode.status === 'IN_PROGRESS' ? '完成参观' : '手动签到'),
      messages,
      guide: null,
      showSource: false,
      audioProgress: 0,
      loading: false,
      canUndo: Boolean(trip.previousSnapshot),
      speechState: tripCompleted ? '已结束' : (currentNode && currentNode.status === 'IN_PROGRESS' ? '已到达' : '待机')
    })
    if (currentNode && currentNode.status === 'IN_PROGRESS') {
      api.getGuide(currentNode.id, currentNode.name, 'short')
        .then((guide) => {
          if (this.data.currentNode && this.data.currentNode.id === currentNode.id) this.setData({ guide })
        })
        .catch(() => {})
    }
  },

  checkIn() {
    const node = this.data.currentNode
    if (!node || this.data.checkingIn) return
    this.setData({ checkingIn: true })
    api.checkIn(this.tripId, node.id, { manual: true })
      .then(({ trip, node: checkedNode, guide }) => {
        this.prepareTrip(trip)
        this.setData({
          currentNode: checkedNode,
          guide,
          checkingIn: false,
          nodeActionLabel: checkedNode.status === 'IN_PROGRESS' ? '完成参观' : '手动签到',
          speechState: '已到达'
        })
        wx.showToast({ title: '签到成功，讲解已准备', icon: 'success' })
      })
      .catch((error) => {
        this.setData({ checkingIn: false })
        wx.showToast({ title: error.message || '签到失败', icon: 'none' })
      })
  },

  completeCurrent() {
    const node = this.data.currentNode
    if (!node || node.status !== 'IN_PROGRESS' || this.data.completing) return
    this.stopPlayback()
    this.setData({ completing: true })
    api.completeNode(this.tripId, node.id)
      .then(({ trip }) => {
        this.setData({ completing: false })
        this.prepareTrip(trip)
        wx.showToast({ title: trip.state === 'COMPLETED' ? '行程已完成' : '已完成，已切换下一站', icon: 'success' })
      })
      .catch((error) => {
        this.setData({ completing: false })
        wx.showToast({ title: error.message || '状态更新失败', icon: 'none' })
      })
  },

  primaryNodeAction() {
    if (this.data.tripCompleted) return
    if (this.data.currentNode && this.data.currentNode.status === 'IN_PROGRESS') this.completeCurrent()
    else this.checkIn()
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
    this.ensureGuide().then((guide) => this.readGuide(guide.text)).catch((error) => {
      wx.showToast({ title: error.message, icon: 'none' })
    })
  },

  readGuide(text) {
    const avatar = this.avatar || this.selectComponent('#guideAvatar')
    if (!avatar) return wx.showToast({ title: '数字人组件未就绪', icon: 'none' })
    this.setData({ speechState: '准备语音', audioProgress: 0 })
    avatar.startSpeak(text)
  },

  beginAudioProgress() {
    if (this.playTimer) clearInterval(this.playTimer)
    this.setData({ explaining: true, speechState: '讲解中', audioProgress: 3 })
    this.playTimer = setInterval(() => {
      const next = Math.min(this.data.audioProgress + 2, 94)
      this.setData({ audioProgress: next })
    }, 500)
  },

  stopPlayback(resetState = true) {
    const avatar = this.avatar || this.selectComponent('#guideAvatar')
    if (avatar) avatar.stopSpeak()
    if (this.playTimer) clearInterval(this.playTimer)
    this.playTimer = null
    if (resetState) this.setData({ explaining: false, speechState: '待机', audioProgress: 0 })
  },

  onAvatarStateChange(event) {
    const labels = { idle: '待机', loading: '准备语音', speaking: '讲解中', error: '文字讲解' }
    this.setData({ speechState: labels[event.detail.status] || '待机' })
  },

  onSpeechStart() {
    this.beginAudioProgress()
  },

  onSpeechEnd() {
    if (this.playTimer) clearInterval(this.playTimer)
    this.playTimer = null
    this.setData({ explaining: false, speechState: '待机', audioProgress: 100 })
  },

  onSpeechStop() {
    if (this.playTimer) clearInterval(this.playTimer)
    this.playTimer = null
    this.setData({ explaining: false, speechState: '待机', audioProgress: 0 })
  },

  onSpeechError(event) {
    if (this.playTimer) clearInterval(this.playTimer)
    this.playTimer = null
    this.setData({ explaining: false, speechState: '文字讲解', audioProgress: 0 })
    wx.showToast({ title: event.detail.message || '语音暂不可用，已保留文字', icon: 'none' })
  },

  detailedGuide() {
    this.stopPlayback()
    this.setData({ speechState: '准备讲解' })
    this.ensureGuide('detail')
      .then((guide) => this.readGuide(guide.text))
      .catch((error) => {
        this.setData({ speechState: '待机' })
        wx.showToast({ title: error.message || '详细讲解暂不可用', icon: 'none' })
      })
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
        if (result.action === 'replan') this.createInlineReplan(text)
      })
      .catch((error) => {
        this.setData({ asking: false, speechState: '服务降级' })
        wx.showToast({ title: error.message || '问答暂不可用，请稍后重试', icon: 'none' })
      })
  },

  createInlineReplan(message) {
    this.setData({ replanLoading: true, pendingReplan: null })
    api.createReplan(this.tripId, message)
      .then((pendingReplan) => this.setData({ pendingReplan, replanLoading: false }))
      .catch((error) => {
        this.setData({ replanLoading: false })
        wx.showToast({ title: error.message || '暂时无法生成调整方案', icon: 'none' })
      })
  },

  cancelInlineReplan() {
    this.setData({ pendingReplan: null })
  },

  applyInlineReplan() {
    const pending = this.data.pendingReplan
    if (!pending || this.data.applyingReplan) return
    this.setData({ applyingReplan: true })
    api.applyReplan(this.tripId, pending)
      .then((trip) => {
        const reply = { id: `applied_${Date.now()}`, role: 'assistant', text: '新方案已应用，只更新了尚未完成的安排。需要时可以撤销这一次调整。' }
        this.setData({
          messages: this.data.messages.concat(reply),
          pendingReplan: null,
          applyingReplan: false,
          canUndo: true
        })
        this.prepareTrip(trip)
      })
      .catch((error) => {
        this.setData({ applyingReplan: false })
        wx.showToast({ title: error.message || '应用失败，原行程未改变', icon: 'none' })
      })
  },

  undoInlineReplan() {
    api.undo(this.tripId)
      .then((trip) => {
        this.setData({ canUndo: false })
        this.prepareTrip(trip)
        wx.showToast({ title: '已恢复上一版本', icon: 'success' })
      })
      .catch((error) => wx.showToast({ title: error.message || '暂无可撤销版本', icon: 'none' }))
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

  retryNearby() {
    if (this.data.nearbyCategory) this.loadNearby(this.data.nearbyCategory)
  },

  loadNearby(category) {
    this.setData({
      nearbyTitle: `附近${category}`,
      nearbyCategory: category,
      nearbyItems: [],
      nearbyLoading: true,
      nearbyError: ''
    })
    const requestNearby = (location = {}) => api.getNearby(category, location)
      .then((result) => this.setData({ nearbyItems: result.items || [], nearbyLoading: false }))
      .catch(() => this.setData({ nearbyLoading: false, nearbyError: '周边服务暂时加载失败' }))
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
    const canOpenMap = item.latitude != null && item.longitude != null
    wx.showActionSheet({
      itemList: canOpenMap ? ['在地图中查看', '复制地点名称'] : ['复制地点名称'],
      success: ({ tapIndex }) => {
        if (!canOpenMap || tapIndex === 1) return wx.setClipboardData({ data: item.name })
        wx.openLocation({
          latitude: Number(item.latitude),
          longitude: Number(item.longitude),
          name: item.name,
          address: item.type || '周边服务',
          scale: 17,
          fail: () => wx.showToast({ title: '暂时无法打开地图', icon: 'none' })
        })
      }
    })
  },

  openMap() {
    const node = this.data.routeTarget
    const nodeQuery = node ? `&nodeId=${encodeURIComponent(node.id)}` : ''
    wx.navigateTo({ url: `/pages/map/index?id=${this.tripId}${nodeQuery}` })
  },

  startNavigation() {
    const node = this.data.routeTarget
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

  viewTrip() { wx.switchTab({ url: '/pages/trips/index' }) },
  goHome() { wx.switchTab({ url: '/pages/home/index' }) },

  createTrip() { wx.navigateTo({ url: '/pages/create/index' }) }
})
