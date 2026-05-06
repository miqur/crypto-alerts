import { env } from '$env/dynamic/private';
import { startAlertScheduler } from '$lib/server/scheduler';
import { startTelegramPolling } from '$lib/server/telegramPolling';

startAlertScheduler();

const updatesMode = String(env.TELEGRAM_UPDATES_MODE ?? 'polling')
	.trim()
	.toLowerCase();

if (updatesMode === 'polling') {
	startTelegramPolling();
} else {
	console.log(`Telegram updates mode: ${updatesMode} (webhook expected, polling disabled).`);
}
