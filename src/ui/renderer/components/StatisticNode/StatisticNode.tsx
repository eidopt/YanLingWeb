'use client';

import { asString } from '../../valueResolvers';
import type { StatisticProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './StatisticNode.module.css';
import { cx } from 'base/classname';

const trendClassMap: Record<string, string> = {
  up: styles.trendUp,
  down: styles.trendDown,
  neutral: styles.trendNeutral,
};

export function StatisticNode({ props, nodeLayoutStyle }: CoreNodeProps<StatisticProps>) {
  const title = asString(props.title);
  const value = asString(props.value);
  const suffix = asString(props.suffix);
  const prefix = asString(props.prefix);
  const tone = asString(props.tone);
  const trend = asString(props.trend);
  const trendClass = trendClassMap[trend] ?? styles.trendNeutral;
  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';

  return (
    <div className={styles.statistic} style={nodeLayoutStyle}>
      {title ? <div className={styles.title}>{title}</div> : null}
      <div className={styles.value} data-tone={tone || undefined}>
        {prefix ? <span className={styles.prefix}>{prefix}</span> : null}
        <span className={styles.number}>{value}</span>
        {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
      </div>
      {trend && trend !== 'neutral' ? (
        <div className={cx(styles.trend, trendClass)}>
          <span>{trendArrow}</span>
        </div>
      ) : null}
    </div>
  );
}
