import { env } from '$env/dynamic/private';
import { generateAlerts, type Alert } from '$lib/alerts/generateAlerts';
import { aiEvaluateSignal, getNewsSentimentFromAI } from '$lib/alerts/aiEvaluateSignal';
import { buildFeatures, type SentimentLabel } from '$lib/alerts/buildFeatures';
import { getTopCoins } from '$lib/api/coins';
import {
	getPollingIntervalMs,
	invalidateMarketCache,
	runQuickBtcCheck
} from '$lib/server/marketCache';
import { getServerCryptoNews } from '$lib/server/cryptoNews';
import { sendTelegramMessage } from '$lib/server/telegram';

interface MarketCoin {
	id: string;
	name: string;
	current_price: number;
	total_volume: number;
	price_change_percentage_24h: number;
}

interface SchedulerState {
	started: boolean;
	timer: ReturnType<typeof setTimeout> | null;
	running: boolean;
	lastMarketData: MarketCoin[] | null;
	nextRunAt: number | null;
}

const schedulerStateKey = '__cryptoAlertSchedulerState__';

function getSchedulerState(): SchedulerState {
	const globalWithState = globalThis as typeof globalThis &
		Record<string, SchedulerState | undefined>;

	if (!globalWithState[schedulerStateKey]) {
		globalWithState[schedulerStateKey] = {
			started: false,
			timer: null,
			running: false,
			lastMarketData: null,
			nextRunAt: null
		};
	}

	return globalWithState[schedulerStateKey] as SchedulerState;
}

function getAlertIntervalMs(): number {
	// Support inline comments like `ALERT_INTERVAL=30 # in minutes`
	const raw = String(env.ALERT_INTERVAL ?? '15');
	const cleaned = raw.split('#')[0].trim();
	const parsed = Number(cleaned);
	const intervalMinutes = Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
	return intervalMinutes * 60 * 1000;
}

function scheduleNextRun(intervalMs: number): void {
	const state = getSchedulerState();
	if (!state.started) return;

	if (state.timer) {
		clearTimeout(state.timer);
		state.timer = null;
	}

	state.nextRunAt = Date.now() + intervalMs;
	state.timer = setTimeout(() => {
		void runAlertCheck();
	}, intervalMs);
	console.log(`Next alert check in ${Math.round(intervalMs / 60000)} minutes`);
}

function isTestModeEnabled(): boolean {
	const raw = String(env.ALERT_TEST_MODE ?? '')
		.trim()
		.toLowerCase();
	return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function getVolatilityFromMarketData(marketData: MarketCoin[]): number {
	if (marketData.length === 0) return 0;
	return (
		marketData.reduce((sum, coin) => sum + Math.abs(coin.price_change_percentage_24h ?? 0), 0) /
		marketData.length
	);
}

async function fetchMarketData(): Promise<MarketCoin[]> {
	const topData = await getTopCoins();
	return topData.map((coin) => ({
		id: coin.id,
		name: coin.name,
		current_price: coin.current_price,
		total_volume: coin.total_volume ?? 0,
		price_change_percentage_24h: coin.price_change_percentage_24h
	}));
}

async function fetchNewsHeadlines(): Promise<string[]> {
	try {
		const items = await getServerCryptoNews(10);
		const headlines = items
			.map((item) => item.title?.trim() ?? '')
			.filter((title) => title.length > 0);
		return headlines.length > 0 ? headlines : getFallbackHeadlines();
	} catch (error) {
		console.warn('Failed to fetch news for scheduler:', error);
		return getFallbackHeadlines();
	}
}

function getFallbackHeadlines(): string[] {
	return [
		'Bitcoin holds key levels as institutional demand remains steady',
		'Ethereum ecosystem sees continued developer and DeFi activity',
		'Market participants watch macro data for next crypto direction',
		'Stablecoin usage grows in cross-border payments',
		'Altcoins trade mixed as traders wait for a breakout trigger'
	];
}

function buildTelegramMessage(
	alerts: Alert[],
	debug?: { sentiment: SentimentLabel; sentimentConfidence: number; modelUsed?: string }
): string {
	let message = '🚨 Smart Alerts\n━━━━━━━━━━━━━━━━━━';

	for (const alert of alerts) {
		const directionLabel = alert.signal === 'bullish' ? 'Бычий' : 'Медвежий';
		const signedChange = `${alert.priceChange24h >= 0 ? '+' : ''}${alert.priceChange24h.toFixed(1)}%`;
		const strength =
			alert.signalStrength === 'strong'
				? '🔥 Сильный'
				: alert.signalStrength === 'medium'
					? '⚠️ Средний'
					: 'ℹ️ Слабый';
		const confidence =
			alert.confidence === 'high'
				? 'Высокая'
				: alert.confidence === 'medium'
					? 'Средняя'
					: 'Низкая';
		const reason = alert.reason || formatReasonRu(alert.signal, alert.confidence);
		const shortTermMove =
			alert.shortTermChangePercent === null
				? null
				: `${alert.shortTermChangePercent >= 0 ? '+' : ''}${alert.shortTermChangePercent.toFixed(1)}% (5-15m)`;
		const volumeLine = alert.volumeSpike ? 'Объем: зафиксирован всплеск' : 'Объем: без всплеска';

		message += `\n\n${alert.icon} ${alert.coinName} · ${shortTermMove ?? signedChange} · ${directionLabel}`;
		message += `\n24h: ${signedChange}`;
		message += `\n${volumeLine}`;
		message += `\n${reason}`;
		message += `\nConfidence: ${confidence} ${strength}`;
	}

	message += `\n\n📊 Контекст рынка`;
	message += `\n${buildMarketContext(alerts)}`;

	const configuredModel = env.OPENROUTER_MODEL?.trim() || 'openrouter/auto';
	const actualModel = debug?.modelUsed || configuredModel;
	message += `\n\n🤖 LLM анализ`;
	message += `\nМодель: ${actualModel}`;
	message += `\nТариф: ${formatModelTier(actualModel)}`;

	return message;
}

function buildHeartbeatMessage(
	marketData: MarketCoin[],
	sentimentLabel: SentimentLabel,
	sentimentConfidence: number,
	modelUsed?: string
): string {
	const bullishMoves = marketData.filter((coin) => coin.price_change_percentage_24h > 4).length;
	const bearishMoves = marketData.filter((coin) => coin.price_change_percentage_24h < -4).length;
	const configuredModel = env.OPENROUTER_MODEL?.trim() || 'openrouter/auto';
	const actualModel = modelUsed || configuredModel;
	const sentimentTitle =
		sentimentLabel === 'bullish'
			? 'Бычий уклон'
			: sentimentLabel === 'bearish'
				? 'Медвежий уклон'
				: 'Нейтральный фон';
	const sentimentEmoji =
		sentimentLabel === 'bullish' ? '🟢' : sentimentLabel === 'bearish' ? '🔴' : '🟡';
	const confidenceBar = renderConfidenceBar(sentimentConfidence);
	const topMovers = marketData
		.slice()
		.sort(
			(a, b) => Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h)
		)
		.slice(0, 3);
	const moversBlock =
		topMovers.length > 0
			? topMovers
					.map((coin, idx) => {
						const signed = `${coin.price_change_percentage_24h >= 0 ? '+' : ''}${coin.price_change_percentage_24h.toFixed(1)}%`;
						return `${idx + 1}) ${coin.name}: ${signed}`;
					})
					.join('\n')
			: '1) Нет данных';

	return [
		'🧪 Heartbeat',
		'━━━━━━━━━━━━━━━━━━',
		`⏱ ${new Date().toLocaleString('ru-RU')}`,
		'',
		`${sentimentEmoji} Настроение: ${sentimentTitle}`,
		`📊 Confidence: ${sentimentConfidence.toFixed(2)}  ${confidenceBar}`,
		`⚡ Сигналы:  ↑ ${bullishMoves}   ↓ ${bearishMoves}`,
		'',
		'🎯 Топ движения:',
		moversBlock,
		'',
		`🤖 AI: OpenRouter · ${actualModel}`,
		`🧾 Тариф: ${formatModelTier(actualModel)}`,
		'ℹ️ Тестовый режим: alerts=0, отправлен heartbeat'
	].join('\n');
}

function renderConfidenceBar(value: number): string {
	const clamped = Math.max(0, Math.min(1, value));
	const filled = Math.round(clamped * 8);
	return `${'█'.repeat(filled)}${'░'.repeat(8 - filled)}`;
}

function formatModelTier(model: string): string {
	const normalized = model.toLowerCase();
	if (normalized.includes('openrouter/auto')) {
		return 'auto';
	}
	if (normalized.includes(':free') || normalized.includes('/free')) {
		return 'free';
	}
	return 'paid/unknown';
}

function buildMarketContext(alerts: Alert[]): string {
	const bullishCount = alerts.filter((alert) => alert.signal === 'bullish').length;
	const bearishCount = alerts.length - bullishCount;
	const strongCount = alerts.filter((alert) => alert.signalStrength === 'strong').length;

	if (bullishCount > bearishCount) {
		return strongCount > 0
			? 'Рынок смещен вверх, есть несколько сильных лидеров роста.'
			: 'Рынок умеренно бычий, импульс вверх усиливается.';
	}

	if (bearishCount > bullishCount) {
		return strongCount > 0
			? 'Рынок смещен вниз, по лидерам заметно сильное давление продаж.'
			: 'Рынок умеренно медвежий, нисходящее давление растет.';
	}

	return 'Смешанная картина, направление пока неочевидно.';
}

function formatReasonRu(signal: Alert['signal'], confidence: Alert['confidence']): string {
	if (signal === 'bullish') {
		if (confidence === 'high') {
			return 'Импульс вверх усиливается, возможен пробой.';
		}

		if (confidence === 'medium') {
			return 'Сильное движение вверх на позитивном фоне.';
		}

		return 'Смещение вверх есть, но подтверждение пока слабое.';
	}

	if (confidence === 'high') {
		return 'Сильное давление продавцов, риск продолжения снижения.';
	}

	if (confidence === 'medium') {
		return 'Продавцы усиливают давление, нисходящий импульс растет.';
	}

	return 'Смещение вниз есть, но сигнал пока слабый.';
}

async function applyAISignalLayer(
	alerts: Alert[],
	sentiment: SentimentLabel,
	sentimentConfidence: number
): Promise<Alert[]> {
	const enriched = await Promise.all(
		alerts.map(async (alert) => {
			try {
				const features = buildFeatures({
					priceChange24h: alert.priceChange24h,
					sentiment,
					sentimentConfidence
				});
				const aiResult = await aiEvaluateSignal(alert.coinName, features);

				return {
					...alert,
					signalStrength: aiResult.strength,
					reason: aiResult.explanation,
					message: `${alert.icon} ${alert.coinName} — ${alert.priceChange24h >= 0 ? '+' : ''}${alert.priceChange24h.toFixed(1)}% (${alert.signal === 'bullish' ? 'Bullish' : 'Bearish'})
${aiResult.explanation}
Confidence: ${alert.confidence.charAt(0).toUpperCase() + alert.confidence.slice(1)}`
				};
			} catch {
				// AI is additive only; rule-based result is preserved on failure.
				return alert;
			}
		})
	);

	return enriched;
}

function logSignalDiagnostics(
	marketData: MarketCoin[],
	sentimentLabel: SentimentLabel,
	alertsCount: number
): void {
	const bullishMoves = marketData.filter((coin) => coin.price_change_percentage_24h > 4).length;
	const bearishMoves = marketData.filter((coin) => coin.price_change_percentage_24h < -4).length;
	const flatOrWeakMoves = marketData.length - bullishMoves - bearishMoves;

	console.log(
		`Signal diagnostics: sentiment=${sentimentLabel}, totalCoins=${marketData.length}, ` +
			`bullishMoves(>4%)=${bullishMoves}, bearishMoves(<-4%)=${bearishMoves}, weakMoves=${flatOrWeakMoves}, alerts=${alertsCount}`
	);

	if (alertsCount === 0) {
		if (sentimentLabel === 'neutral') {
			console.log('No alerts reason: neutral sentiment blocks directional signals.');
			return;
		}

		if (sentimentLabel === 'bullish' && bullishMoves === 0) {
			console.log('No alerts reason: no coins with >4% move for bullish setup.');
			return;
		}

		if (sentimentLabel === 'bearish' && bearishMoves === 0) {
			console.log('No alerts reason: no coins with <-4% move for bearish setup.');
			return;
		}

		console.log('No alerts reason: movement and sentiment mismatch for current rules.');
	}
}

export async function runAlertCheck(): Promise<void> {
	const state = getSchedulerState();
	if (state.running) {
		return;
	}

	state.running = true;
	console.log('Running alert check...');

	try {
		const quick = await runQuickBtcCheck();
		if (quick.shouldRefresh) {
			console.log(
				`Quick BTC move detected (${quick.movePercent.toFixed(2)}%). Triggering full refresh now.`
			);
			invalidateMarketCache(`Quick BTC check move ${quick.movePercent.toFixed(2)}%`);
		}

		const marketData = await fetchMarketData();
		state.lastMarketData = marketData;
		const volatility = getVolatilityFromMarketData(marketData);
		const intervalMs = getPollingIntervalMs(volatility);
		const headlines = await fetchNewsHeadlines();
		const sentimentResult = await getNewsSentimentFromAI(headlines.slice(0, 5));
		const sentimentLabel = sentimentResult.sentiment;

		console.log(
			`News headlines: ${headlines.length}, sentiment: ${sentimentLabel}, sentimentConfidence: ${sentimentResult.confidence.toFixed(2)}`
		);

		const baseAlerts = await generateAlerts(marketData, sentimentLabel);
		const alerts = await applyAISignalLayer(baseAlerts, sentimentLabel, sentimentResult.confidence);
		logSignalDiagnostics(marketData, sentimentLabel, baseAlerts.length);

		if (alerts.length === 0) {
			if (isTestModeEnabled()) {
				const heartbeat = buildHeartbeatMessage(
					marketData,
					sentimentLabel,
					sentimentResult.confidence,
					sentimentResult.model
				);
				const sent = await sendTelegramMessage(heartbeat);
				if (sent) {
					console.log('Alerts sent: 0 (test heartbeat sent)');
				}
			}
			console.log('No alerts');
			scheduleNextRun(intervalMs);
			return;
		}

		const hasMajorAlert = alerts.some((alert) => alert.signalStrength === 'strong');
		if (hasMajorAlert) {
			invalidateMarketCache('major alert triggered');
		}

		const message = buildTelegramMessage(alerts.slice(0, 3), {
			sentiment: sentimentLabel,
			sentimentConfidence: sentimentResult.confidence,
			modelUsed: sentimentResult.model
		});
		const sent = await sendTelegramMessage(message);

		if (sent) {
			console.log(`Alerts sent: ${Math.min(alerts.length, 3)}`);
		} else {
			console.log('No alerts');
		}
		scheduleNextRun(intervalMs);
	} catch (error) {
		const state = getSchedulerState();
		const message = error instanceof Error ? error.message : String(error);

		if (message.includes('Failed to fetch top coins: 429') && state.lastMarketData) {
			console.warn('Using cached market data after CoinGecko rate limit.');
			try {
				const headlines = await fetchNewsHeadlines();
				const sentimentResult = await getNewsSentimentFromAI(headlines.slice(0, 5));
				const sentimentLabel = sentimentResult.sentiment;
				const baseAlerts = await generateAlerts(state.lastMarketData, sentimentLabel);
				const alerts = await applyAISignalLayer(
					baseAlerts,
					sentimentLabel,
					sentimentResult.confidence
				);
				logSignalDiagnostics(state.lastMarketData, sentimentLabel, baseAlerts.length);

				if (alerts.length === 0) {
					if (isTestModeEnabled()) {
						const heartbeat = buildHeartbeatMessage(
							state.lastMarketData,
							sentimentLabel,
							sentimentResult.confidence,
							sentimentResult.model
						);
						const sent = await sendTelegramMessage(heartbeat);
						if (sent) {
							console.log('Alerts sent: 0 (test heartbeat sent)');
						}
					}
					console.log('No alerts');
					const fallbackVolatility = getVolatilityFromMarketData(state.lastMarketData);
					scheduleNextRun(getPollingIntervalMs(fallbackVolatility));
					return;
				}

				const telegramMessage = buildTelegramMessage(alerts.slice(0, 3), {
					sentiment: sentimentLabel,
					sentimentConfidence: sentimentResult.confidence,
					modelUsed: sentimentResult.model
				});
				const sent = await sendTelegramMessage(telegramMessage);
				if (sent) {
					console.log(`Alerts sent: ${Math.min(alerts.length, 3)}`);
				} else {
					console.log('No alerts');
				}
				const fallbackVolatility = getVolatilityFromMarketData(state.lastMarketData);
				scheduleNextRun(getPollingIntervalMs(fallbackVolatility));
				return;
			} catch (fallbackError) {
				console.error('Scheduler fallback failed:', fallbackError);
			}
		}

		console.error('Scheduler alert check failed:', error);
		scheduleNextRun(getAlertIntervalMs());
	} finally {
		state.running = false;
	}
}

export function startAlertScheduler(): void {
	const state = getSchedulerState();
	if (state.started) {
		return;
	}

	state.started = true;
	void runAlertCheck();

	console.log('Alert scheduler started with adaptive polling (5/15/30 min).');
}
