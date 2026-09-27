const api = require('../../utils/api')

Page({
  data: {
    tripId: '',
    stages: [
      { label: '理解需求', state: 'active' },
      { label: '搜索地点', state: '' },
      { label: '规划路线', state: '' },
      { label: '检查结果', state: '' }
    ],
    current: 0
  },
  onLoad(options) {
    this.setData({ tripId: options.id })
    this.runStages()
  },
  onUnload() {
    if (this.timer) clearInterval(this.timer)
  },
  runStages() {
    this.timer = setInterval(() => {
      const next = this.data.current + 1
      if (next < this.data.stages.length) {
        const stages = this.data.stages.map((stage, index) => ({
          ...stage,
          state: index < next ? 'done' : index === next ? 'active' : ''
        }))
        this.setData({ current: next, stages })
        return
      }
      clearInterval(this.timer)
      api.generateTrip(this.data.tripId).then(() => {
        wx.redirectTo({ url: `/pages/itinerary/index?id=${this.data.tripId}` })
      })
    }, 650)
  }
})
