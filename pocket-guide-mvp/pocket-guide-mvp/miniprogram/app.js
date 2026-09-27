App({
  globalData: {
    currentTripId: null
  },

  onLaunch() {
    const currentTripId = wx.getStorageSync('currentTripId')
    if (currentTripId) this.globalData.currentTripId = currentTripId
  }
})
