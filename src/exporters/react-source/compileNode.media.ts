import {
  type CaseHandler,
  indent,
  propString,
  propStringArray,
  readDataBinding,
  safeJsonExpression,
  styleAttr,
  wrapAsyncDataBoundary,
} from './compileNode.shared';
import { toObjectLiteral } from './styleCompiler';
import { sanitizeInlineStyle } from '@shared/theme-layout/htmlSafety';
import { normalizeStyleRecordUnits } from '@shared/theme-layout/lengthUnits';

const compileImage: CaseHandler = ({ node, props, nextContext, context }) => {
  const style = styleAttr(node);
  const src = propString(props.src);
  if (src) {
    return {
      ...nextContext,
      code: [
        `${indent(context.depth)}<img className="core-image"`,
        ` src=${JSON.stringify(src)}`,
        ` alt=${JSON.stringify(propString(props.alt))}`,
        props.title ? ` title=${JSON.stringify(propString(props.title))}` : '',
        ` data-fit=${JSON.stringify(propString(props.objectFit, 'cover'))}`,
        style ? ` ${style}` : '',
        ' />',
      ].join(''),
    };
  }
  return {
    ...nextContext,
    code: [
      `${indent(context.depth)}<div className="core-image"`,
      style ? ` ${style}` : '',
      ` aria-label=${JSON.stringify(propString(props.alt, 'Generated image placeholder'))} />`,
    ].join(''),
  };
};

const compileHtml: CaseHandler = ({ props, children, nextContext, context }) => {
  const childContent = children ? `\n${children}\n${indent(context.depth)}` : '';
  return {
    ...nextContext,
    needsHtmlBlock: true,
    code: [
      `${indent(context.depth)}<HtmlBlock`,
      ` tag=${JSON.stringify(propString(props.tag, 'div'))}`,
      ` styleValue={${toObjectLiteral(normalizeStyleRecordUnits(sanitizeInlineStyle(props.style)))}}`,
      `>${childContent}</HtmlBlock>`,
    ].join(''),
  };
};

const compileWidget: CaseHandler = ({ node, props, nextContext, context }) => {
  const binding = readDataBinding(node, context);
  const widgetCode = [
    `${indent(binding ? context.depth + 2 : context.depth)}<StaticWidget`,
    ` id=${JSON.stringify(node.id)}`,
    ` library=${JSON.stringify(propString(props.library))}`,
    ` renderer=${JSON.stringify(propString(props.renderer))}`,
    binding ? ' data={data}' : ` data={${safeJsonExpression(props.data)}}`,
    ' />',
  ].join('');
  return {
    ...nextContext,
    needsAsyncDataBoundary: nextContext.needsAsyncDataBoundary || Boolean(binding),
    needsStaticWidget: true,
    code: binding ? wrapAsyncDataBoundary(context, binding, widgetCode) : widgetCode,
  };
};

const compileVideo: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const src = propString(props.src);
  const poster = propString(props.poster);
  const style = styleAttr(node);
  return {
    ...nextContext,
    code:
      `${indent(context.depth)}<video className="${className}"` +
      `${src ? ` src=${JSON.stringify(src)}` : ''}` +
      `${poster ? ` poster=${JSON.stringify(poster)}` : ''}` +
      `${props.autoplay ? ' autoPlay' : ''}` +
      `${props.controls !== false ? ' controls' : ''}` +
      `${style ? ` ${style}` : ''} />`,
  };
};

const compileAudio: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const src = propString(props.src);
  const style = styleAttr(node);
  return {
    ...nextContext,
    code:
      `${indent(context.depth)}<audio className="${className}"` +
      `${src ? ` src=${JSON.stringify(src)}` : ''}` +
      `${props.autoplay ? ' autoPlay' : ''}` +
      `${props.controls !== false ? ' controls' : ''}` +
      `${style ? ` ${style}` : ''} />`,
  };
};

const compileCarousel: CaseHandler = ({ props, nextContext, context }) => {
  const images = propStringArray(props.images);
  return {
    ...nextContext,
    needsInteractiveCarousel: true,
    code: [
      `${indent(context.depth)}<InteractiveCarousel`,
      ` images={${safeJsonExpression(images)}}`,
      ` altPrefix=${JSON.stringify(propString(props.altPrefix, 'Slide'))}`,
      ' />',
    ].join(''),
  };
};

const compileAvatar: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const src = propString(props.src);
  const text = propString(props.text);
  const size = propString(props.size, 'medium');
  const shape = propString(props.shape, 'circle');
  const style = styleAttr(node);
  if (src) {
    return {
      ...nextContext,
      code:
        `${indent(context.depth)}<img className="${className}"` +
        ` data-size="${size}" data-shape="${shape}"` +
        ` src=${JSON.stringify(src)}` +
        ` alt=${JSON.stringify(text || 'avatar')}` +
        `${style ? ` ${style}` : ''} />`,
    };
  }
  return {
    ...nextContext,
    code:
      `${indent(context.depth)}<span className="${className}"` +
      ` data-size="${size}" data-shape="${shape}"` +
      `${style ? ` ${style}` : ''}` +
      `>{${JSON.stringify((text || '?').charAt(0))}}</span>`,
  };
};

export const mediaHandlers: Record<string, CaseHandler> = {
  'core.image': compileImage,
  'core.html': compileHtml,
  'core.widget': compileWidget,
  'core.video': compileVideo,
  'core.audio': compileAudio,
  'core.carousel': compileCarousel,
  'core.avatar': compileAvatar,
};
