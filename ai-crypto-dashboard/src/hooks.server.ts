import { env } from '$env/dynamic/private';
import { startAlertScheduler } from '$lib/server/scheduler';
import { ensureTelegramBotMenuConfigured } from '$lib/server/telegram';
import { startTelegramPolling, stopTelegramPolling } from '$lib/server/telegramPolling';

startAlertScheduler();
ensureTelegramBotMenuConfigured();

const updatesMode = String(env.TELEGRAM_UPDATES_MODE ?? 'polling')
	.trim()
	.toLowerCase();

if (updatesMode === 'polling') {
	startTelegramPolling();
} else {
	stopTelegramPolling(`updates mode is ${updatesMode}`);
	console.log(`Telegram updates mode: ${updatesMode} (webhook expected, polling disabled).`);
}
