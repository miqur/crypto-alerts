export interface CurrencyRateItem {
	bank: string;
	buy: number;
	sell: number;
	official?: boolean;
}

interface CachedRates {
	data: CurrencyRateItem[];
	timestamp: number;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
let currencyCache: CachedRates | null = null;

const BANK_PATTERNS = [
	{
		key: 'alfa',
		bank: 'Альфа-Банк',
		pattern: /Альфа-Банк([\s\S]{0,260}?)(\d,\d{4})([\s\S]{0,120}?)(\d,\d{4})/i
	},
	{
		key: 'bsb',
		bank: 'БСБ-Банк',
		pattern: /БСБ-Банк([\s\S]{0,260}?)(\d,\d{4})([\s\S]{0,120}?)(\d,\d{4})/i
	},
	{
		key: 'bnb',
		bank: 'БНБ-Банк',
		pattern: /Белорусский Народный Банк([\s\S]{0,300}?)(\d,\d{4})([\s\S]{0,120}?)(\d,\d{4})/i
	},
	{
		key: 'prior',
		bank: 'Приорбанк',
		pattern: /Приорбанк([\s\S]{0,260}?)(\d,\d{4})([\s\S]{0,120}?)(\d,\d{4})/i
	}
];

export async function getUsdBynRates(): Promise<CurrencyRateItem[]> {
	const now = Date.now();
	if (currencyCache && now - currencyCache.timestamp < CACHE_TTL_MS) {
		return currencyCache.data;
	}

	let officialRate = 0;
	try {
		officialRate = await fetchNbrbUsdRate();
	} catch (error) {
		console.warn('NBRB USD rate failed:', error);
	}

	let pageText = '';
	try {
		pageText = await fetchBanki24Page();
	} catch (error) {
		console.warn('banki24.by fetch failed:', error);
	}

	const bankRates = extractBankRates(pageText);

	const data: CurrencyRateItem[] = [
		{
			bank: 'Нацбанк',
			buy: officialRate,
			sell: officialRate,
			official: true
		},
		...bankRates
	];

	const hasAnyRate =
		(Number.isFinite(officialRate) && officialRate > 0) ||
		bankRates.some((b) => b.buy > 0 && b.sell > 0);

	if (hasAnyRate) {
		currencyCache = { data, timestamp: now };
		return data;
	}

	if (currencyCache) {
		return currencyCache.data;
	}

	console.warn('Currency: no rates from NBRB or banki24, returning empty');
	return [];
}

async function fetchNbrbUsdRate(): Promise<number> {
	const response = await fetch('https://api.nbrb.by/exrates/rates/USD?parammode=2', {
		headers: { Accept: 'application/json' }
	});
	if (!response.ok) {
		throw new Error(`NBRB API failed: ${response.status}`);
	}
	const payload = (await response.json()) as { Cur_OfficialRate?: number };
	const rate = Number(payload.Cur_OfficialRate);
	if (!Number.isFinite(rate) || rate <= 0) {
		throw new Error('NBRB API returned invalid USD rate');
	}
	return rate;
}

async function fetchBanki24Page(): Promise<string> {
	const response = await fetch('https://banki24.by/kurs', {
		headers: {
			Accept: 'text/html,application/xhtml+xml',
			'User-Agent': 'Mozilla/5.0'
		}
	});
	if (!response.ok) {
		throw new Error(`banki24 fetch failed: ${response.status}`);
	}
	return await response.text();
}

function extractBankRates(pageText: string): CurrencyRateItem[] {
	const result: CurrencyRateItem[] = [];
	for (const descriptor of BANK_PATTERNS) {
		const match = pageText.match(descriptor.pattern);
		if (!match) {
			continue;
		}

		const buy = parseRate(match[2]);
		const sell = parseRate(match[4]);
		if (!Number.isFinite(buy) || !Number.isFinite(sell)) {
			continue;
		}

		result.push({
			bank: descriptor.bank,
			buy,
			sell
		});
	}
	return result;
}

function parseRate(value: string): number {
	return Number(value.replace(',', '.'));
}
