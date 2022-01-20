const pool = require('../db')
// class Company {
//     constructor(pool) {
//         this.pool = pool;
//     }
    
    // async selectApiCompanyById(id){
    const selectApiCompanyById = async (id) => {
        if (!id) {
            return false;
        }
        const company = await pool.query(`SELECT url, token FROM public.company WHERE id_company = $1`, [id]);
        if (!company.rowCount) {
            return false;
        }
        const url = company.rows[0].url
        const token = company.rows[0].token
        return { url, token }
    }
// }

module.exports = { selectApiCompanyById };