<script lang="ts">
	import type { Alert } from '$lib/alerts/generateAlerts';
	import StatusDisplay from '$lib/components/dashboard/StatusDisplay.svelte';

	let { alerts = [], alertsLoading = false }: { alerts?: Alert[]; alertsLoading?: boolean } = $props();

	function getSeverityBadgeClass(severity: string): string {
		switch (severity) {
			case 'high':
				return 'bg-red-100 text-red-800';
			case 'medium':
				return 'bg-yellow-100 text-yellow-800';
			case 'low':
				return 'bg-blue-100 text-blue-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function getDecisionBadgeClass(decision: Alert['decision']): string {
		switch (decision) {
			case 'early_breakout':
				return 'border-orange-300/50 bg-orange-500/20 text-orange-100';
			case 'breakout':
				return 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100';
			case 'continuation':
				return 'border-cyan-300/40 bg-cyan-500/15 text-cyan-100';
			case 'pullback':
				return 'border-amber-300/40 bg-amber-500/15 text-amber-100';
			default:
				return 'border-slate-300/30 bg-slate-500/15 text-slate-100';
		}
	}

	function getDecisionLabel(decision: Alert['decision']): string {
		switch (decision) {
			case 'early_breakout':
				return '⚡ early_breakout';
			case 'breakout':
				return '🔥 breakout';
			case 'continuation':
				return 'continuation';
			case 'pullback':
				return 'pullback';
			default:
				return 'uncertain';
		}
	}
</script>

{#if alerts.length > 0 || alertsLoading}
	<div
		class="mb-8 rounded-2xl border border-indigo-400/20 bg-slate-900/70 p-6 shadow-[0_0_40px_rgba(99,102,241,0.18)] backdrop-blur transition-transform duration-300 hover:-translate-y-0.5"
	>
		<h2 class="mb-4 text-lg font-semibold text-indigo-100">Смарт-сигналы</h2>

		{#if alertsLoading}
			<StatusDisplay title="Генерируем сигналы" subtitle="Комбинируем правила и AI-анализ..." />
		{:else}
			<div class="space-y-4">
				{#each alerts as alert (alert.coinName + alert.message)}
					<div
						class="rounded-xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg
						{alert.type === 'bullish' ? 'border-emerald-500/40 bg-emerald-500/10' : ''}
						{alert.type === 'bearish' ? 'border-rose-500/40 bg-rose-500/10' : ''}
						{alert.type === 'warning' ? 'border-amber-500/40 bg-amber-500/10' : ''}"
					>
						<div class="mb-2 flex items-center gap-2">
							<span class="text-xl">{alert.icon}</span>
							<span
								class="font-semibold {alert.type === 'bullish' ? 'text-emerald-200' : ''}
								{alert.type === 'bearish' ? 'text-rose-200' : ''}
								{alert.type === 'warning' ? 'text-amber-200' : ''}"
							>
								{alert.coinName}
							</span>
							<span
								class="ml-auto rounded-full px-2 py-1 text-xs font-medium {getSeverityBadgeClass(
									alert.severity
								)}"
							>
								{alert.severity}
							</span>
						</div>
						<p class="text-sm font-medium text-slate-100">{alert.reason}</p>
						<p class="mt-1 text-xs text-slate-300">Действие: {alert.actionHint}</p>
						<div class="mt-2 flex items-center gap-2 text-xs">
							<span
								class="rounded-full border px-2 py-1 uppercase tracking-wide {getDecisionBadgeClass(
									alert.decision
								)}"
							>
								{getDecisionLabel(alert.decision)}
							</span>
							<span class="text-slate-400">
								24ч: {alert.priceChange24h >= 0 ? '+' : ''}{alert.priceChange24h.toFixed(1)}%
							</span>
							{#if alert.shortTermChange5mPercent !== null}
								<span class="text-slate-400">
									5м: {alert.shortTermChange5mPercent >= 0 ? '+' : ''}{alert.shortTermChange5mPercent.toFixed(1)}%
								</span>
							{/if}
							{#if alert.shortTermChange15mPercent !== null}
								<span class="text-slate-400">
									15м: {alert.shortTermChange15mPercent >= 0 ? '+' : ''}{alert.shortTermChange15mPercent.toFixed(1)}%
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
