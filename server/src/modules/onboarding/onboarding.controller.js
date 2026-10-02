const service = require('./onboarding.service');
const coverage = require('./coverage.service');
const { ProviderEnrolment } = require('./onboarding.model');
const Shop = require('../shop/shop.model');
const { ProviderPricing } = require('../repair/models/pricing.model');
const Worker = require('../worker/worker.model');
const { ProblemCategory, Problem } = require('../repair/models/problem.model');

/**
 * Provider-facing onboarding.
 *
 * The provider is resolved from the TOKEN, never from the request body: a
 * worker cannot enrol a shop by naming its id, because the id is not something
 * they get to send.
 */

/** Who is calling, in the shape the service layer expects. */
function ownerOf(req) {
  return req.auth.role === 'shop'
    ? { kind: 'shop', id: req.auth.sub, providerKind: 'shop' }
    : { kind: 'worker', id: req.auth.sub, providerKind: 'individual' };
}

async function listDomains(req, res, next) {
  try {
    const domains = await service.listDomains();
    res.json({ domains });
  } catch (err) { next(err); }
}

async function listLines(req, res, next) {
  try {
    const owner = ownerOf(req);
    const lines = await service.listLines({
      domainCode: req.query.domainCode,
      providerKind: owner.providerKind,
    });

    // Pair each line with this provider's own state on it, so the picker can
    // show "applied", "approved" or "start" without a second round trip.
    const mine = await ProviderEnrolment.find({
      ...service.ownerFilter(owner),
      lineCode: { $in: lines.map((l) => l.code) },
    }).select('lineCode status').lean();
    const byLine = new Map(mine.map((m) => [m.lineCode, m.status]));

    res.json({ lines: lines.map((l) => ({ ...l, myStatus: byLine.get(l.code) || null })) });
  } catch (err) { next(err); }
}

/** Everything this provider has started, whatever state it is in. */
async function myEnrolments(req, res, next) {
  try {
    const enrolments = await service.listEnrolments(ownerOf(req));
    res.json({ enrolments });
  } catch (err) { next(err); }
}

async function getRequirements(req, res, next) {
  try {
    const owner = ownerOf(req);
    const { line, set } = await service.resolveRequirements({
      lineCode: req.params.lineCode,
      providerKind: owner.providerKind,
    });

    const doc = await ProviderEnrolment.findOne({ ...service.ownerFilter(owner), lineCode: line.code });
    // Identity already on file shows as done, not as something to upload again.
    if (doc) await require('./identity').carryIdentity(doc);
    const enrolment = doc ? doc.toObject() : null;

    res.json({
      line,
      requirements: set
        ? {
          id: set._id,
          name: set.name,
          documents: set.documents,   // each carries its own `capture` rule
          fields: set.fields,
          declarations: set.declarations,
          minSkillLevel: set.minSkillLevel,
        }
        : null,
      enrolment: enrolment || null,
    });
  } catch (err) { next(err); }
}

async function enrol(req, res, next) {
  try {
    const owner = ownerOf(req);
    const enrolment = await service.enrol({
      owner,
      providerKind: owner.providerKind,
      lineCode: req.body.lineCode,
    });
    res.status(201).json({ enrolment });
  } catch (err) { next(err); }
}

async function saveSubmission(req, res, next) {
  try {
    const enrolment = await service.saveSubmission({
      owner: ownerOf(req),
      enrolmentId: req.params.id,
      documents: req.body.documents || [],
      fields: req.body.fields || [],
      acceptedDeclarations: req.body.acceptedDeclarations,
    });
    res.json({ enrolment });
  } catch (err) { next(err); }
}

async function submitForReview(req, res, next) {
  try {
    const enrolment = await service.submitForReview({
      owner: ownerOf(req),
      enrolmentId: req.params.id,
    });
    res.json({ enrolment });
  } catch (err) { next(err); }
}

async function requestLine(req, res, next) {
  try {
    const owner = ownerOf(req);
    const { request, deduped } = await service.requestLine({
      owner,
      providerKind: owner.providerKind,
      domainCode: req.body.domainCode,
      proposedName: req.body.proposedName,
      description: req.body.description,
    });
    res.status(deduped ? 200 : 201).json({ request, deduped });
  } catch (err) { next(err); }
}

/**
 * One call that tells the provider app exactly where the provider stands.
 *
 * Onboarding spans several screens and a review that happens hours later, so
 * the app needs a single truthful answer to "what now?" rather than inferring
 * it from three separate lists.
 */
async function status(req, res, next) {
  try {
    const owner = ownerOf(req);
    const profile = owner.kind === 'shop'
      ? await Shop.findById(owner.id)
        .select('businessName ownerName phone category services kyc isActive address coverImageUrl bio hours')
        .lean()
      : await Worker.findById(owner.id).select('name phone skills kyc onboardingComplete').lean();

    const enrolments = await service.listEnrolments(owner);
    const approved = enrolments.filter((e) => e.status === 'approved');

    // Which repair verticals this provider may now work in — the handover point
    // to the repair engine's own setup (capabilities, areas, pricing, stock).
    const verticals = [...new Set(approved.map((e) => e.line?.repairVertical).filter(Boolean))];

    const hasPricing = await ProviderPricing.countDocuments({
      ...(owner.kind === 'shop' ? { shopId: owner.id } : { workerId: owner.id }),
      supersededAt: null,
      approvalStatus: { $in: ['approved', 'auto_approved'] },
    }) > 0;

    const storefront = storefrontChecklist({
      profile, kind: owner.kind, approvedCount: approved.length, hasPricing,
    });

    res.json({
      providerKind: owner.providerKind,
      profile,
      enrolments,
      approvedLineCodes: approved.map((e) => e.lineCode),
      repairVerticals: verticals,
      storefront,
      // Live means a customer can actually find and book them, which needs the
      // storefront as well as the verification.
      isLive: storefront.every((s) => s.done) && !!profile && (owner.kind !== 'shop' || profile.isActive !== false),
      nextStep: nextStepFor({ profile, enrolments, kind: owner.kind }),
    });
  } catch (err) { next(err); }
}


/**
 * Is this provider's storefront actually set up?
 *
 * Being verified for a service is only half of going live. A customer choosing
 * between shops is choosing on a photo, an address they can reach, and hours
 * that say whether anyone is there — a shop with none of those is invisible in
 * practice even when its paperwork is perfect.
 *
 * Returned as a checklist rather than a boolean so the app can say WHICH piece
 * is missing, which is the difference between a provider finishing setup and
 * one who assumes the app is broken.
 */
function storefrontChecklist({ profile, kind, approvedCount, hasPricing }) {
  if (kind !== 'shop') {
    // An independent technician has no storefront to dress: they are found by
    // service area and skill, so the equivalent list is deliberately shorter.
    return [
      { key: 'name', label: 'Your name', done: !!profile?.name },
      { key: 'services', label: 'Get verified for a service', done: approvedCount > 0 },
      { key: 'pricing', label: 'Set your prices', done: hasPricing },
    ];
  }

  const address = profile?.address;
  return [
    { key: 'name', label: 'Business name', done: !!profile?.businessName },
    {
      key: 'location',
      label: 'Address and map pin',
      done: !!address?.text && Array.isArray(address?.location?.coordinates) && address.location.coordinates.length === 2,
    },
    { key: 'photo', label: 'Storefront photo', done: !!profile?.coverImageUrl },
    { key: 'hours', label: 'Opening hours', done: (profile?.hours || []).length > 0 },
    { key: 'services', label: 'Get verified for a service', done: approvedCount > 0 },
    { key: 'pricing', label: 'Set your prices', done: hasPricing },
  ];
}

/** The single most useful thing this provider should do next. */
function nextStepFor({ profile, enrolments, kind }) {
  if (!profile) return { code: 'PROFILE_MISSING', label: 'Complete your account' };
  if (kind === 'shop' && !profile.address?.text) {
    return { code: 'ADDRESS_REQUIRED', label: 'Add your shop address' };
  }
  if (!enrolments.length) return { code: 'PICK_SERVICE', label: 'Choose what you work on' };

  const draft = enrolments.find((e) => e.status === 'draft');
  if (draft) return { code: 'COMPLETE_VERIFICATION', label: `Finish verification for ${draft.line?.name || draft.lineCode}`, enrolmentId: draft._id };

  const rejected = enrolments.find((e) => e.status === 'rejected');
  if (rejected) return { code: 'FIX_REJECTED', label: `Re-submit ${rejected.line?.name || rejected.lineCode}`, enrolmentId: rejected._id };

  if (enrolments.every((e) => e.status === 'pending_review')) {
    return { code: 'AWAITING_REVIEW', label: 'We are reviewing your documents' };
  }
  if (kind === 'shop' && !profile.coverImageUrl) {
    return { code: 'ADD_PHOTO', label: 'Add a photo of your shop' };
  }
  if (kind === 'shop' && !(profile.hours || []).length) {
    return { code: 'SET_HOURS', label: 'Set your opening hours' };
  }
  return { code: 'READY', label: 'Set up your services and pricing' };
}


/* Customer-facing catalog */

/**
 * What a customer can actually book today.
 *
 * Driven by the same rows providers sign up against, so the two sides cannot
 * disagree: a service is offered to customers only when it is `live`, which is
 * also the only state a provider can enrol in. Nothing is listed that nobody
 * is verified to do.
 *
 * Public on purpose — the home page renders before anyone signs in, and a
 * catalog of what we offer is not private.
 */
async function liveCatalog(req, res, next) {
  try {
    // Live = admin marked it live AND a provider is approved for it (see coverage.service).
    const { domains, lines } = await coverage.loadLiveLines();


    /**
     * What each service actually covers, grouped the way a customer thinks.
     *
     * "Phone Repair" is a category, not a reason to open the app — people arrive
     * with a cracked screen, a dead battery, or a laptop that will not connect
     * to wi-fi. Showing the real headings (DISPLAY, BATTERY & POWER,
     * CONNECTIVITY, STORAGE…) with the symptoms under them lets someone find
     * their problem by scanning, instead of guessing whether we handle it.
     *
     * The grouping is the admin-managed problem catalog, so a new category or
     * symptom appears here the moment it is added — nothing about this list is
     * written in code.
     *
     * Note this is the SYMPTOM catalog, not a diagnosis: choosing one starts the
     * booking flow, which still asks its questions before naming a repair.
     */
    const verticals = [...new Set(lines.map((l) => l.repairVertical).filter(Boolean))];
    const [categories, problems] = verticals.length
      ? await Promise.all([
        ProblemCategory.find({
          vertical: { $in: verticals }, isActive: true, isArchived: false,
        }).sort({ displayOrder: 1, name: 1 }).select('code name icon imageUrl vertical').lean(),
        Problem.find({
          vertical: { $in: verticals }, isActive: true, isArchived: false,
        }).sort({ displayOrder: 1, name: 1 })
          .select('code name vertical categoryCode severity requiresDiagnosis isPopular')
          .lean(),
      ])
      : [[], []];

    const published = new Set(categories.map((c) => `${c.vertical}:${c.code}`));
    const visibleProblems = problems.filter((p) => published.has(`${p.vertical}:${p.categoryCode}`));

    const coverageByVertical = new Map();
    const highlightsByVertical = new Map();

    for (const c of categories) {
      const groups = coverageByVertical.get(c.vertical) || [];
      groups.push({
        code: c.code,
        name: c.name,
        icon: c.icon,
        imageUrl: c.imageUrl || '',
        problems: visibleProblems
          .filter((p) => p.vertical === c.vertical && p.categoryCode === c.code)
          .map((p) => ({
            code: p.code,
            name: p.name,
            severity: p.severity,
            requiresDiagnosis: !!p.requiresDiagnosis,
          })),
      });
      coverageByVertical.set(c.vertical, groups);
    }

    // An empty heading is worse than no heading — it reads as a gap in what we
    // cover rather than as a category nobody has filled in yet.
    for (const [vertical, groups] of coverageByVertical) {
      coverageByVertical.set(vertical, groups.filter((g) => g.problems.length > 0));
    }

    // The shortlist shown before the full breakdown is expanded.
    for (const p of visibleProblems) {
      if (!p.isPopular) continue;
      const list = highlightsByVertical.get(p.vertical) || [];
      if (list.length < 8) list.push({ code: p.code, name: p.name });
      highlightsByVertical.set(p.vertical, list);
    }

    const byDomain = new Map();
    for (const l of lines) {
      if (!byDomain.has(l.domainCode)) byDomain.set(l.domainCode, []);
      byDomain.get(l.domainCode).push({
        code: l.code,
        name: l.name,
        // Strings are never undefined — both clients declare them as string,
        // and the domain/category rows already honoured that.
        description: l.description || '',
        tagline: l.tagline || '',
        icon: l.icon || '',
        imageUrl: l.imageUrl || '',
        artKey: l.artKey || l.repairVertical || '',
        path: l.customerPath,
        isPopular: !!l.isPopular,
        highlights: highlightsByVertical.get(l.repairVertical) || [],
        coverage: coverageByVertical.get(l.repairVertical) || [],
      });
    }

    /*
     * Catalog artwork is uploaded as a private S3 KEY (never a pasted URL), so
     * it must be signed on the way out — an unsigned key renders as a broken
     * image, which reads to everyone as "the artwork was never uploaded".
     * This is the same failure that made brand logos vanish on refresh, and it
     * was latent here only because no catalog art had been uploaded yet.
     */
    const s3Service = require('../../core/storage/s3');
    for (const services of byDomain.values()) {
      for (const svc of services) {
        svc.imageUrl = (await s3Service.signMedia(svc.imageUrl)) || '';
        for (const c of svc.coverage) {
          c.imageUrl = (await s3Service.signMedia(c.imageUrl)) || '';
        }
      }
    }
    for (const d of domains) {
      d.signedImageUrl = (await s3Service.signMedia(d.imageUrl)) || '';
    }

    // A domain with nothing live in it is not shown — an empty category is a
    // dead end that makes the whole catalog feel broken.
    res.json({
      domains: domains
        .filter((d) => byDomain.has(d.code))
        .map((d) => ({
          code: d.code,
          name: d.name,
          description: d.description,
          icon: d.icon,
          imageUrl: d.signedImageUrl || '',
          services: byDomain.get(d.code),
        })),
    });
  } catch (err) { next(err); }
}

module.exports = {
  listDomains, listLines, myEnrolments, getRequirements,
  enrol, saveSubmission, submitForReview, requestLine, status,
  liveCatalog,
};
