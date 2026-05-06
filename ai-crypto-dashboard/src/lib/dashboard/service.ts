import { getTopCoins, type CoinData } from '$lib/api/coins';
import { getCachedNews, type NewsItem } from '$lib/api/news';
import { generateAlerts, type Alert } from '$lib/alerts/generateAlerts';

export type SentimentLabel = 'bullish' | 'bearish' | 'neutral';

export interface InitialDashboardData {
	coins: CoinData[];
	aiInsight: string;
}

export interface NewsPipelineData {
	news: NewsItem[];
	newsSentiment: string;
	sentimentLabel: SentimentLabel;
	alerts: Alert[];
}

export async function loadInitialDashboardData(): Promise<InitialDashboardData> {
	const allCoins = await getTopCoins();
	const ton = allCoins.find((coin) => coin.id === 'the-open-network');
	const others = allCoins.filter((coin) => coin.id !== 'the-open-network').slice(0, 9);
	const coins = ton ? [ton, ...others] : others;

	let aiInsight = '';
	try {
		const response = await fetch('/api/ai', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				coins: coins.map((coin) => ({
					name: coin.name,
					price_change_percentage_24h: coin.price_change_percentage_24h
				}))
			})
		});

		if (response.ok) {
			const { message } = await response.json();
			aiInsight = String(message ?? '');
		}
	} catch (error) {
		console.error('Error getting AI market insight:', error);
	}

	return { coins, aiInsight };
}

export async function loadNewsPipeline(coins: CoinData[]): Promise<NewsPipelineData> {
	const sourceNews = await getCachedNews(10);
	const news = await translateNewsToRussian(sourceNews);
	const newsSentiment = await getNewsSentimentText(news);
	const sentimentLabel = extractSentimentLabel(newsSentiment);

	const marketData = coins.map((coin) => ({
		name: coin.name,
		price_change_percentage_24h: coin.price_change_percentage_24h
	}));
	const alerts = await generateAlerts(marketData, sentimentLabel);

	if (alerts.length > 0) {
		try {
			await fetch('/api/alerts/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ alerts })
			});
		} catch (error) {
			console.error('Error sending alerts to Telegram:', error);
		}
	}

	return {
		news,
		newsSentiment,
		sentimentLabel,
		alerts
	};
}

async function translateNewsToRussian(news: NewsItem[]): Promise<NewsItem[]> {
	if (news.length === 0) {
		return news;
	}

	try {
		const payload = news.map((item, index) => ({
			index,
			title: item.title,
			source: item.source
		}));

		const response = await fetch('/api/ai', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				prompt: `Переведи на русский язык список крипто-новостей. Сохрани смысл и названия монет/проектов.
Верни ТОЛЬКО JSON-массив объектов формата:
[{"index":0,"title":"...","source":"..."}]
Данные:
${JSON.stringify(payload)}`
			})
		});

		if (!response.ok) {
			return news;
		}

		const { message } = await response.json();
		const parsed = parseJsonFromText(String(message ?? ''));
		if (!Array.isArray(parsed)) {
			return news;
		}

		const translatedByIndex = new Map<number, { title: string; source: string }>();
		for (const item of parsed) {
			if (!item || typeof item !== 'object') continue;
			const row = item as Record<string, unknown>;
			const index = Number(row.index);
			const title = String(row.title ?? '').trim();
			const source = String(row.source ?? '').trim();
			if (!Number.isFinite(index) || !title || !source) continue;
			translatedByIndex.set(index, { title, source });
		}

		return news.map((item, index) => {
			const translated = translatedByIndex.get(index);
			if (!translated) return item;
			return {
				...item,
				title: translated.title,
				source: translated.source
			};
		});
	} catch (error) {
		console.error('Error translating news to Russian:', error);
		return news;
	}
}

async function getNewsSentimentText(news: NewsItem[]): Promise<string> {
	if (news.length === 0) {
		return '';
	}

	const headlines = news
		.slice(0, 5)
		.map((item) => item.title)
		.join('\n');

	const response = await fetch('/api/ai', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			prompt: `Вот свежие заголовки крипто-новостей:\n${headlines}\n\nСделай краткую сводку на русском языке и укажи тональность рынка: bullish, bearish или neutral. Ответ должен быть на русском.`
		})
	});

	if (!response.ok) {
		return '';
	}

	const { message } = await response.json();
	return String(message ?? '');
}

function extractSentimentLabel(message: string): SentimentLabel {
	const lower = message.toLowerCase();
	if (lower.includes('bullish')) {
		return 'bullish';
	}
	if (lower.includes('bearish')) {
		return 'bearish';
	}
	return 'neutral';
}

function parseJsonFromText(text: string): unknown | null {
	try {
		return JSON.parse(text);
	} catch {
		const start = text.indexOf('[');
		const end = text.lastIndexOf(']');
		if (start === -1 || end === -1 || end <= start) {
			return null;
		}
		try {
			return JSON.parse(text.slice(start, end + 1));
		} catch {
			return null;
		}
	}
}
