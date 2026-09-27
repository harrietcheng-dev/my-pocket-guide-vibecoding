const { synthesize, prepareAudio } = require('./tts')
let instanceCounter = 0
const labels = { idle: '光墩墩', loading: '正在准备语音…', speaking: '光墩墩正在说话', error: '语音暂不可用' }

Component({
  properties: {
    size: { type: Number, value: 300 },
    showStatus: { type: Boolean, value: true },
    imageBase: { type: String, value: '' },
    ttsFunction: { type: String, value: 'guangdundun-tts' }
  },
  data: {
    frame: 0, status: 'idle', statusLabel: labels.idle,
    // Original sheet: 1381×1139; each viewport is 480×480, excluding captions.
    // Frame 0 uses the gentle smile; supplied sheet has no closed-mouth idle.
    positions: [
      { left: -183.333333, top: -116.666667 },
      { left: -4.166667, top: 0 },
      { left: -93.75, top: 0 },
      { left: -183.333333, top: 0 },
      { left: -4.166667, top: -116.666667 },
      { left: -93.75, top: -116.666667 }
    ]
  },
  lifetimes: {
    attached() {
      this._alive = true
      this._visible = true
      this._id = `${Date.now()}-${++instanceCounter}`
      this._sequence = 0
    },
    detached() {
      this._alive = false
      this._finish('stopped')
    }
  },
  pageLifetimes: {
    hide() { this._visible = false; this.stopSpeak() },
    show() { this._visible = true }
  },
  methods: {
    // provider(text) -> Promise<{ audioUrl } | { audioBase64, format: 'mp3' }>
    setTtsProvider(provider) {
      if (typeof provider !== 'function') throw new Error('TTS provider 必须是函数')
      this.stopSpeak()
      this._provider = provider
    },
    startSpeak(text) {
      this._finish('superseded')
      if (!this._alive || !this._visible) return Promise.resolve({ status: 'stopped' })
      if (typeof text !== 'string' || !text.trim() || text.trim().length > 500) {
        const message = '朗读文字不能为空，且每段最多 500 字'
        this._state('error')
        this.triggerEvent('speecherror', { message })
        return Promise.resolve({ status: 'error', message })
      }
      const request = { id: ++this._sequence }
      this._request = request
      const completion = new Promise(resolve => { request.resolve = resolve })
      this._state('loading')
      // Covers cloud invocation, audio preparation, and initial buffering.
      request.timeout = setTimeout(() => this._fail(request, '语音准备超时，请重试'), 30000)
      const provider = this._provider || (value => synthesize(value, this.properties.ttsFunction))
      Promise.resolve().then(() => provider(text.trim())).then(result => {
        if (!this._current(request)) return null
        return prepareAudio(result, `${this._id}-${request.id}`)
      }).then(asset => {
        if (!asset) return
        if (!this._current(request)) { asset.release(); return }
        request.asset = asset
        const audio = wx.createInnerAudioContext()
        request.audio = audio
        audio.autoplay = false
        audio.loop = false
        audio.onPlay(() => {
          if (!this._current(request)) return
          clearTimeout(request.timeout)
          this._state('speaking')
          this._animate(request)
          this.triggerEvent('speechstart')
          // Guard against a missing ended event or a permanently stalled stream.
          request.timeout = setTimeout(() => this._fail(request, '语音播放超时'), 300000)
        })
        audio.onEnded(() => { if (this._current(request)) this._finish('ended') })
        audio.onStop(() => { if (this._current(request)) this._finish('stopped') })
        audio.onPause(() => { if (this._current(request)) this._finish('stopped') })
        audio.onWaiting(() => {
          if (!this._current(request)) return
          clearInterval(request.interval)
          this.setData({ frame: 0 })
          this._state('loading')
        })
        audio.onTimeUpdate(() => {
          if (this._current(request) && this.data.status === 'loading' && audio.currentTime > 0) {
            this._state('speaking')
            this._animate(request)
          }
        })
        audio.onError(() => this._fail(request, '音频播放失败，请检查音频地址及合法域名配置'))
        audio.src = asset.src
        audio.play()
      }).catch(error => this._fail(request, error.message || '语音合成失败'))
      return completion
    },
    stopSpeak() { this._finish('stopped') },
    _current(request) { return this._alive && this._visible && this._request === request },
    _state(status) {
      if (!this._alive) return
      this.setData({ status, statusLabel: labels[status] })
      this.triggerEvent('statechange', { status })
    },
    _animate(request) {
      clearInterval(request.interval)
      const tick = () => {
        if (!this._current(request)) return
        // Randomly choose one of five mouths without repeating the current frame.
        const frame = this.data.frame ? ((this.data.frame - 1 + 1 + Math.floor(Math.random() * 4)) % 5) + 1 : 1
        this.setData({ frame })
      }
      tick()
      request.interval = setInterval(tick, 150)
    },
    _fail(request, message) {
      if (this._current(request)) this._finish('error', message)
    },
    _finish(status, message) {
      const request = this._request
      this._request = null // Invalidate before stop/destroy can emit callbacks.
      if (request) {
        clearInterval(request.interval)
        clearTimeout(request.timeout)
        if (request.audio) {
          try { request.audio.stop() } catch (_) {}
          try { request.audio.destroy() } catch (_) {}
        }
        if (request.asset) request.asset.release()
        request.resolve({ status, ...(message ? { message } : {}) })
      }
      if (!this._alive) return
      this.setData({ frame: 0 })
      this._state(status === 'error' ? 'error' : 'idle')
      if (request) {
        const event = status === 'ended' ? 'speechend' : status === 'error' ? 'speecherror' : 'speechstop'
        this.triggerEvent(event, { reason: status, ...(message ? { message } : {}) })
      }
    }
  }
})
