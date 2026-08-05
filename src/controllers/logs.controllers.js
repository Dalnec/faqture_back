const pool = require('../db');

const getSystemLogs = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, tenant, level } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM public.system_logs WHERE 1=1';
        let queryParams = [];
        let countQuery = 'SELECT COUNT(*) FROM public.system_logs WHERE 1=1';

        if (tenant) {
            queryParams.push(tenant);
            query += ` AND tenant = $${queryParams.length}`;
            countQuery += ` AND tenant = $${queryParams.length}`;
        }

        if (level) {
            queryParams.push(level);
            query += ` AND level = $${queryParams.length}`;
            countQuery += ` AND level = $${queryParams.length}`;
        }

        query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;

        const logsPromise = pool.query(query, [...queryParams, limit, offset]);
        const countPromise = pool.query(countQuery, queryParams);

        const [logs, countResult] = await Promise.all([logsPromise, countPromise]);

        res.status(200).json({
            success: true,
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            data: logs.rows
        });
    } catch (error) {
        console.error('Error in getSystemLogs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getSystemLogs
};
