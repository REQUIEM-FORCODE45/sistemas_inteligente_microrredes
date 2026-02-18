const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const { createUser, loginUser, renewToken} = require('../controllers/auth');
const { validate } = require('../middleware/validateCampo')
const { validateJwt } = require('../middleware/validateJwt')
router.post('/new', 
            [
                check('name', 'Nombre obligatorio').not().isEmpty(),
                check('email', 'Email obligatorio').isEmail(),
                check('password', 'Password debe ser de 6 caracteres').isLength({min:6}),
                validate
            ],createUser);

router.post('/',
            [
                check('email', 'Email obligatorio').isEmail(),
                check('password', 'Password debe ser de 6 caracteres').isLength({min:6}),
                validate

            ], loginUser);

router.get('/renew',  validateJwt, renewToken);

module.exports = router;