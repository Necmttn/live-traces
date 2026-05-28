/**
 * Fake but plausible document chunks. Used by the demo workflow to make
 * each "embedding chunk N/32" event carry actual textual content (first
 * ~100 chars), so the UI feels like real workload rather than a counter.
 */
export const CORPUS: ReadonlyArray<string> = [
    "## Executive Summary\nQ3 revenue reached $4.2M, up 28% YoY. Net new ARR closed at $1.1M, slightly behind the $1.3M",
    "Mid-market segment outperformed; enterprise pipeline coverage remains 2.4× but slipped versus 3.1× the prior quarter",
    "**Engineering**: shipped 14 new features this quarter including the live-traces public API and the cross-region failover",
    "We onboarded six engineers in October. Promotion review for the staff cohort concluded last week; two folks promoted",
    "Customer health: 92% of accounts in green. The two amber accounts (Acme, Northwind) are blocked on the SCIM migration",
    "Sales productivity per rep was $186k for the quarter, on track but below the $200k target. CAC ticked up 9% to $4,210",
    "Marketing spend was reallocated mid-quarter to performance and away from events after Q2 attribution data came back",
    "Infra: the migration from RDS to Aurora completed without downtime. p99 read latency dropped from 142ms to 38ms",
    "Security review for SOC 2 Type II is on track for January submission. Penetration test findings: 0 high, 3 medium",
    "Open-source: we extracted live-traces as a standalone npm package under Apache-2.0. Initial signups: 412 within 48h",
    "Hiring plan for Q4: backend (2), product design (1), enterprise sales (3). The platform team is fully staffed now",
    "Operating expenses came in 4% under plan. The largest underspend was contractor budget which we paused in September",
    "Customer success NRR ticked to 118%, the highest reading since Q4 last year. Gross retention held at 94%",
    "The board approved the new pricing tiers. Rollout is scheduled for January 1st with a 90-day grandfathering window",
    "Product velocity: 286 PRs shipped to production. Mean time to deploy 11.4 minutes. Rollback rate fell to 0.3%",
    "We are deprecating the v1 webhook payload in March. Customer communications drafted; migration tooling shipped",
    "Partnership pipeline: Notion integration in beta with 38 customers. Slack and Linear connectors are in scoping",
    "Brand refresh launched on the marketing site. CTR on hero CTA improved 21% week over week post-launch",
    "Compliance: GDPR DPA template updated for the new pricing tiers. EU data residency added to enterprise plans",
    "Postmortems this quarter: one P1 incident (queue backpressure), three P2s. All remediations shipped within SLO",
    "Two new senior engineers started on the data platform team. The OLAP migration to ClickHouse is on track for Q1",
    "ML infrastructure: vector store throughput improved 3.8× after the pgvector → Lance migration. Index build time halved",
    "Customer-facing AI features adoption: 31% of monthly actives used the new agent panel at least once last month",
    "Pricing experiments: the metered usage tier converted 4.1× the old free trial. Rolling it out to all geos in Q4",
    "Documentation: every public API endpoint now has an example request and response. We launched the API playground",
    "Hiring funnel conversion improved after the take-home rewrite. Final-round to offer ratio is up from 18% to 31%",
    "Investor updates: Series B term sheet from Acme Ventures accepted. Closing scheduled for late November",
    "The remote-first policy was reaffirmed. We will run two in-person summits next year, in Lisbon and Mexico City",
    "Office footprint: lease for the SF location renewed at a 22% reduction. Hub model unchanged: SF, NYC, Lisbon",
    "Sustainability: data center contracts now 87% renewable. We will publish our first sustainability report in March",
    "Recruiting referrals: 38% of new hires came from employee referrals this quarter, the highest rate to date",
    "Risks: deal slippage at top of funnel. Mitigation: SDR ramp, refreshed outbound playbook, paid acquisition test",
];

/** First N chars with ellipsis. */
export function preview(s: string, n = 88): string {
    const oneLine = s.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + "…";
}
