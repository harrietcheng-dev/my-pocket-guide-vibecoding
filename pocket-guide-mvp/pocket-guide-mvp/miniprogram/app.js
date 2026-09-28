const { cloudEnv } = require('./config/runtime')

App({
  globalData: {
    currentTripId: null,
    cloudAvailable: false,
    cloudInitError: ''
  },

  onLaunch() {
    this.initializeCloud()
    const currentTripId = wx.getStorageSync('currentTripId')
    if (currentTripId) this.globalData.currentTripId = currentTripId
  },

  initializeCloud() {
    if (!wx.cloud || !wx.cloud.init) {
      this.globalData.cloudInitError = '当前微信基础库不支持云开发'
      return
    }
    const options = { traceUser: true }
    if (cloudEnv) options.env = cloudEnv
    try {
      wx.cloud.init(options)
      this.globalData.cloudAvailable = true
    } catch (error) {
      this.globalData.cloudInitError = error.message || '云开发初始化失败'
    }
  }
})
