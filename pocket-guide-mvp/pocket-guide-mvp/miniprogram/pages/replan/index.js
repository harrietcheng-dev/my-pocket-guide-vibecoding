const api = require('../../utils/api')

Page({
  data: {
    tripId: '',
    message: '走得有点累，后面少走一点，最好增加休息时间',
    suggestions: ['少走一点', '想早点结束', '找地方吃饭', '不想去某处'],
    replan: null,
    loading: false
  },
  onLoad(options) {
    this.setData({ tripId: options.id })
  },
  input(event) {
    this.setData({ message: event.detail.value })
  },
  useSuggestion(event) {
    this.setData({ message: event.currentTarget.dataset.value })
  },
  generate() {
    if (!this.data.message.trim()) return
    this.setData({ loading: true })
    api.createReplan(this.data.tripId, this.data.message)
      .then((replan) => this.setData({ replan, loading: false }))
      .catch((error) => {
        this.setData({ loading: false })
        wx.showToast({ title: error.message, icon: 'none' })
      })
  },
  apply() {
    api.applyReplan(this.data.tripId, this.data.replan).then(() => {
      wx.showToast({ title: '新方案已应用' })
      setTimeout(() => wx.navigateBack(), 500)
    })
  }
})
