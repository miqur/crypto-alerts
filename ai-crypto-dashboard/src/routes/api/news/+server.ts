import type { RequestHandler } from '@sveltejs/kit';
import { getServerCryptoNews } from '$lib/server/cryptoNews';

export type { NewsItem } from '$lib/server/cryptoNews';

export const GET: RequestHandler = async () => {
	try {
		const news = await getServerCryptoNews(10);
		return new Response(JSON.stringify(news), {
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
