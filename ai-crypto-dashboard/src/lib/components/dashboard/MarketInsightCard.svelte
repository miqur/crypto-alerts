<script lang="ts">
	let { aiInsight = '' }: { aiInsight?: string } = $props();
</script>

{#if aiInsight}
	<div
		class="rounded-2xl border border-violet-400/20 bg-slate-900/70 p-6 shadow-[0_0_40px_rgba(139,92,246,0.18)] backdrop-blur transition-transform duration-300 hover:-translate-y-0.5"
	>
		<h2 class="mb-4 text-lg font-semibold text-violet-100">Рыночный инсайт</h2>
		<p class="whitespace-pre-line text-slate-200">{aiInsight}</p>
	</div>
{/if}
