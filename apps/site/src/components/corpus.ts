/**
 * Fake but plausible document chunks. Used by the demo workflow so each
 * "embedding chunk N/32" event carries actual textual content (~140-200
 * chars), making the UI feel like real workload rather than a counter.
 */
export const CORPUS: ReadonlyArray<string> = [
    "Executive summary - Q3 revenue reached $4.2M, up 28% year over year. Net new ARR closed at $1.1M, slightly behind the $1.3M target, with the gap concentrated in late-stage enterprise.",
    "The mid-market segment outperformed plan by 14%, while enterprise pipeline coverage came in at 2.4× - down from the 3.1× we entered the quarter with. Top-of-funnel improvements roll out in Q4.",
    "Engineering shipped 14 new features this quarter, including the livetraces public API, the cross-region failover for our queue subsystem, and the long-awaited rebuild of the importer pipeline.",
    "We onboarded six engineers in October across the platform and growth pods. Promotion review for the staff cohort concluded last week - two engineers promoted, one moved into a TL role on payments.",
    "Customer health: 92% of accounts are in the green band. The two amber accounts (Acme, Northwind) are both blocked on the SCIM migration, which we expect to clear within the first two weeks of November.",
    "Sales productivity per rep landed at $186k for the quarter, on track but $14k short of the $200k target. Customer acquisition cost ticked up 9% to $4,210 - driven by a deliberate increase in paid spend.",
    "Marketing spend was reallocated mid-quarter from events to performance after the Q2 attribution data came back. The reallocation is responsible for roughly 38% of the lift in pipeline coverage in mid-market.",
    "Infra milestones - the migration from RDS to Aurora completed without downtime. p99 read latency dropped from 142ms to 38ms, and the new failover topology survived two simulated region-outage drills.",
    "The SOC 2 Type II review is on track for January submission. Penetration test findings closed at 0 high, 3 medium, 11 low - all medium findings have remediations merged and we are sweeping the longs.",
    "Open-source - we extracted livetraces as a standalone npm package under Apache-2.0. Initial signups crossed 412 within 48 hours of launch. Two early adopters are already integrating against the SSE transport.",
    "Hiring plan for Q4: two backend engineers, one product designer, three enterprise sellers. The platform team is fully staffed for the first time since the rebuild, freeing the CTO for the architecture review.",
    "Operating expenses came in 4% under plan for the quarter. The single largest underspend was contractor budget which we paused in September pending the new contracts for the financial-systems migration project.",
    "Customer success - NRR ticked to 118%, the highest reading since Q4 of last year. Gross retention held at 94%, with churn concentrated in a single SMB cohort that signed during last year's pricing experiment.",
    "The board approved the new pricing tiers ahead of the public rollout scheduled for January 1st. Existing customers will be grandfathered for 90 days; customer success has the migration scripts ready to send.",
    "Product velocity - 286 PRs shipped to production this quarter. Mean time to deploy fell to 11.4 minutes, and the rollback rate dropped to 0.3% as the canary-by-default rollout policy reached full coverage.",
    "We are deprecating the v1 webhook payload in March. Customer communications are drafted, the migration tooling has shipped, and three of the top-five integrators have already opted into the new payload format.",
    "Partnership pipeline - the Notion integration is in private beta with 38 customers. The Slack and Linear connectors are in scoping; we expect to ship Slack first given the volume of inbound interest from sales.",
    "The brand refresh launched on the marketing site last Tuesday. Click-through on the hero CTA improved 21% week over week post-launch, with the strongest lift coming from the developer-tools acquisition channel.",
    "Compliance - the GDPR DPA template was updated for the new pricing tiers. EU data residency was added to the enterprise plan; we now have customer-deployed regions in Frankfurt, Dublin, and Sydney.",
    "Postmortems this quarter - one P1 incident (queue backpressure from a malformed webhook), three P2s. All remediations shipped within SLO, and we ran a tabletop exercise on the queue-failure scenario.",
    "Two new senior engineers started on the data-platform team in October. The OLAP migration from PostgreSQL to ClickHouse is on track for Q1 cutover, and the historical backfill window has been narrowed to 30 days.",
    "ML infrastructure - vector store throughput improved 3.8× after the pgvector → Lance migration. Index build time was cut roughly in half, and ingestion of new tenants no longer requires the maintenance window.",
    "Customer-facing AI features adoption - 31% of monthly actives used the new agent panel at least once last month, with 9% becoming weekly actives. Activation correlates strongly with the new in-product tour.",
    "Pricing experiments - the metered usage tier converted 4.1× the old free trial in the test geography. We are rolling it out to all remaining geos in Q4 with the localized billing and tax-rate work shipping first.",
    "Documentation - every public API endpoint now has an example request and an example response. We launched the interactive API playground last week and are seeing healthy engagement from new-account holders.",
    "Hiring funnel conversion improved noticeably after the take-home rewrite. The final-round-to-offer ratio climbed from 18% to 31%, and time-to-offer fell by an average of nine business days across all roles.",
    "Investor updates - the Series B term sheet from Acme Ventures was accepted earlier this month. Closing is scheduled for late November pending the standard diligence; the secondary tender is now sized at $14M.",
    "The remote-first policy was reaffirmed by the leadership team. We will host two in-person summits in 2026, one in Lisbon and one in Mexico City, both timed to roadmap planning and the spring product cycle.",
    "Office footprint - the lease for the San Francisco location renewed at a 22% reduction with the same square footage. The hub model is unchanged: anchor offices in SF, NYC, and Lisbon plus full remote everywhere else.",
    "Sustainability - our data-center contracts are now 87% renewable, up from 71% last year. We will publish the first company sustainability report in March alongside the audited Scope 1 and Scope 2 disclosures.",
    "Recruiting referrals - 38% of new hires this quarter came in through employee referrals, the highest rate to date. The referral bonus program will continue unchanged through Q4 and is up for review in January.",
    "Risks - deal slippage at the top of the enterprise funnel. Mitigation includes an aggressive SDR ramp, a refreshed outbound playbook tailored to the new ICP, and a paid acquisition test in two adjacent verticals.",
];

/** First N chars with ellipsis. */
export function preview(s: string, n = 220): string {
    const oneLine = s.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + "…";
}
