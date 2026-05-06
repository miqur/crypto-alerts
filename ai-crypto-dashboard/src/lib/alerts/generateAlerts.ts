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
			const signalStrength = momentum.momentumStrength;
			const reason = buildReason(signal, confidence, momentum.volumeSpike);
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
			const actionHint = getActionHint(decision);

			const alert: Alert = {
				coinName: coin.name,
				message: buildAlertMessage({
					coinName: coin.name,
					change,
					shortTermChangePercent: momentum.shortTermChangePercent,
					signal,
					reason,
					confidence,
					volumeSpike: momentum.volumeSpike,
					actionHint
				}),
				type: signal === 'bullish' ? 'bullish' : signal === 'bearish' ? 'bearish' : 'warning',
				severity: confidence,
				icon: signal === 'bullish' ? '📈' : signal === 'bearish' ? '📉' : '⚠️',
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
				actionHint
			};

			return alert;
		})
		.filter((alert): alert is Alert => alert !== null);

	// Priority: early_breakout > breakout > continuation > pullback > uncertain,
	// then severity and strongest move.
	const decisionPriority: Record<Alert['decision'], number> = {
		early_breakout: 0,
		breakout: 1,
		continuation: 2,
		pullback: 3,
		uncertain: 4
	};
	const severityOrder = { high: 0, medium: 1, low: 2 };
	alerts.sort((a, b) => {
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
		return 'Импульс усиливается, возможен выход из диапазона.';
	}

	if (confidence === 'medium') {
		return 'Рост поддерживается фоном и сохраняет силу.';
	}

	return 'Бычий уклон есть, но подтверждение пока ограничено.';
}

function getBearishReason(confidence: 'low' | 'medium' | 'high'): string {
	if (confidence === 'high') {
		return 'Давление продавцов сильное, откат может продолжиться.';
	}

	if (confidence === 'medium') {
		return 'Продавцы активны, нисходящий импульс нарастает.';
	}

	return 'Медвежий уклон есть, но отскок пока не исключен.';
}

function buildAlertMessage({
	coinName,
	change,
	shortTermChangePercent,
	signal,
	reason,
	confidence,
	volumeSpike,
	actionHint
}: {
	coinName: string;
	change: number;
	shortTermChangePercent: number | null;
	signal: 'bullish' | 'bearish' | 'uncertain';
	reason: string;
	confidence: 'low' | 'medium' | 'high';
	volumeSpike: boolean;
	actionHint: string;
}): string {
	const icon = signal === 'bullish' ? '📈' : signal === 'bearish' ? '📉' : '⚠️';
	const signedChange = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
	const shortTermMove =
		shortTermChangePercent === null
			? null
			: `${shortTermChangePercent >= 0 ? '+' : ''}${shortTermChangePercent.toFixed(1)}% (5-15m)`;
	const directionLabel =
		signal === 'bullish' ? 'Бычий' : signal === 'bearish' ? 'Медвежий' : 'Неопределенный';
	const volumeText = volumeSpike ? 'Объем подтверждает движение' : 'Объем без всплеска';

	return `${icon} ${coinName} — ${shortTermMove ?? signedChange} (${directionLabel})
24h: ${signedChange}
${volumeText}
${reason}
Действие: ${actionHint}
Уверенность: ${capitalizeRu(confidence)}`;
}

function buildReason(
	signal: 'bullish' | 'bearish' | 'uncertain',
	confidence: 'low' | 'medium' | 'high',
	volumeSpike: boolean
): string {
	if (signal === 'uncertain') {
		return 'Сигнал смешанный: цена и фон не дают устойчивого направления.';
	}
	const base = signal === 'bullish' ? getBullishReason(confidence) : getBearishReason(confidence);
	if (!volumeSpike) {
		return base;
	}
	return `${base} Движение поддержано ростом объема.`;
}

function capitalizeRu(value: Alert['confidence']): string {
	if (value === 'high') return 'Высокая';
	if (value === 'medium') return 'Средняя';
	return 'Низкая';
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

function getActionHint(decision: Alert['decision']): string {
	switch (decision) {
		case 'early_breakout':
			return 'Ранний пробой формируется, наблюдать очень внимательно';
		case 'breakout':
			return 'Следить за пробоем';
		case 'pullback':
			return 'Возможен разворот';
		case 'continuation':
			return 'Вероятно продолжение импульса';
		default:
			return 'Высокий риск, направление неясно';
	}
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
		volumeSpike: alert.volumeSpike,
		actionHint: alert.actionHint
	});
}
