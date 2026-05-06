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

export async function sendTelegramMessage(
	text: string,
	chatIdOverride?: string | number
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
		const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chat_id: chatId,
				text: text
			})
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
