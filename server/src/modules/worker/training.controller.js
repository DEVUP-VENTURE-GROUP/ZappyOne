const TrainingModule = require('./training.model');
const Worker = require('./worker.model');

async function listModules(req, res, next) {
  try {
    const modules = await TrainingModule.find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .select('-quiz') // hide answers until opened
      .lean();

    const worker = await Worker.findById(req.auth.sub).select('certifications skills').lean();
    const earnedIds = new Set((worker?.certifications || []).map(c => c.moduleId));

    const certMap = {};
    (worker?.certifications || []).forEach(c => { certMap[c.moduleId] = c.score; });

    res.json({
      modules: modules.map(m => ({
        ...m,
        certified: certMap[String(m._id)] !== undefined,
        certScore: certMap[String(m._id)] ?? null,
      })),
    });
  } catch (err) { next(err); }
}

async function getModule(req, res, next) {
  try {
    const mod = await TrainingModule.findById(req.params.id).lean();
    if (!mod || !mod.isActive) return res.status(404).json({ error: 'Module not found' });
    // Return quiz without correct answers
    const safeQuiz = (mod.quiz || []).map(({ question, options }) => ({ question, options }));
    res.json({ module: { ...mod, quiz: safeQuiz } });
  } catch (err) { next(err); }
}

async function submitQuiz(req, res, next) {
  try {
    const mod = await TrainingModule.findById(req.params.id).lean();
    if (!mod || !mod.isActive) return res.status(404).json({ error: 'Module not found' });

    const { answers } = req.body;
    if (!Array.isArray(answers) || answers.length !== (mod.quiz || []).length) {
      return res.status(400).json({ error: 'Answer count does not match quiz questions' });
    }
    if (mod.quiz.length === 0) {
      return res.status(400).json({ error: 'This module has no quiz questions yet' });
    }

    const correct = answers.filter((a, i) => a === mod.quiz[i].correct).length;
    const score = Math.round((correct / mod.quiz.length) * 100);
    const passed = score >= mod.passingScore;

    if (!passed) {
      return res.json({ passed: false, score, passingScore: mod.passingScore,
        message: `You scored ${score}%. You need ${mod.passingScore}% to pass. Review the material and try again.` });
    }

    const moduleId = String(mod._id);
    // The first pass is claimed in one step, so two quick submissions never both count as first.
    const first = await Worker.updateOne(
      { _id: req.auth.sub, 'certifications.moduleId': { $ne: moduleId } },
      { $push: { certifications: { moduleId, moduleName: mod.title, score, earnedAt: new Date() } }, ...(mod.unlockService && { $addToSet: { skills: mod.unlockService } }) },
    );
    const isFirstTime = first.modifiedCount === 1;
    let improvedScore = false;
    if (isFirstTime) {
      // Paid into the wallet ledger (what withdrawals read), once per module.
      if (mod.bonusRupees > 0) {
        await require('../wallet/wallet.service').apply({
          kind: 'worker', id: req.auth.sub, type: 'credit', amountPaise: Math.round(mod.bonusRupees * 100),
          reason: require('../payment/transaction.model').REASONS.TRAINING_BONUS,
          idempotencyKey: `training:${req.auth.sub}:${moduleId}`, description: `Training bonus: ${mod.title}`,
        });
      }
    } else {
      const r = await Worker.updateOne(
        { _id: req.auth.sub, certifications: { $elemMatch: { moduleId, score: { $lt: score } } } },
        { $set: { 'certifications.$.score': score } },
      );
      improvedScore = r.modifiedCount === 1;
    }

    res.json({
      passed: true,
      score,
      bonusAdded: isFirstTime ? (mod.bonusRupees || 0) * 100 : 0,
      bonusRupees: isFirstTime ? mod.bonusRupees : 0,
      xpReward: isFirstTime ? mod.xpReward : 0,
      unlockedService: isFirstTime ? mod.unlockService : null,
      alreadyCertified: !isFirstTime,
      message: isFirstTime
        ? `Congratulations! You scored ${score}% and earned your ${mod.title} certification.`
        : `You scored ${score}%.${improvedScore ? ' Your best score has been updated.' : ''}`,
    });
  } catch (err) { next(err); }
}

// Admin CRUD
async function adminListModules(req, res, next) {
  try {
    const modules = await TrainingModule.find().sort({ order: 1 }).lean();
    res.json({ modules });
  } catch (err) { next(err); }
}

async function adminCreateModule(req, res, next) {
  try {
    const mod = await TrainingModule.create(req.body);
    res.status(201).json({ module: mod });
  } catch (err) { next(err); }
}

async function adminUpdateModule(req, res, next) {
  try {
    const mod = await TrainingModule.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!mod) return res.status(404).json({ error: 'Not found' });
    res.json({ module: mod });
  } catch (err) { next(err); }
}

module.exports = { listModules, getModule, submitQuiz, adminListModules, adminCreateModule, adminUpdateModule };
