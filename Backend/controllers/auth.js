const express = require('express');
const Usuario = require('../data/models/Usuario');
const bcrypt  = require('bcryptjs'); 
const { GeneratorJWT }  = require('../helpers/jwt');


const createUser = async (req, res = express.response) => {
    const {email, password} = req.body;

    try{

        let usuario = await Usuario.findOne({ email });
        if( usuario ){
            return res.status(400).json({
                ok:false,
                msg: 'Correo ya esta registrado'
            })
        }

        usuario = new Usuario( req.body );
        const salt = bcrypt.genSaltSync();
        usuario.password = bcrypt.hashSync( password, salt );
        await usuario.save();

        const token = await GeneratorJWT( usuario.id, usuario.name);

        res.json({
            ok: true,
            uid: usuario.id,
            name: usuario.name,
            token
        });

    }catch(error){
        res.status(400).json({
            ok: false,
            msg: 'Registro fallido'
        })
    }

}

const loginUser = async (req, res = express.response ) =>{
    const {email, password} = req.body;
    try{
        const usuario = await Usuario.findOne({ email });
        if( !usuario ){
            return res.status(400).json({
                ok:false,
                msg: 'Usuario y contraseña no son correctos'
            })
        }

        const validPassword = bcrypt.compareSync( password, usuario.password);

        if( !validPassword ){
            return res.status(400).json({
                ok:false,
                msg: 'Usuario y contraseña no son correctos',
            });
        }

       
        const token = await GeneratorJWT( usuario.id, usuario.name);


        res.json({
            ok: true,
            uid: usuario.id,
            name: usuario.name,
            token
        });


    }catch(error){
        res.status(500).json({
            ok: false,
            msg: 'Ingreso fallido',
            error
        })
    }

}

const renewToken = async(req, res = express.response ) =>{

    const uid = req.uid;
    const name = req.name;

    token = await GeneratorJWT(uid, name);

    res.json({
        ok: true,
        uid,
        name,
        token

    })

}

module.exports = {
    createUser,
    loginUser,
    renewToken,
}