<script lang="ts">
	import StatusDisplay from '$lib/components/dashboard/StatusDisplay.svelte';

	let {
		newsSentiment = '',
		sentimentLoading = false,
		sentimentLabel = ''
	}: {
		newsSentiment?: string;
		sentimentLoading?: boolean;
		sentimentLabel?: 'bullish' | 'bearish' | 'neutral' | '';
	} = $props();

	function cleanSentimentText(raw: string): string {
		return raw
			.replace(/\*\*/g, '')
			.replace(/\|/g, '')
			.replace(/`/g, '')
			.replace(/\n{3,}/g, '\n\n')
			.trim();
	}

	function sentimentSummary(raw: string): string {
		const cleaned = cleanSentimentText(raw);
		const lines = cleaned
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		const meaningful = lines.find(
			(line) =>
				!line.toLowerCase().includes('summary') &&
				!line.toLowerCase().includes('overall market sentiment') &&
				!line.toLowerCase().includes('topic key points') &&
				!/^-+$/.test(line)
		);

		return meaningful ?? 'Анализ тональности готов.';
	}

	function sentimentHighlights(raw: string): string[] {
		const cleaned = cleanSentimentText(raw);
		const sentences = cleaned
			.replace(/\n/g, ' ')
			.split(/[.!?]+/)
			.map((item) => item.trim())
			.filter((item) => item.length > 30);

		const unique: string[] = [];
		for (const sentence of sentences) {
			const normalized = sentence.toLowerCase();
			if (unique.some((item) => item.toLowerCase() === normalized)) {
				continue;
			}
			unique.push(sentence);
			if (unique.length === 4) {
				break;
			}
		}

		return unique;
	}

	function sentimentTitle(label: typeof sentimentLabel): string {
		if (label === 'bullish') return 'Бычий взгляд';
		if (label === 'bearish') return 'Медвежий взгляд';
		return 'Нейтральный взгляд';
	}
</script>

{#if newsSentiment || sentimentLoading}
	<div
		class="mb-8 rounded-2xl border border-fuchsia-400/20 bg-slate-900/70 p-6 shadow-[0_0_40px_rgba(217,70,239,0.18)] backdrop-blur transition-transform duration-300 hover:-translate-y-0.5"
	>
		<h2 class="mb-4 text-lg font-semibold text-fuchsia-100">Тональность новостей</h2>

		{#if sentimentLoading}
			<StatusDisplay title="Анализируем тональность" subtitle="LLM оценивает новостной фон рынка..." />
		{:else}
			<div class="mb-3 flex items-center gap-3">
				<span
					class="inline-block rounded-full px-3 py-1 text-sm font-semibold
					{sentimentLabel === 'bullish' ? 'bg-green-100 text-green-800' : ''}
					{sentimentLabel === 'bearish' ? 'bg-red-100 text-red-800' : ''}
					{sentimentLabel === 'neutral' ? 'bg-gray-100 text-gray-800' : ''}"
				>
					{sentimentLabel.charAt(0).toUpperCase() + sentimentLabel.slice(1)}
				</span>
				<span class="text-sm font-medium text-slate-300">{sentimentTitle(sentimentLabel)}</span>
			</div>
			<div class="rounded-xl border border-slate-600/70 bg-linear-to-br from-slate-800 to-slate-900 p-4">
				<p class="mb-3 text-sm font-medium text-slate-100">{sentimentSummary(newsSentiment)}</p>
				<div class="space-y-2">
					{#each sentimentHighlights(newsSentiment) as point (point)}
						<div class="flex items-start gap-2 text-sm leading-relaxed text-slate-300">
							<span class="mt-0.5 text-fuchsia-300">•</span>
							<span>{point}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
