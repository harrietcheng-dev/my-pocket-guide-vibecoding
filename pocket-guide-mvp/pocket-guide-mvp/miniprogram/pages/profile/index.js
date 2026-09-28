const travelLibrary = require('../../utils/travel-library')

Page({
  data: { tab: 'favorites', favorites: [], notes: [] },
  onShow() { this.refreshLibrary() },
  refreshLibrary() {
    const formatDate = (value) => value ? String(value).slice(0, 10) : ''
    this.setData({
      favorites: travelLibrary.listFavorites().map((item) => ({ ...item, displayDate: formatDate(item.savedAt) })),
      notes: travelLibrary.listNotes().map((item) => ({ ...item, displayDate: formatDate(item.updatedAt) }))
    })
  },
  switchTab(event) { this.setData({ tab: event.currentTarget.dataset.tab }) },
  openFavorite(event) {
    const favorite = this.data.favorites.find((item) => item.id === event.currentTarget.dataset.id)
    if (!favorite) return
    if (favorite.latitude == null || favorite.longitude == null) return wx.setClipboardData({ data: favorite.name })
    wx.openLocation({
      latitude: Number(favorite.latitude), longitude: Number(favorite.longitude), name: favorite.name,
      address: favorite.reason || favorite.type, scale: 16,
      fail: () => wx.setClipboardData({ data: favorite.name })
    })
  },
  removeFavorite(event) {
    const favorite = this.data.favorites.find((item) => item.id === event.currentTarget.dataset.id)
    if (!favorite) return
    wx.showModal({
      title: '取消收藏？', content: `确认从收藏中移除“${favorite.name}”吗？`, confirmText: '移除', confirmColor: '#d92d20',
      success: ({ confirm }) => { if (confirm) { travelLibrary.removeFavorite(favorite.id); this.refreshLibrary() } }
    })
  },
  openNoteTrip(event) {
    const note = this.data.notes.find((item) => item.id === event.currentTarget.dataset.id)
    if (!note || !note.tripId) return
    wx.setStorageSync('lastViewedTripId', note.tripId)
    wx.switchTab({ url: '/pages/trips/index' })
  },
  removeNote(event) {
    const note = this.data.notes.find((item) => item.id === event.currentTarget.dataset.id)
    if (!note) return
    wx.showModal({
      title: '删除旅行笔记？', content: `“${note.placeName}”的笔记删除后无法恢复。`, confirmText: '删除', confirmColor: '#d92d20',
      success: ({ confirm }) => { if (confirm) { travelLibrary.removeNote(note.id); this.refreshLibrary() } }
    })
  },
  goTrips() { wx.switchTab({ url: '/pages/trips/index' }) }
})
