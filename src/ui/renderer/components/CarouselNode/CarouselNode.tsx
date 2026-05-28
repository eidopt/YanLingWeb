'use client';

import { asBoolean, asNumber, asStringArray } from '../../valueResolvers';
import type { CarouselProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './CarouselNode.module.css';
import { useEffect, useRef, useState } from 'react';

export function CarouselNode({ props, nodeLayoutStyle }: CoreNodeProps<CarouselProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const images = asStringArray(props.images);
  const autoplay = asBoolean(props.autoplay);
  const interval = Math.max(500, asNumber(props.interval, 3000));

  useEffect(() => {
    if (!autoplay || images.length <= 1) {
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, interval);

    return () => window.clearInterval(timer);
  }, [autoplay, images.length, interval]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      left: container.clientWidth * activeIndex,
      behavior: autoplay ? 'smooth' : 'auto',
    });
  }, [activeIndex, autoplay]);

  return (
    <div
      ref={containerRef}
      className={styles.carousel}
      style={{
        ...nodeLayoutStyle,
        scrollSnapType: 'x mandatory',
        scrollBehavior: autoplay ? 'smooth' : undefined,
      }}
    >
      {images.map((src, index) => (
        <div key={src} className={styles.slide} style={{ scrollSnapAlign: 'start' }}>
          <img className={styles.image} src={src} alt={`Slide ${index + 1}`} />
        </div>
      ))}
    </div>
  );
}
