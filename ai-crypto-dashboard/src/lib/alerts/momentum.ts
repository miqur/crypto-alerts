export interface MomentumInput {
	coinKey: string;
	currentPrice: number;
	totalVolume: number;
	priceChange24h: number;
	sentimentLabel: string;
}

export interface MomentumSignals {
	shortTermChangePercent: number | null;
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

const MIN_SNAPSHOT_GAP_MS = 5 * 60 * 1000;
const MAX_SNAPSHOT_AGE_MS = 15 * 60 * 1000;
const volumeBaselines = new Map<string, VolumeBaseline>();
const priceSnapshots = new Map<string, Snapshot>();

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
	const shortTermChangePercent = getShortTermPriceChangePercent(input.coinKey, input.currentPrice);
	const volume = detectVolumeSpike(input.coinKey, input.totalVolume);
	const score = computeMomentumScore({
		priceChange24h: input.priceChange24h,
		shortTermChangePercent,
		volumeSpike: volume.spike,
		sentimentLabel: input.sentimentLabel
	});

	return {
		shortTermChangePercent,
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

function getShortTermPriceChangePercent(coinKey: string, currentPrice: number): number | null {
	const key = coinKey.toLowerCase();
	const now = Date.now();
	const current = sanitizeNonNegative(currentPrice);
	const prev = priceSnapshots.get(key);

	priceSnapshots.set(key, { price: current, timestamp: now });

	if (!prev || prev.price <= 0) {
		return null;
	}

	const ageMs = now - prev.timestamp;
	if (ageMs < MIN_SNAPSHOT_GAP_MS || ageMs > MAX_SNAPSHOT_AGE_MS) {
		return null;
	}

	return ((current - prev.price) / prev.price) * 100;
}

function sanitizeNonNegative(value: number): number {
	if (!Number.isFinite(value) || value < 0) {
		return 0;
	}
	return value;
}
