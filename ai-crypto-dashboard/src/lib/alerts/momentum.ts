export interface MomentumInput {
	coinKey: string;
	currentPrice: number;
	totalVolume: number;
	priceChange24h: number;
	sentimentLabel: string;
}

export interface MomentumSignals {
	shortTermChangePercent: number | null;
	shortTermChange5mPercent: number | null;
	shortTermChange15mPercent: number | null;
	volumeSpike: boolean;
	volumeRatio: number | null;
	momentumScore: number;
	momentumStrength: 'weak' | 'medium' | 'strong';
}

interface Snapshot {
	price: number;
	timestamp: number;
}

interface VolumeBaseline {
	avgVolume: number;
	samples: number;
}

const MIN_SNAPSHOT_GAP_MS = 30 * 1000;
const MAX_SNAPSHOT_AGE_MS = 20 * 60 * 1000;
const volumeBaselines = new Map<string, VolumeBaseline>();
const priceSnapshots = new Map<string, Snapshot[]>();

export function detectVolumeSpike(
	coinKey: string,
	totalVolume: number
): {
	spike: boolean;
	ratio: number | null;
} {
	const key = coinKey.toLowerCase();
	const current = sanitizeNonNegative(totalVolume);
	const baseline = volumeBaselines.get(key);

	if (!baseline || baseline.avgVolume <= 0) {
		volumeBaselines.set(key, {
			avgVolume: current,
			samples: 1
		});
		return { spike: false, ratio: null };
	}

	const ratio = current / baseline.avgVolume;
	const spike = ratio >= 1.5;

	const nextAvg = baseline.avgVolume * 0.8 + current * 0.2;
	volumeBaselines.set(key, {
		avgVolume: nextAvg,
		samples: baseline.samples + 1
	});

	return { spike, ratio };
}

export function computeMomentumSignals(input: MomentumInput): MomentumSignals {
	const shortTermChanges = getShortTermPriceChanges(input.coinKey, input.currentPrice);
	const volume = detectVolumeSpike(input.coinKey, input.totalVolume);
	const score = computeMomentumScore({
		priceChange24h: input.priceChange24h,
		shortTermChangePercent: shortTermChanges.change5m,
		volumeSpike: volume.spike,
		sentimentLabel: input.sentimentLabel
	});

	return {
		shortTermChangePercent: shortTermChanges.change5m,
		shortTermChange5mPercent: shortTermChanges.change5m,
		shortTermChange15mPercent: shortTermChanges.change15m,
		volumeSpike: volume.spike,
		volumeRatio: volume.ratio,
		momentumScore: score,
		momentumStrength: scoreToStrength(score)
	};
}

function computeMomentumScore(input: {
	priceChange24h: number;
	shortTermChangePercent: number | null;
	volumeSpike: boolean;
	sentimentLabel: string;
}): number {
	const shortTermAbs = Math.abs(input.shortTermChangePercent ?? 0);
	const priceAbs = Math.abs(input.priceChange24h);

	let priceWeight = 0;
	if (shortTermAbs >= 2.5 || priceAbs >= 8) {
		priceWeight = 2;
	} else if (shortTermAbs >= 1 || priceAbs >= 4) {
		priceWeight = 1;
	}

	const volumeWeight = input.volumeSpike ? 1 : 0;
	const sentiment = input.sentimentLabel.toLowerCase();
	const sentimentWeight = sentiment === 'neutral' ? 0 : 1;

	return priceWeight + volumeWeight + sentimentWeight;
}

function scoreToStrength(score: number): 'weak' | 'medium' | 'strong' {
	if (score >= 4) {
		return 'strong';
	}
	if (score >= 2) {
		return 'medium';
	}
	return 'weak';
}

function getShortTermPriceChanges(
	coinKey: string,
	currentPrice: number
): { change5m: number | null; change15m: number | null } {
	const key = coinKey.toLowerCase();
	const now = Date.now();
	const current = sanitizeNonNegative(currentPrice);
	const history = priceSnapshots.get(key) ?? [];

	const nextHistory = history.filter((snapshot) => now - snapshot.timestamp <= MAX_SNAPSHOT_AGE_MS);
	const change5m = getChangeFromSnapshot(current, findSnapshotBefore(nextHistory, now - 5 * 60 * 1000));
	const change15m = getChangeFromSnapshot(
		current,
		findSnapshotBefore(nextHistory, now - 15 * 60 * 1000)
	);

	const latestSnapshot = nextHistory[nextHistory.length - 1];
	if (!latestSnapshot || now - latestSnapshot.timestamp >= MIN_SNAPSHOT_GAP_MS) {
		nextHistory.push({ price: current, timestamp: now });
	}
	priceSnapshots.set(key, nextHistory);

	return { change5m, change15m };
}

function findSnapshotBefore(history: Snapshot[], targetTs: number): Snapshot | null {
	for (let i = history.length - 1; i >= 0; i -= 1) {
		if (history[i].timestamp <= targetTs) {
			return history[i];
		}
	}
	return null;
}

function getChangeFromSnapshot(currentPrice: number, snapshot: Snapshot | null): number | null {
	if (!snapshot || snapshot.price <= 0) {
		return null;
	}
	return ((currentPrice - snapshot.price) / snapshot.price) * 100;
}

function sanitizeNonNegative(value: number): number {
	if (!Number.isFinite(value) || value < 0) {
		return 0;
	}
	return value;
}
