const api = require('../../utils/api')

Page({
  data: { draft: null, interestText: '', transportText: '', creating: false },
  onLoad() {
    const draft = wx.getStorageSync('tripDraft')
    this.setData({
      draft,
      interestText: (draft.interests || []).join('、'),
      transportText: (draft.transportModes || []).join('、')
    })
  },
  edit() {
    wx.navigateBack()
  },
  confirm() {
    if (this.data.creating) return
    this.setData({ creating: true })
    api.createTrip(this.data.draft)
      .then((trip) => wx.redirectTo({ url: `/pages/progress/index?id=${trip.id}` }))
      .catch((error) => {
        this.setData({ creating: false })
        wx.showToast({ title: error.message || '创建失败', icon: 'none' })
      })
  }
})
