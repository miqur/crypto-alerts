import { env } from '$env/dynamic/private';
import type { AlertFeatures, SentimentLabel } from '$lib/alerts/buildFeatures';

export interface NewsSentimentAIResult {
	sentiment: SentimentLabel;
	confidence: number;
	model?: string;
}

export interface SignalEvaluationAIResult {
	strength: 'weak' | 'medium' | 'strong';
	explanation: string;
	model?: string;
}

export interface AICallResult {
	parsed: unknown | null;
	model?: string;
}

export async function getNewsSentimentFromAI(headlines: string[]): Promise<NewsSentimentAIResult> {
	const safeHeadlines = headlines.slice(0, 5);
	if (safeHeadlines.length === 0) {
		return { sentiment: 'neutral', confidence: 0.5 };
	}

	const payload = {
		task: 'sentiment',
		headlines: safeHeadlines,
		instructions:
			'Return JSON only: {"sentiment":"bullish|bearish|neutral","confidence":0-1}. No markdown.'
	};

	const ai = await callAIApi(payload);
	if (!ai.parsed || typeof ai.parsed !== 'object') {
		return { sentiment: 'neutral', confidence: 0.5 };
	}

	const sentiment = normalizeSentiment((ai.parsed as Record<string, unknown>).sentiment);
	const confidence = normalizeConfidence((ai.parsed as Record<string, unknown>).confidence);
	return { sentiment, confidence, model: ai.model };
}

export async function aiEvaluateSignal(
	coin: string,
	features: AlertFeatures
): Promise<SignalEvaluationAIResult> {
	const payload = {
		task: 'signal_evaluation',
		data: {
			coin,
			priceChange: features.priceChange24h,
			volatility: features.volatility,
			sentiment: features.sentiment,
			confidence: features.sentimentConfidence
		},
		instructions:
			'Given this data, classify signal strength (weak|medium|strong) and explain in 1 short sentence. Return JSON only.'
	};

	const ai = await callAIApi(payload);
	if (!ai.parsed || typeof ai.parsed !== 'object') {
		throw new Error('AI signal evaluation returned invalid JSON');
	}

	const strength = normalizeStrength((ai.parsed as Record<string, unknown>).strength);
	const explanation = normalizeExplanation((ai.parsed as Record<string, unknown>).explanation);

	if (!strength || !explanation) {
		throw new Error('AI signal evaluation missing required fields');
	}

	return { strength, explanation, model: ai.model };
}

async function callAIApi(payload: unknown): Promise<AICallResult> {
	try {
		const baseUrl = env.ALERT_AI_BASE_URL ?? 'http://127.0.0.1:5173';
		const response = await fetch(`${baseUrl}/api/ai`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			return { parsed: null };
		}

		const body = (await response.json()) as { message?: string; data?: unknown; model?: string };
		const model = typeof body.model === 'string' ? body.model : undefined;
		if (body.data) {
			return { parsed: body.data, model };
		}

		if (!body.message) {
			return { parsed: null, model };
		}

		return { parsed: parseJsonFromText(body.message), model };
	} catch {
		return { parsed: null };
	}
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

function normalizeSentiment(value: unknown): SentimentLabel {
	if (value === 'bullish' || value === 'bearish' || value === 'neutral') {
		return value;
	}
	return 'neutral';
}

function normalizeConfidence(value: unknown): number {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return 0.5;
	}
	if (numeric < 0) return 0;
	if (numeric > 1) return 1;
	return numeric;
}

function normalizeStrength(value: unknown): 'weak' | 'medium' | 'strong' | null {
	if (value === 'weak' || value === 'medium' || value === 'strong') {
		return value;
	}
	return null;
}

function normalizeExplanation(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const clean = value.trim();
	return clean.length > 0 ? clean : null;
}
