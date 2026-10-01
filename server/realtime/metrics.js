const RESERVOIR = 1000;

function percentile(sorted, p) {
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

/** In-process latency/counter store. Percentiles are only reported with enough samples. */
class Metrics {
  constructor({ minSamples = { p50: 5, p95: 20, p99: 100 } } = {}) {
    this.minSamples = minSamples;
    this.timings = new Map();
    this.counters = new Map();
  }

  observe(name, ms) {
    let t = this.timings.get(name);
    if (!t) this.timings.set(name, (t = { samples: [], count: 0 }));
    t.count += 1;
    t.samples.push(ms);
    if (t.samples.length > RESERVOIR) t.samples.shift();
  }

  inc(name, by = 1) {
    this.counters.set(name, (this.counters.get(name) || 0) + by);
  }

  snapshot() {
    const timings = {};
    for (const [name, t] of this.timings) {
      const sorted = [...t.samples].sort((a, b) => a - b);
      const n = sorted.length;
      timings[name] = {
        count: t.count,
        window: n,
        p50: n >= this.minSamples.p50 ? percentile(sorted, 50) : null,
        p95: n >= this.minSamples.p95 ? percentile(sorted, 95) : null,
        p99: n >= this.minSamples.p99 ? percentile(sorted, 99) : null,
        max: sorted[n - 1],
      };
    }
    return { timings, counters: Object.fromEntries(this.counters) };
  }
}

module.exports = { Metrics, percentile };
