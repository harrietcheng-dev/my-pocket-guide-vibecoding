const FAVORITES_KEY = 'pocketGuideFavorites'
const NOTES_KEY = 'pocketGuideNotes'

const clone = (value) => JSON.parse(JSON.stringify(value))

function readList(key) {
  const value = wx.getStorageSync(key)
  return Array.isArray(value) ? value : []
}

function writeList(key, value) {
  wx.setStorageSync(key, value)
  return clone(value)
}

function placeKey(place) {
  const latitude = place.latitude == null ? '' : Number(place.latitude).toFixed(5)
  const longitude = place.longitude == null ? '' : Number(place.longitude).toFixed(5)
  return `${String(place.name || '').trim()}|${latitude}|${longitude}`
}

function listFavorites() {
  return clone(readList(FAVORITES_KEY).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))))
}

function isFavorite(place) {
  const key = placeKey(place)
  return readList(FAVORITES_KEY).some((item) => item.placeKey === key)
}

function toggleFavorite(place, trip = {}) {
  const favorites = readList(FAVORITES_KEY)
  const key = placeKey(place)
  const index = favorites.findIndex((item) => item.placeKey === key)
  if (index >= 0) {
    favorites.splice(index, 1)
    writeList(FAVORITES_KEY, favorites)
    return { saved: false, favorites: clone(favorites) }
  }
  favorites.unshift({
    id: `favorite_${Date.now()}_${favorites.length}`,
    placeKey: key,
    name: place.name,
    type: place.type || '地点',
    reason: place.reason || '',
    latitude: place.latitude,
    longitude: place.longitude,
    tripId: trip.id || '',
    tripTitle: trip.title || '',
    savedAt: new Date().toISOString()
  })
  writeList(FAVORITES_KEY, favorites)
  return { saved: true, favorites: clone(favorites) }
}

function removeFavorite(id) {
  return writeList(FAVORITES_KEY, readList(FAVORITES_KEY).filter((item) => item.id !== id))
}

function listNotes() {
  return clone(readList(NOTES_KEY).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))))
}

function getNote(tripId, nodeId) {
  const note = readList(NOTES_KEY).find((item) => item.tripId === tripId && item.nodeId === nodeId)
  return note ? clone(note) : null
}

function saveNote({ tripId, tripTitle, nodeId, placeName, text }) {
  const value = String(text || '').trim()
  if (!value) throw new Error('笔记内容不能为空')
  if (value.length > 500) throw new Error('笔记最多 500 字')
  const notes = readList(NOTES_KEY)
  const index = notes.findIndex((item) => item.tripId === tripId && item.nodeId === nodeId)
  const now = new Date().toISOString()
  const note = {
    id: index >= 0 ? notes[index].id : `note_${Date.now()}_${notes.length}`,
    tripId,
    tripTitle,
    nodeId,
    placeName,
    text: value,
    createdAt: index >= 0 ? notes[index].createdAt : now,
    updatedAt: now
  }
  if (index >= 0) notes[index] = note
  else notes.unshift(note)
  writeList(NOTES_KEY, notes)
  return clone(note)
}

function removeNote(id) {
  return writeList(NOTES_KEY, readList(NOTES_KEY).filter((item) => item.id !== id))
}

module.exports = {
  placeKey,
  listFavorites,
  isFavorite,
  toggleFavorite,
  removeFavorite,
  listNotes,
  getNote,
  saveNote,
  removeNote
}
