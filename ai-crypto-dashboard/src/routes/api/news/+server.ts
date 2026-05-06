import type { RequestHandler } from '@sveltejs/kit';

export interface NewsItem {
	title: string;
	url: string;
	source: string;
	published_at: string;
}

// Cache for news data (short-term cache)
let newsCache: { data: NewsItem[]; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const GET: RequestHandler = async () => {
	try {
		const now = Date.now();

		// Return cached data if available and fresh
		if (newsCache && now - newsCache.timestamp < CACHE_DURATION) {
			return new Response(JSON.stringify(newsCache.data), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Try to fetch from CryptoPanic API
		try {
			const response = await fetch(
				'https://cryptopanic.com/api/v1/posts/?auth_token=free&public=true&limit=10'
			);

			if (response.ok) {
				const data = await response.json();

				interface CryptoPanicItem {
					title: string;
					url: string;
					source?: { title: string };
					published_at: string;
				}

				const news: NewsItem[] = data.results.map((item: CryptoPanicItem) => ({
					title: item.title,
					url: item.url,
					source: item.source?.title || 'Unknown',
					published_at: item.published_at
				}));

				// Update cache
				newsCache = { data: news, timestamp: now };

				return new Response(JSON.stringify(news), {
					headers: { 'Content-Type': 'application/json' }
				});
			}
		} catch {
			console.log('CryptoPanic API failed, using mock data');
		}

		// Return mock data as fallback
		const mockNews: NewsItem[] = [
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

		// Update cache with mock data
		newsCache = { data: mockNews, timestamp: now };

		return new Response(JSON.stringify(mockNews), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Error in news endpoint:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch news' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
