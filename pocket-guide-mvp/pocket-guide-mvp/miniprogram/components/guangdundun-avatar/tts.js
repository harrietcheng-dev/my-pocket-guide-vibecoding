// Only the cloud function holds provider credentials. Pages may inject their own provider.
function synthesize(text, functionName) {
  if (!wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('请初始化 wx.cloud，或调用 setTtsProvider 接入自己的 TTS 接口'))
  }
  return wx.cloud.callFunction({ name: functionName, data: { text } }).then(({ result }) => {
    if (!result || result.error) throw new Error((result && result.error) || 'TTS 返回为空')
    return result
  })
}

function prepareAudio(result, id) {
  if (result && typeof result.audioUrl === 'string' && /^https:\/\//.test(result.audioUrl)) {
    return Promise.resolve({ src: result.audioUrl, release() {} })
  }
  if (!result || result.format !== 'mp3' || typeof result.audioBase64 !== 'string' || !result.audioBase64.length || result.audioBase64.length > 2500000) {
    return Promise.reject(new Error('TTS 需要返回 HTTPS audioUrl，或 MP3 格式的 audioBase64'))
  }
  const fs = wx.getFileSystemManager()
  const filePath = `${wx.env.USER_DATA_PATH}/guangdundun-${id}.mp3`
  return new Promise((resolve, reject) => {
    fs.writeFile({
      filePath, data: result.audioBase64, encoding: 'base64',
      success: () => resolve({ src: filePath, release() { fs.unlink({ filePath, fail() {} }) } }),
      fail: () => reject(new Error('无法保存合成音频'))
    })
  })
}

module.exports = { synthesize, prepareAudio }
