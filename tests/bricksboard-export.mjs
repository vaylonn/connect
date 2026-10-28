// A BricksBoard file (bricksboard.fr: the dashboard its bookmarklet saves from app.bricks.co), built here
// with invented projects, movements and investor (personal exports never go in the repo). Same shape as the
// real files: the Bricks API's answers embedded as « window.__BD__={…}; », amounts in cents, the investor's
// identity and IBAN next to the data Carnet reads.
const project = (id, name, address, owned, { price = 1000, orig = 1000, status = 'repayment-ongoing', rate = 10, horizon = 24, ended = '2025-01-10T09:00:00.000Z', started = '2024-12-01T10:30:00.000Z', revenueStart = '2025-02' } = {}) => ({
  investorContractType: 'obligation', id, thumbnailUrl: `https://documents.example/${id}.webp`, imageGallery: [`https://documents.example/${id}-1.webp`],
  address: { fr: address, en: address }, name: { fr: name, en: name },
  totalNumberOfBricks: 50000, investmentHorizonInMonths: horizon, publishStatus: 'published', yearlyTotalRentabilityPercentage: rate, brickPrice: price,
  documents: [{ type: 'contract', url: `https://documents.example/${id}.pdf` }],
  funding: { startedAt: started, amountToFundCents: 50000000, brickPrice: orig, maxEndDate: '2025-01-31T10:30:00.000Z', ...(ended ? { ended: { type: 'success', at: ended } } : {}), revenueStartDate: revenueStart, investorCount: 1200, purchasedBrickCount: 50000 },
  resale: null, ownedBricks: owned, hasBricksAvailable: false, investorBricks: { owned, onSale: 0 }, hasBeenInDelayOrDefaultOnce: status !== 'repayment-ongoing', financialStatus: status,
});

export const PROJECTS = {
  tilleuls: project('11111111-aaaa-4bbb-8ccc-000000000001', 'Résidence des Tilleuls', '3 rue des Tilleuls, 69003 Lyon', 20, { rate: 10 }),
  port: project('11111111-aaaa-4bbb-8ccc-000000000002', 'Hôtel du Port', '5 quai du Port, 13002 Marseille', 30, { price: 400, status: 'repayment-delay', rate: 11 }),
  maison: project('11111111-aaaa-4bbb-8ccc-000000000003', 'Maison des Exemples', '8 allée des Exemples, 44000 Nantes', 10, { price: 0, status: 'repayment-finished', horizon: 12, ended: '2024-06-02T08:00:00.000Z', revenueStart: '2024-07' }),
  villa: project('11111111-aaaa-4bbb-8ccc-000000000004', 'Villa Exemplo', 'Rua do Exemplo 12, 4730-458 Vila de Prado 🇵🇹', 5, { status: 'repayment-default', ended: '2025-09-01T08:00:00.000Z', revenueStart: '2025-10' }),
  neuf: project('11111111-aaaa-4bbb-8ccc-000000000005', 'Immeuble Neuf', '1 place Neuve, 33000 Bordeaux', 3, { status: 'funding-ongoing', ended: null, started: '2026-09-28T10:30:00.000Z', revenueStart: '2026-11' }),
  autre: project('11111111-aaaa-4bbb-8ccc-000000000006', 'Projet d’un autre', '2 rue Ailleurs, 75011 Paris', 0),
};

const tx = (date, kind, value, status = 'confirmed') => ({ kind, createdAt: date + 'T10:00:00.000Z', value, status });
export const WALLET = [
  tx('2024-06-01', 'topup_card', 50000),
  tx('2024-06-02', 'primary_purchase_with_refund', -10000),
  tx('2024-06-02', 'topup_card', 9999, 'declined'),
  tx('2025-01-05', 'topup_checkout', 60000),
  tx('2025-01-06', 'primary_purchase_with_refund', -20000),
  tx('2025-01-06', 'primary_purchase_with_refund', -30000),
  tx('2025-03-04', 'recurring_revenue', 300), tx('2025-03-04', 'withholding_tax', -90),
  tx('2025-04-04', 'recurring_revenue', 250), tx('2025-04-04', 'withholding_tax', -75),
  tx('2025-06-01', 'obligation_principal_repayment_final', 10000),
  tx('2025-09-01', 'primary_purchase_with_refund', -5000),
  tx('2025-09-02', 'primary_purchase_with_refund', -1000, 'canceled'),
  tx('2026-02-10', 'obligation_principal_repayment_partial', 18000),
  tx('2026-03-01', 'refer_referrer', 500),
  tx('2026-04-01', 'adjustment', 13),
  tx('2026-10-01', 'primary_purchase_with_refund', -3000),
  tx('2026-10-05', 'recurring_revenue', 400), tx('2026-10-05', 'withholding_tax', -120),
  tx('2026-10-06', 'boosted_balance_gain', 20),
].reverse(); // newest first, as Bricks lists them

export function bricksData({ fetchedAt = '2026-10-28T13:11:12.405Z', projects = PROJECTS, wallet = WALLET, balance } = {}) {
  const { tilleuls, port, maison, villa, neuf, autre } = projects;
  return {
    financed: [
      { yearMonthDate: '2025-09', projects: [villa, autre], total: 2 },
      { yearMonthDate: '2025-01', projects: [tilleuls, port], total: 2 },
      { yearMonthDate: '2024-06', projects: [maison], total: 1 },
    ],
    revenues: { investorFirstRevenueDate: '2025-03-04T10:00:00.000Z', revenuesTotal: { untaxedTotal: 1483, taxedTotal: 1198, revenues: {} }, revenuesByYearAndMonth: [] },
    fundingProjects: {
      ongoing: { projects: [{ ...neuf, listingStatus: 'ongoing' }], total: 1 },
      upcoming: { projects: [], total: 0 },
      financed: { projects: [{ ...tilleuls, listingStatus: 'financed' }], total: 1 },
    },
    customer: {
      createdAt: '2024-05-30T08:00:00.000Z',
      customerProfile: { firstName: 'Camille', lastName: 'Exemple', phone: '+33600000000', street: '1 rue des Exemples', city: 'Exempleville', postcode: '99999' },
      email: 'camille@example.org', lemonwayBalance: balance ?? wallet.filter(x => x.status === 'confirmed').reduce((s, x) => s + x.value, 0),
      lemonwayIban: 'FR7600000000000000000000000', lemonwayBic: 'EXAMPLEXXX', giftBalance: 0, referrerCode: 'CAMEX00',
    },
    pastRevenuesMap: { [tilleuls.id]: [{ value: 300, date: '2025-03-04T10:00:00.000Z' }] },
    contractMap: {
      [tilleuls.id]: { remainingMonths: 8, repaymentDate: '2027-06', grade: 'B+', finalScore: 61, coverage: 120 },
      [port.id]: { remainingMonths: 3, repaymentDate: '2027-01', grade: 'C', finalScore: 40, coverage: 90 },
    },
    wallet: { transactions: wallet, pages: 1, firstPageSize: 50, requestedTake: 100, truncated: false, stopReason: 'data vide' },
    fetchedAt,
  };
}

export const bricksboardHtml = opts => `<!DOCTYPE html>
<html lang="fr">
<head><script>window.__TAX_RATE=0.314;</script><script>var t=localStorage.getItem('bb_theme')||'light';</script><script>window.__BD__=${JSON.stringify(bricksData(opts))};</script>
<title>BricksBoard</title></head>
<body><div id="fetched-at"></div><script>function processData(data) { return data; }</script></body>
</html>
`;
