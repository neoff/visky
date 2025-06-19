// metrics.ts //yarn add prom-client
import { collectDefaultMetrics, Registry, Gauge } from 'prom-client';

export const register = new Registry();

// Collect default metrics (CPU, memory, event loop lag, etc.)
collectDefaultMetrics({ register });

// Function to expose Prometheus metrics
const getMetrics = async () => await register.metrics();
export default getMetrics;
