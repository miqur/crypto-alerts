import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sendTelegramMessage } from '$lib/server/telegram';
import type { Alert } from '$lib/alerts/generateAlerts';

// Simple in-memory deduplication
let lastSentAlerts: string | null = null;
const DEDUP_WINDOW = 5 * 60 * 1000; // 5 minutes
let lastSendTime = 0;

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { alerts } = await request.json();

		if (!Array.isArray(alerts) || alerts.length === 0) {
			return new Response(JSON.stringify({ message: 'No alerts to send' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Simple deduplication: don't send same alerts within 5 minutes
		const alertsKey = JSON.stringify(alerts.map((a: Alert) => `${a.coinName}:${a.type}`));
		const now = Date.now();

		if (lastSentAlerts === alertsKey && now - lastSendTime < DEDUP_WINDOW) {
			return new Response(JSON.stringify({ message: 'Alerts already sent recently' }), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Format deterministic strong alerts for Telegram
		const strongAlerts = (alerts as Alert[]).filter((alert) => alert.signal !== 'uncertain').slice(0, 3);

		if (strongAlerts.length === 0) {
			return new Response(JSON.stringify({ message: 'No meaningful alerts to send' }), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const message = await formatAlertsForTelegram(strongAlerts);

		// Send to Telegram
		const sent = await sendTelegramMessage(message);

		if (sent) {
			// Update deduplication tracking
			lastSentAlerts = alertsKey;
			lastSendTime = now;

			return new Response(JSON.stringify({ message: 'Alerts sent successfully' }), {
				headers: { 'Content-Type': 'application/json' }
			});
		} else {
			return new Response(JSON.stringify({ message: 'Failed to send alerts' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	} catch (error) {
		console.error('Error sending alerts:', error);
		return new Response(JSON.stringify({ message: 'Internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

async function formatAlertsForTelegram(alerts: Alert[]): Promise<string> {
	let message = '🚨 СМАРТ-СИГНАЛЫ\n────────────────';

	alerts.forEach((alert) => {
		const typeEmoji = alert.signal === 'bullish' ? '📈' : '📉';
		const directionLabel = alert.signal === 'bullish' ? 'Бычий' : 'Медвежий';
		const signedChange = `${alert.priceChange24h >= 0 ? '+' : ''}${alert.priceChange24h.toFixed(1)}%`;
		const confidence = formatConfidenceRu(alert.confidence);
		const strength = formatSignalStrength(alert.signalStrength);
		const reason = formatReasonRu(alert.signal, alert.confidence);

		message += `\n\n${typeEmoji} ${alert.coinName}  ${signedChange}  •  ${directionLabel}`;
		message += `\n${reason}`;
		message += `\n└ Уверенность: ${confidence} ${strength}`;
	});

	const marketContext = await generateMarketContext(alerts);
	message += `\n\n📊 КОНТЕКСТ РЫНКА\n${marketContext}`;
	const configuredModel = env.OPENROUTER_MODEL?.trim() || 'openrouter/auto';
	message += `\n\n🤖 LLM анализ\nМодель: ${configuredModel}\nТариф: ${formatModelTier(configuredModel)}`;

	return message;
}

async function generateMarketContext(alerts: Alert[]): Promise<string> {
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

function formatSignalStrength(strength: Alert['signalStrength']): string {
	if (strength === 'strong') {
		return '🔥 Сильный';
	}

	if (strength === 'medium') {
		return '⚠️ Средний';
	}

	return 'ℹ️ Слабый';
}

function formatConfidenceRu(confidence: Alert['confidence']): string {
	if (confidence === 'high') {
		return 'Высокая';
	}

	if (confidence === 'medium') {
		return 'Средняя';
	}

	return 'Низкая';
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
