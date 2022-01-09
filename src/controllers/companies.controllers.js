const setFilters = require('../libs/functions')
const pool = require('../db')

const getCompanies = async (req, res, next) => {
    const response = await pool.query('SELECT * FROM company');
    res.status(200).json(response.rows)
}

const getCompaniestByFilters = async (req, res, next) => {
    try {
        let { filters, page, itemsPerPage} = req.body;
        filters = setFilters(filters)
        const response = await pool.query(`SELECT * FROM company ${filters} ORDER BY id_company 
        LIMIT ${itemsPerPage} OFFSET ${(page - 1) * itemsPerPage}`);

        const tocount = await pool.query(`SELECT * FROM company ${filters}`)

        res.json({
            page: page,
            count: tocount.rows.length,
            data: response.rows
        });
    } catch (error) {
        res.json({error: error.message})
    }
};

const getCompanyId = async (req, res, next) => {
    const id = parseInt(req.params.id);
    const response = await pool.query('SELECT * FROM company WHERE id_company = $1', [id]);
    res.json(response.rows);
};

const createCompany = async (req, res, next) => {
    try {
        const { company_number, company, url, token} = req.body

        const now = new Date()
        const response = await pool.query(
            `INSERT INTO company(created, modified, company_number, company, url, token) 
            VALUES ( $1, $2, $3, $4, $5, $6 )`,
            [ now, now, company_number, company, url, token]);
        res.json({
            state: 'success',
            message: "Company Created"
        })
    } catch (error) {
        res.json({error: error.message});
        next();
    }
    
};

const updateCompany = async (req, res, next) => {
    const id = parseInt(req.params.id);
    // const { company_number, company, url, token } = req.body;
    const newData =  setFilters(req.body)
    const response = await pool.query(`UPDATE company SET ${newData} WHERE id = $1`, [id]);
    res.json({
        state: 'success',
        message: "Company Updated"
    })
};

const deleteCompany = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        await pool.query('DELETE FROM company where id_company = $1', [ id ]);
        res.json({
            state: 'success',
            message: "Company Deleted"
        })
    } catch (error) {
        res.json({error: error.message});
        next();
    }
};


module.exports = {
    getCompaniestByFilters, 
    getCompanyId,   
    createCompany,  
    updateCompany,  
    deleteCompany
};