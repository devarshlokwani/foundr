/**
 * What Foundr charges and what each plan includes.
 *
 * One definition, used by both the public pricing section on the landing
 * page and the signed-in upgrade page, so the two can't quietly disagree
 * about the price or what's included. A mismatch between what a visitor
 * was promised and what a customer is shown is the kind of thing nobody
 * notices until someone complains.
 *
 * The free limits here mirror PLAN_LIMITS in server/lib/entitlements.ts,
 * which is the actual enforcement. These numbers are the marketing copy
 * for them: if the server's limits change, change these too.
 */

export const PREMIUM_PRICE = "$29";
export const PREMIUM_INTERVAL = "per month";

/** Mirrors the server's free-plan ceilings. Kept in sync by hand; the server enforces. */
export const FREE_LIMITS = {
  businesses: 2,
  entriesPerMonth: 50,
  shopifyStores: 1,
};

export interface PlanDefinition {
  id: "free" | "premium";
  name: string;
  price: string;
  interval: string;
  tagline: string;
  features: string[];
  featured: boolean;
}

export const PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Starter",
    price: "Free",
    interval: "forever",
    tagline: "For founders just getting going",
    features: [
      `Track ${FREE_LIMITS.businesses} startups`,
      `${FREE_LIMITS.entriesPerMonth} entries a month`,
      "Burn, runway, ROI, and margins",
      "Connect a Shopify store",
      "Reports and CSV export",
    ],
    featured: false,
  },
  {
    id: "premium",
    name: "Premium",
    price: PREMIUM_PRICE,
    interval: PREMIUM_INTERVAL,
    tagline: "For founders running the real thing",
    features: [
      "Unlimited startups",
      "Unlimited entries",
      "Full Shopify order history",
      "Unlimited connected stores",
      "Everything in Starter",
    ],
    featured: true,
  },
];
