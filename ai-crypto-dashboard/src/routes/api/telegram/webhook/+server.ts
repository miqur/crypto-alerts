import type { RequestHandler } from '@sveltejs/kit';
import { handleTelegramCommand } from '$lib/server/telegramCommandRouter';
import { sendTelegramMessage } from '$lib/server/telegram';

/**
 * Telegram webhook setup:
 * POST https://api.telegram.org/bot<TOKEN>/setWebhook
 * Body (application/json):
 * { "url": "https://your-domain.com/api/telegram/webhook" }
 */

interface TelegramWebhookUpdate {
	update_id?: number;
	message?: {
		text?: string;
		chat?: {
			id?: number;
		};
	};
}

export const POST: RequestHandler = async ({ request }) => {
	let payload: TelegramWebhookUpdate;
	try {
		payload = (await request.json()) as TelegramWebhookUpdate;
	} catch {
		return new Response(JSON.stringify({ ok: true }), { status: 200 });
	}

	const text = payload.message?.text?.trim();
	const chatId = payload.message?.chat?.id;
	if (!text || typeof chatId !== 'number') {
		// Ignore unknown/invalid payloads safely.
		return new Response(JSON.stringify({ ok: true }), { status: 200 });
	}

	const { command, reply } = await handleTelegramCommand(text, chatId);
	console.log(`Telegram command incoming: ${command} from chat=${chatId}`);

	const sent = await sendTelegramMessage(reply, chatId);
	console.log(`Telegram response sent: command=${command}, chat=${chatId}, ok=${sent}`);
	return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
