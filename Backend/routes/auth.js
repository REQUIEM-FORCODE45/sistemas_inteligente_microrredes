const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { createUser, loginUser, renewToken, getAllUsers, updateUser, deleteUser } = require('../controllers/auth');
const { validate } = require('../middleware/validateCampo')
const { validateJwt } = require('../middleware/validateJwt')

// /new y / son las unicas rutas publicas del API. Sin limite, el puerto de
// ngrok queda expuesto a fuerza bruta de contrasenas y a relleno de la base
// de datos con cuentas basura (el registro es abierto).
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        ok: false,
        msg: 'Demasiados intentos. Espera 15 minutos e intentalo de nuevo.'
    }
});

router.post('/new', authLimiter,
            [
                check('name', 'Nombre obligatorio').not().isEmpty(),
                check('email', 'Email obligatorio').isEmail(),
                check('password', 'Password debe ser de 6 caracteres').isLength({min:6}),
                validate
            ],createUser);

router.post('/', authLimiter,
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