import fs from 'node:fs';
import path from 'node:path';

const root = 'templates_json';
const labels = {
  accept: '文件类型',
  action: '上传地址',
  actionLabel: '按钮文案',
  active: '激活',
  activeTab: '当前标签',
  align: '对齐',
  alignItems: '交叉轴对齐',
  alt: '替代文本',
  animated: '动画效果',
  arrow: '显示箭头',
  autoplay: '自动播放',
  body: '正文',
  bordered: '显示边框',
  cancelText: '取消文案',
  checked: '已选中',
  chrome: '外壳样式',
  closable: '可关闭',
  collapsed: '折叠',
  columns: '列配置',
  confirmText: '确认文案',
  controls: '控制栏',
  count: '数量',
  current: '当前页',
  data: '数据',
  description: '描述',
  direction: '方向',
  disabled: '禁用',
  dot: '红点',
  duration: '持续时间',
  endValue: '结束值',
  expanded: '展开',
  expandAll: '全部展开',
  fixed: '固定定位',
  format: '格式',
  gap: '间距',
  group: '分组',
  headerActionLabel: '头部操作文案',
  headerLeftAriaLabel: '左侧按钮说明',
  icon: '图标',
  iconColor: '图标颜色',
  icons: '图标',
  images: '图片列表',
  interval: '间隔',
  items: '项目',
  justify: '主轴对齐',
  label: '标签',
  labelAlign: '标签对齐',
  labelWidth: '标签宽度',
  leftArrow: '返回箭头',
  library: '组件库',
  max: '最大值',
  maxCount: '最大数量',
  message: '消息内容',
  min: '最小值',
  multiple: '多选',
  name: '名称',
  note: '备注',
  objectFit: '填充方式',
  options: '选项',
  pageSize: '每页数量',
  placement: '位置',
  placeholder: '占位提示',
  poster: '封面图',
  prefix: '前缀',
  range: '范围模式',
  renderer: '渲染器',
  rows: '行数',
  separator: '分隔符',
  shape: '形状',
  size: '尺寸',
  split: '显示分割线',
  src: '资源地址',
  startValue: '起始值',
  statusTime: '状态栏时间',
  step: '步长',
  stripe: '斑马纹',
  subtitle: '副标题',
  suffix: '后缀',
  surface: '运行平台',
  tabs: '标签项',
  text: '文本',
  thumb: '缩略图',
  title: '标题',
  tone: '色调',
  total: '总数',
  transparent: '透明背景',
  trend: '趋势',
  type: '类型',
  value: '数值',
  variant: '样式',
  visible: '显示',
  width: '宽度',
  wrap: '换行',
};

function fallbackLabel(name) {
  return labels[name] ?? name;
}

let changedFiles = 0;
let changedProps = 0;

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.json')) {
    continue;
  }
  const filePath = path.join(root, entry.name);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const components = data.layoutDocument?.components;
  if (!Array.isArray(components)) {
    continue;
  }

  let changed = false;
  for (const component of components) {
    if (!Array.isArray(component.props)) {
      continue;
    }
    for (const prop of component.props) {
      if (!prop || typeof prop !== 'object' || typeof prop.name !== 'string') {
        continue;
      }
      if (typeof prop.label !== 'string' || !/[\u3400-\u9fff]/.test(prop.label)) {
        prop.label = fallbackLabel(prop.name);
        changed = true;
        changedProps += 1;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    changedFiles += 1;
  }
}

console.log(JSON.stringify({ changedFiles, changedProps }));
