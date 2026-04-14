const express = require('express');
const Usuario = require('../data/models/Usuario');
const bcrypt  = require('bcryptjs'); 
const { GeneratorJWT }  = require('../helpers/jwt');


const createUser = async (req, res = express.response) => {
    const {email, password, role} = req.body;

    try{

        let usuario = await Usuario.findOne({ email });
        if( usuario ){
            return res.status(400).json({
                ok:false,
                msg: 'Correo ya esta registrado'
            })
        }

        usuario = new Usuario( req.body );
        
        const validRoles = ['user', 'admin', 'operator'];
        if (!validRoles.includes(role)) {
            usuario.role = 'user';
        }

        const salt = bcrypt.genSaltSync();
        usuario.password = bcrypt.hashSync( password, salt );
        await usuario.save();

        const token = await GeneratorJWT( usuario.id, usuario.name, usuario.role);

        res.json({
            ok: true,
            uid: usuario.id,
            name: usuario.name,
            role: usuario.role,
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
        const token = await GeneratorJWT( usuario.id, usuario.name, usuario.role);

        res.json({
            ok: true,
            uid: usuario.id,
            name: usuario.name,
            role: usuario.role,
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
    const role = req.role;

    token = await GeneratorJWT(uid, name, role);

    res.json({
        ok: true,
        uid,
        name,
        role,
        token

    })

}

const getAllUsers = async (req, res = express.response) => {
    try {
        const users = await Usuario.find({}, 'name email role createdAt active');
        
        res.json({
            ok: true,
            data: users
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: 'Error al obtener usuarios'
        });
    }
}

const updateUser = async (req, res = express.response) => {
    const { id } = req.params;
    const { name, email, role, active } = req.body;
    
    try {
        const user = await Usuario.findById(id);
        if (!user) {
            return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });
        }
        
        if (name) user.name = name;
        if (email) user.email = email;
        if (role) user.role = role;
        if (active !== undefined) user.active = active;
        
        await user.save();
        
        res.json({ ok: true, msg: 'Usuario actualizado', user: { name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error al actualizar usuario' });
    }
}

const deleteUser = async (req, res = express.response) => {
    const { id } = req.params;
    
    try {
        const user = await Usuario.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });
        }
        
        res.json({ ok: true, msg: 'Usuario eliminado' });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error al eliminar usuario' });
    }
}

module.exports = {
    createUser,
    loginUser,
    renewToken,
    getAllUsers,
    updateUser,
    deleteUser,
}