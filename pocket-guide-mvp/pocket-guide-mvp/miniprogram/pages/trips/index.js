const api = require('../../utils/api')

Page({
  data: {
    trip: null,
    trips: [],
    filteredTrips: [],
    tripFilter: 'ALL',
    selectedTripId: '',
    tripCounts: { active: 0, upcoming: 0, completed: 0, cancelled: 0 },
    view: 'overview',
    selectedDay: 0,
    latitude: 39.918,
    longitude: 116.397,
    markers: [],
    polyline: [],
    editing: false,
    editOperations: [],
    editForm: null,
    editPreview: null,
    editSubmitting: false
  },
  onShow() {
    this.loadTrips()
  },
  loadTrips(preferredId) {
    api.listTrips()
      .then((items) => {
        const priority = { ACTIVE: 0, READY: 1, CONFIRMED: 1, DRAFT: 1, COMPLETED: 2, CANCELLED: 3 }
        const trips = (items || []).map((trip) => this.decorateTrip(trip)).sort((a, b) => {
          const left = Object.prototype.hasOwnProperty.call(priority, a.state) ? priority[a.state] : 9
          const right = Object.prototype.hasOwnProperty.call(priority, b.state) ? priority[b.state] : 9
          return left - right
        })
        const currentId = wx.getStorageSync('currentTripId')
        const activeTrip = trips.find((item) => item.state === 'ACTIVE')
        const selectedId = preferredId || wx.getStorageSync('lastViewedTripId') || currentId
        let tripFilter = this.data.tripFilter
        let filteredTrips = this.filterTrips(trips, tripFilter)
        if (!filteredTrips.length && trips.length) {
          tripFilter = 'ALL'
          filteredTrips = trips
        }
        const selected = filteredTrips.find((item) => item.id === selectedId) || filteredTrips[0] || trips[0] || null
        if (activeTrip) {
          wx.setStorageSync('currentTripId', activeTrip.id)
        } else if (currentId && !trips.some((item) => item.id === currentId && ['READY', 'CONFIRMED'].includes(item.state))) {
          wx.removeStorageSync('currentTripId')
        }
        if (selected) wx.setStorageSync('lastViewedTripId', selected.id)
        this.setData({
          trips,
          filteredTrips,
          tripFilter,
          trip: selected,
          selectedTripId: selected ? selected.id : '',
          selectedDay: 0,
          view: 'overview',
          tripCounts: {
            active: trips.filter((item) => item.state === 'ACTIVE').length,
            upcoming: trips.filter((item) => ['READY', 'CONFIRMED', 'DRAFT'].includes(item.state)).length,
            completed: trips.filter((item) => item.state === 'COMPLETED').length,
            cancelled: trips.filter((item) => item.state === 'CANCELLED').length
          }
        }, () => { if (selected) this.drawDay(0) })
      })
      .catch((error) => {
        this.setData({ trip: null, trips: [] })
        wx.showToast({ title: error.message || '行程列表加载失败', icon: 'none' })
      })
  },
  decorateTrip(trip) {
    const labels = { ACTIVE: '行程中', READY: '待出发', CONFIRMED: '待生成', DRAFT: '草稿', COMPLETED: '已完成', CANCELLED: '已取消' }
    const constraints = trip.constraints || {}
    return {
      ...trip,
      stateLabel: labels[trip.state] || trip.state,
      stateClass: String(trip.state || '').toLowerCase(),
      dateRange: constraints.startDate && constraints.endDate ? `${constraints.startDate} 至 ${constraints.endDate}` : '日期待定'
    }
  },
  filterTrips(trips, filter) {
    if (filter === 'ACTIVE') return trips.filter((item) => item.state === 'ACTIVE')
    if (filter === 'UPCOMING') return trips.filter((item) => ['READY', 'CONFIRMED', 'DRAFT'].includes(item.state))
    if (filter === 'COMPLETED') return trips.filter((item) => item.state === 'COMPLETED')
    if (filter === 'CANCELLED') return trips.filter((item) => item.state === 'CANCELLED')
    return trips
  },
  selectTripFilter(event) {
    if (this.data.editing) return wx.showToast({ title: '请先完成或取消编辑', icon: 'none' })
    const tripFilter = event.currentTarget.dataset.filter
    const filteredTrips = this.filterTrips(this.data.trips, tripFilter)
    const trip = filteredTrips.find((item) => item.id === this.data.selectedTripId) || filteredTrips[0]
    if (!trip) return this.setData({ tripFilter, filteredTrips })
    wx.setStorageSync('lastViewedTripId', trip.id)
    this.setData({ tripFilter, filteredTrips, trip, selectedTripId: trip.id, selectedDay: 0, view: 'overview' }, () => this.drawDay(0))
  },
  selectTrip(event) {
    if (this.data.editing) return wx.showToast({ title: '请先完成或取消编辑', icon: 'none' })
    const id = event.currentTarget.dataset.id
    const trip = this.data.trips.find((item) => item.id === id)
    if (!trip) return
    wx.setStorageSync('lastViewedTripId', id)
    this.setData({ trip, selectedTripId: id, selectedDay: 0, view: 'overview', editPreview: null }, () => this.drawDay(0))
  },
  replaceTripInList(trip) {
    const decorated = this.decorateTrip(trip)
    const trips = this.data.trips.map((item) => item.id === decorated.id ? decorated : item)
    this.setData({ trip: decorated, trips, filteredTrips: this.filterTrips(trips, this.data.tripFilter) })
  },
  switchView(event) {
    if (this.data.editing && event.currentTarget.dataset.view !== 'overview') {
      return wx.showToast({ title: '请先完成或取消编辑', icon: 'none' })
    }
    this.setData({ view: event.currentTarget.dataset.view })
  },
  selectDay(event) {
    this.setData({ editForm: null, editPreview: null })
    this.drawDay(Number(event.currentTarget.dataset.index))
  },
  startEditing() {
    if (!this.data.trip || ['COMPLETED', 'CANCELLED'].includes(this.data.trip.state)) return
    this.originalTrip = JSON.parse(JSON.stringify(this.data.trip))
    this.setData({ editing: true, view: 'overview', editOperations: [], editForm: null, editPreview: null })
  },
  cancelEditing() {
    this.setData({
      trip: this.originalTrip || this.data.trip,
      editing: false,
      editOperations: [],
      editForm: null,
      editPreview: null
    }, () => this.drawDay(this.data.selectedDay))
  },
  moveEditNode(event) {
    const index = Number(event.currentTarget.dataset.index)
    const delta = Number(event.currentTarget.dataset.delta)
    const day = this.data.trip.days[this.data.selectedDay]
    const node = day.nodes[index]
    const targetIndex = index + delta
    if (!node || node.status !== 'PLANNED' || targetIndex < 0 || targetIndex >= day.nodes.length) return
    const trip = JSON.parse(JSON.stringify(this.data.trip))
    const nodes = trip.days[this.data.selectedDay].nodes
    const moved = nodes.splice(index, 1)[0]
    nodes.splice(targetIndex, 0, moved)
    const operation = { action: 'move', dayIndex: day.dayIndex, nodeId: node.id, targetIndex }
    this.setData({ trip, editOperations: this.data.editOperations.concat(operation), editPreview: null })
  },
  deleteEditNode(event) {
    const index = Number(event.currentTarget.dataset.index)
    const day = this.data.trip.days[this.data.selectedDay]
    const node = day.nodes[index]
    if (!node || node.status !== 'PLANNED') return
    if (day.nodes.length <= 1) return wx.showToast({ title: '每天至少保留一个节点', icon: 'none' })
    wx.showModal({
      title: '删除行程节点',
      content: `确认删除“${node.name}”吗？确认编辑前不会影响正式行程。`,
      success: ({ confirm }) => {
        if (!confirm) return
        const trip = JSON.parse(JSON.stringify(this.data.trip))
        trip.days[this.data.selectedDay].nodes.splice(index, 1)
        const operation = { action: 'delete', dayIndex: day.dayIndex, nodeId: node.id }
        this.setData({ trip, editOperations: this.data.editOperations.concat(operation), editPreview: null })
      }
    })
  },
  openReplaceNode(event) {
    const index = Number(event.currentTarget.dataset.index)
    const node = this.data.trip.days[this.data.selectedDay].nodes[index]
    if (!node || node.status !== 'PLANNED') return
    this.setData({ editForm: this.makeEditForm('replace', index, node), editPreview: null })
  },
  openAddNode() {
    this.setData({
      editForm: this.makeEditForm('add', this.data.trip.days[this.data.selectedDay].nodes.length, {
        name: '', type: '景点', durationMin: 90, costRange: [0, 0], reason: '用户手动新增', latitude: 39.908, longitude: 116.397
      }),
      editPreview: null
    })
  },
  makeEditForm(mode, index, node) {
    return {
      mode,
      index,
      nodeId: node.id || '',
      name: node.name || '',
      type: node.type || '景点',
      durationMin: node.durationMin || 90,
      costMin: (node.costRange || [0, 0])[0],
      costMax: (node.costRange || [0, 0])[1],
      reason: node.reason || '',
      latitude: node.latitude,
      longitude: node.longitude
    }
  },
  inputEditForm(event) {
    this.setData({ [`editForm.${event.currentTarget.dataset.field}`]: event.detail.value })
  },
  cancelEditForm() { this.setData({ editForm: null }) },
  saveEditForm() {
    const form = this.data.editForm
    if (!form || !String(form.name || '').trim()) return wx.showToast({ title: '请填写地点名称', icon: 'none' })
    const durationMin = Number(form.durationMin)
    const costMin = Number(form.costMin)
    const costMax = Number(form.costMax)
    if (!Number.isInteger(durationMin) || durationMin < 15) return wx.showToast({ title: '停留时间至少 15 分钟', icon: 'none' })
    if (costMin < 0 || costMax < costMin) return wx.showToast({ title: '费用区间不正确', icon: 'none' })
    const day = this.data.trip.days[this.data.selectedDay]
    const payload = {
      name: String(form.name).trim(),
      type: String(form.type || '景点').trim(),
      durationMin,
      costRange: [costMin, costMax],
      reason: String(form.reason || '用户手动调整').trim(),
      latitude: form.latitude,
      longitude: form.longitude
    }
    const trip = JSON.parse(JSON.stringify(this.data.trip))
    const operations = [...this.data.editOperations]
    if (form.mode === 'replace') {
      const original = trip.days[this.data.selectedDay].nodes[form.index]
      trip.days[this.data.selectedDay].nodes[form.index] = { ...original, ...payload }
      operations.push({ action: 'replace', dayIndex: day.dayIndex, nodeId: form.nodeId, node: payload })
    } else {
      const clientKey = `draft_${Date.now()}`
      trip.days[this.data.selectedDay].nodes.push({ id: clientKey, ...payload, status: 'PLANNED', draftOnly: true })
      operations.push({ action: 'add', dayIndex: day.dayIndex, targetIndex: day.nodes.length, node: payload, clientKey })
    }
    this.setData({ trip, editOperations: operations, editForm: null, editPreview: null })
  },
  removeDraftAddition(event) {
    const index = Number(event.currentTarget.dataset.index)
    const day = this.data.trip.days[this.data.selectedDay]
    const node = day.nodes[index]
    if (!node || !node.draftOnly) return
    const trip = JSON.parse(JSON.stringify(this.data.trip))
    trip.days[this.data.selectedDay].nodes.splice(index, 1)
    const operations = this.data.editOperations.filter((item) => item.clientKey !== node.id)
    this.setData({ trip, editOperations: operations, editPreview: null })
  },
  previewEdits() {
    if (!this.data.editOperations.length || this.data.editSubmitting) return
    this.setData({ editSubmitting: true })
    const operations = this.data.editOperations.map(({ clientKey, ...operation }) => operation)
    api.previewEdits(this.data.trip.id, operations)
      .then((editPreview) => this.setData({ editPreview, editSubmitting: false }))
      .catch((error) => {
        this.setData({ editSubmitting: false })
        wx.showToast({ title: error.message || '无法生成编辑摘要', icon: 'none' })
      })
  },
  applyEditPreview() {
    const preview = this.data.editPreview
    if (!preview || this.data.editSubmitting) return
    this.setData({ editSubmitting: true })
    api.confirmEdits(this.data.trip.id, preview.id)
      .then((trip) => {
        this.originalTrip = null
        this.replaceTripInList(trip)
        this.setData({ editing: false, editOperations: [], editForm: null, editPreview: null, editSubmitting: false }, () => this.drawDay(this.data.selectedDay))
        wx.showToast({ title: '行程编辑已应用', icon: 'success' })
      })
      .catch((error) => {
        this.setData({ editSubmitting: false })
        wx.showToast({ title: error.message || '应用编辑失败', icon: 'none' })
      })
  },
  closeEditPreview() { this.setData({ editPreview: null }) },
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
    if (!this.data.trip || this.data.trip.state === 'CANCELLED') return wx.showToast({ title: '已取消的行程不能进入陪伴', icon: 'none' })
    const otherActive = this.data.trips.find((item) => item.state === 'ACTIVE' && item.id !== this.data.trip.id)
    if (otherActive && this.data.trip.state !== 'COMPLETED') {
      return wx.showToast({ title: `请先完成或取消${otherActive.title}`, icon: 'none' })
    }
    wx.setStorageSync('companionTripId', this.data.trip.id)
    if (['READY', 'ACTIVE', 'CONFIRMED'].includes(this.data.trip.state)) wx.setStorageSync('currentTripId', this.data.trip.id)
    wx.switchTab({ url: '/pages/companion/index' })
  },
  cancelTrip() {
    const trip = this.data.trip
    if (!trip || !['READY', 'ACTIVE', 'CONFIRMED', 'DRAFT'].includes(trip.state)) return
    wx.showModal({
      title: '取消这段行程？',
      content: trip.state === 'ACTIVE' ? '已经完成的节点会保留，当前及后续安排会标记为已取消。' : '取消后仍可在历史行程中查看，但不能继续签到。',
      confirmText: '确认取消',
      confirmColor: '#d92d20',
      success: ({ confirm }) => {
        if (!confirm) return
        api.cancelTrip(trip.id)
          .then(() => {
            if (wx.getStorageSync('currentTripId') === trip.id) wx.removeStorageSync('currentTripId')
            if (wx.getStorageSync('companionTripId') === trip.id) wx.removeStorageSync('companionTripId')
            wx.showToast({ title: '行程已取消', icon: 'success' })
            this.loadTrips(trip.id)
          })
          .catch((error) => wx.showToast({ title: error.message || '取消失败', icon: 'none' }))
      }
    })
  }
})
