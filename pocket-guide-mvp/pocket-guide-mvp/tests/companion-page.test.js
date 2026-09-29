const test = require('node:test')
const assert = require('node:assert/strict')

global.wx = {
  request({ fail }) { fail(new Error('offline test')) }
}

let pageConfig
global.Page = (config) => { pageConfig = config }
require('../miniprogram/pages/companion/index')

function makeNode(id, status) {
  return { id, name: `景点${id}`, status, durationMin: 60, latitude: 39.9, longitude: 116.4 }
}

function makeContext(trip) {
  return {
    data: JSON.parse(JSON.stringify(pageConfig.data)),
    loadedTripId: null,
    setData(update) { Object.assign(this.data, update) },
    trip
  }
}

test('route targets the current planned node before check-in', () => {
  const trip = { id: 'trip-1', state: 'READY', days: [{ nodes: [makeNode('1', 'PLANNED'), makeNode('2', 'PLANNED')] }] }
  const context = makeContext(trip)

  pageConfig.prepareTrip.call(context, trip)

  assert.equal(context.data.currentNode.id, '1')
  assert.equal(context.data.routeTarget.id, '1')
  assert.equal(context.data.routeLabel, '本次目的地')
  assert.equal(context.data.progressText, '已完成 0/2')
})

test('route advances only after the current node is in progress', () => {
  const trip = { id: 'trip-2', state: 'ACTIVE', days: [{ nodes: [makeNode('1', 'IN_PROGRESS'), makeNode('2', 'PLANNED')] }] }
  const context = makeContext(trip)

  pageConfig.prepareTrip.call(context, trip)

  assert.equal(context.data.currentNode.id, '1')
  assert.equal(context.data.routeTarget.id, '2')
  assert.equal(context.data.routeLabel, '接下来参观')
})

test('all terminal nodes show completion instead of restarting at the first node', () => {
  const trip = { id: 'trip-3', state: 'ACTIVE', days: [{ nodes: [makeNode('1', 'COMPLETED'), makeNode('2', 'COMPLETED')] }] }
  const context = makeContext(trip)

  pageConfig.prepareTrip.call(context, trip)

  assert.equal(context.data.tripCompleted, true)
  assert.equal(context.data.currentNode, null)
  assert.equal(context.data.routeTarget, null)
  assert.equal(context.data.progressPercent, 100)
})

test('nearby map action opens the selected place coordinates', () => {
  let opened
  global.wx.showActionSheet = ({ success }) => success({ tapIndex: 0 })
  global.wx.openLocation = (options) => { opened = options }
  const item = { name: '游客中心卫生间', type: '公共设施', latitude: 39.921, longitude: 116.401 }

  pageConfig.openNearby.call({}, { currentTarget: { dataset: { item } } })

  assert.equal(opened.name, item.name)
  assert.equal(opened.latitude, item.latitude)
  assert.equal(opened.longitude, item.longitude)
})
