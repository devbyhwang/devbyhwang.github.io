import type { StreamObservation, StreamingAggregate } from "../model";

function clampCoverage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function midpointPercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return (sorted[lower] + sorted[upper]) / 2;
}

export function summarizeStreams(streams: StreamObservation[], coverage: number): StreamingAggregate {
  if (streams.length === 0) {
    return {
      totalViewers: 0,
      channelCount: 0,
      medianViewersPerChannel: 0,
      p75ViewersPerChannel: 0,
      top10ViewerShare: 0,
      viewerConcentration: 0,
      coverage: clampCoverage(coverage),
    };
  }

  const totalViewers = streams.reduce((total, stream) => total + Math.max(0, stream.viewerCount), 0);
  const userIds = new Set(streams.flatMap((stream) => stream.userId ? [stream.userId] : []));
  const channelCount = userIds.size > 0 ? userIds.size : streams.length;
  const viewerCounts = streams
    .map((stream) => Math.max(0, stream.viewerCount))
    .sort((left, right) => left - right);
  const topTenSum = viewerCounts
    .slice(-10)
    .reduce((total, viewers) => total + viewers, 0);
  const viewerConcentration = totalViewers > 0
    ? viewerCounts.reduce((sum, viewers) => sum + (viewers / totalViewers) ** 2, 0)
    : 0;

  return {
    totalViewers,
    channelCount,
    medianViewersPerChannel: midpointPercentile(viewerCounts, 0.5),
    p75ViewersPerChannel: midpointPercentile(viewerCounts, 0.75),
    top10ViewerShare: totalViewers > 0 ? topTenSum / totalViewers : 0,
    viewerConcentration,
    coverage: clampCoverage(coverage),
  };
}
