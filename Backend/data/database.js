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
            });
            console.log('Conexion exitosa');
        } catch (error) {
            console.log(error);
            console.log('Error en la conexion');
        }
    }
}

module.exports = MongoDatabase;
