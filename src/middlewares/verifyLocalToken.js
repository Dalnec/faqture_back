const pool = require('../db')

const verifyLocalToken = async (req, res, next) => {
    try {
        // console.log(req.headers.authorization);
        if (!req.headers.authorization) {
            return res.status(403).json({ error: 'No credentials sent!' });
        }
        const token = req.headers.authorization && req.headers.authorization.split(' ')[1]


        const tenant = req.params.tenant;
        const schema = await pool.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1;`, [tenant]);        
        if (!schema.rows.length) {
            return res.status(403).json({ error: 'Error credentials!' });
        }
        req.params.tenant = schema.rows[0].schema_name;

        // console.log(req.params.tenant);
        const company = await pool.query('SELECT * FROM public.company WHERE tenant = $1', [req.params.tenant]);        
        if (!company.rows.length) {
            return res.status(403).json({ error: 'No company' });
        }
        req.params.company = company.rows[0].id_company
        req.params.company_number = company.rows[0].company_number

        if (token !== company.rows[0].localtoken) {
            return res.status(403).json({ error: 'No valid crendentials' });
        }

        next();

    } catch (error) {
        res.status(401).json({
            state: 'error',
            message: error.message,
        })
        // next();
    }
}

module.exports = {verifyLocalToken};