const store = require('../../utils/profile-store')

function toMultiOptions(values, selected) {
  return values.map((value) => ({ value, selected: selected.indexOf(value) >= 0 }))
}

function toSingleOptions(values, selected) {
  return values.map((value) => ({ value, selected: value === selected }))
}

Page({
  data: {
    interestOptions: [],
    paceOptions: [],
    transportOptions: [],
    dietOptions: [],
    lodgingOptions: [],
    accessibilityOptions: [],
    healthOptions: [],
    companionOptions: [],
    perCapitaBudget: store.PER_CAPITA_BUDGET_DEFAULT,
    saving: false
  },
  onLoad() {
    this.loadPreferences()
  },
  loadPreferences() {
    const prefs = store.getPreferences()
    this.setData({
      interestOptions: toMultiOptions(store.INTEREST_OPTIONS, prefs.interests),
      paceOptions: toSingleOptions(store.PACE_OPTIONS, prefs.pace),
      transportOptions: toMultiOptions(store.TRANSPORT_OPTIONS, prefs.transportModes),
      dietOptions: toMultiOptions(store.DIET_OPTIONS, prefs.dietRestrictions),
      lodgingOptions: toSingleOptions(store.LODGING_OPTIONS, prefs.lodging),
      accessibilityOptions: toMultiOptions(store.ACCESSIBILITY_OPTIONS, prefs.accessibility),
      healthOptions: toMultiOptions(store.HEALTH_OPTIONS, prefs.healthNeeds),
      companionOptions: toMultiOptions(store.COMPANION_OPTIONS, prefs.companions),
      perCapitaBudget: prefs.perCapitaBudget
    })
  },
  toggleMulti(event) {
    const { field, value } = event.currentTarget.dataset
    this.setData({
      [field]: this.data[field].map((item) => (item.value === value ? { ...item, selected: !item.selected } : item))
    })
  },
  pickSingle(event) {
    const { field, value } = event.currentTarget.dataset
    this.setData({
      [field]: this.data[field].map((item) => ({ ...item, selected: item.value === value }))
    })
  },
  inputBudget(event) {
    this.setData({ perCapitaBudget: event.detail.value })
  },
  collect() {
    const selected = (field) => this.data[field].filter((item) => item.selected).map((item) => item.value)
    const single = (field) => {
      const hit = this.data[field].find((item) => item.selected)
      return hit ? hit.value : ''
    }
    return {
      interests: selected('interestOptions'),
      pace: single('paceOptions') || '适中',
      transportModes: selected('transportOptions'),
      perCapitaBudget: Number(this.data.perCapitaBudget) || store.PER_CAPITA_BUDGET_DEFAULT,
      dietRestrictions: selected('dietOptions'),
      lodging: single('lodgingOptions'),
      accessibility: selected('accessibilityOptions'),
      healthNeeds: selected('healthOptions'),
      companions: selected('companionOptions')
    }
  },
  save() {
    if (this.data.saving) return
    const value = this.collect()
    if (!value.transportModes.length) {
      return wx.showToast({ title: '请至少选择一种交通方式', icon: 'none' })
    }
    this.setData({ saving: true })
    store.savePreferences(value)
    this.setData({ saving: false })
    wx.showToast({ title: '已保存，新建行程会自动带入', icon: 'success' })
  },
  reset() {
    wx.showModal({
      title: '恢复默认偏好？',
      content: '已选择的兴趣、节奏和特殊需求会被清空，下次新建行程将使用默认值。',
      confirmText: '恢复默认',
      confirmColor: '#d92d20',
      success: ({ confirm }) => {
        if (!confirm) return
        store.resetPreferences()
        this.loadPreferences()
        wx.showToast({ title: '已恢复默认', icon: 'success' })
      }
    })
  }
})
