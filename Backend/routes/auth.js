const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const { createUser, loginUser, renewToken, getAllUsers, updateUser, deleteUser } = require('../controllers/auth');
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

router.get('/users', validateJwt, getAllUsers);

router.put('/users/:id', validateJwt, updateUser);

router.delete('/users/:id', validateJwt, deleteUser);

module.exports = router;