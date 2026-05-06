import { env } from '$env/dynamic/private';
import { handleTelegramCommand } from '$lib/server/telegramCommandRouter';
import { sendTelegramMessage } from '$lib/server/telegram';

interface TelegramUpdate {
	update_id: number;
	message?: {
		text?: string;
		chat?: {
			id?: number;
		};
	};
}

interface GetUpdatesResponse {
	ok: boolean;
	result?: TelegramUpdate[];
	description?: string;
}

interface PollingState {
	started: boolean;
	offset: number;
	timer: ReturnType<typeof setTimeout> | null;
}

const pollingStateKey = '__telegramPollingState__';

function getPollingState(): PollingState {
	const globalWithState = globalThis as typeof globalThis &
		Record<string, PollingState | undefined>;
	if (!globalWithState[pollingStateKey]) {
		globalWithState[pollingStateKey] = {
			started: false,
			offset: 0,
			timer: null
		};
	}
	return globalWithState[pollingStateKey] as PollingState;
}

export function startTelegramPolling(): void {
	const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
	if (!botToken) {
		console.warn('Telegram polling disabled: TELEGRAM_BOT_TOKEN is missing.');
		return;
	}

	const state = getPollingState();
	if (state.started) {
		return;
	}
	state.started = true;
	console.log('Telegram polling started (getUpdates mode).');
	void pollLoop();
}

async function pollLoop(): Promise<void> {
	const state = getPollingState();
	const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
	if (!state.started || !botToken) {
		return;
	}

	try {
		const updates = await getUpdates(botToken, state.offset);
		for (const update of updates) {
			state.offset = Math.max(state.offset, update.update_id + 1);

			const text = update.message?.text?.trim();
			const chatId = update.message?.chat?.id;
			if (!text || typeof chatId !== 'number') {
				continue;
			}

			const { command, reply } = await handleTelegramCommand(text, chatId);
			console.log(`Telegram command incoming: ${command} from chat=${chatId}`);
			const sent = await sendTelegramMessage(reply, chatId);
			console.log(`Telegram response sent: command=${command}, chat=${chatId}, ok=${sent}`);
		}

		scheduleNextPoll(0);
	} catch (error) {
		console.error('Telegram polling failed:', error);
		scheduleNextPoll(3000);
	}
}

function scheduleNextPoll(delayMs: number): void {
	const state = getPollingState();
	if (state.timer) {
		clearTimeout(state.timer);
		state.timer = null;
	}
	state.timer = setTimeout(() => {
		void pollLoop();
	}, delayMs);
}

async function getUpdates(botToken: string, offset: number): Promise<TelegramUpdate[]> {
	const params = new URLSearchParams();
	params.set('timeout', '25');
	params.set('allowed_updates', JSON.stringify(['message']));
	if (offset > 0) {
		params.set('offset', String(offset));
	}

	const response = await fetch(
		`https://api.telegram.org/bot${botToken}/getUpdates?${params.toString()}`
	);
	if (!response.ok) {
		throw new Error(`getUpdates HTTP ${response.status}`);
	}

	const data = (await response.json()) as GetUpdatesResponse;
	if (!data.ok) {
		throw new Error(`getUpdates error: ${data.description ?? 'unknown error'}`);
	}
	return data.result ?? [];
}
