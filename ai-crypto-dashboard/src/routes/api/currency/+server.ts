import type { RequestHandler } from '@sveltejs/kit';
import { getUsdBynRates } from '$lib/api/currency';

export const GET: RequestHandler = async () => {
	try {
		const rates = await getUsdBynRates();
		return new Response(JSON.stringify(rates), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Failed to fetch currency rates:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch currency rates' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
