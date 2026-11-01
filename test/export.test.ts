import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { discoveryPackage, simulationCsv } from '../lib/export';
import { fitSindy, parseCsv, simulate, systems } from '../lib/science';

describe('CSV import and export', () => {
  it('fits an uploaded logistic dataset with accurate candidate equations', () => {
    const csv = readFileSync(new URL('./fixtures/logistic.csv', import.meta.url), 'utf8');
    const dataset = parseCsv(csv, 'logistic.csv');
    const fit = fitSindy(dataset, 'time', ['population'], 2, 0.02);
    expect(dataset.rows).toHaveLength(41);
    expect(fit.r2).toBeGreaterThan(0.99);
    expect(fit.equations[0]).toContain('population');
    const exported = JSON.parse(discoveryPackage(fit, dataset));
    expect(exported.dataset).toEqual(dataset);
    expect(exported.model.equations).toEqual(fit.equations);
  });

  it('exports each trajectory with matching columns and row counts', () => {
    for (const system of Object.values(systems)) {
      const points = simulate(system);
      const exported = parseCsv(simulationCsv(system, points), 'exported.csv');
      expect(exported.columns).toEqual(['time', ...system.variables]);
      expect(exported.rows).toHaveLength(points.length);
      expect(exported.rows[0]).toEqual([points[0].t, ...points[0].state]);
    }
  });
});
