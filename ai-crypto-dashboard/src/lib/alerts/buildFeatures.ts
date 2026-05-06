export type SentimentLabel = 'bullish' | 'bearish' | 'neutral';
export type Direction = 'up' | 'down';
export type Volatility = 'high' | 'medium' | 'low';

export interface AlertFeatures {
	priceChange24h: number;
	direction: Direction;
	volatility: Volatility;
	sentiment: SentimentLabel;
	sentimentConfidence: number;
}

interface BuildFeaturesInput {
	priceChange24h: number;
	sentiment: SentimentLabel;
	sentimentConfidence: number;
}

export function buildFeatures(input: BuildFeaturesInput): AlertFeatures {
	const absChange = Math.abs(input.priceChange24h);

	return {
		priceChange24h: input.priceChange24h,
		direction: input.priceChange24h >= 0 ? 'up' : 'down',
		volatility: getVolatility(absChange),
		sentiment: input.sentiment,
		sentimentConfidence: clamp01(input.sentimentConfidence)
	};
}

function getVolatility(absChange: number): Volatility {
	if (absChange >= 8) {
		return 'high';
	}

	if (absChange >= 5) {
		return 'medium';
	}

	return 'low';
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) {
		return 0.5;
	}

	if (value < 0) {
		return 0;
	}

	if (value > 1) {
		return 1;
	}

	return value;
}
