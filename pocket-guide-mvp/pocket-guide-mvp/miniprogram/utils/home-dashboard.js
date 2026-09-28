function tripDate(trip, field) {
  return String((trip.constraints || {})[field] || '')
}

function decorateTrip(trip) {
  const constraints = trip.constraints || {}
  return {
    ...trip,
    dateRange: constraints.startDate && constraints.endDate ? `${constraints.startDate} 至 ${constraints.endDate}` : '日期待定',
    dayCount: (trip.days || []).length
  }
}

function summarizeActiveTrip(trip) {
  if (!trip) return null
  const nodes = (trip.days || []).reduce((all, day) => all.concat(day.nodes || []), [])
  const completedCount = nodes.filter((item) => item.status === 'COMPLETED').length
  const inProgress = nodes.find((item) => item.status === 'IN_PROGRESS')
  const focusNode = inProgress || nodes.find((item) => item.status === 'PLANNED') || null
  const focusIndex = focusNode ? nodes.findIndex((item) => item.id === focusNode.id) : -1
  const nextNode = focusIndex >= 0 ? nodes.slice(focusIndex + 1).find((item) => item.status === 'PLANNED') || null : null
  return {
    ...decorateTrip(trip),
    completedCount,
    totalCount: nodes.length,
    progressPercent: nodes.length ? Math.round(completedCount / nodes.length * 100) : 0,
    focusNode,
    nextNode,
    focusLabel: inProgress ? '正在参观' : '下一站'
  }
}

function buildHomeDashboard(trips, currentTripId) {
  const allTrips = Array.isArray(trips) ? trips : []
  const activeTrip = allTrips.find((item) => item.state === 'ACTIVE') || null
  const upcoming = allTrips
    .filter((item) => ['READY', 'CONFIRMED', 'DRAFT'].includes(item.state))
    .map(decorateTrip)
    .sort((a, b) => {
      if (a.id === currentTripId) return -1
      if (b.id === currentTripId) return 1
      return tripDate(a, 'startDate').localeCompare(tripDate(b, 'startDate'))
    })
    .slice(0, 3)
  const recentCompleted = allTrips
    .filter((item) => item.state === 'COMPLETED')
    .map(decorateTrip)
    .sort((a, b) => tripDate(b, 'endDate').localeCompare(tripDate(a, 'endDate')))[0] || null
  return {
    activeTrip: summarizeActiveTrip(activeTrip),
    upcoming,
    recentCompleted,
    totalTrips: allTrips.length
  }
}

module.exports = { decorateTrip, summarizeActiveTrip, buildHomeDashboard }
