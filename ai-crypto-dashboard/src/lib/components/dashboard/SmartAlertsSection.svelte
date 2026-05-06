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
						<p class="text-slate-200">{alert.message}</p>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
