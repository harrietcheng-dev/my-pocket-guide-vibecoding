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
      return trip
    })
  },
  generateTrip(id) {
    return useMock ? mock.generateTrip(id) : request(`/trips/${id}/generate`, 'POST')
  },
  getTrip(id) {
    return useMock ? mock.getTrip(id) : request(`/trips/${id}`)
  },
  listTrips() {
    return useMock ? mock.listTrips() : request('/trips')
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
