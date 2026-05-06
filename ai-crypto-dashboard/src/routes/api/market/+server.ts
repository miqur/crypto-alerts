import type { RequestHandler } from '@sveltejs/kit';
import { getMarketCoins } from '$lib/server/marketCache';

export const GET: RequestHandler = async () => {
	try {
		const coins = await getMarketCoins();
		return new Response(JSON.stringify(coins), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Error in /api/market:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch market data' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
