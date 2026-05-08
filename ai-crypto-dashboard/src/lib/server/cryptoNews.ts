/**
 * Server-side crypto news (CryptoPanic + cache). Shared by /api/news, Telegram, scheduler.
 */

export interface NewsItem {
	title: string;
	url: string;
	source: string;
	published_at: string;
}

let newsCache: { data: NewsItem[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000;

interface CryptoPanicItem {
	title: string;
	url: string;
	source?: { title: string };
	published_at: string;
}

function mockNews(): NewsItem[] {
	return [
		{
			title: 'Bitcoin Surges Past $80,000 as Institutional Demand Grows',
			url: 'https://www.coindesk.com/',
			source: 'CryptoNews',
			published_at: new Date().toISOString()
		},
		{
			title: 'Ethereum Layer 2 Solutions Gain Traction with Lower Fees',
			url: 'https://cointelegraph.com/tags/ethereum',
			source: 'BlockchainDaily',
			published_at: new Date(Date.now() - 3600000).toISOString()
		},
		{
			title: 'TON Ecosystem Expands with New DeFi Protocols',
			url: 'https://ton.org/',
			source: 'TON News',
			published_at: new Date(Date.now() - 7200000).toISOString()
		},
		{
			title: 'Regulatory Clarity Boosts Crypto Market Sentiment',
			url: 'https://www.theblock.co/regulation',
			source: 'CryptoReg',
			published_at: new Date(Date.now() - 10800000).toISOString()
		},
		{
			title: 'Stablecoins See Record Adoption in Cross-Border Payments',
			url: 'https://www.coindesk.com/tag/stablecoins/',
			source: 'FinTech Today',
			published_at: new Date(Date.now() - 14400000).toISOString()
		}
	];
}

async function fetchFromCryptoPanic(): Promise<NewsItem[] | null> {
	const response = await fetch(
		'https://cryptopanic.com/api/v1/posts/?auth_token=free&public=true&limit=10'
	);

	if (!response.ok) {
		return null;
	}

	const data = (await response.json()) as { results?: CryptoPanicItem[] };
	const results = data.results ?? [];
	if (results.length === 0) {
		return null;
	}

	return results.map((item) => ({
		title: item.title,
		url: item.url,
		source: item.source?.title || 'Unknown',
		published_at: item.published_at
	}));
}

export async function getServerCryptoNews(limit = 10): Promise<NewsItem[]> {
	const capped = Math.min(Math.max(limit, 1), 20);
	const now = Date.now();

	if (newsCache && now - newsCache.timestamp < CACHE_DURATION) {
		return newsCache.data.slice(0, capped);
	}

	try {
		const fromApi = await fetchFromCryptoPanic();
		if (fromApi && fromApi.length > 0) {
			newsCache = { data: fromApi, timestamp: now };
			return fromApi.slice(0, capped);
		}
	} catch {
		console.log('CryptoPanic API failed, using mock data');
	}

	const mock = mockNews();
	newsCache = { data: mock, timestamp: now };
	return mock.slice(0, capped);
}
