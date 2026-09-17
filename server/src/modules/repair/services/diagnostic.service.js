// diagnostic-flow.model exports the model directly, not a named bag.
const DiagnosticFlow = require('../../service/diagnostic-flow.model');
const { Problem } = require('../models/problem.model');
const { Repair } = require('../models/repair.model');

/**
 * Diagnostic engine — turns a reported SYMPTOM into a recommended REPAIR.
 *
 * This is the piece §7 exists to force: the customer says "cracked screen",
 * and the system must not silently decide that means a new display. A cracked
 * outer glass over a working panel is a different job at a fraction of the
 * price, and guessing wrong in either direction is a real commercial error.
 *
 * The decision tree is data (DiagnosticFlow documents), never code. This module
 * only knows how to WALK a tree:
 *
 *   nextQuestions()  — which questions are currently answerable
 *   resolve()        — what the answers add up to
 *
 * Conditional branching uses the existing `showIf` predicate already supported
 * by DiagnosticFlow, so admin-authored flows built for other verticals keep
 * working unchanged.
 */

/**
 * Is a question visible given the answers so far?
 *
 * `showIf` is a map of { questionId: [acceptable answer ids] }. Every named
 * question must have one of the listed answers — AND semantics across keys, OR
 * within a key. A question with no `showIf` is always visible.
 */
function isVisible(question, answers) {
  const cond = question.showIf;
  if (!cond || typeof cond !== 'object') return true;

  return Object.entries(cond).every(([qid, accepted]) => {
    const given = answers?.[qid];
    if (given == null) return false;
    const list = Array.isArray(accepted) ? accepted : [accepted];
    // Multi-select answers satisfy the condition if ANY chosen option matches.
    if (Array.isArray(given)) return given.some((g) => list.includes(g));
    return list.includes(given);
  });
}

/** Questions that should be shown now, in author order. */
function nextQuestions(flow, answers = {}) {
  return (flow.questions || []).filter((q) => isVisible(q, answers));
}

/** The first visible question the customer has not yet answered, or null. */
function firstUnanswered(flow, answers = {}) {
  return nextQuestions(flow, answers).find((q) => answers[q.id] == null) || null;
}

/** True once every currently-visible question has an answer. */
function isComplete(flow, answers = {}) {
  return firstUnanswered(flow, answers) === null;
}

/**
 * Every option the customer actually selected, flattened across questions.
 *
 * `depth` is the question's position in the tree, and it matters: a decision
 * tree gets MORE specific as it descends, so a later answer represents better
 * information than an earlier one. "The lid angle changes it" says cable; the
 * follow-up "and the hinge is damaged" says the hinge is what is destroying
 * that cable. Both are true, but the second is the actionable finding.
 */
function selectedOptions(flow, answers = {}) {
  const out = [];
  const questions = flow.questions || [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!isVisible(q, answers)) continue;
    const given = answers[q.id];
    if (given == null) continue;
    const chosen = Array.isArray(given) ? given : [given];
    for (const optId of chosen) {
      const opt = (q.options || []).find((o) => o.id === optId);
      if (opt) {
        out.push({
          questionId: q.id, questionText: q.text, depth: i,
          ...(opt.toObject ? opt.toObject() : opt),
        });
      }
    }
  }
  return out;
}

const URGENCY_RANK = { normal: 0, high: 1, urgent: 2 };

/**
 * Resolve answers into recommended repairs.
 *
 * Candidate repairs are scored by how many selected options pointed at them, so
 * a tree whose branches agree produces a confident single recommendation, while
 * a tree whose branches disagree surfaces several — which is the honest output
 * when the symptoms genuinely are ambiguous.
 *
 * Returns `requiresDiagnosis: true` when nothing can be concluded remotely; the
 * booking then goes down the inspect-first path rather than inventing a repair.
 */
async function resolve({ problemCode, flow, answers = {}, vertical = null }) {
  // Codes are unique per vertical, not globally, so a bare code lookup could
  // return another vertical's row. Callers pass the vertical they are serving.
  const scope = vertical ? { vertical } : {};

  const problem = problemCode
    ? await Problem.findOne({ code: problemCode, isActive: true, ...scope }).lean()
    : null;

  const chosen = flow ? selectedOptions(flow, answers) : [];

  /**
   * Tally repair votes, weighting later answers more heavily.
   *
   * Equal weighting made a tie between "it's the cable" (asked early) and "the
   * hinge is destroying the cable" (asked after, precisely to distinguish them)
   * resolve by array order — i.e. arbitrarily. Depth weighting makes the more
   * specific finding win, which is the entire reason the follow-up is asked.
   */
  const DEPTH_WEIGHT = 0.5;
  const votes = new Map();
  let urgency = 'normal';
  const tools = new Set();
  let recommendedQuality = null;

  for (const opt of chosen) {
    if (opt.recommendedServiceCode) {
      const weight = 1 + (opt.depth || 0) * DEPTH_WEIGHT;
      votes.set(opt.recommendedServiceCode, (votes.get(opt.recommendedServiceCode) || 0) + weight);
    }
    if (URGENCY_RANK[opt.urgency] > URGENCY_RANK[urgency]) urgency = opt.urgency;
    (opt.tools || []).forEach((t) => tools.add(t));
    if (opt.recommendedPartQuality && !recommendedQuality) recommendedQuality = opt.recommendedPartQuality;
  }

  /**
   * A flow that was actually walked and still identified nothing is a RESULT,
   * not a gap: it means the branches the customer took lead somewhere only an
   * inspection can settle — board faults being the usual case. Falling back to
   * the problem's generic candidate list there would convert "we investigated
   * and cannot say" into a confident screen-replacement quote.
   */
  const flowEngaged = !!flow && chosen.length > 0;
  const flowComplete = flow ? isComplete(flow, answers) : true;
  const flowInconclusive = flowEngaged && flowComplete && votes.size === 0;

  let candidateCodes = [...votes.keys()];
  const fromFlow = candidateCodes.length > 0;
  if (!fromFlow && !flowInconclusive) candidateCodes = problem?.candidateRepairCodes || [];

  const repairs = candidateCodes.length
    ? await Repair.find({ code: { $in: candidateCodes }, isActive: true, ...scope }).lean()
    : [];

  const ranked = repairs
    .map((r) => ({
      repairCode: r.code,
      name: r.name,
      pricingMode: r.pricingMode,
      requiresDiagnosis: r.requiresDiagnosis || r.pricingMode === 'diagnosis_required',
      allowedServiceModes: r.allowedServiceModes,
      estimatedDurationMin: r.estimatedDurationMin,
      warrantyDays: r.warrantyDays,
      minSkillLevel: r.minSkillLevel,
      score: votes.get(r.code) || 0,
    }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0] || null;

  // Genuine ambiguity: two candidates tied on votes from an answered flow.
  const ambiguous = ranked.length > 1 && ranked[0].score === ranked[1].score;

  /**
   * Can this be priced without someone opening the device?
   *
   * `problem.requiresDiagnosis` is a DEFAULT, not a veto. "Laptop won't turn
   * on" is unpriceable as a bare symptom — but if the customer has since told
   * us another charger works, the fault is the adapter and we know exactly what
   * it costs. Treating the flag as absolute would make the diagnostic tree
   * pointless for precisely the symptoms that most need one.
   *
   * What can never be cleared: no candidate at all, an inconclusive walk, a
   * genuine tie, or a repair that is itself inspection-priced (liquid damage,
   * board work, data recovery) — those stay diagnosis-required whatever the
   * customer answered.
   */
  const problemForcesDiagnosis = !!problem?.requiresDiagnosis;
  const conclusiveFromFlow = fromFlow && flowComplete && !ambiguous;

  const requiresDiagnosis = !top
    || flowInconclusive
    || !!top.requiresDiagnosis
    || (problemForcesDiagnosis && !conclusiveFromFlow);

  return {
    problemCode: problem?.code || problemCode || null,
    problemName: problem?.name || null,
    flowCode: flow?.code || null,
    complete: flow ? isComplete(flow, answers) : true,
    answeredCount: chosen.length,
    recommendations: ranked,
    primaryRepairCode: requiresDiagnosis ? null : top?.repairCode || null,
    recommendedQuality,
    requiresDiagnosis,
    ambiguous,
    urgency,
    suggestedTools: [...tools],
    /** Plain-language explanation, safe to show the customer verbatim. */
    summary: buildSummary({ problem, top, requiresDiagnosis, ambiguous, fromFlow }),
  };
}

function buildSummary({ problem, top, requiresDiagnosis, ambiguous, fromFlow }) {
  const symptom = problem?.name || 'the reported issue';
  if (requiresDiagnosis) {
    return `${symptom} cannot be priced accurately without inspecting the device. A technician will diagnose it and send you a quote before any work starts.`;
  }
  if (ambiguous) {
    return `${symptom} points to more than one possible repair. A technician will confirm which is needed before starting.`;
  }
  const basis = fromFlow ? 'Based on your answers' : 'Based on the reported symptom';
  return `${basis}, the likely repair is ${top.name}.`;
}

/** Load the flow a problem is wired to, or null when none is configured. */
async function getFlowForProblem(problemCode, vertical = null) {
  const problem = await Problem.findOne({
    code: problemCode, isActive: true, ...(vertical ? { vertical } : {}),
  }).lean();
  if (!problem?.diagnosticFlowCode) return { problem, flow: null };
  const flow = await DiagnosticFlow.findOne({ code: problem.diagnosticFlowCode, isActive: true }).lean();
  return { problem, flow };
}

module.exports = {
  isVisible,
  nextQuestions,
  firstUnanswered,
  isComplete,
  selectedOptions,
  resolve,
  getFlowForProblem,
};
