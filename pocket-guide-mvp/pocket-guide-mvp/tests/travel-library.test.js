const test = require('node:test')
const assert = require('node:assert/strict')

const storage = new Map()
global.wx = {
  getStorageSync(key) { return storage.get(key) },
  setStorageSync(key, value) { storage.set(key, value) }
}

const library = require('../miniprogram/utils/travel-library')

test.beforeEach(() => storage.clear())

test('favorites are deduplicated by place and can be toggled', () => {
  const place = { name: '故宫博物院', type: '景点', latitude: 39.918, longitude: 116.397 }
  const first = library.toggleFavorite(place, { id: 'trip-1', title: '北京一日游' })
  assert.equal(first.saved, true)
  assert.equal(library.listFavorites().length, 1)
  assert.equal(library.isFavorite({ ...place }), true)

  const second = library.toggleFavorite({ ...place }, { id: 'trip-2', title: '另一个行程' })
  assert.equal(second.saved, false)
  assert.equal(library.listFavorites().length, 0)
})

test('a travel note is updated in place for the same trip node', () => {
  const original = library.saveNote({ tripId: 'trip-1', tripTitle: '北京一日游', nodeId: 'node-1', placeName: '故宫博物院', text: '第一次来到这里。' })
  const updated = library.saveNote({ tripId: 'trip-1', tripTitle: '北京一日游', nodeId: 'node-1', placeName: '故宫博物院', text: '中轴线很震撼。' })

  assert.equal(updated.id, original.id)
  assert.equal(library.listNotes().length, 1)
  assert.equal(library.getNote('trip-1', 'node-1').text, '中轴线很震撼。')

  library.removeNote(updated.id)
  assert.equal(library.getNote('trip-1', 'node-1'), null)
})

test('empty and overly long notes are rejected', () => {
  assert.throws(() => library.saveNote({ tripId: '1', nodeId: '1', text: '   ' }), /不能为空/)
  assert.throws(() => library.saveNote({ tripId: '1', nodeId: '1', text: 'a'.repeat(501) }), /500/)
})
