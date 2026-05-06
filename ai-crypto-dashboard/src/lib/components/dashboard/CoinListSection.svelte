<script lang="ts">
	import { onDestroy } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';

	interface Coin {
		id: string;
		name: string;
		current_price: number;
		price_change_percentage_24h: number;
		image: string;
	}

	let {
		coins = [],
		compact = false,
		maxHeightClass = 'max-h-[360px]'
	}: {
		coins?: Coin[];
		compact?: boolean;
		maxHeightClass?: string;
	} = $props();
	let visibleCoins = $state<Coin[]>([]);
	let revealCycle = $state(0);
	let revealTimers: ReturnType<typeof setTimeout>[] = [];
	let lastCoinsKey = '';
	const FLY_DURATION_MS = 327;
	const TYPE_DELAY_MS = 240;
	const TYPE_DURATION_MS = 207;
	const REVEAL_STEP_MS = FLY_DURATION_MS + TYPE_DELAY_MS + TYPE_DURATION_MS;

	function entryMotion(index: number) {
		const vectors = [
			{ x: -460, y: -260, rotate: -24 },
			{ x: 500, y: -220, rotate: 20 },
			{ x: -420, y: 300, rotate: -18 },
			{ x: 460, y: 280, rotate: 16 }
		];
		const vector = vectors[index % vectors.length];

		return {
			duration: 980,
			delay: 120 * index,
			easing: cubicOut,
			css: (t: number) => {
				const tx = (1 - t) * vector.x;
				const ty = (1 - t) * vector.y;
				const rotate = (1 - t) * vector.rotate;
				const scale = 0.68 + t * 0.32;
				const blur = (1 - t) * 12;
				const glow = (1 - t) * 24;

				return `
					transform: translate(${tx}px, ${ty}px) rotate(${rotate}deg) scale(${scale});
					opacity: ${t};
					filter: blur(${blur}px);
					box-shadow: 0 0 ${glow}px rgba(34, 211, 238, 0.45);
				`;
			}
		};
	}

	function warpIn(_node: Element, index: number): TransitionConfig {
		return entryMotion(index);
	}

	function clearRevealTimers() {
		revealTimers.forEach((timer) => clearTimeout(timer));
		revealTimers = [];
	}

	function startRevealSequence(newCoins: Coin[]) {
		clearRevealTimers();
		visibleCoins = [];
		revealCycle += 1;
		newCoins.forEach((coin, index) => {
			const timer = setTimeout(() => {
				visibleCoins = [...visibleCoins, coin];
			}, index * REVEAL_STEP_MS);
			revealTimers.push(timer);
		});
	}

	$effect(() => {
		const key = coins.map((coin) => coin.id).join('|');
		if (key === lastCoinsKey) {
			return;
		}

		lastCoinsKey = key;
		startRevealSequence(coins);
	});

	onDestroy(() => {
		clearRevealTimers();
	});
</script>

<div
	class="rounded-2xl border border-cyan-400/20 bg-slate-900/70 p-4 shadow-[0_0_40px_rgba(14,116,144,0.18)] backdrop-blur {compact ? 'h-full' : ''}"
>
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-sm font-semibold uppercase tracking-wider text-cyan-100">Топ монеток</h2>
		<span class="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] text-cyan-200">{visibleCoins.length}/{coins.length} assets</span>
	</div>
	<div
		class="coin-scroll space-y-3 overflow-x-hidden pr-1 {compact ? maxHeightClass : ''} {coins.length > 0 && visibleCoins.length >= coins.length
			? 'overflow-y-auto'
			: 'overflow-y-hidden'}"
	>
		{#key revealCycle}
			{#each visibleCoins as coin, index (coin.id)}
				<div
				in:warpIn={index}
				class="coin-card flex items-center overflow-hidden rounded-xl border border-slate-600/70 bg-slate-900/65 p-3 shadow-[0_0_20px_rgba(15,23,42,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-slate-900"
				style="--typing-delay: 0.72s"
				>
					<img src={coin.image} alt={coin.name} class="mr-3 h-7 w-7" loading="lazy" />
					<div class="flex-1">
						<h3 class="type-text font-medium text-slate-100">{coin.name}</h3>
						<p class="text-xs text-slate-400">${coin.current_price.toLocaleString()}</p>
					</div>
					<div
						class="text-sm font-semibold {coin.price_change_percentage_24h >= 0 ? 'text-emerald-300' : 'text-rose-300'}"
					>
						{coin.price_change_percentage_24h >= 0 ? '+' : ''}{coin.price_change_percentage_24h.toFixed(2)}%
					</div>
				</div>
			{/each}
		{/key}
	</div>
</div>

<style>
	.coin-scroll {
		scrollbar-width: thin;
		scrollbar-color: rgba(34, 211, 238, 0.65) rgba(15, 23, 42, 0.55);
		overflow-x: hidden;
	}

	.coin-scroll::-webkit-scrollbar {
		width: 8px;
	}

	.coin-scroll::-webkit-scrollbar-track {
		background: linear-gradient(180deg, rgba(15, 23, 42, 0.45), rgba(30, 41, 59, 0.35));
		border-radius: 999px;
	}

	.coin-scroll::-webkit-scrollbar-thumb {
		background: linear-gradient(180deg, rgba(34, 211, 238, 0.85), rgba(129, 140, 248, 0.82));
		border-radius: 999px;
		border: 1px solid rgba(15, 23, 42, 0.6);
		box-shadow: 0 0 10px rgba(34, 211, 238, 0.35);
	}

	.coin-scroll::-webkit-scrollbar-thumb:hover {
		background: linear-gradient(180deg, rgba(103, 232, 249, 0.95), rgba(165, 180, 252, 0.9));
		box-shadow: 0 0 14px rgba(34, 211, 238, 0.5);
	}

	.coin-card {
		animation: card-glow-in 0.9s ease-out both;
	}

	.type-text {
		display: inline-block;
		overflow: hidden;
		white-space: nowrap;
		max-width: 0;
		border-right: 1px solid rgba(34, 211, 238, 0.8);
		animation: typing-reveal 0.62s steps(18, end) forwards, caret-fade 0.2s linear forwards;
		animation-delay: var(--typing-delay), calc(var(--typing-delay) + 0.62s);
	}

	@keyframes card-glow-in {
		0% {
			box-shadow: 0 0 0 rgba(34, 211, 238, 0);
		}
		55% {
			box-shadow: 0 0 24px rgba(34, 211, 238, 0.28);
		}
		100% {
			box-shadow: 0 0 20px rgba(15, 23, 42, 0.35);
		}
	}

	@keyframes typing-reveal {
		from {
			max-width: 0;
		}
		to {
			max-width: 18ch;
		}
	}

	@keyframes caret-fade {
		to {
			border-right-color: transparent;
		}
	}
</style>
