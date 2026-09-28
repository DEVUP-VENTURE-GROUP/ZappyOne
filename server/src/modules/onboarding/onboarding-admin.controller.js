const {
  ServiceDomain, ServiceLine, KycRequirementSet, ProviderEnrolment, ServiceLineRequest,
} = require('./onboarding.model');
const { getViewUrl } = require('../../utils/s3.service');
const service = require('./onboarding.service');
const Shop = require('../shop/shop.model');
const Worker = require('../worker/worker.model');
const auditService = require('../admin/audit.service');
const eventsService = require('../repair/services/events.service');

/**
 * Admin control of the provider catalog and the verification queue.
 *
 * Everything a provider is shown — the domains, the service lines, and the
 * exact documents each one demands — is edited here as data. That is the whole
 * point: opening a new service to providers is a row an operator adds, not a
 * release, and tightening what a phone-repair shop must prove is an edit rather
 * than a code change.
 */

/** Generic list with search + pagination, shared by every catalog resource. */
function listHandler(Model, { searchFields = [], defaultSort = { displayOrder: 1 } } = {}) {
  return async (req, res, next) => {
    try {
      const { q, page = 1, limit = 100, ...rest } = req.query;
      const filter = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v === '' || v == null) continue;
        filter[k] = v === 'true' ? true : v === 'false' ? false : v;
      }
      if (q && searchFields.length) {
        const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = searchFields.map((f) => ({ [f]: new RegExp(safe, 'i') }));
      }

      const [items, total] = await Promise.all([
        Model.find(filter).sort(defaultSort).skip((page - 1) * limit).limit(Math.min(Number(limit), 200)).lean(),
        Model.countDocuments(filter),
      ]);
      res.json({ items, total, page: Number(page), limit: Number(limit) });
    } catch (err) { next(err); }
  };
}

/** Create / update / archive with an audit trail. Never hard-deletes. */
function crudHandlers(Model, entityName) {
  const prefix = `onboarding.${entityName}`;
  return {
    create: async (req, res, next) => {
      try {
        const doc = await Model.create(req.body);
        await auditService.fromRequest(req, `${prefix}.create`, { kind: entityName, id: doc._id }, null, doc.toObject());
        res.status(201).json({ item: doc });
      } catch (err) { next(err); }
    },
    update: async (req, res, next) => {
      try {
        const before = await Model.findById(req.params.id).lean();
        if (!before) return res.status(404).json({ error: `${entityName} not found` });
        const doc = await Model.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
        await auditService.fromRequest(req, `${prefix}.update`, { kind: entityName, id: req.params.id }, before, doc.toObject());
        res.json({ item: doc });
      } catch (err) { next(err); }
    },
    archive: async (req, res, next) => {
      try {
        const before = await Model.findById(req.params.id).lean();
        if (!before) return res.status(404).json({ error: `${entityName} not found` });
        // Providers already approved against this row keep their approval, so
        // the row is retired rather than removed.
        const doc = await Model.findByIdAndUpdate(
          req.params.id,
          { $set: { isArchived: true, isActive: false } },
          { new: true },
        );
        await auditService.fromRequest(req, `${prefix}.archive`, { kind: entityName, id: req.params.id }, before, doc.toObject());
        res.json({ item: doc });
      } catch (err) { next(err); }
    },
  };
}


/**
 * An approved enrolment IS the provider's identity check — so record it as one.
 *
 * The documents a reviewer just examined are the same ones the old standalone
 * KYC screen asks for: Aadhaar and a live selfie from an individual, owner ID,
 * storefront photo and selfie from a shop. Leaving the legacy `kyc.status` at
 * "not_submitted" after that review means the provider signs in, sees "Complete
 * your KYC", and is asked to send the same papers twice — which reads as the
 * app losing their work.
 *
 * One-way on purpose: approving a service approves identity, but REJECTING one
 * service does not un-verify a person who is already working other jobs. Taking
 * identity away is a separate, deliberate admin action.
 */
async function syncLegacyKyc(enrolment) {
  const byCode = Object.fromEntries((enrolment.documents || []).map((d) => [d.code, d.url]));
  const fieldOf = (code) => (enrolment.fields || []).find((f) => f.code === code)?.value || undefined;

  const reviewed = {
    status: 'approved',
    submittedAt: enrolment.submittedAt || new Date(),
    reviewedAt: new Date(),
    reviewNote: `Verified via ${enrolment.lineCode} onboarding`,
  };

  if (enrolment.providerKind === 'shop') {
    const shop = await Shop.findById(enrolment.shopId);
    if (!shop || shop.kyc?.status === 'approved') return;

    shop.kyc = {
      ...(shop.kyc?.toObject?.() || shop.kyc || {}),
      ...reviewed,
      ownerIdUrl: byCode.owner_id || shop.kyc?.ownerIdUrl,
      shopPhotoUrl: byCode.shop_photo || shop.kyc?.shopPhotoUrl,
      selfieUrl: byCode.selfie || shop.kyc?.selfieUrl,
      gstCertificateUrl: byCode.gst_certificate || shop.kyc?.gstCertificateUrl,
      gstNumber: fieldOf('gst_number') || shop.kyc?.gstNumber,
      panNumber: fieldOf('pan_number') || shop.kyc?.panNumber,
    };
    await shop.save();
    return;
  }

  const worker = await Worker.findById(enrolment.workerId);
  if (!worker || worker.kyc?.status === 'approved') return;

  const selfieDoc = (enrolment.documents || []).find((d) => d.code === 'selfie');
  worker.kyc = {
    ...(worker.kyc?.toObject?.() || worker.kyc || {}),
    ...reviewed,
    aadhaarUrl: byCode.aadhaar || worker.kyc?.aadhaarUrl,
    selfieUrl: byCode.selfie || worker.kyc?.selfieUrl,
    // Carry the liveness evidence over so the KYC screens keep showing how the
    // selfie was actually obtained.
    ...(selfieDoc?.captureMethod === 'live_camera' ? {
      selfieMetadata: {
        capturedAt: selfieDoc.capturedAt || undefined,
        captureMethod: 'live_camera',
        lat: selfieDoc.lat ?? undefined,
        lng: selfieDoc.lng ?? undefined,
        geoStatus: selfieDoc.lat != null ? 'ok' : undefined,
      },
    } : {}),
  };
  await worker.save();
}


/**
 * Keep the shop record in step with what it is actually verified for.
 *
 * "Nearby Shops" gates on `shop.services` being non-empty and matches customers
 * to shops through it. That list used to be typed in by the owner; now it is
 * DERIVED from approved enrolments, which means:
 *
 *   • a shop cannot list work it was never verified for, and
 *   • a shop that finishes verification appears to customers immediately,
 *     without a second form nobody told them to fill in.
 *
 * Recomputed after every decision, so suspending laptop work also removes them
 * from laptop searches while leaving their phone listing alone.
 */
async function syncShopServices(enrolment) {
  if (enrolment.providerKind !== 'shop') return;

  const shop = await Shop.findById(enrolment.shopId);
  if (!shop) return;

  const approved = await ProviderEnrolment.find({
    shopId: shop._id, status: 'approved',
  }).select('lineCode domainCode').lean();

  shop.services = approved.map((e) => e.lineCode);
  // Category drives browse filters; keep whatever the owner set if they have one.
  if (!shop.category && approved[0]) shop.category = approved[0].domainCode;

  await shop.save();
}

const domains = {
  list: listHandler(ServiceDomain, { searchFields: ['name', 'code'] }),
  ...crudHandlers(ServiceDomain, 'domain'),
};

const lines = {
  list: listHandler(ServiceLine, { searchFields: ['name', 'code'], defaultSort: { domainCode: 1, displayOrder: 1 } }),
  ...crudHandlers(ServiceLine, 'line'),
};

const requirements = {
  list: listHandler(KycRequirementSet, { searchFields: ['name'], defaultSort: { domainCode: 1, lineCode: 1 } }),
  ...crudHandlers(KycRequirementSet, 'requirement_set'),
};

/* Verification queue */

const enrolments = {
  /**
   * The review queue, with enough of the applicant attached to judge it.
   *
   * A reviewer needs the business behind the documents — an unnamed row of
   * image links cannot be assessed, and opening five tabs per application is
   * how queues stop being worked.
   */
  list: async (req, res, next) => {
    try {
      const { status = 'pending_review', lineCode, domainCode, page = 1, limit = 50 } = req.query;
      const filter = {};
      if (status && status !== 'all') filter.status = status;
      if (lineCode) filter.lineCode = String(lineCode).toLowerCase();
      if (domainCode) filter.domainCode = String(domainCode).toLowerCase();

      const [rows, total] = await Promise.all([
        ProviderEnrolment.find(filter).sort({ submittedAt: 1, updatedAt: -1 })
          .skip((page - 1) * limit).limit(Math.min(Number(limit), 200)).lean(),
        ProviderEnrolment.countDocuments(filter),
      ]);

      const shopIds = rows.filter((r) => r.shopId).map((r) => r.shopId);
      const workerIds = rows.filter((r) => r.workerId).map((r) => r.workerId);
      const [shops, workers, lineDocs] = await Promise.all([
        Shop.find({ _id: { $in: shopIds } }).select('businessName ownerName phone address kyc.status rating').lean(),
        Worker.find({ _id: { $in: workerIds } }).select('name phone rating kyc.status').lean(),
        ServiceLine.find({ code: { $in: rows.map((r) => r.lineCode) } }).select('code name domainCode repairVertical').lean(),
      ]);

      const shopById = new Map(shops.map((s) => [String(s._id), s]));
      const workerById = new Map(workers.map((w) => [String(w._id), w]));
      const lineByCode = new Map(lineDocs.map((l) => [l.code, l]));

      /**
       * Documents are stored as private S3 KEYS, not as URLs.
       *
       * The queue was sending the raw key straight to the browser, which
       * rendered it as a link to a path that does not exist — so a reviewer was
       * approving identity documents they had never actually seen, because
       * there was no way to see them. Presigning here turns each key into a
       * time-limited URL the reviewer's browser can load directly.
       *
       * One hour: long enough to work a queue in one sitting, short enough that
       * a link pasted somewhere it should not be goes dead quickly. Failures
       * are swallowed per document — one unreadable file must not blank the
       * whole queue.
       */
      const withViewUrls = await Promise.all(rows.map(async (r) => {
        const documents = await Promise.all((r.documents || []).map(async (d) => {
          if (!d.url) return d;
          try {
            return { ...d, viewUrl: await getViewUrl(d.url, 3600) };
          } catch {
            return { ...d, viewUrl: null };
          }
        }));

        return {
          ...r,
          documents,
          line: lineByCode.get(r.lineCode) || null,
          provider: r.shopId ? shopById.get(String(r.shopId)) || null : workerById.get(String(r.workerId)) || null,
        };
      }));

      res.json({ items: withViewUrls, total, page: Number(page) });
    } catch (err) { next(err); }
  },

  /**
   * Decide one application.
   *
   * The provider is told either way, and a rejection carries the reviewer's
   * note — "rejected" with no reason produces a support ticket, not a fix.
   */
  decide: async (req, res, next) => {
    try {
      const { decision, note = '' } = req.body;
      const before = await ProviderEnrolment.findById(req.params.id).lean();
      if (!before) return res.status(404).json({ error: 'Enrolment not found' });

      const enrolment = await service.decide({
        enrolmentId: req.params.id,
        decision,
        note,
        adminId: req.auth.sub,
      });

      await auditService.fromRequest(
        req, `onboarding.enrolment.${decision}`,
        { kind: 'enrolment', id: enrolment._id }, before, enrolment.toObject(),
      );

      // Approving the service also settles identity — see syncLegacyKyc — and
      // every decision changes what the shop is listed for.
      if (decision === 'approved') {
        try {
          await syncLegacyKyc(enrolment);
        } catch (err) {
          // Never fail the decision over this: the enrolment is the source of
          // truth, and a stale legacy flag is recoverable. It is logged so it
          // does not pass unnoticed.
          req.log?.warn?.({ err: err.message, enrolmentId: String(enrolment._id) }, '[onboarding] legacy KYC sync failed');
        }
      }

      try {
        await syncShopServices(enrolment);
      } catch (err) {
        req.log?.warn?.({ err: err.message, enrolmentId: String(enrolment._id) }, '[onboarding] shop service sync failed');
      }

      const line = await ServiceLine.findOne({ code: enrolment.lineCode }).select('name').lean();
      const lineName = line?.name || enrolment.lineCode;
      const copy = {
        approved: {
          title: `You're approved for ${lineName}`,
          body: 'Set up your services and pricing to start receiving jobs.',
        },
        rejected: {
          title: `${lineName} verification needs attention`,
          body: note || 'Please review your documents and submit again.',
        },
        suspended: {
          title: `${lineName} has been paused`,
          body: note || 'Contact support to restore this service.',
        },
      }[decision];

      await eventsService.notify({
        kind: enrolment.providerKind === 'shop' ? 'shop' : 'worker',
        id: enrolment.shopId || enrolment.workerId,
        type: 'system_alert',
        title: copy.title,
        body: copy.body,
        deepLink: '/provider/onboarding',
        data: { enrolmentId: String(enrolment._id), lineCode: enrolment.lineCode, decision },
      });

      res.json({ item: enrolment });
    } catch (err) { next(err); }
  },
};

/* Provider-proposed services */

const lineRequests = {
  list: listHandler(ServiceLineRequest, {
    searchFields: ['proposedName', 'description'],
    defaultSort: { status: 1, requestCount: -1, createdAt: -1 },
  }),

  /**
   * Approving a request creates the real line, so the provider who asked can
   * enrol immediately — the request is not merely marked "done".
   */
  approve: async (req, res, next) => {
    try {
      const reqDoc = await ServiceLineRequest.findById(req.params.id);
      if (!reqDoc) return res.status(404).json({ error: 'Request not found' });
      const before = reqDoc.toObject();

      const { code, name, domainCode, status = 'coming_soon', repairVertical = null } = req.body;
      if (!code || !domainCode) {
        return res.status(400).json({ error: 'code and domainCode are required', code: 'PARAMS_REQUIRED' });
      }

      const line = await ServiceLine.create({
        code: String(code).toLowerCase(),
        name: name || reqDoc.proposedName,
        domainCode: String(domainCode).toLowerCase(),
        description: reqDoc.description,
        status,
        repairVertical,
      });

      reqDoc.status = 'approved';
      reqDoc.resultLineCode = line.code;
      reqDoc.reviewedById = req.auth.sub;
      reqDoc.reviewedAt = new Date();
      reqDoc.reviewNote = req.body.note || '';
      await reqDoc.save();

      await auditService.fromRequest(
        req, 'onboarding.line_request.approve',
        { kind: 'line_request', id: reqDoc._id }, before, reqDoc.toObject(),
      );

      res.json({ item: reqDoc, line });
    } catch (err) { next(err); }
  },

  reject: async (req, res, next) => {
    try {
      const row = await ServiceLineRequest.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            status: 'rejected',
            reviewedById: req.auth.sub,
            reviewedAt: new Date(),
            reviewNote: req.body.note || '',
          },
        },
        { new: true },
      );
      if (!row) return res.status(404).json({ error: 'Request not found' });
      res.json({ item: row });
    } catch (err) { next(err); }
  },
};

module.exports = { domains, lines, requirements, enrolments, lineRequests };
