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

	function openNews(url: string): void {
		if (!isNewsLinkAvailable(url)) {
			return;
		}
		window.open(url, '_blank', 'noopener,noreferrer');
	}

	function isNewsLinkAvailable(url: string): boolean {
		return Boolean(url && !url.includes('example.com'));
	}
</script>

<div
	class="rounded-2xl border border-blue-400/20 bg-slate-900/70 p-6 shadow-[0_0_40px_rgba(59,130,246,0.18)] backdrop-blur transition-transform duration-300 hover:-translate-y-0.5"
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
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			{#each [1, 2, 3, 4] as i (i)}
				<div
					class="h-28 animate-pulse rounded-xl border border-blue-400/15 bg-slate-800/60"
					aria-hidden="true"
				></div>
			{/each}
		</div>
	{:else if newsError}
		<StatusDisplay type="error" title="Ошибка новостей" subtitle={newsError} />
	{:else}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			{#each news.slice(0, 10) as item (item.url)}
				<button
					type="button"
					onclick={() => openNews(item.url)}
					class={`flex h-full w-full flex-col rounded-xl border border-slate-600/70 bg-slate-800/70 p-4 text-left transition-all duration-300 ${
						isNewsLinkAvailable(item.url)
							? 'hover:-translate-y-0.5 hover:border-blue-300/40 hover:bg-slate-800/90'
							: 'cursor-not-allowed opacity-70'
					}`}
				>
					<h3 class="mb-3 line-clamp-2 font-medium text-slate-100 hover:text-blue-200">{item.title}</h3>
					<div
						class="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-200/85 sm:text-sm"
					>
						<span class="font-medium text-cyan-200/90">{item.source}</span>
						<span class="text-slate-400/90">·</span>
						<time class="text-slate-300/90" datetime={item.published_at}>{formatDate(item.published_at)}</time>
						{#if !isNewsLinkAvailable(item.url)}
							<span
								class="ml-auto rounded-full border border-amber-300/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200"
							>
								Источник недоступен
							</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
