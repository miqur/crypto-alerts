<script lang="ts">
	let {
		title = 'Загрузка',
		subtitle = 'Подготавливаем данные...',
		type = 'loading'
	}: {
		title?: string;
		subtitle?: string;
		type?: 'loading' | 'error';
	} = $props();
</script>

<div
	class="flex items-center gap-4 rounded-xl border px-4 py-4 {type === 'error'
		? 'border-rose-500/35 bg-rose-500/10'
		: 'border-cyan-400/25 bg-cyan-500/10'}"
>
	<div class="relative grid h-12 w-12 place-items-center">
		{#if type === 'loading'}
			<span class="absolute h-12 w-12 rounded-full border border-cyan-300/40 pulse-ring"></span>
			<svg viewBox="0 0 100 100" class="h-10 w-10 rotate-orbit">
				<defs>
					<linearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stop-color="#67e8f9" />
						<stop offset="100%" stop-color="#818cf8" />
					</linearGradient>
				</defs>
				<circle cx="50" cy="50" r="30" fill="none" stroke="url(#orbitGrad)" stroke-width="8" stroke-linecap="round" stroke-dasharray="140 70"></circle>
			</svg>
		{:else}
			<span class="absolute h-12 w-12 rounded-full border border-rose-300/40 pulse-ring"></span>
			<svg viewBox="0 0 100 100" class="h-10 w-10 wobble">
				<defs>
					<linearGradient id="errorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stop-color="#fb7185" />
						<stop offset="100%" stop-color="#f43f5e" />
					</linearGradient>
				</defs>
				<path d="M50 12 L88 82 H12 Z" fill="url(#errorGrad)"></path>
				<rect x="46" y="34" width="8" height="26" rx="4" fill="#fff"></rect>
				<circle cx="50" cy="72" r="4" fill="#fff"></circle>
			</svg>
		{/if}
	</div>

	<div>
		<p class="text-sm font-semibold {type === 'error' ? 'text-rose-200' : 'text-cyan-100'}">{title}</p>
		<p class="text-xs {type === 'error' ? 'text-rose-100/85' : 'text-slate-200/90'}">{subtitle}</p>
	</div>
</div>

<style>
	.rotate-orbit {
		animation: rotate-orbit 1.5s linear infinite;
	}

	.pulse-ring {
		animation: pulse-ring 1.8s ease-in-out infinite;
	}

	.wobble {
		animation: wobble 1.2s ease-in-out infinite;
	}

	@keyframes rotate-orbit {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes pulse-ring {
		0%,
		100% {
			transform: scale(0.85);
			opacity: 0.35;
		}
		50% {
			transform: scale(1.08);
			opacity: 0.9;
		}
	}

	@keyframes wobble {
		0%,
		100% {
			transform: rotate(0deg);
		}
		25% {
			transform: rotate(-3deg);
		}
		75% {
			transform: rotate(3deg);
		}
	}
</style>
