'use client';

import { homePageContent as c } from './HomePage.content';
import { useEffect, useRef, useState } from 'react';
import { MetricStrip } from 'ui/pages';
import { Box } from 'ui/system';

function CountUpValue({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [displayValue, setDisplayValue] = useState(value);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) {return;}

    const numMatch = /^([\d.]+)/.exec(value);
    if (!numMatch) {return;}

    const target = parseFloat(numMatch[1]);
    const suffix = value.slice(numMatch[0].length);

    const el = ref.current;
    if (!el) {return;}

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          hasAnimated.current = true;
          observer.unobserve(el);

          const duration = 1200;
          const start = performance.now();

          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(target * eased);
            setDisplayValue(`${current}${suffix}`);
            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };

          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.6 },
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref} className="count-up-value">
      {displayValue}
    </span>
  );
}

function AnimatedMetricStrip() {
  return (
    <Box data-section="stats">
      <MetricStrip
        items={c.stats.map((stat) => ({
          value: <CountUpValue value={stat.value} />,
          label: stat.label,
        }))}
      />
    </Box>
  );
}

export function StatsBar() {
  return <AnimatedMetricStrip />;
}
