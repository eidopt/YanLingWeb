/**
 * rpx（小程序响应式长度单位）→ px 归一化。
 *
 * 设计稿约定 750rpx = 375px 屏宽，即 1rpx = 0.5px。
 * 历史 AI 模板在 props.style 里残留了 rpx（生成提示词已禁止但仍有漂移），
 * 浏览器不识别 rpx 会丢弃整条声明，导致尺寸/间距全部失效。
 * 渲染器（coreAliases/styleResolvers）与 React 源码导出器（styleCompiler）
 * 统一在这里兜底转换，避免两条链路各自打补丁。
 */
const RPX_PATTERN = /(-?\d+(?:\.\d+)?)rpx\b/gi;

const RPX_TO_PX_RATIO = 0.5;

/** 把字符串值里的所有 rpx 长度换算成 px（如 "20rpx 20rpx 0" → "10px 10px 0"）。 */
export function normalizeRpxUnits<T>(value: T): T {
  if (typeof value !== 'string' || !/rpx/i.test(value)) {
    return value;
  }
  return value.replace(RPX_PATTERN, (_match, num: string) => {
    const px = Number.parseFloat(num) * RPX_TO_PX_RATIO;
    return `${Math.round(px * 100) / 100}px`;
  }) as T;
}

/** 批量归一化样式记录里的字符串值（sanitizeInlineStyle 之后的兜底步骤）。 */
export function normalizeStyleRecordUnits<T extends Record<string, unknown>>(style: T): T {
  return Object.fromEntries(
    Object.entries(style).map(([key, value]) => [
      key,
      typeof value === 'string' ? normalizeRpxUnits(value) : value,
    ]),
  ) as T;
}
