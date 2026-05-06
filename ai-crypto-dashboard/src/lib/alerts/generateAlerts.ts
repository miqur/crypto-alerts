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
	decision: 'early_breakout' | 'breakout' | 'pullback' | 'continuation' | 'uncertain';
	actionHint: string;
	extremeMove: boolean;
	confidencePercent: number;
	shortTermChange5mPercent: number | null;
	shortTermChange15mPercent: number | null;
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
			const momentum = computeMomentumSignals({
				coinKey: coin.id ?? coin.name,
				currentPrice: coin.current_price ?? 0,
				totalVolume: coin.total_volume ?? 0,
				priceChange24h: change,
				sentimentLabel
			});
			const confidence = confidenceFromMomentum(change, momentum.momentumScore);
			const confidencePercent = computeConfidencePercent(change, momentum.momentumScore, momentum.volumeSpike);
			const signalStrength = signalStrengthFromConfidenceScore(confidence, momentum.momentumScore);
			const reason = buildReason(signal, confidence, momentum.volumeSpike);
			const extremeMove = Math.abs(change) > 20;
			const decision = classifyDecision({
				signal,
				change24h: change,
				sentimentLabel,
				shortTermChange5mPercent: momentum.shortTermChange5mPercent,
				shortTermChange15mPercent: momentum.shortTermChange15mPercent,
				shortTermChangePercent: momentum.shortTermChangePercent,
				volumeSpike: momentum.volumeSpike,
				momentumStrength: signalStrength
			});
			const actionHint = getActionHint(decision, extremeMove);

			const alert: Alert = {
				coinName: coin.name,
				message: buildAlertMessage({
					coinName: coin.name,
					change,
					strength: signalStrength,
					actionHint,
					confidencePercent,
					extremeMove
				}),
				type: signal === 'bullish' ? 'bullish' : signal === 'bearish' ? 'bearish' : 'warning',
				severity: confidence,
				icon: extremeMove ? '🚀' : signalStrengthIcon(signalStrength),
				priceChange24h: change,
				confidence,
				signal,
				reason,
				signalStrength,
				shortTermChangePercent: momentum.shortTermChangePercent,
				shortTermChange5mPercent: momentum.shortTermChange5mPercent,
				shortTermChange15mPercent: momentum.shortTermChange15mPercent,
				volumeSpike: momentum.volumeSpike,
				volumeRatio: momentum.volumeRatio,
				momentumScore: momentum.momentumScore,
				decision,
				actionHint,
				extremeMove,
				confidencePercent
			};

			return alert;
		})
		.filter((alert): alert is Alert => alert !== null);

	// Priority: extreme_move > early_breakout > breakout > continuation > others.
	const decisionPriority: Record<Alert['decision'], number> = {
		early_breakout: 1,
		breakout: 2,
		continuation: 3,
		pullback: 4,
		uncertain: 5
	};
	const severityOrder = { high: 0, medium: 1, low: 2 };
	alerts.sort((a, b) => {
		if (a.extremeMove !== b.extremeMove) {
			return a.extremeMove ? -1 : 1;
		}
		const decisionDiff = decisionPriority[a.decision] - decisionPriority[b.decision];
		if (decisionDiff !== 0) {
			return decisionDiff;
		}

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
		return 'Possible breakout';
	}

	if (confidence === 'medium') {
		return 'Momentum building';
	}

	return 'Low strength move';
}

function getBearishReason(confidence: 'low' | 'medium' | 'high'): string {
	if (confidence === 'high') {
		return 'Momentum building';
	}

	if (confidence === 'medium') {
		return 'Possible breakout';
	}

	return 'Low strength move';
}

function buildAlertMessage({
	coinName,
	change,
	strength,
	actionHint,
	confidencePercent,
	extremeMove
}: {
	coinName: string;
	change: number;
	strength: Alert['signalStrength'];
	actionHint: string;
	confidencePercent: number;
	extremeMove: boolean;
}): string {
	const signedChange = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
	const icon = extremeMove ? '🚀' : signalStrengthIcon(strength);

	// Max 2 lines for cleaner presentation.
	return `${icon} ${coinName} — ${signedChange} | Confidence: ${confidencePercent}%
${actionHint}`;
}

function buildReason(
	signal: 'bullish' | 'bearish' | 'uncertain',
	confidence: 'low' | 'medium' | 'high',
	volumeSpike: boolean
): string {
	if (signal === 'uncertain') {
		return 'Mixed signals';
	}
	const base = signal === 'bullish' ? getBullishReason(confidence) : getBearishReason(confidence);
	if (!volumeSpike) {
		return base;
	}
	return 'Momentum building';
}

function classifyDecision(input: {
	signal: Alert['signal'];
	change24h: number;
	sentimentLabel: string;
	shortTermChange5mPercent: number | null;
	shortTermChange15mPercent: number | null;
	shortTermChangePercent: number | null;
	volumeSpike: boolean;
	momentumStrength: Alert['signalStrength'];
}): Alert['decision'] {
	const shortTerm = input.shortTermChangePercent ?? 0;
	const short5m = input.shortTermChange5mPercent ?? 0;
	const short15m = input.shortTermChange15mPercent ?? 0;
	const normalizedSentiment = input.sentimentLabel.toLowerCase();
	const alignedDirection =
		(input.signal === 'bullish' && shortTerm >= 0) || (input.signal === 'bearish' && shortTerm <= 0);
	const strongMove = Math.abs(input.change24h) >= 5;
	const shortTermStrong = Math.abs(shortTerm) >= 1;
	const short5mBullish = short5m >= 1.2;
	const short15mBullish = short15m >= 1.8;

	// Safety: минимум 2 подтверждения. Здесь это цена (5m/15m) + объем.
	if (
		input.signal === 'bullish' &&
		normalizedSentiment === 'bullish' &&
		input.volumeSpike &&
		(short5mBullish || short15mBullish)
	) {
		return 'early_breakout';
	}

	if (input.signal === 'uncertain') {
		return 'uncertain';
	}

	if (input.momentumStrength === 'strong' && input.volumeSpike && strongMove && alignedDirection) {
		return 'breakout';
	}

	if (alignedDirection && (input.momentumStrength === 'medium' || shortTermStrong)) {
		return 'continuation';
	}

	if (!alignedDirection && shortTermStrong) {
		return 'pullback';
	}

	return 'uncertain';
}

function getActionHint(decision: Alert['decision'], extremeMove: boolean): string {
	if (extremeMove) {
		return 'Extreme move';
	}

	switch (decision) {
		case 'early_breakout':
			return 'Watch closely, momentum building';
		case 'breakout':
			return 'Possible breakout';
		case 'pullback':
			return 'Low strength move';
		case 'continuation':
			return 'Momentum building';
		default:
			return 'Mixed signals';
	}
}

function signalStrengthFromConfidenceScore(
	confidence: Alert['confidence'],
	momentumScore: number
): Alert['signalStrength'] {
	if (confidence === 'high' || momentumScore >= 4) {
		return 'strong';
	}
	if (confidence === 'medium' || momentumScore >= 2) {
		return 'medium';
	}
	return 'weak';
}

function signalStrengthIcon(strength: Alert['signalStrength']): string {
	if (strength === 'strong') return '🔥';
	if (strength === 'medium') return '⚠️';
	return 'ℹ️';
}

function computeConfidencePercent(change: number, momentumScore: number, volumeSpike: boolean): number {
	const changeScore = Math.min(35, Math.round(Math.abs(change) * 1.8));
	const momentum = Math.min(45, momentumScore * 12);
	const volume = volumeSpike ? 20 : 0;
	const score = Math.min(98, Math.max(25, changeScore + momentum + volume));
	return score;
}

// Optional: AI can only generate a short reason sentence
export async function enhanceAlertWithAI(alert: Alert): Promise<string> {
	return buildAlertMessage({
		coinName: alert.coinName,
		change: alert.priceChange24h,
		strength: alert.signalStrength,
		actionHint: alert.actionHint,
		confidencePercent: alert.confidencePercent,
		extremeMove: alert.extremeMove
	});
}
