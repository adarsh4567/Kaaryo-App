/**
 * Maps this app's catalog onto the trial endpoint's own subcategory list.
 *
 * Two separate vocabularies meet here and neither can be edited to suit the
 * other. `GET /api/services` prices a normal booking against keys like `kitchen`
 * and `bathroom`; `GET /api/user/trials/offer` validates a trial against its own
 * list, which has `basic_home` and `post_construction` that the rate card has no
 * equivalent for. So the guess the instant sheet makes for a normal booking
 * cannot be reused for a trial — this is the trial's version of it.
 *
 * Deliberately conservative, and deliberately only a *pre-selection*: the field is
 * optional server-side and the customer can always change or clear the chip, so a
 * wrong guess costs a tap. Getting it wrong silently would be worse than that, so
 * an ambiguous match resolves to the group's general option rather than to the
 * closest-looking specific one.
 */

import type { Service, ServiceGroupKey } from './catalog';
import type { TrialSubcategory } from './userTrials';

/**
 * Where a service lands when nothing matched by name.
 *
 * Everyday house help is a general home clean; the machine-assisted shelf is a
 * deep clean. `repairs` is absent on purpose — nothing there bills as cleaning,
 * so it never reaches this function.
 */
const GROUP_FALLBACK: Partial<Record<ServiceGroupKey, string>> = {
  house_help: 'basic_home',
  deep_clean: 'deep_cleaning',
};

/** Words that appear in almost every service name and so distinguish nothing. */
const STOP_WORDS = new Set(['cleaning', 'clean', 'and', 'the', 'full', 'help', 'home']);

function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * The best trial subcategory key for a service, or null if the offer has none.
 *
 * Scores each subcategory by how much of its *own* key is accounted for by the
 * service — `sofa_carpet` against "Sofa & carpet shampoo" scores 1.0, while
 * `deep_cleaning` against "Bathroom deep clean" scores 0.5 and loses to
 * `bathroom`. A tie or a weak best means the name genuinely does not say which
 * one, and the group fallback answers instead.
 */
export function matchTrialSubcategory(
  subcategories: TrialSubcategory[],
  service: Service
): string | null {
  if (!subcategories.length) return null;

  const haystack = new Set([...tokenise(service.key), ...tokenise(service.name)]);

  let best: { key: string; score: number } | null = null;
  let tied = false;

  for (const sub of subcategories) {
    // Scored on the key, not the display name: the key is the stable contract,
    // and the names are server-side copy that can be reworded at any time.
    const tokens = tokenise(sub.key).filter((t) => !STOP_WORDS.has(t));
    if (!tokens.length) continue;

    const hits = tokens.filter((t) => haystack.has(t)).length;
    const score = hits / tokens.length;
    if (score === 0) continue;

    if (!best || score > best.score) {
      best = { key: sub.key, score };
      tied = false;
    } else if (score === best.score) {
      tied = true;
    }
  }

  if (best && !tied && best.score >= 0.99) return best.key;

  const fallback = GROUP_FALLBACK[service.group];
  if (fallback && subcategories.some((s) => s.key === fallback)) return fallback;

  // The offer's list is server-owned and could be reshaped, so never assume a
  // particular key exists — leaving it unset is always valid.
  return null;
}
