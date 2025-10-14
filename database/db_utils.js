const database = require('../databaseConnection');

async function printMySQLVersion() {
    try {
        const [rows] = await database.query('SHOW VARIABLES LIKE "version"');
        console.log("MySQL Version: ", rows[0].Value);
        return true;
    } catch (err) {
        console.error("Error getting version from MySQL: ", err.message);
        return false;
    }
}

module.exports = { printMySQLVersion }; 