export interface NewsItem {
	title: string;
	url: string;
	source: string;
	published_at: string;
}

// Cache for news data (short-term cache)
let newsCache: { data: NewsItem[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getCachedNews(limit = 10): Promise<NewsItem[]> {
	try {
		const now = Date.now();

		// Return cached data if available and fresh
		if (newsCache && now - newsCache.timestamp < CACHE_DURATION) {
			return newsCache.data.slice(0, limit);
		}

		// Fetch from our server-side API (no CORS issues)
		const response = await fetch('/api/news');

		if (!response.ok) {
			throw new Error('Failed to fetch news');
		}

		const news: NewsItem[] = await response.json();

		// Update cache
		newsCache = { data: news, timestamp: now };

		return news.slice(0, limit);
	} catch (error) {
		console.error('Error fetching news:', error);
		// Return mock data as fallback
		return getMockNews(limit);
	}
}

// Mock data for development/fallback
function getMockNews(limit: number): NewsItem[] {
	const mockNews = [
		{
			title: 'Bitcoin Surges Past $80,000 as Institutional Demand Grows',
			url: 'https://example.com/bitcoin-surge',
			source: 'CryptoNews',
			published_at: new Date().toISOString()
		},
		{
			title: 'Ethereum Layer 2 Solutions Gain Traction with Lower Fees',
			url: 'https://example.com/ethereum-l2',
			source: 'BlockchainDaily',
			published_at: new Date(Date.now() - 3600000).toISOString()
		},
		{
			title: 'TON Ecosystem Expands with New DeFi Protocols',
			url: 'https://example.com/ton-ecosystem',
			source: 'TON News',
			published_at: new Date(Date.now() - 7200000).toISOString()
		},
		{
			title: 'Regulatory Clarity Boosts Crypto Market Sentiment',
			url: 'https://example.com/regulatory-clarity',
			source: 'CryptoReg',
			published_at: new Date(Date.now() - 10800000).toISOString()
		},
		{
			title: 'Stablecoins See Record Adoption in Cross-Border Payments',
			url: 'https://example.com/stablecoin-adoption',
			source: 'FinTech Today',
			published_at: new Date(Date.now() - 14400000).toISOString()
		}
	];

	return mockNews.slice(0, limit);
}
