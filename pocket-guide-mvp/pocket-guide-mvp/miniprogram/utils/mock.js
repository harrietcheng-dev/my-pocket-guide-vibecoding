const storageKey = 'pocketGuideTrips'
const pendingEdits = {}
let tripSequence = 0
const clone = (value) => JSON.parse(JSON.stringify(value))
const readTrips = () => wx.getStorageSync(storageKey) || []
const writeTrips = (trips) => wx.setStorageSync(storageKey, trips)

function node(time, name, type, cost, durationMin, longitude, latitude, reason) {
  return {
    id: `${name}_${time}`,
    time,
    name,
    type,
    costRange: [cost, cost + Math.max(20, Math.round(cost * 0.25))],
    durationMin,
    longitude,
    latitude,
    reason,
    status: 'PLANNED'
  }
}

function makeTrip(constraints) {
  const id = `trip_${Date.now()}_${++tripSequence}`
  const city = constraints.city || '北京'
  return {
    id,
    state: 'READY',
    version: 1,
    title: `${city}${constraints.days || 4}日游`,
    constraints,
    costSummary: {
      tickets: [360, 460],
      food: [720, 960],
      transport: [180, 260],
      other: [80, 160],
      total: [1340, 1840]
    },
    days: [
      {
        dayIndex: 1,
        dateLabel: 'Day 1',
        walkDistanceKm: 5.6,
        nodes: [
          node('08:30', '天安门广场', '景点', 0, 90, 116.3975, 39.9087, '城市地标，适合清晨到达'),
          node('10:10', '故宫博物院', '景点', 120, 210, 116.3970, 39.9180, '历史文化核心地点，需提前预约'),
          node('13:00', '午餐区域', '餐饮', 80, 100, 116.4050, 39.9200, '优先选择附近平价餐饮'),
          node('14:30', '景山公园', '景点', 20, 90, 116.3966, 39.9250, '俯瞰故宫中轴线')
        ]
      },
      {
        dayIndex: 2,
        dateLabel: 'Day 2',
        walkDistanceKm: 4.2,
        nodes: [
          node('09:00', '天坛公园', '景点', 34, 150, 116.4173, 39.8822, '体验古代祭祀建筑群'),
          node('12:00', '午餐区域', '餐饮', 90, 90, 116.4250, 39.8890, '安排休息，避免连续步行'),
          node('14:00', '国家博物馆', '景点', 0, 180, 116.4010, 39.9036, '室内文化体验，需预约')
        ]
      },
      {
        dayIndex: 3,
        dateLabel: 'Day 3',
        walkDistanceKm: 6.1,
        nodes: [
          node('08:30', '颐和园', '景点', 30, 210, 116.2732, 39.9999, '皇家园林与湖景'),
          node('13:30', '午餐与休息', '休息', 80, 90, 116.2900, 39.9900, '预留恢复体力时间'),
          node('15:20', '圆明园', '景点', 25, 150, 116.3036, 40.0081, '历史遗址与园林空间')
        ]
      },
      {
        dayIndex: 4,
        dateLabel: 'Day 4',
        walkDistanceKm: 3.8,
        nodes: [
          node('09:30', '什刹海', '景点', 0, 120, 116.3850, 39.9402, '轻松城市漫步'),
          node('12:00', '午餐区域', '餐饮', 100, 90, 116.3900, 39.9350, '体验北京风味'),
          node('14:00', '南锣鼓巷', '景点', 0, 120, 116.4030, 39.9370, '街区漫步与伴手礼')
        ]
      }
    ],
    validationSummary: {
      routeChecked: true,
      budgetChecked: true,
      unverifiedFields: ['部分临时公告请出发前复核']
    }
  }
}

function buildEditCandidate(trip, operations) {
  const candidate = clone(trip)
  const snapshot = clone(trip)
  delete snapshot.previousSnapshot
  const changes = []
  const affectedDays = new Set()
  operations.forEach((operation) => {
    const day = candidate.days.find((item) => item.dayIndex === operation.dayIndex)
    if (!day) throw new Error(`第 ${operation.dayIndex} 天不存在`)
    const index = day.nodes.findIndex((item) => item.id === operation.nodeId)
    if (['delete', 'replace', 'move'].includes(operation.action)) {
      if (index < 0) throw new Error('要编辑的行程节点不存在')
      if (day.nodes[index].status !== 'PLANNED') throw new Error('已完成或正在进行的节点不能修改')
    }
    if (operation.action === 'delete') {
      if (day.nodes.length <= 1) throw new Error('每天至少保留一个行程节点')
      changes.push(`删除第 ${day.dayIndex} 天的${day.nodes[index].name}`)
      day.nodes.splice(index, 1)
    } else if (operation.action === 'move') {
      const lockedCount = day.nodes.filter((item) => item.status !== 'PLANNED').length
      if (operation.targetIndex < lockedCount) throw new Error('不能把未开始节点移动到已发生行程之前')
      const moved = day.nodes.splice(index, 1)[0]
      day.nodes.splice(Math.max(0, Math.min(operation.targetIndex, day.nodes.length)), 0, moved)
      changes.push(`调整第 ${day.dayIndex} 天${moved.name}的顺序`)
    } else if (operation.action === 'replace') {
      const original = day.nodes[index]
      day.nodes[index] = { ...original, ...operation.node, status: 'PLANNED' }
      changes.push(`将第 ${day.dayIndex} 天的${original.name}替换为${operation.node.name}`)
    } else if (operation.action === 'add') {
      const added = { id: `manual_${Date.now()}_${day.nodes.length}`, time: '09:00', ...operation.node, status: 'PLANNED' }
      const lockedCount = day.nodes.filter((item) => item.status !== 'PLANNED').length
      const target = operation.targetIndex == null ? day.nodes.length : Math.max(lockedCount, Math.min(operation.targetIndex, day.nodes.length))
      day.nodes.splice(target, 0, added)
      changes.push(`在第 ${day.dayIndex} 天新增${added.name}`)
    }
    affectedDays.add(day.dayIndex)
  })
  candidate.days.filter((day) => affectedDays.has(day.dayIndex)).forEach((day) => recalculateMockDay(day, candidate.constraints))
  candidate.previousSnapshot = snapshot
  candidate.version += 1
  candidate.lastAdjustment = `手动编辑了 ${changes.length} 处安排`
  candidate.costSummary = recalculateMockCosts(candidate)
  return { candidate, changes }
}

function recalculateMockDay(day, constraints) {
  const [hour, minute] = (constraints.dailyStart || '09:00').split(':').map(Number)
  let cursor = hour * 60 + minute
  day.nodes.forEach((item, index) => {
    if (item.status === 'PLANNED') item.time = `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`
    else {
      const [fixedHour, fixedMinute] = String(item.time || constraints.dailyStart || '09:00').split(':').map(Number)
      cursor = Math.max(cursor, fixedHour * 60 + fixedMinute)
    }
    cursor += Number(item.durationMin || 90) + (index < day.nodes.length - 1 ? 30 : 0)
  })
  const [endHour, endMinute] = (constraints.dailyEnd || '21:00').split(':').map(Number)
  if (cursor > endHour * 60 + endMinute) throw new Error(`${day.dateLabel} 调整后超出每日结束时间`)
  day.walkDistanceKm = Math.round(Math.max(1.2, day.nodes.length * 1.25) * 10) / 10
}

function recalculateMockCosts(trip) {
  const result = { tickets: [0, 0], food: [0, 0], transport: [0, 0], other: [0, 0] }
  trip.days.forEach((day) => day.nodes.forEach((item) => {
    const key = item.type === '餐饮' ? 'food' : item.type === '交通' ? 'transport' : item.type === '景点' ? 'tickets' : 'other'
    result[key][0] += Number(item.costRange[0])
    result[key][1] += Number(item.costRange[1])
  }))
  result.total = [Object.values(result).reduce((sum, value) => sum + value[0], 0), Object.values(result).reduce((sum, value) => sum + value[1], 0)]
  return result
}

module.exports = {
  createTrip(constraints) {
    const trip = makeTrip(constraints)
    const trips = readTrips()
    trips.unshift(trip)
    writeTrips(trips)
    wx.setStorageSync('currentTripId', trip.id)
    return Promise.resolve(clone(trip))
  },
  getTrip(id) {
    return Promise.resolve(clone(readTrips().find((item) => item.id === id) || null))
  },
  listTrips() {
    return Promise.resolve(clone(readTrips()))
  },
  cancelTrip(id) {
    const trips = readTrips()
    const trip = trips.find((item) => item.id === id)
    if (!trip) return Promise.reject(new Error('行程不存在'))
    if (trip.state === 'COMPLETED') return Promise.reject(new Error('已完成的行程不能取消'))
    trip.days.forEach((day) => day.nodes.forEach((item) => {
      if (['PLANNED', 'IN_PROGRESS'].includes(item.status)) item.status = 'CANCELLED'
    }))
    trip.state = 'CANCELLED'
    writeTrips(trips)
    return Promise.resolve(clone(trip))
  },
  previewEdits(id, operations) {
    const trip = readTrips().find((item) => item.id === id)
    if (!trip) return Promise.reject(new Error('行程不存在'))
    try {
      const { candidate, changes } = buildEditCandidate(trip, operations)
      const editId = `edit_${Date.now()}`
      pendingEdits[editId] = { tripId: id, baseVersion: trip.version, candidate }
      return Promise.resolve({
        id: editId,
        tripId: id,
        summary: candidate.lastAdjustment,
        changes,
        affectedDays: [...new Set(operations.map((item) => item.dayIndex))],
        costBefore: trip.costSummary.total,
        costAfter: candidate.costSummary.total
      })
    } catch (error) {
      return Promise.reject(error)
    }
  },
  confirmEdits(id, editId) {
    const edit = pendingEdits[editId]
    const trips = readTrips()
    const index = trips.findIndex((item) => item.id === id)
    if (!edit || edit.tripId !== id || index < 0) return Promise.reject(new Error('编辑方案不存在'))
    if (trips[index].version !== edit.baseVersion) return Promise.reject(new Error('行程已发生变化，请重新编辑'))
    trips[index] = edit.candidate
    delete pendingEdits[editId]
    writeTrips(trips)
    return Promise.resolve(clone(trips[index]))
  },
  generateTrip(id) {
    return this.getTrip(id)
  },
  checkIn(id, nodeId) {
    const trips = readTrips()
    const trip = trips.find((item) => item.id === id)
    if (!trip) return Promise.reject(new Error('行程不存在'))
    if (trip.state === 'COMPLETED') return Promise.reject(new Error('行程已结束，不能继续签到'))
    if (trip.state === 'CANCELLED') return Promise.reject(new Error('行程已取消，不能继续签到'))
    const otherActive = trips.find((item) => item.id !== id && item.state === 'ACTIVE')
    if (otherActive) return Promise.reject(new Error(`“${otherActive.title}”正在进行，请先完成或取消它`))
    let checkedNode = null
    const nodes = trip.days.reduce((all, day) => all.concat(day.nodes), [])
    const targetIndex = nodes.findIndex((item) => item.id === nodeId)
    const activeIndex = nodes.findIndex((item) => item.status === 'IN_PROGRESS')
    if (targetIndex < 0) return Promise.reject(new Error('行程节点不存在'))
    if (activeIndex > targetIndex) return Promise.reject(new Error('后续节点正在进行，不能回退签到'))
    if (activeIndex >= 0 && activeIndex !== targetIndex) nodes[activeIndex].status = 'COMPLETED'
    nodes.forEach((item) => {
      if (item.id === nodeId) {
        item.status = 'IN_PROGRESS'
        checkedNode = item
      }
    })
    trip.state = 'ACTIVE'
    writeTrips(trips)
    return Promise.resolve({ trip: clone(trip), node: clone(checkedNode), guide: guideFor(checkedNode ? checkedNode.name : '当前景点') })
  },
  completeNode(id, nodeId) {
    const trips = readTrips()
    const trip = trips.find((item) => item.id === id)
    if (!trip) return Promise.reject(new Error('行程不存在'))
    const node = trip.days.reduce((all, day) => all.concat(day.nodes), []).find((item) => item.id === nodeId)
    if (!node || node.status !== 'IN_PROGRESS') return Promise.reject(new Error('只有正在进行的节点可以完成'))
    node.status = 'COMPLETED'
    const nodes = trip.days.reduce((all, day) => all.concat(day.nodes), [])
    if (nodes.length && nodes.every((item) => ['COMPLETED', 'SKIPPED', 'CANCELLED'].includes(item.status))) {
      trip.state = 'COMPLETED'
    }
    writeTrips(trips)
    return Promise.resolve({ trip: clone(trip), node: clone(node) })
  },
  getGuide(placeId, name, depth) {
    const guide = guideFor(name || placeId)
    if (depth === 'detail') guide.text += ' 参观时还可以留意建筑轴线、屋顶形制和空间层次。'
    return Promise.resolve(guide)
  },
  getNearby(category, location = {}) {
    const samples = {
      '美食': [['简餐与茶歇', '餐饮', 320], ['故宫角楼咖啡', '餐饮', 680]],
      '卫生间': [['公共卫生间', '公共设施', 180], ['游客中心卫生间', '公共设施', 460]],
      '休息': [['游客休息区', '休息点', 120], ['东华门休息点', '休息点', 520]],
      '医院': [['北京医院', '正规医院', 2100], ['协和医院东单院区', '正规医院', 2800]],
      '交通': [['东华门公交站', '公交站', 410], ['金鱼胡同地铁站', '地铁站', 960]]
    }
    const baseLatitude = location.latitude == null ? 39.9180 : Number(location.latitude)
    const baseLongitude = location.longitude == null ? 116.3970 : Number(location.longitude)
    const items = (samples[category] || samples['休息']).map((item, index) => ({
      id: `${category}-${index}`,
      name: item[0],
      type: item[1],
      distanceM: item[2],
      latitude: Number((baseLatitude + (index + 1) * 0.0012).toFixed(6)),
      longitude: Number((baseLongitude + (index + 1) * 0.0015).toFixed(6))
    }))
    return Promise.resolve({ category, items, locationUsed: location.latitude != null && location.longitude != null })
  },
  askQuestion(id, text) {
    let reply = '这是当前景点的演示问答。接入知识服务后，我会提供带来源和查询时间的回答。'
    let action = null
    if (/不舒服|胸痛|受伤|危险|报警|医院|药店/.test(text)) {
      reply = '如果你或同行者身体不适或遇到危险，请尽快联系 120、110 或附近正规机构。我已为你准备附近医院列表。'
      action = 'nearby_hospital'
    } else if (/卫生间|厕所/.test(text)) {
      reply = '可以，已为你准备附近卫生间列表。当前距离为演示数据。'
      action = 'nearby_toilet'
    } else if (/累|少走|下雨|早点结束|不想去/.test(text)) {
      reply = '可以。我会保留已完成和正在进行的节点，只调整后续安排，确认后才会应用。'
      action = 'replan'
    }
    return Promise.resolve({ id: `message_${Date.now()}`, reply, action })
  },
  createReplan(id, request) {
    const trip = readTrips().find((item) => item.id === id)
    if (!trip) return Promise.reject(new Error('行程不存在'))
    return Promise.resolve({
      id: `replan_${Date.now()}`,
      tripId: id,
      request,
      summary: '保留已完成节点，减少后续步行并增加休息时间',
      changes: [
        '将圆明园替换为国家博物馆室内参观',
        '增加 45 分钟休息时间',
        '预计步行减少 3.2 公里',
        '预计费用增加 20–45 元'
      ],
      walkingDeltaKm: -3.2,
      costDelta: [20, 45]
    })
  },
  applyReplan(id, replan) {
    const trips = readTrips()
    const index = trips.findIndex((item) => item.id === id)
    if (index < 0) return Promise.reject(new Error('行程不存在'))
    const trip = trips[index]
    trip.previousSnapshot = clone(trip)
    trip.version += 1
    trip.lastAdjustment = replan.summary
    let replaced = false
    trip.days.forEach((day) => {
      if (replaced) return
      const nodeIndex = day.nodes.findIndex((item) => item.name === '圆明园' && item.status === 'PLANNED')
      if (nodeIndex >= 0) {
        day.walkDistanceKm = Math.max(0, Math.round((day.walkDistanceKm - 3.2) * 10) / 10)
        day.nodes[nodeIndex] = node('15:00', '国家博物馆', '景点', 0, 180, 116.4010, 39.9036, '减少步行并改为室内参观')
        replaced = true
      }
    })
    trips[index] = trip
    writeTrips(trips)
    return Promise.resolve(clone(trip))
  },
  undo(id) {
    const trips = readTrips()
    const index = trips.findIndex((item) => item.id === id)
    if (index < 0 || !trips[index].previousSnapshot) return Promise.reject(new Error('没有可撤销版本'))
    const restored = trips[index].previousSnapshot
    delete restored.previousSnapshot
    trips[index] = restored
    writeTrips(trips)
    return Promise.resolve(clone(restored))
  }
}

function guideFor(name) {
  return {
    title: `${name}短讲解`,
    text: name === '故宫博物院'
      ? '这里是故宫博物院，始建于明永乐年间，曾是明清两代皇宫。参观时建议先看中轴线三大殿，再按体力选择东西六宫。'
      : `${name}是本次行程的重要一站。我会结合已审核资料介绍核心看点。`,
    durationSec: 42,
    sourceTitle: '团队审核文旅资料（比赛演示）',
    fetchedAt: '2026-09-27',
    confidence: 'PARTIAL'
  }
}
