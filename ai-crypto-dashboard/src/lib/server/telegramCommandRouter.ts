import { env } from '$env/dynamic/private';
import { generateAlerts } from '$lib/alerts/generateAlerts';
import { computeMomentumSignals } from '$lib/alerts/momentum';
import { getUsdBynRates } from '$lib/api/currency';
import { getTopCoins } from '$lib/api/coins';
import { generateAIResponseWithMeta } from '$lib/server/ai/provider';
import { getServerCryptoNews } from '$lib/server/cryptoNews';
import { getTelegramMenuKeyboardMarkup, resolveTelegramMenuButton } from '$lib/server/telegram';

const knownUsers = new Set<number>();
const btcPriceHistory: Array<{ price: number; timestamp: number }> = [];
const BTC_HISTORY_WINDOW_MS = 20 * 60 * 1000;
const TELEGRAM_AI_MAX_INPUT_LENGTH = 500;

/** После пустого /llm ждём следующий текст как вопрос к универсальному ИИ (меню Telegram шлёт /llm сразу). */
const LLM_PENDING_TTL_MS = 5 * 60 * 1000;
const llmPendingUntil = new Map<number, number>();

const SLASH_COMMANDS = new Set([
	'/start',
	'/status',
	'/alerts',
	'/btc',
	'/news',
	'/currency',
	'/healthz',
	'/llm'
]);

function isLlmPending(chatId: number): boolean {
	const until = llmPendingUntil.get(chatId);
	if (until == null) {
		return false;
	}
	if (Date.now() > until) {
		llmPendingUntil.delete(chatId);
		return false;
	}
	return true;
}

function setLlmPending(chatId: number): void {
	llmPendingUntil.set(chatId, Date.now() + LLM_PENDING_TTL_MS);
}

function clearLlmPending(chatId: number): void {
	llmPendingUntil.delete(chatId);
}

function buildLlmTwoStepHint(): string {
	return [
		'В меню команд Telegram выбранная команда сразу уходит в чат — строку в поле ввода «дописать» нельзя, это устроено в клиенте.',
		'',
		'Как спросить ИИ:',
		'• отправьте следующим сообщением ваш вопрос одним текстом (я жду ответ до ~5 мин), или',
		'• одной строкой: /llm ваш вопрос',
		'',
		'Команда /status и остальные отменяют это ожидание.'
	].join('\n');
}

export async function handleTelegramCommand(
	text: string,
	chatId: number
): Promise<{
	command: string;
	reply: string;
	parseMode?: 'HTML';
	replyMarkup?: ReturnType<typeof getTelegramMenuKeyboardMarkup>;
}> {
	knownUsers.add(chatId);
	const normalized = resolveTelegramMenuButton(text).trim();
	const firstToken = normalized.split(/\s+/)[0].toLowerCase();

	if (isLlmPending(chatId)) {
		const isKnownSlash = normalized.startsWith('/') && SLASH_COMMANDS.has(firstToken);

		if (!normalized.startsWith('/')) {
			clearLlmPending(chatId);
			const reply = await buildAIGenericReply(normalized, true);
			return { command: 'llm_followup', reply };
		}

		if (isKnownSlash && firstToken !== '/llm') {
			clearLlmPending(chatId);
		} else if (firstToken === '/llm') {
			const rest = normalized.replace(/^\/llm\s*/i, '').trim();
			clearLlmPending(chatId);
			if (rest.length > 0) {
				const reply = await buildAIGenericReply(normalized, true);
				return { command: '/llm', reply };
			}
			setLlmPending(chatId);
			return { command: '/llm', reply: buildLlmTwoStepHint() };
		} else if (normalized.startsWith('/') && !isKnownSlash) {
			clearLlmPending(chatId);
		}
	}

	const command = firstToken;

	let reply: string;
	let parseMode: 'HTML' | undefined;
	let replyMarkup: ReturnType<typeof getTelegramMenuKeyboardMarkup> | undefined;
	switch (command) {
		case '/start':
			clearLlmPending(chatId);
			reply = buildStartMessage(chatId);
			replyMarkup = getTelegramMenuKeyboardMarkup();
			break;
		case '/status':
			clearLlmPending(chatId);
			reply = await buildStatusMessage();
			break;
		case '/alerts':
			clearLlmPending(chatId);
			reply = await buildAlertsMessage();
			break;
		case '/btc':
			clearLlmPending(chatId);
			reply = await buildBtcMessage();
			break;
		case '/healthz':
			clearLlmPending(chatId);
			reply = await buildHealthzMessage();
			break;
		case '/currency':
			clearLlmPending(chatId);
			reply = await buildCurrencyMessage();
			parseMode = 'HTML';
			break;
		case '/news':
			clearLlmPending(chatId);
			reply = await buildCryptoNewsMessage();
			break;
		case '/llm': {
			const rest = normalized.replace(/^\/llm\s*/i, '').trim();
			if (rest.length === 0) {
				setLlmPending(chatId);
				reply = buildLlmTwoStepHint();
			} else {
				clearLlmPending(chatId);
				reply = await buildAIGenericReply(normalized, true);
			}
			break;
		}
		default:
			clearLlmPending(chatId);
			reply = command.startsWith('/')
				? 'Неизвестная команда.\n\nДоступно:\n/start\n/status\n/alerts\n/btc\n/news\n/currency\n/healthz\n/llm <запрос>\n\nПодсказка: откройте список команд кнопкой «/» у поля ввода или нажмите «❓ Справка» на клавиатуре.'
				: await buildAIGenericReply(normalized, false);
			break;
	}

	return { command, reply, parseMode, replyMarkup };
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

async function buildCryptoNewsMessage(): Promise<string> {
	try {
		const items = await getServerCryptoNews(5);
		if (items.length === 0) {
			return 'Не удалось получить новости. Попробуйте позже.';
		}

		const lines: string[] = [
			'📰 Топ-5 новостей крипторынка',
			'Лента: CryptoPanic (публичный API)',
			`Сводка сформирована: ${formatMinskTime()}`,
			''
		];

		for (let i = 0; i < items.length; i += 1) {
			const item = items[i];
			lines.push(`${i + 1}. ${item.title}`);
			lines.push(`   ${item.source} · ${formatNewsPublishedAt(item.published_at)}`);
			lines.push(`   ${item.url}`);
			lines.push('');
		}

		lines.push('Не финансовый совет — сверяйтесь с первоисточниками.');
		return lines.join('\n');
	} catch (error) {
		console.error('Failed to build /news response:', error);
		return 'Не удалось загрузить новости. Попробуйте позже.';
	}
}

function formatNewsPublishedAt(iso: string): string {
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) {
			return iso;
		}
		return d.toLocaleString('ru-RU', {
			timeZone: 'Europe/Minsk',
			dateStyle: 'short',
			timeStyle: 'short'
		});
	} catch {
		return iso;
	}
}

function buildStartMessage(chatId: number): string {
	return [
		'👋 Привет! Я crypto-dashboard бот.',
		'',
		'Ниже закреплена клавиатура с кнопками — можно не вводить команды вручную.',
		'Список команд также доступен через кнопку «/» слева от поля ввода (меню Telegram).',
		'',
		'Доступные команды:',
		'/status — краткий статус рынка',
		'/alerts — топ-3 текущих сигнала',
		'/btc — быстрый статус по BTC',
		'/currency — курсы USD/BYN по банкам',
		'/news — топ-5 свежих новостей крипторынка',
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

function escapeTelegramHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function buildCurrencyMessage(): Promise<string> {
	try {
		const rates = await getUsdBynRates();
		if (rates.length === 0) {
			return escapeTelegramHtml('Не удалось получить актуальные курсы USD/BYN.');
		}

		const official = rates.find((r) => r.official);
		const commercial = rates.filter((r) => !r.official);
		const checkedAt = formatMinskTime();

		const blocks: string[] = [
			'<b>💱 USD → BYN</b>',
			'<i>Курсы банков РБ · НБРБ + коммерческие</i>',
			''
		];

		if (official) {
			const rateStr =
				official.buy > 0 ? official.buy.toFixed(4) : '—';
			blocks.push('<b>🏛 Официальный курс</b>');
			blocks.push(`${escapeTelegramHtml(official.bank)} · <code>${rateStr}</code> <i>BYN за 1 USD</i>`);
			blocks.push('');
		}

		if (commercial.length > 0) {
			const nameW = Math.max(...commercial.map((r) => r.bank.length), 6);
			const numW = 7;
			const header = `${'Банк'.padEnd(nameW)}  ${'купить'.padStart(numW)}  ${'продажа'.padStart(numW)}`;
			const rule = '─'.repeat(nameW + 2 + numW + 2 + numW);
			const preLines = [header, rule];
			for (const r of commercial) {
				const buy = r.buy > 0 ? r.buy.toFixed(4) : '—';
				const sell = r.sell > 0 ? r.sell.toFixed(4) : '—';
				const name = escapeTelegramHtml(r.bank).padEnd(nameW);
				preLines.push(`${name}  ${buy.padStart(numW)}  ${sell.padStart(numW)}`);
			}
			blocks.push('<b>🏦 Коммерческие курсы</b>');
			blocks.push(`<pre>${preLines.join('\n')}</pre>`);
			blocks.push('');
		}

		blocks.push(`<i>🕐 ${escapeTelegramHtml(checkedAt)}</i>`);
		return blocks.join('\n');
	} catch (error) {
		console.error('Failed to build /currency response:', error);
		return escapeTelegramHtml('Не удалось получить курсы валют. Попробуйте чуть позже.');
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
