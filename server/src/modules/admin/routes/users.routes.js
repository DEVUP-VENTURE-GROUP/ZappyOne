const express = require('express');
const Joi = require('joi');
const { validate } = require('../../../middlewares/validate');
const ctrl = require('../controllers/users.controller');

const router = express.Router();

router.get('/users', ctrl.listUsers);
router.get('/users/:id', ctrl.getUser);
router.post(
  '/users/:id/block',
  validate(Joi.object({ blocked: Joi.boolean().required() })),
  ctrl.blockUser,
);

module.exports = router;
