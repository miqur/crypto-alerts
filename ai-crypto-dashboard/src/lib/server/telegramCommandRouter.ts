import { env } from '$env/dynamic/private';
import { generateAlerts } from '$lib/alerts/generateAlerts';
import { computeMomentumSignals } from '$lib/alerts/momentum';
import { getUsdBynRates } from '$lib/api/currency';
import { getTopCoins } from '$lib/api/coins';
import { generateAIResponseWithMeta } from '$lib/server/ai/provider';

const knownUsers = new Set<number>();
const btcPriceHistory: Array<{ price: number; timestamp: number }> = [];
const BTC_HISTORY_WINDOW_MS = 20 * 60 * 1000;
const TELEGRAM_AI_MAX_INPUT_LENGTH = 500;

export async function handleTelegramCommand(
	text: string,
	chatId: number
): Promise<{ command: string; reply: string }> {
	knownUsers.add(chatId);
	const command = text.split(/\s+/)[0].toLowerCase();

	let reply: string;
	switch (command) {
		case '/start':
			reply = buildStartMessage(chatId);
			break;
		case '/status':
			reply = await buildStatusMessage();
			break;
		case '/alerts':
			reply = await buildAlertsMessage();
			break;
		case '/btc':
			reply = await buildBtcMessage();
			break;
		case '/healthz':
			reply = await buildHealthzMessage();
			break;
		case '/currency':
			reply = await buildCurrencyMessage();
			break;
		case '/llm':
			reply = await buildAIGenericReply(text, true);
			break;
		default:
			reply = command.startsWith('/')
				? 'Неизвестная команда.\n\nДоступно:\n/start\n/status\n/alerts\n/btc\n/currency\n/healthz\n/llm <запрос>'
				: await buildAIGenericReply(text, false);
			break;
	}

	return { command, reply };
}

async function buildAIGenericReply(text: string, generalMode: boolean): Promise<string> {
	const raw = generalMode ? text.replace(/^\/llm\b\s*/i, '') : text;
	const trimmed = raw.trim();
	if (!trimmed) {
		return generalMode
			? 'Использование: /llm <ваш запрос>. Пример: /llm объясни что такое RSI простыми словами.'
			: 'Напишите сообщение, и я постараюсь помочь.';
	}

	if (trimmed.length > TELEGRAM_AI_MAX_INPUT_LENGTH) {
		return `Сообщение слишком длинное. Отправьте до ${TELEGRAM_AI_MAX_INPUT_LENGTH} символов.`;
	}

	try {
		const prompt = generalMode
			? [
					'Ты полезный универсальный ассистент в Telegram.',
					'Отвечай на русском, понятно и по делу.',
					'Если данных недостаточно, честно скажи об этом и предложи, что уточнить.',
					`Пользователь: ${trimmed}`
				].join('\n')
			: [
					'Ты ассистент в Telegram-боте crypto-dashboard.',
					'Отвечай на русском, коротко и по делу (1-4 предложения).',
					'Если вопрос про рынок/крипту — дай практичный и осторожный ответ без финансовых гарантий.',
					`Пользователь: ${trimmed}`
				].join('\n');
		const ai = await generateAIResponseWithMeta(prompt);
		const clean = ai.content.trim();
		return clean.length > 0 ? clean : 'Сейчас не получилось сформировать ответ. Попробуйте еще раз.';
	} catch (error) {
		console.error('Failed to build generic Telegram AI response:', error);
		return 'Сейчас ИИ недоступен. Попробуйте еще раз чуть позже.';
	}
}

function buildStartMessage(chatId: number): string {
	return [
		'👋 Привет! Я crypto-dashboard бот.',
		'',
		'Доступные команды:',
		'/status — краткий статус рынка',
		'/alerts — топ-3 текущих сигнала',
		'/btc — быстрый статус по BTC',
		'/currency — курсы USD/BYN по банкам',
		'/healthz — статус доступности сервиса',
		'/llm <запрос> — универсальный режим (обычная LLM)',
		'',
		`Ваш chat_id: ${chatId}`,
		`Подключено пользователей: ${knownUsers.size}`
	].join('\n');
}

async function buildStatusMessage(): Promise<string> {
	try {
		const coins = await getTopCoins();
		const btc = coins.find((coin) => coin.id === 'bitcoin');
		const eth = coins.find((coin) => coin.id === 'ethereum');
		const avgChange = getAverageChange(coins);
		const avgAbsChange = getAverageAbsChange(coins);
		const trend = avgChange > 1 ? 'Бычий' : avgChange < -1 ? 'Медвежий' : 'Нейтральный';
		const volatility = avgAbsChange >= 5 ? 'Высокая' : avgAbsChange >= 2 ? 'Средняя' : 'Низкая';
		const hint =
			volatility === 'Высокая'
				? 'Рынок активный, следите за ускорением импульса.'
				: volatility === 'Средняя'
					? 'Движение умеренное, ждите подтверждения по объему.'
					: 'Рынок спокойный, сильный импульс пока не сформирован.';

		return [
			'📊 Статус рынка',
			`BTC: ${formatSignedPercent(btc?.price_change_percentage_24h ?? 0)}`,
			`ETH: ${formatSignedPercent(eth?.price_change_percentage_24h ?? 0)}`,
			'',
			`Тренд: ${trend}`,
			`Волатильность: ${volatility}`,
			'',
			`Подсказка: ${hint}`
		].join('\n');
	} catch (error) {
		console.error('Failed to build /status response:', error);
		return 'Не удалось получить статус рынка. Попробуйте еще раз позже.';
	}
}

async function buildAlertsMessage(): Promise<string> {
	try {
		const coins = await getTopCoins();
		const avgChange = getAverageChange(coins);
		const sentimentLabel = avgChange >= 0 ? 'bullish' : 'bearish';
		const alerts = await generateAlerts(coins, sentimentLabel);

		if (alerts.length === 0) {
			return [
				'🚨 Топ сигналы',
				'',
				'Сильных сигналов пока нет.',
				'Подсказка: рынок тихий, ждите пробой или рост объема.'
			].join('\n');
		}

		const top3 = alerts.slice(0, 3);
		const lines: string[] = ['🚨 Топ сигналы', ''];
		for (const alert of top3) {
			const marker = getPriorityIcon(alert);
			lines.push(`${marker} ${alert.coinName} — ${formatSignedPercent(alert.priceChange24h)}`);
			lines.push(`${alert.actionHint} | Confidence: ${alert.confidencePercent}%`);
			lines.push('');
		}
		lines.push('Подсказка: следите за продолжением импульса и подтверждением по объему.');
		return lines.join('\n');
	} catch (error) {
		console.error('Failed to build /alerts response:', error);
		return 'Не удалось получить алерты. Попробуйте позже.';
	}
}

async function buildBtcMessage(): Promise<string> {
	try {
		const coins = await getTopCoins();
		const btc = coins.find((coin) => coin.id === 'bitcoin');
		if (!btc) {
			return 'BTC не найден в текущих рыночных данных.';
		}

		const avgChange = getAverageChange(coins);
		const sentimentLabel = avgChange >= 0 ? 'bullish' : 'bearish';
		const momentum = computeMomentumSignals({
			coinKey: btc.id,
			currentPrice: btc.current_price,
			totalVolume: btc.total_volume,
			priceChange24h: btc.price_change_percentage_24h,
			sentimentLabel
		});
		const signal =
			btc.price_change_percentage_24h > 4
				? 'Бычий'
				: btc.price_change_percentage_24h < -4
					? 'Медвежий'
					: 'Нейтральный';
		const momentumLabel =
			momentum.momentumStrength === 'strong'
				? 'Сильный'
				: momentum.momentumStrength === 'medium'
					? 'Средний'
					: 'Слабый';
		const shortTerm = getBtcShortTermChange(btc.current_price);
		const hint =
			momentumLabel === 'Сильный'
				? 'Подсказка: возможен пробой, следите за удержанием импульса.'
				: momentumLabel === 'Средний'
					? 'Подсказка: импульс есть, дождитесь подтверждения.'
					: 'Подсказка: сильного импульса нет, не спешите с входом.';

		return [
			'₿ BTC',
			`Цена: $${btc.current_price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
			`24ч: ${formatSignedPercent(btc.price_change_percentage_24h)}`,
			`5м: ${formatSignedPercent(shortTerm.change5m)} / 15м: ${formatSignedPercent(shortTerm.change15m)}`,
			'',
			`Сигнал: ${signal}`,
			`Импульс: ${momentumLabel}`,
			hint
		].join('\n');
	} catch (error) {
		console.error('Failed to build /btc response:', error);
		return 'Не удалось получить BTC данные. Попробуйте позже.';
	}
}

async function buildHealthzMessage(): Promise<string> {
	const baseUrl = resolveServiceBaseUrl();
	const healthUrl = `${baseUrl}/healthz`;
	const checkedAt = formatMinskTime();

	try {
		const response = await fetch(healthUrl, {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			return [
				'🛑 Health check',
				`URL: ${healthUrl}`,
				`Статус: HTTP ${response.status}`,
				`Проверка: ${checkedAt}`,
				'',
				'Как поднять сервис:',
				'1) Render -> Service -> Manual Deploy -> Deploy latest commit',
				'2) Проверь переменные окружения и Health Check Path (/healthz)',
				'3) Открой логи Render и проверь ошибки старта'
			].join('\n');
		}

		return [
			'✅ Health check',
			`URL: ${healthUrl}`,
			'Статус: сервис доступен',
			`Проверка: ${checkedAt}`
		].join('\n');
	} catch (error) {
		console.error('Failed to build /healthz response:', error);
		return [
			'🛑 Health check',
			`URL: ${healthUrl}`,
			'Статус: сервис недоступен',
			`Проверка: ${checkedAt}`,
			'',
			'Как поднять сервис:',
			'1) Render -> Service -> Manual Deploy -> Deploy latest commit',
			'2) Убедись, что TELEGRAM_UPDATES_MODE=webhook и health endpoint доступен',
			'3) Проверь последние логи Render (Build/Runtime)'
		].join('\n');
	}
}

function resolveServiceBaseUrl(): string {
	const candidate =
		env.APP_BASE_URL?.trim() ||
		env.RENDER_EXTERNAL_URL?.trim() ||
		'https://crypto-alerts-v0vi.onrender.com';
	return candidate.replace(/\/+$/, '');
}

function formatMinskTime(): string {
	return new Date().toLocaleString('ru-RU', {
		timeZone: 'Europe/Minsk'
	});
}

async function buildCurrencyMessage(): Promise<string> {
	try {
		const rates = await getUsdBynRates();
		if (rates.length === 0) {
			return 'Не удалось получить актуальные курсы USD/BYN.';
		}

		const lines = ['💱 USD/BYN — курсы банков', ''];
		for (const rate of rates) {
			if (rate.official) {
				lines.push(`🏛 ${rate.bank}: ${rate.buy.toFixed(4)} (официальный)`);
			} else {
				lines.push(
					`🏦 ${rate.bank}: покупка ${rate.buy.toFixed(4)} / продажа ${rate.sell.toFixed(4)}`
				);
			}
		}

		lines.push('', `Проверка: ${formatMinskTime()}`);
		return lines.join('\n');
	} catch (error) {
		console.error('Failed to build /currency response:', error);
		return 'Не удалось получить курсы валют. Попробуйте чуть позже.';
	}
}

function getPriorityIcon(alert: {
	extremeMove: boolean;
	decision: 'early_breakout' | 'breakout' | 'pullback' | 'continuation' | 'uncertain';
	signalStrength: 'strong' | 'medium' | 'weak';
}): string {
	if (alert.extremeMove) return '🚀';
	if (alert.decision === 'early_breakout') return '⚡';
	if (alert.decision === 'breakout') return '🔥';
	if (alert.signalStrength === 'strong') return '🔥';
	if (alert.signalStrength === 'medium') return '⚠️';
	return 'ℹ️';
}

function getBtcShortTermChange(currentPrice: number): { change5m: number; change15m: number } {
	const now = Date.now();
	btcPriceHistory.push({ price: currentPrice, timestamp: now });
	cleanupBtcHistory(now);

	const snapshot5m = findSnapshotBefore(now - 5 * 60 * 1000);
	const snapshot15m = findSnapshotBefore(now - 15 * 60 * 1000);

	const change5m = snapshot5m ? ((currentPrice - snapshot5m.price) / snapshot5m.price) * 100 : 0;
	const change15m = snapshot15m
		? ((currentPrice - snapshot15m.price) / snapshot15m.price) * 100
		: 0;

	return { change5m, change15m };
}

function cleanupBtcHistory(now: number): void {
	while (btcPriceHistory.length > 0 && now - btcPriceHistory[0].timestamp > BTC_HISTORY_WINDOW_MS) {
		btcPriceHistory.shift();
	}
}

function findSnapshotBefore(targetTs: number): { price: number; timestamp: number } | null {
	for (let i = btcPriceHistory.length - 1; i >= 0; i -= 1) {
		if (btcPriceHistory[i].timestamp <= targetTs) {
			return btcPriceHistory[i];
		}
	}
	return null;
}

function getAverageChange(coins: Array<{ price_change_percentage_24h: number }>): number {
	return coins.length === 0
		? 0
		: coins.reduce((sum, coin) => sum + (coin.price_change_percentage_24h ?? 0), 0) / coins.length;
}

function getAverageAbsChange(coins: Array<{ price_change_percentage_24h: number }>): number {
	return coins.length === 0
		? 0
		: coins.reduce((sum, coin) => sum + Math.abs(coin.price_change_percentage_24h ?? 0), 0) /
				coins.length;
}

function formatSignedPercent(value: number): string {
	return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}
