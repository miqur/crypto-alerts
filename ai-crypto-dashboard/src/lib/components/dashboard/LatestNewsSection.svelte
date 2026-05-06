<script lang="ts">
	import type { NewsItem } from '$lib/api/news';
	import StatusDisplay from '$lib/components/dashboard/StatusDisplay.svelte';

	let {
		news = [],
		newsLoading = false,
		newsError = null,
		onRefresh = () => {}
	}: {
		news?: NewsItem[];
		newsLoading?: boolean;
		newsError?: string | null;
		onRefresh?: () => void;
	} = $props();

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleString('ru-RU', {
			day: 'numeric',
			month: 'long',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div
	class="mb-8 rounded-2xl border border-blue-400/20 bg-slate-900/70 p-6 shadow-[0_0_40px_rgba(59,130,246,0.18)] backdrop-blur transition-transform duration-300 hover:-translate-y-0.5"
>
	<div class="mb-4 flex items-center justify-between">
		<h2 class="text-lg font-semibold text-blue-100">Последние крипто-новости</h2>
		<button
			onclick={onRefresh}
			disabled={newsLoading}
			class="rounded-lg border border-blue-300/30 bg-blue-500/25 px-4 py-2 text-sm text-blue-100 transition-all hover:bg-blue-500/35 disabled:opacity-50"
		>
			{newsLoading ? 'Загрузка...' : 'Обновить'}
		</button>
	</div>

	{#if newsLoading}
		<StatusDisplay title="Загружаем новости" subtitle="Подключаем источники и фильтруем поток..." />
	{:else if newsError}
		<StatusDisplay type="error" title="Ошибка новостей" subtitle={newsError} />
	{:else}
		<div class="space-y-4">
			{#each news.slice(0, 10) as item (item.url)}
				<button
					type="button"
					onclick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
					class="block w-full rounded-xl border border-slate-600/70 bg-slate-800/70 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-300/40 hover:bg-slate-800"
				>
					<h3 class="mb-2 font-medium text-slate-100 hover:text-blue-200">{item.title}</h3>
					<div class="flex items-center gap-2 text-sm text-slate-400">
						<span>{item.source}</span>
						<span>•</span>
						<span>{formatDate(item.published_at)}</span>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
