import { startAlertScheduler } from '$lib/server/scheduler';
import { startTelegramPolling } from '$lib/server/telegramPolling';

startAlertScheduler();
startTelegramPolling();
