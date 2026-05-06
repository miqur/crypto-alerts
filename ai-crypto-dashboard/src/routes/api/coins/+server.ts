import type { RequestHandler } from '@sveltejs/kit';
import { getTopCoins } from '$lib/api/coins';

export const GET: RequestHandler = async () => {
	try {
		const data = await getTopCoins();
		return new Response(JSON.stringify(data), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Error fetching data:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch data' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
