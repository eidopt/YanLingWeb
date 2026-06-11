import {
  attrs,
  type CaseHandler,
  indent,
  interactionActionAttr,
  propNumber,
  propString,
  propStringArray,
  safeJsonExpression,
  styleAttr,
  tabNavigateTarget,
  visibilityControlAttrs,
} from './compileNode.shared';

const compileButton: CaseHandler = ({ node, props, nextContext, context }) => {
  const label = propString(props.label) || propString(props.text, 'Button');
  const icon = propString(props.icon);
  const buttonAttrs = attrs([
    styleAttr(node),
    interactionActionAttr(node.interactions?.onClick),
    `data-variant=${JSON.stringify(propString(props.variant, 'primary'))}`,
    `data-active={${JSON.stringify(Boolean(props.active))}}`,
    props.disabled ? 'disabled' : null,
  ]);
  return {
    ...nextContext,
    code: [
      `${indent(context.depth)}<button type="button" className="core-button"`,
      buttonAttrs ? ` ${buttonAttrs}` : '',
      '>',
      icon ? `<span aria-hidden="true">{${JSON.stringify(icon)}}</span>` : '',
      `{${JSON.stringify(label)}}</button>`,
    ].join(''),
  };
};

const compileTabs: CaseHandler = ({ node, props, nextContext, context }) => {
  const tabs = propStringArray(props.tabs);
  const activeTab = propString(props.activeTab, tabs[0] ?? '');
  const navigateTargets = Object.fromEntries(
    tabs
      .map((tab) => [tab, tabNavigateTarget(node.interactions?.onTabClick, tab)] as const)
      .filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string'),
  );
  return {
    ...nextContext,
    needsInteractiveTabs: true,
    code: [
      `${indent(context.depth)}<InteractiveTabs`,
      ` tabs={${safeJsonExpression(tabs)}}`,
      ` initialActive=${JSON.stringify(activeTab)}`,
      ` navigateTargets={${safeJsonExpression(navigateTargets)}}`,
      ' onNavigate={onNavigate} />',
    ].join(''),
  };
};

const compileSearch: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const style = styleAttr(node);
  return {
    ...nextContext,
    code: [
      `${indent(context.depth)}<input className="${className}"`,
      style ? ` ${style}` : '',
      ' type="search"',
      ` placeholder=${JSON.stringify(propString(props.placeholder))}`,
      props.value ? ` defaultValue=${JSON.stringify(propString(props.value))}` : '',
      ` aria-label=${JSON.stringify(propString(props.placeholder, 'Search'))} />`,
    ].join(''),
  };
};

const compileInput: CaseHandler = ({ node, props, nextContext, context }) => {
  const label = propString(props.label);
  const style = styleAttr(node);
  const input = [
    `<input className="core-input"`,
    label ? '' : style ? ` ${style}` : '',
    ` type=${JSON.stringify(propString(props.type, 'text'))}`,
    ` placeholder=${JSON.stringify(propString(props.placeholder))}`,
    props.value ? ` defaultValue=${JSON.stringify(propString(props.value))}` : '',
    props.disabled ? ' disabled' : '',
    ` aria-label=${JSON.stringify(propString(props.label) || propString(props.placeholder, 'Input'))} />`,
  ].join('');
  if (!label) {
    return {
      ...nextContext,
      code: `${indent(context.depth)}${input}`,
    };
  }
  return {
    ...nextContext,
    code: [
      `${indent(context.depth)}<label className="core-field"${style ? ` ${style}` : ''}>`,
      `${indent(context.depth + 1)}<span className="core-input-label">{${JSON.stringify(label)}}</span>`,
      `${indent(context.depth + 1)}${input}`,
      `${indent(context.depth)}</label>`,
    ].join('\n'),
  };
};

const compileSelect: CaseHandler = ({ node, props, nextContext, context }) => {
  const label = propString(props.label);
  const placeholder = propString(props.placeholder);
  const options = propStringArray(props.options);
  const value = propString(props.value);
  const style = styleAttr(node);
  const opts = options
    .map((o) => `${indent(context.depth + 2)}<option value=${JSON.stringify(o)}>{${JSON.stringify(o)}}</option>`)
    .join('\n');
  const select = [
    `<select className="core-select" defaultValue=${JSON.stringify(value)}`,
    ` aria-label=${JSON.stringify(label || placeholder || 'Select')}>`,
    placeholder
      ? `${indent(context.depth + 1)}<option value="" disabled>{${JSON.stringify(placeholder)}}</option>`
      : '',
    opts,
    `${indent(context.depth + 1)}</select>`,
  ]
    .filter(Boolean)
    .join('\n');
  if (!label) {
    return { ...nextContext, code: `${indent(context.depth)}${select}` };
  }
  return {
    ...nextContext,
    code: [
      `${indent(context.depth)}<label className="core-field"${style ? ` ${style}` : ''}>`,
      `${indent(context.depth + 1)}<span className="core-field-label">{${JSON.stringify(label)}}</span>`,
      `${indent(context.depth + 1)}${select}`,
      `${indent(context.depth)}</label>`,
    ].join('\n'),
  };
};

const compileCheckbox: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const label = propString(props.label);
  const checked = Boolean(props.checked);
  const disabled = Boolean(props.disabled);
  const style = styleAttr(node);
  return {
    ...nextContext,
    code:
      `${indent(context.depth)}<label className="${className}"${style ? ` ${style}` : ''}>` +
      `<input type="checkbox"${checked ? ' defaultChecked' : ''}` +
      `${disabled ? ' disabled' : ''} />` +
      '<span className="checkbox-box" />' +
      `<span>{${JSON.stringify(label)}}</span></label>`,
  };
};

const compileRadio: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const label = propString(props.label);
  const checked = Boolean(props.checked);
  const disabled = Boolean(props.disabled);
  const group = propString(props.group);
  const style = styleAttr(node);
  return {
    ...nextContext,
    code:
      `${indent(context.depth)}<label className="${className}"${style ? ` ${style}` : ''}>` +
      `<input type="radio" name=${JSON.stringify(group)}` +
      `${checked ? ' defaultChecked' : ''}` +
      `${disabled ? ' disabled' : ''} />` +
      '<span className="radio-dot" />' +
      `<span>{${JSON.stringify(label)}}</span></label>`,
  };
};

const compileSwitch: CaseHandler = ({ node, props, nextContext, context }) => {
  const label = propString(props.label);
  const checked = Boolean(props.checked);
  const disabled = Boolean(props.disabled);
  const style = styleAttr(node);
  return {
    ...nextContext,
    needsInteractiveSwitch: true,
    code: [
      `${indent(context.depth)}<InteractiveSwitch`,
      ` label=${JSON.stringify(label)}`,
      ` initialChecked={${JSON.stringify(checked)}}`,
      ` disabled={${JSON.stringify(disabled)}}`,
      style ? ` ${style}` : '',
      ' />',
    ].join(''),
  };
};

const compileRate: CaseHandler = ({ node, props, nextContext, context }) => {
  const value = propNumber(props.value, 0);
  const count = propNumber(props.count, 5);
  const style = styleAttr(node);
  return {
    ...nextContext,
    needsInteractiveRate: true,
    code: [
      `${indent(context.depth)}<InteractiveRate`,
      ` value={${JSON.stringify(value)}}`,
      ` count={${JSON.stringify(count)}}`,
      ` disabled={${JSON.stringify(Boolean(props.disabled))}}`,
      style ? ` ${style}` : '',
      ' />',
    ].join(''),
  };
};

const compileSlider: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const min = propNumber(props.min, 0);
  const max = propNumber(props.max, 100);
  const step = propNumber(props.step, 1);
  const value = propNumber(props.value, min);
  const style = styleAttr(node);
  return {
    ...nextContext,
    code:
      `${indent(context.depth)}<input className="${className}"` +
      ` type="range" min={${min}} max={${max}}` +
      ` step={${step}} defaultValue={${value}}` +
      `${style ? ` ${style}` : ''} />`,
  };
};

const compileDatepicker: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const placeholder = propString(props.placeholder, '选择日期');
  const value = propString(props.value);
  const style = styleAttr(node);
  return {
    ...nextContext,
    code:
      `${indent(context.depth)}<input className="${className}"` +
      ` type="date"${value ? ` defaultValue=${JSON.stringify(value)}` : ''}` +
      ` placeholder=${JSON.stringify(placeholder)}` +
      `${style ? ` ${style}` : ''} />`,
  };
};

const compileTimepicker: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const placeholder = propString(props.placeholder, '选择时间');
  const value = propString(props.value);
  const style = styleAttr(node);
  return {
    ...nextContext,
    code:
      `${indent(context.depth)}<input className="${className}"` +
      ` type="time"${value ? ` defaultValue=${JSON.stringify(value)}` : ''}` +
      ` placeholder=${JSON.stringify(placeholder)}` +
      `${style ? ` ${style}` : ''} />`,
  };
};

const compileForm: CaseHandler = ({ props, children, nextContext, context }) => ({
  ...nextContext,
  needsInteractiveForm: true,
  code: [
    `${indent(context.depth)}<InteractiveForm`,
    ` labelAlign=${JSON.stringify(propString(props.labelAlign, 'left'))}`,
    ` labelWidth=${JSON.stringify(propString(props.labelWidth, '80px'))}`,
    ` successMessage=${JSON.stringify(propString(props.successMessage, 'Submitted'))}`,
    '>',
    children,
    `${indent(context.depth)}</InteractiveForm>`,
  ].join('\n'),
});

const compileUpload: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const accept = propString(props.accept);
  const multiple = Boolean(props.multiple);
  const actionLabel = propString(props.actionLabel, '点击上传');
  const style = styleAttr(node);
  return {
    ...nextContext,
    code:
      `${indent(context.depth)}<div className="${className}"${style ? ` ${style}` : ''}>` +
      `<input type="file" className="upload-input"` +
      `${accept ? ` accept=${JSON.stringify(accept)}` : ''}` +
      `${multiple ? ' multiple' : ''} />` +
      `<span className="upload-label">{${JSON.stringify(actionLabel)}}</span></div>`,
  };
};

const compilePagination: CaseHandler = ({ props, nextContext, context }) => {
  const current = propNumber(props.current, 1);
  const total = propNumber(props.total, 1);
  const pageSize = propNumber(props.pageSize, 10);
  return {
    ...nextContext,
    needsInteractivePagination: true,
    code: [
      `${indent(context.depth)}<InteractivePagination`,
      ` current={${JSON.stringify(current)}}`,
      ` total={${JSON.stringify(total)}}`,
      ` pageSize={${JSON.stringify(pageSize)}}`,
      ' />',
    ].join(''),
  };
};

const compileDialog: CaseHandler = ({ node, props, children, nextContext, context }) => {
  const title = propString(props.title);
  const visible = Boolean(props.visible);
  const visibilityAttrs = visibilityControlAttrs(context, node, visible);
  const confirmText = propString(props.confirmText, '确定');
  const cancelText = propString(props.cancelText, '取消');
  return {
    ...nextContext,
    needsInteractiveDialog: true,
    code: [
      `${indent(context.depth)}<InteractiveDialog`,
      ` title=${JSON.stringify(title)}`,
      ...visibilityAttrs,
      ` confirmText=${JSON.stringify(confirmText)}`,
      ` cancelText=${JSON.stringify(cancelText)}`,
      '>',
      children || '',
      `${indent(context.depth)}</InteractiveDialog>`,
    ].join('\n'),
  };
};

const compileDrawer: CaseHandler = ({ node, props, children, nextContext, context }) => {
  const title = propString(props.title);
  const visible = Boolean(props.visible);
  const visibilityAttrs = visibilityControlAttrs(context, node, visible);
  const placement = propString(props.placement, 'right');
  return {
    ...nextContext,
    needsInteractiveDrawer: true,
    code: [
      `${indent(context.depth)}<InteractiveDrawer`,
      ` title=${JSON.stringify(title)}`,
      ...visibilityAttrs,
      ` placement=${JSON.stringify(placement)}`,
      '>',
      children || '',
      `${indent(context.depth)}</InteractiveDrawer>`,
    ].join('\n'),
  };
};

export const controlsHandlers: Record<string, CaseHandler> = {
  'core.button': compileButton,
  'core.tabs': compileTabs,
  'core.search': compileSearch,
  'core.input': compileInput,
  'core.select': compileSelect,
  'core.checkbox': compileCheckbox,
  'core.radio': compileRadio,
  'core.switch': compileSwitch,
  'core.rate': compileRate,
  'core.slider': compileSlider,
  'core.datepicker': compileDatepicker,
  'core.timepicker': compileTimepicker,
  'core.form': compileForm,
  'core.upload': compileUpload,
  'core.pagination': compilePagination,
  'core.dialog': compileDialog,
  'core.drawer': compileDrawer,
};
