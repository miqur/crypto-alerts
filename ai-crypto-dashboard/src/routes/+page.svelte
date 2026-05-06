<script lang="ts">
	import { onMount } from 'svelte';
	import type { CoinData } from '$lib/api/coins';
	import type { NewsItem } from '$lib/api/news';
	import type { Alert } from '$lib/alerts/generateAlerts';
	import {
		loadInitialDashboardData,
		loadNewsPipeline,
		type SentimentLabel
	} from '$lib/dashboard/service';
	import SmartAlertsSection from '$lib/components/dashboard/SmartAlertsSection.svelte';
	import MarketInsightCard from '$lib/components/dashboard/MarketInsightCard.svelte';
	import LatestNewsSection from '$lib/components/dashboard/LatestNewsSection.svelte';
	import NewsSentimentSection from '$lib/components/dashboard/NewsSentimentSection.svelte';
	import CoinListSection from '$lib/components/dashboard/CoinListSection.svelte';
	import MarketMomentumChart from '$lib/components/dashboard/MarketMomentumChart.svelte';
	import StatusDisplay from '$lib/components/dashboard/StatusDisplay.svelte';

	let coins = $state<CoinData[]>([]);
	let news = $state<NewsItem[]>([]);
	let alerts = $state<Alert[]>([]);
	let newsLoading = $state(true);
	let newsError = $state<string | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let aiInsight = $state('');
	let newsSentiment = $state('');
	let sentimentLabel = $state<SentimentLabel | ''>('');
	let sentimentLoading = $state(false);
	let alertsLoading = $state(false);

	onMount(async () => {
		try {
			const initialData = await loadInitialDashboardData();
			coins = initialData.coins;
			aiInsight = initialData.aiInsight;
		} catch (err) {
			console.error(err);
			error = 'Не удалось загрузить данные';
		} finally {
			loading = false;
		}

		await refreshNews();
	});

	async function refreshNews() {
		newsLoading = true;
		sentimentLoading = true;
		alertsLoading = true;
		newsError = null;
		try {
			const pipeline = await loadNewsPipeline(coins);
			news = pipeline.news;
			newsSentiment = pipeline.newsSentiment;
			sentimentLabel = pipeline.sentimentLabel;
			alerts = pipeline.alerts;
		} catch (err) {
			console.error(err);
			newsError = 'Failed to load news';
		} finally {
			newsLoading = false;
			sentimentLoading = false;
			alertsLoading = false;
		}
	}

	function formatPrice(value: number): string {
		return `$${value.toLocaleString('en-US', {
			maximumFractionDigits: value >= 100 ? 0 : 2
		})}`;
	}
</script>

<div
	class="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_60%)] p-6 pt-20 text-slate-100"
>
	{#if coins.length > 0}
		<div
			class="fixed top-0 right-0 left-0 z-50 overflow-hidden border-b border-cyan-300/20 bg-slate-950/85 backdrop-blur-md"
		>
			<div class="ticker-track py-2">
				<div class="ticker-content">
					{#each [...coins, ...coins] as coin, idx (`${coin.id}-${idx}`)}
						<div class="ticker-item">
							<span class="font-semibold text-cyan-200">{coin.name}</span>
							<span class="text-slate-300">{formatPrice(coin.current_price)}</span>
							<span
								class={coin.price_change_percentage_24h >= 0
									? 'font-semibold text-emerald-300'
									: 'font-semibold text-rose-300'}
							>
								{coin.price_change_percentage_24h >= 0
									? '+'
									: ''}{coin.price_change_percentage_24h.toFixed(1)}%
							</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<div class="mx-auto flex w-full max-w-6xl flex-1 flex-col">
		<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
			<div>
				<p class="mb-2 text-xs tracking-[0.35em] text-cyan-300/80 uppercase">
					Crypto Intelligence Terminal
				</p>
				<h1 class="text-3xl font-bold text-white sm:text-4xl">Pulse Dashboard</h1>
				<p class="mt-2 text-sm text-slate-300">
					Сигналы, тональность и рыночный импульс в реальном времени
				</p>
			</div>
			<div
				class="rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100"
			>
				Live Mode
			</div>
		</div>

		{#if loading}
			<StatusDisplay title="Загружаем дашборд" subtitle="Собираем цены, новости и сигналы..." />
		{:else if error}
			<StatusDisplay type="error" title="Ошибка загрузки" subtitle={error} />
		{:else}
			<div class="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
				<SmartAlertsSection {alerts} {alertsLoading} />
				<MarketInsightCard {aiInsight} />
			</div>

			<div class="mb-8 grid grid-cols-1 items-stretch gap-6 xl:grid-cols-3">
				<div class="xl:col-span-2">
					<MarketMomentumChart {coins} />
				</div>
				<div>
					<CoinListSection {coins} compact={true} maxHeightClass="max-h-[338px]" />
				</div>
			</div>

			<div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
				<NewsSentimentSection {newsSentiment} {sentimentLoading} {sentimentLabel} />
				<LatestNewsSection {news} {newsLoading} {newsError} onRefresh={refreshNews} />
			</div>
		{/if}

		<footer class="mt-auto border-t border-slate-700/50 pt-4 text-center text-xs text-slate-400">
			© {new Date().getFullYear()} Crypto Dashboard. All rights reserved.
		</footer>
	</div>
</div>

<style>
	.ticker-track {
		overflow: hidden;
		white-space: nowrap;
	}

	.ticker-content {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		min-width: max-content;
		animation: ticker-scroll 34s linear infinite;
		padding-inline: 1rem;
	}

	.ticker-item {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		border: 1px solid rgba(56, 189, 248, 0.2);
		border-radius: 9999px;
		padding: 0.35rem 0.8rem;
		background: rgba(15, 23, 42, 0.7);
	}

	@keyframes ticker-scroll {
		0% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(-50%);
		}
	}
</style>
