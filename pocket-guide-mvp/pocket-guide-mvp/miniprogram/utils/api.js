const mock = require('./mock')

const useMock = false
const baseUrl = 'http://127.0.0.1:8000/api/v1'

function request(path, method = 'GET', data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${path}`,
      method,
      data,
      header: {
        'content-type': 'application/json',
        'X-Session-Token': wx.getStorageSync('anonymousToken') || ''
      },
      success: ({ statusCode, data: body }) => {
        if (statusCode >= 200 && statusCode < 300) resolve(body)
        else {
          const error = new Error(body.detail || '请求失败')
          error.statusCode = statusCode
          reject(error)
        }
      },
      fail: reject
    })
  })
}

function ensureSession() {
  const existingToken = wx.getStorageSync('anonymousToken')
  if (existingToken) return Promise.resolve(existingToken)
  let deviceId = wx.getStorageSync('anonymousDeviceId')
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(16).slice(2)}`
    wx.setStorageSync('anonymousDeviceId', deviceId)
  }
  return request('/sessions/anonymous', 'POST', { device_id: deviceId }).then((session) => {
    wx.setStorageSync('anonymousToken', session.token)
    wx.setStorageSync('anonymousSessionExpiresAt', session.expires_at)
    return session.token
  })
}

function authorizedRequest(path, method = 'GET', data) {
  return ensureSession()
    .then(() => request(path, method, data))
    .catch((error) => {
      if (error.statusCode !== 401) throw error
      wx.removeStorageSync('anonymousToken')
      wx.removeStorageSync('anonymousSessionExpiresAt')
      return ensureSession().then(() => request(path, method, data))
    })
}

module.exports = {
  ensureSession,
  createTrip(data) {
    const operation = useMock ? mock.createTrip(data) : authorizedRequest('/trips', 'POST', { constraints: data })
    return operation.then((trip) => {
      wx.setStorageSync('currentTripId', trip.id)
      return trip
    })
  },
  confirmTrip(id) {
    return useMock ? mock.confirmTrip(id) : authorizedRequest(`/trips/${id}/confirm`, 'POST')
  },
  generateTrip(id) {
    return useMock ? mock.generateTrip(id) : authorizedRequest(`/trips/${id}/generate`, 'POST')
  },
  getTrip(id) {
    return useMock ? mock.getTrip(id) : authorizedRequest(`/trips/${id}`)
  },
  listTrips() {
    return useMock ? mock.listTrips() : authorizedRequest('/trips')
  },
  startTrip(id) {
    return useMock ? mock.startTrip(id) : authorizedRequest(`/trips/${id}/start`, 'POST')
  },
  checkInNode(id, nodeId) {
    return useMock ? mock.checkInNode(id, nodeId) : authorizedRequest(`/trips/${id}/nodes/${nodeId}/check-in`, 'POST')
  },
  updateNodeStatus(id, nodeId, action) {
    return useMock
      ? mock.updateNodeStatus(id, nodeId, action)
      : authorizedRequest(`/trips/${id}/nodes/${nodeId}/status`, 'POST', { action })
  },
  completeTrip(id, note = '') {
    return useMock ? mock.completeTrip(id, note) : authorizedRequest(`/trips/${id}/complete`, 'POST', { note })
  },
  createReplan(id, message) {
    return useMock ? mock.createReplan(id, message) : authorizedRequest(`/trips/${id}/replans`, 'POST', { message })
  },
  applyReplan(id, replan) {
    return useMock ? mock.applyReplan(id, replan) : authorizedRequest(`/trips/${id}/replans/${replan.id}/apply`, 'POST')
  },
  undo(id) {
    return useMock ? mock.undo(id) : authorizedRequest(`/trips/${id}/undo`, 'POST')
  }
}
