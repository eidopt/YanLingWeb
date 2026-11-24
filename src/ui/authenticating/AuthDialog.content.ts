export const authDialogContent = {
  tabs: {
    login: '登录',
    register: '注册',
  },

  login: {
    title: '欢迎回来',
    sub: '登录你的账号，继续创作',
    identifierLabel: '账号',
    identifierPlaceholder: '用户名 / 邮箱 / 手机号',
    passwordLabel: '密码',
    passwordPlaceholder: '请输入密码',
    forgotPassword: '忘记密码？',
    submitBtn: '登录',
    submittingBtn: '登录中...',
    switchHint: '还没有账号？',
    switchLink: '立即注册',
  },

  register: {
    title: '创建账号',
    sub: '免费注册，开始你的 AI 设计之旅',
    nameLabel: '用户名',
    namePlaceholder: '设置你的用户名',
    emailLabel: '邮箱（选填）',
    emailPlaceholder: '请输入邮箱地址',
    passwordLabel: '密码',
    passwordPlaceholder: '至少 8 位字符',
    confirmLabel: '确认密码',
    confirmPlaceholder: '再次输入密码',
    submitBtn: '免费注册',
    submittingBtn: '注册中...',
    switchHint: '已有账号？',
    switchLink: '直接登录',
    terms: '注册即代表同意',
    termsLink: '服务协议',
    and: '与',
    privacyLink: '隐私政策',
  },

  divider: '或',

  social: {
    wechat: '微信快捷登录',
    phone: '手机号登录',
  },

  error: {
    unknown: '操作失败，请稍后重试',
    passwordMismatch: '两次输入的密码不一致',
    passwordTooShort: '密码至少需要 8 位字符',

    // Backend errorCode → user-friendly Chinese messages
    byCode: {
      INVALID_CREDENTIALS: '账号或密码错误',
      INVALID_NONCE: '登录会话已过期，请重新登录',
      ALREADY_EXISTS: '用户名、邮箱或手机号已被使用',
      ACCOUNT_DISABLED: '账号已停用',
      VALIDATION_ERROR: '输入格式不正确',
    } as Record<string, string>,
  },

  close: '关闭',
} as const;
