export interface CoinData {
	id: string;
	name: string;
	current_price: number;
	total_volume: number;
	price_change_percentage_24h: number;
	image: string;
}

export async function getTopCoins(): Promise<CoinData[]> {
	// In SSR use server-side cache directly (no relative fetch issues).
	if (import.meta.env.SSR) {
		const { getMarketCoins } = await import('$lib/server/marketCache');
		return getMarketCoins();
	}

	// In browser call centralized endpoint so we don't hit CoinGecko directly.
	try {
		const res = await fetch('/api/market');
		if (!res.ok) {
			throw new Error(`GET /api/market failed: ${res.status}`);
		}

		return (await res.json()) as CoinData[];
	} catch (error) {
		console.error('getTopCoins fallback:', error);
		return getFallbackCoins();
	}
}

function getFallbackCoins(): CoinData[] {
	return [
		{
			id: 'bitcoin',
			name: 'Bitcoin',
			current_price: 0,
			total_volume: 0,
			price_change_percentage_24h: 0,
			image: ''
		},
		{
			id: 'ethereum',
			name: 'Ethereum',
			current_price: 0,
			total_volume: 0,
			price_change_percentage_24h: 0,
			image: ''
		},
		{
			id: 'the-open-network',
			name: 'TON',
			current_price: 0,
			total_volume: 0,
			price_change_percentage_24h: 0,
			image: ''
		}
	];
}
