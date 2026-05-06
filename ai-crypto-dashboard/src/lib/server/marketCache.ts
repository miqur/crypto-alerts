export interface CoinData {
	id: string;
	name: string;
	current_price: number;
	total_volume: number;
	price_change_percentage_24h: number;
	image: string;
}

type CacheState = {
	data: CoinData[];
	timestamp: number;
	ttlMs: number;
	priorityTimestamp: number;
	priorityTtlMs: number;
};

const MAX_ATTEMPTS = 3;
const QUICK_CHECK_MOVE_THRESHOLD_PERCENT = 1.5;
const EARLY_INVALIDATION_MOVE_THRESHOLD_PERCENT = 3;

let cache: CacheState | null = null;
let inFlight: Promise<CoinData[]> | null = null;
let lastQuickBtcPriceUsd: number | null = null;

type HttpError = Error & { status?: number };

function getFallbackCoins(): CoinData[] {
	return [
		{
			id: 'bitcoin',
			name: 'Bitcoin',
			current_price: 0,
			total_volume: 0,
			price_change_percentage_24h: 0,
			image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png'
		},
		{
			id: 'ethereum',
			name: 'Ethereum',
			current_price: 0,
			total_volume: 0,
			price_change_percentage_24h: 0,
			image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png'
		},
		{
			id: 'the-open-network',
			name: 'TON',
			current_price: 0,
			total_volume: 0,
			price_change_percentage_24h: 0,
			image: 'https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png'
		}
	];
}

export async function getMarketCoins(): Promise<CoinData[]> {
	const now = Date.now();
	if (cache && now - cache.timestamp < cache.ttlMs) {
		if (now - cache.priorityTimestamp >= cache.priorityTtlMs) {
			console.log('Market cache hit, refreshing priority coins (BTC/ETH)');
			await refreshPriorityCoins();
		} else {
			console.log('Market cache hit');
		}
		return cache.data;
	}

	if (inFlight) {
		console.log('Market cache miss: reuse in-flight request');
		return inFlight;
	}

	console.log('Market cache miss: cache stale or empty. Calling CoinGecko...');
	inFlight = fetchCoinsFromCoinGeckoWithRetry().finally(() => {
		inFlight = null;
	});
	const data = await inFlight;
	setMarketCache(data);
	return data;
}

export function invalidateMarketCache(reason: string): void {
	cache = null;
	console.log(`Cache invalidated early: ${reason}`);
}

export function estimateMarketVolatility(coins: CoinData[]): number {
	if (coins.length === 0) return 0;
	const averageAbsChange =
		coins.reduce((sum, coin) => sum + Math.abs(coin.price_change_percentage_24h ?? 0), 0) /
		coins.length;
	return Number.isFinite(averageAbsChange) ? averageAbsChange : 0;
}

export function getPollingIntervalMs(volatility: number): number {
	if (volatility >= 5) {
		console.log('High volatility detected');
		console.log('Switching to fast polling');
		return 5 * 60 * 1000;
	}
	if (volatility >= 2) {
		return 15 * 60 * 1000;
	}
	return 30 * 60 * 1000;
}

export async function runQuickBtcCheck(): Promise<{ shouldRefresh: boolean; movePercent: number }> {
	try {
		const response = await fetch(
			'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
		);
		if (!response.ok) {
			return { shouldRefresh: false, movePercent: 0 };
		}

		const json = (await response.json()) as {
			bitcoin?: { usd?: number };
		};
		const price = json.bitcoin?.usd;
		if (typeof price !== 'number' || price <= 0) {
			return { shouldRefresh: false, movePercent: 0 };
		}

		if (lastQuickBtcPriceUsd === null) {
			lastQuickBtcPriceUsd = price;
			return { shouldRefresh: false, movePercent: 0 };
		}

		const movePercent = Math.abs(((price - lastQuickBtcPriceUsd) / lastQuickBtcPriceUsd) * 100);
		lastQuickBtcPriceUsd = price;
		const shouldRefresh = movePercent >= QUICK_CHECK_MOVE_THRESHOLD_PERCENT;

		if (movePercent >= EARLY_INVALIDATION_MOVE_THRESHOLD_PERCENT) {
			invalidateMarketCache(`BTC moved ${movePercent.toFixed(2)}% (threshold 3%)`);
		}

		return { shouldRefresh, movePercent };
	} catch (error) {
		console.warn('BTC quick check failed; keep cached data if possible.', error);
		return { shouldRefresh: false, movePercent: 0 };
	}
}

async function fetchCoinsFromCoinGeckoWithRetry(): Promise<CoinData[]> {
	let lastStatus = 0;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		console.log(`CoinGecko API call (attempt ${attempt}/${MAX_ATTEMPTS})`);
		try {
			const coins = await fetchTopCoins();
			return coins;
		} catch (err) {
			const status = err instanceof Error ? ((err as HttpError).status ?? 0) : 0;
			lastStatus = status || lastStatus;

			if (status === 429 && attempt < MAX_ATTEMPTS) {
				const backoffMs = attempt * 2000;
				console.warn(`CoinGecko 429. Retry in ${backoffMs}ms...`);
				await wait(backoffMs);
				continue;
			}

			// For other failures: if we have stale cache, return it. Otherwise fallback.
			if (cache?.data?.length) {
				console.warn('CoinGecko failed; using stale cached market data.', err);
				return cache.data;
			}
			console.warn('CoinGecko failed; trying emergency market source.', err);
			const emergencyData = await fetchEmergencyCoins();
			if (emergencyData.length > 0) {
				console.warn('Emergency source used for market data.');
				return emergencyData;
			}
			console.error('All market sources failed; using static fallback data.');
			return getFallbackCoins();
		}
	}

	throw new Error(`CoinGecko failed for all attempts: ${lastStatus}`);
}

async function refreshPriorityCoins(): Promise<void> {
	if (!cache) return;
	try {
		const response = await fetch(
			'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum'
		);
		if (!response.ok) {
			return;
		}

		const priorityCoins = (await response.json()) as CoinData[];
		if (priorityCoins.length === 0) {
			return;
		}

		const byId = new Map(priorityCoins.map((coin) => [coin.id, coin] as const));
		cache.data = cache.data.map((coin) => byId.get(coin.id) ?? coin);
		cache.priorityTimestamp = Date.now();
	} catch (error) {
		console.warn('Failed to refresh priority coins (BTC/ETH).', error);
	}
}

function setMarketCache(data: CoinData[]): void {
	const volatility = estimateMarketVolatility(data);
	const ttlMs = resolveAdaptiveTtlMs(volatility);
	const priorityTtlMs = resolvePriorityTtlMs(volatility);
	cache = {
		data,
		timestamp: Date.now(),
		ttlMs,
		priorityTimestamp: Date.now(),
		priorityTtlMs
	};
}

function resolveAdaptiveTtlMs(volatility: number): number {
	if (volatility >= 5) {
		console.log('High volatility detected');
		return 30 * 1000;
	}
	if (volatility >= 2) {
		return 90 * 1000;
	}
	return 180 * 1000;
}

function resolvePriorityTtlMs(volatility: number): number {
	if (volatility >= 5) {
		return 20 * 1000;
	}
	if (volatility >= 2) {
		return 45 * 1000;
	}
	return 60 * 1000;
}

async function fetchTopCoins(): Promise<CoinData[]> {
	const topResponse = await fetch(
		'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1'
	);

	if (!topResponse.ok) {
		const err: HttpError = new Error(`Failed CoinGecko fetch: ${topResponse.status}`);
		err.status = topResponse.status;
		throw err;
	}

	const topData = (await topResponse.json()) as CoinData[];

	// Always include TON (the-open-network)
	const hasTON = topData.some((c) => c.id === 'the-open-network');
	if (!hasTON) {
		const tonResponse = await fetch(
			'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=the-open-network'
		);
		if (tonResponse.ok) {
			const tonData = (await tonResponse.json()) as CoinData[];
			if (tonData.length) topData.push(tonData[0]);
		}
	}

	return topData;
}

async function fetchEmergencyCoins(): Promise<CoinData[]> {
	try {
		const response = await fetch('https://api.coincap.io/v2/assets?limit=12');
		if (!response.ok) {
			return [];
		}

		const payload = (await response.json()) as {
			data?: Array<{
				id?: string;
				name?: string;
				symbol?: string;
				priceUsd?: string;
				changePercent24Hr?: string;
				volumeUsd24Hr?: string;
			}>;
		};
		const data = payload.data ?? [];
		if (data.length === 0) {
			return [];
		}

		const mapped = data
			.map((asset) => {
				const id = normalizeAssetId(asset.id, asset.symbol);
				const name = normalizeAssetName(asset.name, asset.symbol);
				const currentPrice = Number(asset.priceUsd ?? 0);
				const change24h = Number(asset.changePercent24Hr ?? 0);
				const volume = Number(asset.volumeUsd24Hr ?? 0);
				return {
					id,
					name,
					current_price: Number.isFinite(currentPrice) ? currentPrice : 0,
					total_volume: Number.isFinite(volume) ? volume : 0,
					price_change_percentage_24h: Number.isFinite(change24h) ? change24h : 0,
					image: coinImageById(id)
				} satisfies CoinData;
			})
			.filter((coin) => coin.id !== 'unknown');

		const withTon = ensureTonInEmergencySet(mapped);
		return withTon.slice(0, 10);
	} catch (error) {
		console.warn('Emergency market source failed.', error);
		return [];
	}
}

function ensureTonInEmergencySet(coins: CoinData[]): CoinData[] {
	const hasTon = coins.some((coin) => coin.id === 'the-open-network');
	if (hasTon) {
		return coins;
	}

	const tonBySymbol = coins.find((coin) => coin.name.toLowerCase().includes('ton'));
	if (tonBySymbol) {
		return coins.map((coin) =>
			coin === tonBySymbol ? { ...coin, id: 'the-open-network', name: 'TON' } : coin
		);
	}

	return [...coins, getFallbackCoins()[2]];
}

function normalizeAssetId(rawId?: string, symbol?: string): string {
	const id = (rawId ?? '').toLowerCase().trim();
	const sym = (symbol ?? '').toLowerCase().trim();
	if (id === 'toncoin' || sym === 'ton') return 'the-open-network';
	if (id) return id;
	return 'unknown';
}

function normalizeAssetName(rawName?: string, symbol?: string): string {
	if (symbol?.toUpperCase() === 'TON') return 'TON';
	return rawName?.trim() || symbol?.toUpperCase() || 'Unknown';
}

function coinImageById(id: string): string {
	const map: Record<string, string> = {
		bitcoin: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
		ethereum: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
		'the-open-network': 'https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png',
		tether: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
		'usd-coin': 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
		bnb: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
		solana: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
		xrp: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
		dogecoin: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
		cardano: 'https://assets.coingecko.com/coins/images/975/large/cardano.png'
	};
	return map[id] ?? '';
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
