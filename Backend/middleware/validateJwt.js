const { response } = require('express');
const jwt = require('jsonwebtoken')
const validateJwt = ( req, res = response, next ) => {
    const token = req.header('x-token');

    if(!token){
        return res.status(401).json({
            ok:false,
            msg: 'No hay token'
        });
    }

    try{

        const payload = jwt.verify(
            token,
            process.env.SECRET_JWT_SEED
        )

        req.uid = payload.uid;
        req.name = payload.name;

    }catch(error){
        return res.status(401).json({
            ok:false,
            msg: 'token no valido',
        });
    }

    next();
}

module.exports = {
    validateJwt
}