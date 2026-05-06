import { env } from '$env/dynamic/private';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_FREE_MODELS = [
	'google/gemma-2-9b-it:free',
	'microsoft/phi-3-mini-128k-instruct:free',
	'qwen/qwen-2.5-7b-instruct:free'
];
const MODELS_CACHE_TTL_MS = 10 * 60 * 1000;

interface OpenRouterChoice {
	message?: {
		content?: string;
	};
}

interface OpenRouterResponse {
	choices?: OpenRouterChoice[];
	model?: string;
}

interface OpenRouterModelsResponse {
	data?: Array<{ id?: string }>;
}

export interface AIProviderResponse {
	content: string;
	model: string;
}

let freeModelsCache: { models: string[]; timestamp: number } | null = null;

export async function generateAIResponse(prompt: string): Promise<string> {
	const result = await generateAIResponseWithMeta(prompt);
	return result.content;
}

export async function generateAIResponseWithMeta(prompt: string): Promise<AIProviderResponse> {
	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error('OPENROUTER_API_KEY is not configured');
	}

	const models = await buildModelFallbackList(apiKey);
	let lastError = 'Unknown OpenRouter error';

	for (const model of models) {
		const response = await fetch(OPENROUTER_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model,
				messages: [{ role: 'user', content: prompt }]
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			lastError = `model=${model}, status=${response.status}, body=${errorText}`;

			// 404/400 often means model unavailable for account; try next model.
			if (response.status === 404 || response.status === 400) {
				console.warn(`OpenRouter model unavailable, trying next: ${model}`);
				continue;
			}

			// For other errors keep trying next model too, but log once.
			console.warn(`OpenRouter request failed, trying next model: ${model}`);
			continue;
		}

		const data = (await response.json()) as OpenRouterResponse;
		const content = data.choices?.[0]?.message?.content?.trim();
		const resolvedModel = data.model?.trim() || model;

		if (content) {
			return { content, model: resolvedModel };
		}

		lastError = `model=${model}, empty response content`;
	}

	throw new Error(`OpenRouter request failed for all models: ${lastError}`);
}

async function buildModelFallbackList(apiKey: string): Promise<string[]> {
	const envModel = env.OPENROUTER_MODEL?.trim();
	const discoveredFreeModels = await getAvailableFreeModels(apiKey);
	const fallbackModels =
		discoveredFreeModels.length > 0 ? discoveredFreeModels : [...DEFAULT_FREE_MODELS, 'openrouter/auto'];

	if (!envModel) {
		return dedupeModels(fallbackModels);
	}

	return dedupeModels([envModel, ...fallbackModels]);
}

async function getAvailableFreeModels(apiKey: string): Promise<string[]> {
	const now = Date.now();
	if (freeModelsCache && now - freeModelsCache.timestamp < MODELS_CACHE_TTL_MS) {
		return freeModelsCache.models;
	}

	try {
		const response = await fetch(OPENROUTER_MODELS_URL, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			return [];
		}

		const body = (await response.json()) as OpenRouterModelsResponse;
		const models = (body.data ?? [])
			.map((item) => item.id?.trim() ?? '')
			.filter((id) => id.length > 0 && id.includes(':free'))
			.slice(0, 30);

		freeModelsCache = { models, timestamp: now };
		return models;
	} catch {
		return [];
	}
}

function dedupeModels(models: string[]): string[] {
	const unique: string[] = [];
	for (const model of models) {
		if (!model) continue;
		if (!unique.includes(model)) {
			unique.push(model);
		}
	}
	return unique;
}
