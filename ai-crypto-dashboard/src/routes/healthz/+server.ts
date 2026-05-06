import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	return new Response(
		JSON.stringify({
			ok: true,
			service: 'crypto-dashboard',
			timestamp: new Date().toISOString()
		}),
		{
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		}
	);
};
