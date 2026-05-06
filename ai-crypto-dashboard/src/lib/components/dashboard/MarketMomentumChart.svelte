<script lang="ts">
	import { onMount } from 'svelte';
	import type { CoinData } from '$lib/api/coins';

	let { coins = [] }: { coins?: CoinData[] } = $props();

	let canvasEl: HTMLCanvasElement | null = null;
	let chart: import('chart.js/auto').Chart | null = null;

	function buildDataset(currentCoins: CoinData[]) {
		const sorted = [...currentCoins]
			.sort((a, b) => Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h))
			.slice(0, 8);

		return {
			labels: sorted.map((coin) => coin.name),
			values: sorted.map((coin) => Number(coin.price_change_percentage_24h.toFixed(2)))
		};
	}

	async function renderChart() {
		if (!canvasEl) return;

		const { default: Chart } = await import('chart.js/auto');
		const { labels, values } = buildDataset(coins);
		const colors = values.map((value) => (value >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.75)'));

		if (chart) {
			chart.data.labels = labels;
			chart.data.datasets[0].data = values;
			chart.data.datasets[0].backgroundColor = colors;
			chart.update();
			return;
		}

		chart = new Chart(canvasEl, {
			type: 'bar',
			data: {
				labels,
				datasets: [
					{
						label: 'Изм. за 24ч, %',
						data: values,
						backgroundColor: colors,
						borderRadius: 10
					}
				]
			},
			options: {
				animation: { duration: 850, easing: 'easeOutQuart' },
				plugins: {
					legend: { display: false },
					tooltip: {
						backgroundColor: 'rgba(15,23,42,0.95)',
						titleColor: '#e2e8f0',
						bodyColor: '#cbd5e1',
						displayColors: false
					}
				},
				scales: {
					x: {
						ticks: { color: '#94a3b8', maxRotation: 0, minRotation: 0 },
						grid: { display: false }
					},
					y: {
						ticks: { color: '#94a3b8' },
						grid: { color: 'rgba(148,163,184,0.12)' }
					}
				}
			}
		});
	}

	onMount(() => {
		void renderChart();

		return () => {
			chart?.destroy();
			chart = null;
		};
	});

	$effect(() => {
		void coins;
		if (!chart) return;
		void renderChart();
	});
</script>

<div
	class="rounded-2xl border border-cyan-400/20 bg-slate-900/70 p-6 shadow-[0_0_40px_rgba(14,116,144,0.18)] backdrop-blur transition-transform duration-300 hover:-translate-y-0.5"
>
	<div class="mb-4 flex items-center justify-between">
		<h2 class="text-lg font-semibold text-cyan-100">Радар импульса рынка</h2>
		<span class="rounded-full bg-cyan-400/15 px-3 py-1 text-xs text-cyan-200">Top 8 movers</span>
	</div>
	<canvas bind:this={canvasEl} class="h-[260px] w-full"></canvas>
</div>
