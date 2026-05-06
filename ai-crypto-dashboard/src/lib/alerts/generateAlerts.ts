import { computeMomentumSignals } from '$lib/alerts/momentum';

export interface Alert {
	coinName: string;
	message: string;
	type: 'bullish' | 'bearish' | 'warning';
	severity: 'high' | 'medium' | 'low';
	icon: string;
	priceChange24h: number;
	confidence: 'low' | 'medium' | 'high';
	signal: 'bullish' | 'bearish' | 'uncertain';
	reason: string;
	signalStrength: 'strong' | 'medium' | 'weak';
	shortTermChangePercent: number | null;
	volumeSpike: boolean;
	volumeRatio: number | null;
	momentumScore: number;
}

export interface MarketCoin {
	id?: string;
	name: string;
	current_price?: number;
	total_volume?: number;
	price_change_percentage_24h: number;
}

export interface SentimentData {
	label: string;
	summary: string;
}

export async function generateAlerts(
	marketData: MarketCoin[],
	sentimentLabel: string
): Promise<Alert[]> {
	const alerts: Alert[] = marketData
		.map((coin) => {
			const change = coin.price_change_percentage_24h;
			const signal = getSignalType(change, sentimentLabel);

			if (signal === 'uncertain') {
				return null;
			}

			const momentum = computeMomentumSignals({
				coinKey: coin.id ?? coin.name,
				currentPrice: coin.current_price ?? 0,
				totalVolume: coin.total_volume ?? 0,
				priceChange24h: change,
				sentimentLabel
			});
			const confidence = confidenceFromMomentum(change, momentum.momentumScore);
			const signalStrength = momentum.momentumStrength;
			const reason = buildReason(signal, confidence, momentum.volumeSpike);

			const alert: Alert = {
				coinName: coin.name,
				message: buildAlertMessage({
					coinName: coin.name,
					change,
					shortTermChangePercent: momentum.shortTermChangePercent,
					signal,
					reason,
					confidence,
					volumeSpike: momentum.volumeSpike
				}),
				type: signal === 'bullish' ? 'bullish' : 'bearish',
				severity: confidence,
				icon: signal === 'bullish' ? '📈' : '📉',
				priceChange24h: change,
				confidence,
				signal,
				reason,
				signalStrength,
				shortTermChangePercent: momentum.shortTermChangePercent,
				volumeSpike: momentum.volumeSpike,
				volumeRatio: momentum.volumeRatio,
				momentumScore: momentum.momentumScore
			};

			return alert;
		})
		.filter((alert): alert is Alert => alert !== null);

	// Sort by severity (high -> medium -> low), then strongest move first
	const severityOrder = { high: 0, medium: 1, low: 2 };
	alerts.sort((a, b) => {
		const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
		if (severityDiff !== 0) {
			return severityDiff;
		}

		return Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h);
	});

	// Limit to top 5 alerts
	return alerts.slice(0, 5);
}

function getSignalType(
	change: number,
	sentimentLabel: string
): 'bullish' | 'bearish' | 'uncertain' {
	const normalizedSentiment = sentimentLabel.toLowerCase();

	if (change > 4 && normalizedSentiment === 'bullish') {
		return 'bullish';
	}

	if (change < -4 && normalizedSentiment === 'bearish') {
		return 'bearish';
	}

	// mismatch or neutral sentiment is always treated as weak
	return 'uncertain';
}

function confidenceFromMomentum(change: number, momentumScore: number): 'low' | 'medium' | 'high' {
	if (momentumScore >= 4 || Math.abs(change) >= 8) {
		return 'high';
	}
	if (momentumScore >= 2 || Math.abs(change) >= 6) {
		return 'medium';
	}
	return 'low';
}

function getBullishReason(confidence: 'low' | 'medium' | 'high'): string {
	if (confidence === 'high') {
		return 'Momentum building, possible breakout.';
	}

	if (confidence === 'medium') {
		return 'Strong upward move with positive sentiment.';
	}

	return 'Bullish bias, but follow-through is still limited.';
}

function getBearishReason(confidence: 'low' | 'medium' | 'high'): string {
	if (confidence === 'high') {
		return 'Heavy selling pressure, risk of further pullback.';
	}

	if (confidence === 'medium') {
		return 'Selling pressure building, downside momentum growing.';
	}

	return 'Bearish tilt, watch for weak bounce attempts.';
}

function buildAlertMessage({
	coinName,
	change,
	shortTermChangePercent,
	signal,
	reason,
	confidence,
	volumeSpike
}: {
	coinName: string;
	change: number;
	shortTermChangePercent: number | null;
	signal: 'bullish' | 'bearish' | 'uncertain';
	reason: string;
	confidence: 'low' | 'medium' | 'high';
	volumeSpike: boolean;
}): string {
	const icon = signal === 'bullish' ? '📈' : signal === 'bearish' ? '📉' : '⚠️';
	const signedChange = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
	const shortTermMove =
		shortTermChangePercent === null
			? null
			: `${shortTermChangePercent >= 0 ? '+' : ''}${shortTermChangePercent.toFixed(1)}% (5-15m)`;
	const directionLabel = signal === 'bullish' ? 'Bullish' : 'Bearish';
	const volumeText = volumeSpike ? 'Volume spike detected' : 'Volume stable';

	return `${icon} ${coinName} — ${shortTermMove ?? signedChange} (${directionLabel})
24h: ${signedChange}
${volumeText}
${reason}
Confidence: ${capitalize(confidence)}`;
}

function buildReason(
	signal: 'bullish' | 'bearish' | 'uncertain',
	confidence: 'low' | 'medium' | 'high',
	volumeSpike: boolean
): string {
	const base = signal === 'bullish' ? getBullishReason(confidence) : getBearishReason(confidence);
	if (!volumeSpike) {
		return base;
	}
	return `${base} Momentum supported by rising volume.`;
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

// Optional: AI can only generate a short reason sentence
export async function enhanceAlertWithAI(alert: Alert): Promise<string> {
	return buildAlertMessage({
		coinName: alert.coinName,
		change: alert.priceChange24h,
		shortTermChangePercent: alert.shortTermChangePercent,
		signal: alert.signal,
		reason: alert.reason,
		confidence: alert.confidence,
		volumeSpike: alert.volumeSpike
	});
}
