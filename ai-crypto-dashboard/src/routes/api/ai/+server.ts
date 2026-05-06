import type { RequestHandler } from '@sveltejs/kit';
import { generateAIResponseWithMeta } from '$lib/server/ai/provider';

type SentimentLabel = 'bullish' | 'bearish' | 'neutral';
type StrengthLabel = 'weak' | 'medium' | 'strong';
interface CoinData {
	name: string;
	price_change_percentage_24h: number;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		console.log('AI call: /api/ai');

		if (body.task === 'sentiment') {
			const headlines = Array.isArray(body.headlines) ? body.headlines.slice(0, 5) : [];
			const prompt = createSentimentPrompt(headlines);
			const aiResult = await generateAIResponseWithMeta(prompt);
			const aiText = aiResult.content;
			const parsed = parseJsonFromText(aiText);
			const result = parseSentimentResult(parsed);

			if (!result) {
				console.warn('AI fallback used: invalid sentiment JSON');
				const fallback = { sentiment: 'neutral' as const, confidence: 0.5 };
				return new Response(JSON.stringify({ message: JSON.stringify(fallback), data: fallback, model: 'fallback' }), {
					headers: { 'Content-Type': 'application/json' }
				});
			}

			return new Response(
				JSON.stringify({
					message: JSON.stringify(result),
					data: result,
					model: aiResult.model
				}),
				{
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		if (body.task === 'signal_evaluation') {
			const prompt = createSignalEvaluationPrompt(body.data);
			const aiResult = await generateAIResponseWithMeta(prompt);
			const aiText = aiResult.content;
			const parsed = parseJsonFromText(aiText);
			const result = parseSignalResult(parsed);

			if (!result) {
				console.warn('AI fallback used: invalid signal JSON');
				const fallback = {
					strength: 'medium' as const,
					explanation: 'Signal is present, but confirmation is limited.'
				};
				return new Response(JSON.stringify({ message: JSON.stringify(fallback), data: fallback, model: 'fallback' }), {
					headers: { 'Content-Type': 'application/json' }
				});
			}

			return new Response(
				JSON.stringify({
					message: JSON.stringify(result),
					data: result,
					model: aiResult.model
				}),
				{
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		if (body.prompt) {
			const aiResult = await generateAIResponseWithMeta(String(body.prompt));
			return new Response(JSON.stringify({ message: aiResult.content, model: aiResult.model }), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Backward compatibility for existing UI request shape: { coins: [...] }
		if (Array.isArray(body.coins)) {
			const coins = (body.coins as CoinData[]).slice(0, 10);
			const prompt = createMarketInsightPrompt(coins);
			const aiResult = await generateAIResponseWithMeta(prompt);
			return new Response(JSON.stringify({ message: aiResult.content, model: aiResult.model }), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const fallback = { message: 'AI response unavailable right now.' };
		console.warn('AI fallback used: unsupported request shape');
		return new Response(JSON.stringify(fallback), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('AI provider error, using fallback:', error);
		return new Response(
			JSON.stringify({
				message: 'AI response unavailable right now.'
			}),
			{
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};

function createSentimentPrompt(headlines: string[]): string {
	return [
		'You are a crypto market sentiment classifier.',
		'Analyze these headlines and return JSON only.',
		'Required JSON format: {"sentiment":"bullish|bearish|neutral","confidence":0.0}',
		`Headlines: ${JSON.stringify(headlines)}`
	].join('\n');
}

function createSignalEvaluationPrompt(input: unknown): string {
	return [
		'You are a crypto signal evaluator.',
		'Given the following structured data, classify signal strength and explain in one short sentence.',
		'Return JSON only.',
		'Required JSON format: {"strength":"weak|medium|strong","explanation":"..."}',
		`Data: ${JSON.stringify(input)}`
	].join('\n');
}

function createMarketInsightPrompt(coins: CoinData[]): string {
	return [
		'Ты крипто-аналитик.',
		'Дай краткий рыночный инсайт на русском языке в 2-4 строки.',
		'Укажи общий тон рынка и 1-2 заметных лидера движения.',
		`Coin data: ${JSON.stringify(coins)}`
	].join('\n');
}

function parseJsonFromText(text: string): unknown | null {
	try {
		return JSON.parse(text);
	} catch {
		const start = text.indexOf('{');
		const end = text.lastIndexOf('}');
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

function parseSentimentResult(value: unknown): { sentiment: SentimentLabel; confidence: number } | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as Record<string, unknown>;
	const sentiment = candidate.sentiment;
	const confidence = Number(candidate.confidence);

	if (
		(sentiment !== 'bullish' && sentiment !== 'bearish' && sentiment !== 'neutral') ||
		!Number.isFinite(confidence)
	) {
		return null;
	}

	const normalizedConfidence = Math.min(1, Math.max(0, confidence));
	return { sentiment, confidence: normalizedConfidence };
}

function parseSignalResult(value: unknown): { strength: StrengthLabel; explanation: string } | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as Record<string, unknown>;
	const strength = candidate.strength;
	const explanation = candidate.explanation;

	if (
		(strength !== 'weak' && strength !== 'medium' && strength !== 'strong') ||
		typeof explanation !== 'string' ||
		explanation.trim().length === 0
	) {
		return null;
	}

	return { strength, explanation: explanation.trim() };
}
