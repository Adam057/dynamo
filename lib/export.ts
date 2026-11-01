import type { Dataset, FitResult, Point, System } from './science';

export function simulationCsv(system: System, points: Point[]): string {
  return ['time', ...system.variables].join(',') + '\n' +
    points.map(point => [point.t, ...point.state].join(',')).join('\n');
}

export function discoveryPackage(fit: FitResult, dataset: Dataset): string {
  return JSON.stringify({
    version: '0.1.0',
    model: fit,
    dataset,
    reproduction: 'Load dataset in DYNAMO and fit with the included terms and threshold.'
  }, null, 2);
}
