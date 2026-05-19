export const wechatQrViewContent = {
  error: {
    qrLoadFailed: '获取二维码失败',
    oauthFailed: 'OAuth failed',
  },
  back: '返回',
  title: '微信扫码登录',
  subtitle: '使用微信扫描下方二维码',
  refresh: '重新获取',
  qrAlt: '微信登录二维码',
  scanned: '已扫码，请在微信中确认',
  hint: '打开微信 -> 扫一扫 -> 扫描上方二维码',
  expiredRefresh: '二维码已过期？点击刷新',
  openInBrowser: '在浏览器中打开微信授权页',
  dev: {
    title: 'Dev: simulate WeChat callback',
    placeholder: 'paste WeChat code',
    submit: '提交',
  },
} as const;
