// WeChat cloud function. Credentials must only be configured in cloud environment variables.
const https = require('node:https')
const escapeXml = text => text.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]))

exports.main = async (event) => {
  const text = event && event.text
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 500) return { error: '文字长度须为 1～500 字' }
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region || !/^[a-z0-9-]+$/.test(region)) return { error: '请在云函数配置 AZURE_SPEECH_KEY 和 AZURE_SPEECH_REGION' }
  const ssml = `<speak version="1.0" xml:lang="zh-CN"><voice name="zh-CN-XiaoxiaoNeural">${escapeXml(text.trim())}</voice></speak>`
  try {
    const audio = await new Promise((resolve, reject) => {
      let timeout
      const fail = error => {
        if (timeout) clearTimeout(timeout)
        reject(error)
      }
      const request = https.request({
        hostname: `${region}.tts.speech.microsoft.com`,
        path: '/cognitiveservices/v1', method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
          'Content-Length': Buffer.byteLength(ssml)
        }
      }, response => {
        if (response.statusCode !== 200) {
          response.resume()
          fail(new Error('TTS provider rejected request'))
          return
        }
        const chunks = []
        let size = 0
        response.on('data', chunk => {
          size += chunk.length
          if (size > 1800000) { request.destroy(new Error('Audio too large')); return }
          chunks.push(chunk)
        })
        response.on('end', () => resolve(Buffer.concat(chunks)))
        response.on('error', fail)
        response.on('aborted', () => fail(new Error('Audio interrupted')))
      })
      timeout = setTimeout(() => request.destroy(new Error('TTS timeout')), 20000)
      request.on('close', () => clearTimeout(timeout))
      request.on('error', fail)
      request.end(ssml)
    })
    if (!audio.length) throw new Error('Empty audio')
    return { audioBase64: audio.toString('base64'), format: 'mp3' }
  } catch (_) {
    return { error: '语音合成失败，请检查 TTS 服务配置、配额及云函数网络' }
  }
}
