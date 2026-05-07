import { homePageContent as c } from './HomePage.content';
import { MetricStrip } from 'ui/pages';

export function StatsBar() {
  return <MetricStrip items={c.stats} />;
}
