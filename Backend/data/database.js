const mongoose = require('mongoose');

class MongoDatabase {
    constructor(url, name) {
        this.name = name;
        this.url = url;
    }

    static async connect(url, name) {
        try {
            await mongoose.connect(url, {
                dbName: name,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 10000,
            });
            console.log('Conexion exitosa a MongoDB');
        } catch (error) {
            console.error('Error en la conexion a MongoDB:', error.message);
            throw error;
        }
    }
}

module.exports = MongoDatabase;
