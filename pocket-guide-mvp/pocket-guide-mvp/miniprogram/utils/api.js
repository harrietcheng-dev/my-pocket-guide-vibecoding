const mock = require('./mock')

const useMock = false
const baseUrl = 'http://127.0.0.1:8000/api/v1'

function request(path, method = 'GET', data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${path}`,
      method,
      data,
      header: { 'content-type': 'application/json' },
      success: ({ statusCode, data: body }) => {
        if (statusCode >= 200 && statusCode < 300) resolve(body)
        else reject(new Error(body.detail || '请求失败'))
      },
      fail: reject
    })
  })
}

module.exports = {
  createTrip(data) {
    const operation = useMock
      ? mock.createTrip(data)
      : request('/trips', 'POST', { constraints: data })
    return operation.then((trip) => {
      wx.setStorageSync('currentTripId', trip.id)
      wx.setStorageSync('companionTripId', trip.id)
      return trip
    })
  },
  generateTrip(id) {
    return useMock ? mock.generateTrip(id) : request(`/trips/${id}/generate`, 'POST')
  },
  getTrip(id) {
    return useMock ? mock.getTrip(id) : request(`/trips/${id}`)
  },
  checkIn(id, nodeId, payload = { manual: true }) {
    return useMock ? mock.checkIn(id, nodeId, payload) : request(`/trips/${id}/nodes/${nodeId}/check-in`, 'POST', payload)
  },
  completeNode(id, nodeId) {
    return useMock ? mock.completeNode(id, nodeId) : request(`/trips/${id}/nodes/${nodeId}/complete`, 'POST')
  },
  getGuide(placeId, name, depth = 'short') {
    return useMock ? mock.getGuide(placeId, name, depth) : request(`/places/${placeId}/guide?name=${encodeURIComponent(name || '')}&depth=${depth}`)
  },
  getNearby(category, location = {}) {
    const query = [`category=${encodeURIComponent(category)}`]
    if (location.latitude != null) query.push(`latitude=${location.latitude}`)
    if (location.longitude != null) query.push(`longitude=${location.longitude}`)
    return useMock ? mock.getNearby(category, location) : request(`/nearby?${query.join('&')}`)
  },
  askQuestion(id, text, nodeId) {
    return useMock ? mock.askQuestion(id, text, nodeId) : request(`/conversations/${id}/messages`, 'POST', { text, node_id: nodeId })
  },
  listTrips() {
    return useMock ? mock.listTrips() : request('/trips')
  },
  cancelTrip(id) {
    return useMock ? mock.cancelTrip(id) : request(`/trips/${id}/cancel`, 'POST')
  },
  previewEdits(id, operations) {
    return useMock ? mock.previewEdits(id, operations) : request(`/trips/${id}/edits`, 'POST', { operations })
  },
  confirmEdits(id, editId) {
    return useMock ? mock.confirmEdits(id, editId) : request(`/trips/${id}/edits/${editId}/confirm`, 'POST')
  },
  createReplan(id, message) {
    return useMock ? mock.createReplan(id, message) : request(`/trips/${id}/replans`, 'POST', { message })
  },
  applyReplan(id, replan) {
    return useMock ? mock.applyReplan(id, replan) : request(`/trips/${id}/replans/${replan.id}/apply`, 'POST')
  },
  undo(id) {
    return useMock ? mock.undo(id) : request(`/trips/${id}/undo`, 'POST')
  }
}
