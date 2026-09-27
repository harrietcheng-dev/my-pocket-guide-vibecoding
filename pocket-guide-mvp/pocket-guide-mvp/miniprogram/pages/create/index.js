const interestOptions = ['历史文化', '美食', '自然', '拍照', '城市漫步', '休闲']

Page({
  data: {
    interestOptions: interestOptions.map((value) => ({
      value,
      selected: value === '历史文化' || value === '美食'
    })),
    paceOptions: ['轻松', '适中', '紧凑'],
    form: {
      city: '北京',
      startDate: '2026-10-01',
      endDate: '2026-10-04',
      days: 4,
      partySize: 2,
      groupBudgetCny: 3000,
      interests: ['历史文化', '美食'],
      pace: '适中',
      transportModes: ['公交', '地铁', '步行'],
      dailyWindow: '09:00–21:00',
      physicalConstraints: []
    }
  },
  onLoad() {
    const city = wx.getStorageSync('draftCity')
    if (city) this.setData({ 'form.city': city })
  },
  input(event) {
    this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value })
  },
  pickPace(event) {
    this.setData({ 'form.pace': event.currentTarget.dataset.value })
  },
  toggleInterest(event) {
    const value = event.currentTarget.dataset.value
    const interests = [...this.data.form.interests]
    const index = interests.indexOf(value)
    if (index >= 0) interests.splice(index, 1)
    else interests.push(value)
    const interestOptions = this.data.interestOptions.map((item) => ({
      ...item,
      selected: interests.indexOf(item.value) >= 0
    }))
    this.setData({ 'form.interests': interests, interestOptions })
  },
  next() {
    const form = this.data.form
    if (!form.city || !form.startDate || !form.endDate || Number(form.groupBudgetCny) <= 0) {
      return wx.showToast({ title: '请补全城市、日期和预算', icon: 'none' })
    }
    form.partySize = Number(form.partySize)
    form.groupBudgetCny = Number(form.groupBudgetCny)
    wx.setStorageSync('tripDraft', form)
    wx.navigateTo({ url: '/pages/summary/index' })
  }
})
