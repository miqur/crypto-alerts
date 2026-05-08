/**
 * Telegram Bot Setup Instructions:
 * 1. Create a bot via @BotFather on Telegram
 * 2. Get BOT_TOKEN from BotFather
 * 3. Get CHAT_ID by messaging @userinfobot on Telegram
 * 4. Add to your .env file:
 *    TELEGRAM_BOT_TOKEN=your_bot_token_here
 *    TELEGRAM_CHAT_ID=your_chat_id_here
 */

import { env } from '$env/dynamic/private';

interface TelegramResponse {
	ok: boolean;
	result?: unknown;
	description?: string;
}

export type TelegramParseMode = 'HTML';

/** Подпись на кнопке → текст команды (reply keyboard шлёт подпись, не /command). */
export const TELEGRAM_MENU_ENTRIES: readonly (readonly [string, string])[] = [
	['📊 Статус', '/status'],
	['🚨 Сигналы', '/alerts'],
	['₿ BTC', '/btc'],
	['📰 Новости', '/news'],
	['💱 Курсы', '/currency'],
	['✅ Сервис', '/healthz'],
	['❓ Справка', '/start'],
	['🤖 ИИ', '/llm']
] as const;

const TELEGRAM_MENU_REGISTERED_KEY = '__cryptoTelegramSetMyCommandsDone__';

function chunkMenuRows<T>(items: readonly T[], size: number): T[][] {
	const rows: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		rows.push(items.slice(i, i + size));
	}
	return rows;
}

export function getTelegramMenuKeyboardMarkup(): {
	keyboard: { text: string }[][];
	resize_keyboard: boolean;
	one_time_keyboard: boolean;
	input_field_placeholder: string;
} {
	const keyboard = chunkMenuRows([...TELEGRAM_MENU_ENTRIES], 3).map((row) =>
		row.map(([label]) => ({ text: label }))
	);
	return {
		keyboard,
		resize_keyboard: true,
		one_time_keyboard: false,
		input_field_placeholder: 'Команда или сообщение…'
	};
}

/** Если пользователь нажал кнопку меню — подменяем на реальную команду. */
export function resolveTelegramMenuButton(raw: string): string {
	const t = raw.trim();
	const hit = TELEGRAM_MENU_ENTRIES.find(([label]) => label === t);
	return hit ? hit[1] : raw;
}

export function ensureTelegramBotMenuConfigured(): void {
	const g = globalThis as typeof globalThis & Record<string, boolean | undefined>;
	if (g[TELEGRAM_MENU_REGISTERED_KEY]) {
		return;
	}
	g[TELEGRAM_MENU_REGISTERED_KEY] = true;
	void registerTelegramBotCommands().catch((err) => {
		console.error('Telegram setMyCommands failed:', err);
	});
}

async function registerTelegramBotCommands(): Promise<void> {
	const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
	if (!botToken) {
		console.warn('Telegram setMyCommands skipped: TELEGRAM_BOT_TOKEN is missing.');
		return;
	}

	const commands = [
		{ command: 'start', description: 'Справка и клавиатура команд' },
		{ command: 'status', description: 'Статус рынка (BTC, ETH, тренд)' },
		{ command: 'alerts', description: 'Топ сигналов по рынку' },
		{ command: 'btc', description: 'Курс и импульс Bitcoin' },
		{ command: 'news', description: 'Топ-5 новостей крипторынка' },
		{ command: 'currency', description: 'USD/BYN — курсы НБРБ и банков' },
		{ command: 'healthz', description: 'Доступность сервиса' },
		{ command: 'llm', description: 'Универсальный ИИ: /llm ваш вопрос' }
	];

	const response = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ commands })
	});

	const data: TelegramResponse = await response.json();
	if (!data.ok) {
		console.error('Telegram setMyCommands error:', data.description);
		return;
	}
	console.log('Telegram bot commands menu registered (setMyCommands).');
}

export type TelegramSendMessageOptions = {
	parseMode?: TelegramParseMode;
	replyMarkup?: ReturnType<typeof getTelegramMenuKeyboardMarkup>;
};

export async function sendTelegramMessage(
	text: string,
	chatIdOverride?: string | number,
	options?: TelegramSendMessageOptions
): Promise<boolean> {
	const botToken = env.TELEGRAM_BOT_TOKEN;
	const chatId = chatIdOverride ?? env.TELEGRAM_CHAT_ID;

	if (!botToken || !chatId) {
		console.error(
			'Telegram credentials not configured. Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env'
		);
		return false;
	}

	try {
		const body: Record<string, unknown> = {
			chat_id: chatId,
			text
		};
		if (options?.parseMode) {
			body.parse_mode = options.parseMode;
		}
		if (options?.replyMarkup) {
			body.reply_markup = options.replyMarkup;
		}

		const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});

		const data: TelegramResponse = await response.json();

		if (!data.ok) {
			console.error('Telegram API error:', data.description);
			return false;
		}

		return true;
	} catch (error) {
		console.error('Error sending Telegram message:', error);
		return false;
	}
}
